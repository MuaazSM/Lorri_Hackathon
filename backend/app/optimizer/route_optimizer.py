"""
Route Optimizer — TSP per truck using OR-Tools RoutingModel.

After the MIP solver assigns shipments to trucks, this module finds
the optimal visit sequence for each truck's stops. This minimizes
the actual distance traveled — the difference between "which shipments
share a truck" (MIP) and "what order does the truck visit them" (TSP).

The MIP solver minimizes trucks and maximizes utilization.
The route optimizer minimizes distance within each truck's route.
Together they solve the full load consolidation + routing problem.

Uses OR-Tools' RoutingIndexManager + RoutingModel which is purpose-built
for vehicle routing TSP problems. For a truck with N unique cities,
this is a small TSP (typically 2-6 cities) that solves in milliseconds.
"""

from typing import List, Dict, Optional, Tuple
from backend.app.data_loader.synthetic_generator import get_distance

try:
    from ortools.constraint_solver import routing_enums_pb2, pywrapcp
    ROUTING_AVAILABLE = True
except ImportError:
    ROUTING_AVAILABLE = False
    print("[Route Optimizer] OR-Tools routing not available. Using naive ordering.")


def optimize_truck_route(
    shipment_ids: List[str],
    shipment_lookup: Dict,
) -> Dict:
    """
    Find the optimal visit sequence for one truck's assigned shipments.

    Collects all unique cities (origins + destinations) the truck must
    visit, builds a distance matrix, and runs OR-Tools TSP solver to
    find the shortest tour.

    Args:
        shipment_ids: List of shipment IDs assigned to this truck
        shipment_lookup: Dict mapping shipment_id → shipment data

    Returns:
        Dict with:
        - stop_sequence: ordered list of city names to visit
        - optimized_distance_km: total route distance with optimal ordering
        - naive_distance_km: total route distance with default ordering
        - savings_km: distance saved by optimization
        - savings_pct: percentage distance reduction
    """
    if not shipment_ids or len(shipment_ids) == 0:
        return _empty_route_result()

    # Collect all unique cities this truck must visit
    # Order: all origins first, then all destinations
    origins = []
    destinations = []
    for sid in shipment_ids:
        s = shipment_lookup.get(sid, {})
        origin = s.get("origin", "")
        dest = s.get("destination", "")
        if origin and origin not in origins:
            origins.append(origin)
        if dest and dest not in destinations:
            destinations.append(dest)

    # Combine into unique city list (preserving origin-first ordering)
    all_cities = []
    for city in origins + destinations:
        if city not in all_cities:
            all_cities.append(city)

    n_cities = len(all_cities)

    # Trivial cases — no optimization needed
    if n_cities <= 1:
        return {
            "stop_sequence": all_cities,
            "optimized_distance_km": 0.0,
            "naive_distance_km": 0.0,
            "savings_km": 0.0,
            "savings_pct": 0.0,
        }

    if n_cities == 2:
        dist = get_distance(all_cities[0], all_cities[1])
        return {
            "stop_sequence": all_cities,
            "optimized_distance_km": round(dist, 1),
            "naive_distance_km": round(dist, 1),
            "savings_km": 0.0,
            "savings_pct": 0.0,
        }

    # Compute naive distance (visit cities in default order)
    naive_distance = _compute_sequential_distance(all_cities)

    # Build distance matrix for TSP
    distance_matrix = _build_distance_matrix(all_cities)

    # Run TSP solver
    if ROUTING_AVAILABLE:
        optimal_sequence = _solve_tsp(distance_matrix, all_cities)
    else:
        # Fallback: try all permutations for small N, else use naive
        optimal_sequence = _brute_force_tsp(distance_matrix, all_cities)

    optimized_distance = _compute_sequential_distance(optimal_sequence)

    savings_km = naive_distance - optimized_distance
    savings_pct = (savings_km / naive_distance * 100) if naive_distance > 0 else 0

    return {
        "stop_sequence": optimal_sequence,
        "optimized_distance_km": round(optimized_distance, 1),
        "naive_distance_km": round(naive_distance, 1),
        "savings_km": round(max(savings_km, 0), 1),
        "savings_pct": round(max(savings_pct, 0), 1),
    }


