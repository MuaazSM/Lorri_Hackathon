"""
Compatibility Graph Builder — Post-processing filters for the ML graph.

The ML model (compatibility_model.py) scores shipment pairs and builds
a networkx graph. This module applies additional hard rule-based filters
that Rajkumar specified:

1. Route overlap: origins and/or destinations must be nearby
2. Time window overlap: minimum overlap required
3. Combined weight+volume within vehicle capacity
4. Special handling match: conflicting types removed
5. Detour within limit: combined route can't exceed max detour

These filters run AFTER the ML model and BEFORE the guardrail.
They remove edges that the ML model approved but that violate
hard operational rules. Think of it as a second pass of pruning.
"""

from typing import List, Dict, Optional
from datetime import datetime
import networkx as nx
from backend.app.data_loader.synthetic_generator import get_distance


# ---------------------------------------------------------------------------
# Filter thresholds
# ---------------------------------------------------------------------------

# Maximum distance (km) between origins for consolidation to be feasible.
# Beyond this, the pickup detour is too large to justify co-loading.
MAX_ORIGIN_DISTANCE_KM = 300

# Maximum distance (km) between destinations for co-delivery
MAX_DEST_DISTANCE_KM = 300

# Minimum time window overlap as a fraction (0-1).
# Below this, the truck can't realistically serve both shipments.
MIN_TIME_OVERLAP_PCT = 0.1

# Maximum route detour in km for a consolidated trip.
# If combining two shipments adds more than this detour vs direct routes,
# the consolidation isn't worth it.
MAX_DETOUR_KM = 200

# Special handling pairs that can never share a truck
FORBIDDEN_HANDLING_PAIRS = {
    frozenset({"hazardous", "fragile"}),
    frozenset({"hazardous", "refrigerated"}),
    frozenset({"hazardous", "oversized"}),
}


# ---------------------------------------------------------------------------
# Time window overlap computation
# ---------------------------------------------------------------------------