def optimize_all_routes(
    assignments: List[Dict],
    shipments: List[Dict],
) -> Tuple[List[Dict], Dict]:
    """
    Run TSP route optimization for every truck in the solver output.

    Takes the raw assignments from the MIP solver/heuristic and enriches
    each one with optimized route data. Also computes aggregate stats.

    Args:
        assignments: List of assignment dicts from the solver
                     (vehicle_id, shipment_ids, utilization_pct)
        shipments: All shipments for lookup

    Returns:
        Tuple of:
        - enriched_assignments: same list but with route optimization fields added
        - route_stats: aggregate statistics across all trucks
    """
    if not assignments:
        return assignments, _empty_stats()

    shipment_lookup = {s.get("shipment_id", ""): s for s in shipments}

    enriched = []
    total_naive = 0.0
    total_optimized = 0.0
    total_savings = 0.0
    trucks_improved = 0

    for assignment in assignments:
        sids = assignment.get("shipment_ids", [])

        route_result = optimize_truck_route(sids, shipment_lookup)

        # Merge route data into the assignment dict
        enriched_assignment = {
            **assignment,
            "stop_sequence": route_result["stop_sequence"],
            "optimized_route_km": route_result["optimized_distance_km"],
            "naive_route_km": route_result["naive_distance_km"],
            "route_savings_km": route_result["savings_km"],
            "route_savings_pct": route_result["savings_pct"],
        }

        # Replace the old route_detour_km with the optimized distance
        enriched_assignment["route_detour_km"] = route_result["optimized_distance_km"]

        enriched.append(enriched_assignment)

        total_naive += route_result["naive_distance_km"]
        total_optimized += route_result["optimized_distance_km"]
        total_savings += route_result["savings_km"]
        if route_result["savings_km"] > 0:
            trucks_improved += 1

    savings_pct = (total_savings / total_naive * 100) if total_naive > 0 else 0

    route_stats = {
        "total_naive_distance_km": round(total_naive, 1),
        "total_optimized_distance_km": round(total_optimized, 1),
        "total_savings_km": round(total_savings, 1),
        "total_savings_pct": round(savings_pct, 1),
        "trucks_optimized": len(assignments),
        "trucks_improved": trucks_improved,
    }

    print(f"[Route Optimizer] Optimized {len(assignments)} truck routes. "
          f"Distance: {total_naive:.0f}km → {total_optimized:.0f}km "
          f"(saved {total_savings:.0f}km, {savings_pct:.1f}%)")

    return enriched, route_stats


# ---------------------------------------------------------------------------
# Distance matrix and TSP helpers
# ---------------------------------------------------------------------------

def _build_distance_matrix(cities: List[str]) -> List[List[int]]:
    """
    Build a distance matrix between all cities.
    OR-Tools routing solver needs integer distances, so we scale by 10
    to preserve one decimal place of precision.
    """
    n = len(cities)
    matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            if i == j:
                row.append(0)
            else:
                dist = get_distance(cities[i], cities[j])
                row.append(int(dist * 10))  # Scale to integers
        matrix.append(row)
    return matrix


def _solve_tsp(distance_matrix: List[List[int]], cities: List[str]) -> List[str]:
    """
    Solve TSP using OR-Tools RoutingModel.

    Finds the shortest tour through all cities, starting from the
    first city (which is typically the first origin).
    """
    n = len(cities)

    # Create routing index manager
    # Args: num_nodes, num_vehicles, depot (start node)
    manager = pywrapcp.RoutingIndexManager(n, 1, 0)
    routing = pywrapcp.RoutingModel(manager)

    # Distance callback
    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Search parameters
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.seconds = 5  # Quick — these are small TSPs

    # Solve
    solution = routing.SolveWithParameters(search_params)

    if solution:
        # Extract the route
        route = []
        index = routing.Start(0)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            route.append(cities[node])
            index = solution.Value(routing.NextVar(index))
        return route
    else:
        # Fallback to original order
        return cities


def _brute_force_tsp(distance_matrix: List[List[int]], cities: List[str]) -> List[str]:
    """
    Brute force TSP for small instances (≤8 cities).
    Fallback when OR-Tools routing is not available.
    """
    from itertools import permutations

    n = len(cities)

    if n > 8:
        # Too many permutations — return original order
        return cities

    best_distance = float('inf')
    best_order = list(range(n))

    # Fix first city (start point), permute the rest
    for perm in permutations(range(1, n)):
        order = [0] + list(perm)
        dist = sum(
            distance_matrix[order[i]][order[i + 1]]
            for i in range(len(order) - 1)
        )
        if dist < best_distance:
            best_distance = dist
            best_order = order

    return [cities[i] for i in best_order]


def _compute_sequential_distance(cities: List[str]) -> float:
    """Compute total distance visiting cities in the given order."""
    total = 0.0
    for i in range(len(cities) - 1):
        total += get_distance(cities[i], cities[i + 1])
    return total


def _empty_route_result() -> Dict:
    return {
        "stop_sequence": [],
        "optimized_distance_km": 0.0,
        "naive_distance_km": 0.0,
        "savings_km": 0.0,
        "savings_pct": 0.0,
    }


def _empty_stats() -> Dict:
    return {
        "total_naive_distance_km": 0.0,
        "total_optimized_distance_km": 0.0,
        "total_savings_km": 0.0,
        "total_savings_pct": 0.0,
        "trucks_optimized": 0,
        "trucks_improved": 0,
    }