def _parse_time(value) -> Optional[datetime]:
    """Parse datetime from string or return as-is."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _time_overlap_pct(s1: Dict, s2: Dict) -> float:
    """
    Calculate what fraction of the shorter time window overlaps
    with the other shipment's window. Returns 0-1.
    """
    p1 = _parse_time(s1.get("pickup_time"))
    d1 = _parse_time(s1.get("delivery_time"))
    p2 = _parse_time(s2.get("pickup_time"))
    d2 = _parse_time(s2.get("delivery_time"))

    if not all([p1, d1, p2, d2]):
        return 0.0

    overlap_start = max(p1, p2)
    overlap_end = min(d1, d2)

    if overlap_start >= overlap_end:
        return 0.0

    overlap_secs = (overlap_end - overlap_start).total_seconds()
    shorter_window = min(
        (d1 - p1).total_seconds(),
        (d2 - p2).total_seconds(),
    )

    if shorter_window <= 0:
        return 0.0

    return min(overlap_secs / shorter_window, 1.0)


# ---------------------------------------------------------------------------
# Detour computation
# ---------------------------------------------------------------------------

def _compute_detour(s1: Dict, s2: Dict) -> float:
    """
    Estimate the extra distance added by serving both shipments on one truck
    vs two separate direct trips.

    Direct: origin1→dest1 + origin2→dest2
    Combined: origin1→origin2→dest1→dest2 (approximate, assuming this order)
    Detour = combined - max(direct1, direct2)

    This is a rough estimate — real routing would use actual road networks.
    """
    o1 = s1.get("origin", "")
    d1 = s1.get("destination", "")
    o2 = s2.get("origin", "")
    d2 = s2.get("destination", "")

    # Direct distances for each shipment
    direct1 = get_distance(o1, d1)
    direct2 = get_distance(o2, d2)

    # Estimate combined route: pickup both, deliver both
    # Approximate as: o1→o2 + o2→d1 + d1→d2
    # (This assumes a reasonable route order)
    combined = (
        get_distance(o1, o2) +
        get_distance(o2, d1) +
        get_distance(d1, d2)
    )

    # Detour is how much longer the combined route is vs the longest direct
    detour = combined - max(direct1, direct2)

    return max(detour, 0)  # Can't have negative detour


# ---------------------------------------------------------------------------
# Main filter function
# ---------------------------------------------------------------------------

def filter_compatibility_graph(
    graph: nx.Graph,
    shipments: List[Dict],
    vehicles: List[Dict],
    max_origin_distance: float = MAX_ORIGIN_DISTANCE_KM,
    max_dest_distance: float = MAX_DEST_DISTANCE_KM,
    min_time_overlap: float = MIN_TIME_OVERLAP_PCT,
    max_detour: float = MAX_DETOUR_KM,
) -> Dict:
    """
    Apply hard rule-based filters to the ML-generated compatibility graph.

    Iterates through every edge in the graph and removes those that
    violate any of the hard operational rules. Returns the pruned graph
    along with stats on how many edges were removed and why.

    Args:
        graph: networkx Graph from the ML compatibility model
        shipments: List of shipment dicts for cross-referencing
        vehicles: List of vehicle dicts for capacity checks
        max_origin_distance: Max km between origins for co-pickup
        max_dest_distance: Max km between destinations for co-delivery
        min_time_overlap: Minimum time window overlap fraction (0-1)
        max_detour: Maximum route detour in km

    Returns:
        Dict with:
        - graph: pruned networkx Graph
        - edges: list of surviving edge dicts (shipment_a, shipment_b, score)
        - removed_counts: how many edges removed per filter
        - original_edge_count: edges before filtering
    """
    if graph is None:
        return {
            "graph": nx.Graph(),
            "edges": [],
            "removed_counts": {},
            "original_edge_count": 0,
        }

    # Build lookup for quick access
    shipment_lookup = {s.get("shipment_id", ""): s for s in shipments}

    # Find the maximum vehicle capacities (for combined weight/volume check)
    max_vehicle_weight = max((v.get("capacity_weight", 0) for v in vehicles), default=0)
    max_vehicle_volume = max((v.get("capacity_volume", 0) for v in vehicles), default=0)

    original_count = graph.number_of_edges()
    edges_to_remove = []

    # Track why edges get removed (for debugging and insights)
    removal_reasons = {
        "origin_too_far": 0,
        "dest_too_far": 0,
        "time_no_overlap": 0,
        "exceeds_capacity": 0,
        "handling_conflict": 0,
        "detour_too_large": 0,
    }

    for u, v, data in graph.edges(data=True):
        s1 = shipment_lookup.get(u, {})
        s2 = shipment_lookup.get(v, {})

        if not s1 or not s2:
            continue

        should_remove = False

        # --- Filter 1: Origin distance ---
        # If origins are too far apart, pickup consolidation is impractical
        o1 = s1.get("origin", "")
        o2 = s2.get("origin", "")
        if o1 != o2:
            origin_dist = get_distance(o1, o2)
            if origin_dist > max_origin_distance:
                removal_reasons["origin_too_far"] += 1
                should_remove = True

        # --- Filter 2: Destination distance ---
        d1 = s1.get("destination", "")
        d2 = s2.get("destination", "")
        if d1 != d2 and not should_remove:
            dest_dist = get_distance(d1, d2)
            if dest_dist > max_dest_distance:
                removal_reasons["dest_too_far"] += 1
                should_remove = True

        # --- Filter 3: Time window overlap ---
        if not should_remove:
            overlap = _time_overlap_pct(s1, s2)
            if overlap < min_time_overlap:
                removal_reasons["time_no_overlap"] += 1
                should_remove = True

        # --- Filter 4: Combined weight+volume within vehicle capacity ---
        if not should_remove:
            combined_w = s1.get("weight", 0) + s2.get("weight", 0)
            combined_v = s1.get("volume", 0) + s2.get("volume", 0)
            if combined_w > max_vehicle_weight or combined_v > max_vehicle_volume:
                removal_reasons["exceeds_capacity"] += 1
                should_remove = True

        # --- Filter 5: Special handling match ---
        if not should_remove:
            h1 = s1.get("special_handling") or "none"
            h2 = s2.get("special_handling") or "none"
            if h1 != "none" and h2 != "none":
                pair = frozenset({h1, h2})
                if pair in FORBIDDEN_HANDLING_PAIRS:
                    removal_reasons["handling_conflict"] += 1
                    should_remove = True

        # --- Filter 6: Detour within limit ---
        if not should_remove:
            detour = _compute_detour(s1, s2)
            if detour > max_detour:
                removal_reasons["detour_too_large"] += 1
                should_remove = True

        if should_remove:
            edges_to_remove.append((u, v))

    # Remove flagged edges from the graph
    graph.remove_edges_from(edges_to_remove)

    # Build the surviving edges list
    surviving_edges = [
        {
            "shipment_a": u,
            "shipment_b": v,
            "score": data.get("weight", 0),
        }
        for u, v, data in graph.edges(data=True)
    ]

    # Sort by score descending
    surviving_edges.sort(key=lambda e: e["score"], reverse=True)

    total_removed = len(edges_to_remove)
    print(f"[Compatibility Filter] Removed {total_removed}/{original_count} edges. "
          f"Surviving: {len(surviving_edges)}. "
          f"Reasons: {removal_reasons}")

    return {
        "graph": graph,
        "edges": surviving_edges,
        "removed_counts": removal_reasons,
        "original_edge_count": original_count,
        "surviving_edge_count": len(surviving_edges),
    }