"""
Sensitivity Analysis — Post-optimization constraint analysis.

After the solver finds the optimal plan, this module answers:
1. Which constraints are binding (tightest)?
2. What's the shadow price of adding one more truck?
3. What's the value of increasing capacity on the bottleneck truck?
4. Which single change would improve the plan the most?

This is textbook LP sensitivity analysis applied to a real freight
optimization problem. It re-runs the solver with small parameter
changes and measures the impact — giving operations managers
actionable intelligence about WHERE to invest for the biggest return.
"""

from typing import List, Dict, Optional
from backend.app.agents.tools.optimization_tool import run_optimization


# ---------------------------------------------------------------------------
# 1. Constraint Slack Analysis
# ---------------------------------------------------------------------------

def analyze_constraint_slack(
    assignments: List[Dict],
    shipments: List[Dict],
    vehicles: List[Dict],
) -> List[Dict]:
    """
    For each truck in the solution, compute how tight each constraint is.

    A "binding" constraint (slack ≈ 0) means the truck is maxed out on
    that dimension. A constraint with high slack means there's room.
    Binding constraints are where improvements would have the most impact.

    Returns a list of per-truck constraint reports.
    """
    shipment_lookup = {s.get("shipment_id", ""): s for s in shipments}
    vehicle_lookup = {v.get("vehicle_id", ""): v for v in vehicles}

    truck_reports = []

    for assignment in assignments:
        vid = assignment.get("vehicle_id", "")
        sids = assignment.get("shipment_ids", [])
        vehicle = vehicle_lookup.get(vid, {})

        cap_weight = vehicle.get("capacity_weight", 0)
        cap_volume = vehicle.get("capacity_volume", 0)

        total_weight = sum(shipment_lookup.get(sid, {}).get("weight", 0) for sid in sids)
        total_volume = sum(shipment_lookup.get(sid, {}).get("volume", 0) for sid in sids)

        weight_slack = cap_weight - total_weight
        volume_slack = cap_volume - total_volume

        weight_util = (total_weight / cap_weight * 100) if cap_weight > 0 else 0
        volume_util = (total_volume / cap_volume * 100) if cap_volume > 0 else 0

        weight_binding = weight_util > 95
        volume_binding = volume_util > 95

        binding_constraint = "none"
        if weight_binding and volume_binding:
            binding_constraint = "both"
        elif weight_binding:
            binding_constraint = "weight"
        elif volume_binding:
            binding_constraint = "volume"

        truck_reports.append({
            "vehicle_id": vid,
            "vehicle_type": vehicle.get("vehicle_type", "unknown"),
            "shipment_count": len(sids),
            "weight_used": round(total_weight, 1),
            "weight_capacity": cap_weight,
            "weight_slack_kg": round(weight_slack, 1),
            "weight_utilization_pct": round(weight_util, 1),
            "weight_binding": weight_binding,
            "volume_used": round(total_volume, 2),
            "volume_capacity": cap_volume,
            "volume_slack_m3": round(volume_slack, 2),
            "volume_utilization_pct": round(volume_util, 1),
            "volume_binding": volume_binding,
            "binding_constraint": binding_constraint,
        })

    return truck_reports


# ---------------------------------------------------------------------------
# 2. Fleet Shadow Price — Value of adding one more truck
# ---------------------------------------------------------------------------

def compute_fleet_shadow_price(
    shipments: List[Dict],
    vehicles: List[Dict],
    original_cost: float,
    compatibility_graph=None,
) -> Dict:
    """
    Compute how much cost would drop if one more truck were available.

    Re-runs the solver with fleet + 1 (duplicating the largest truck)
    and compares the new cost to the original. The difference is the
    "shadow price" of fleet capacity — the maximum you'd pay for one
    more truck.

    If the solver already has unused trucks, shadow price is zero.
    """
    if not vehicles or not shipments:
        return {"shadow_price": 0, "new_cost": original_cost, "improvement_pct": 0}

    # Check if there are already unused vehicles
    used_count = len([v for v in vehicles])  # Will compare with solution
    
    # Add one more vehicle — duplicate the largest truck
    sorted_vehicles = sorted(vehicles, key=lambda v: v.get("capacity_weight", 0), reverse=True)
    largest = sorted_vehicles[0]

    extra_vehicle = {
        **largest,
        "vehicle_id": f"{largest['vehicle_id']}_SHADOW",
    }

    expanded_fleet = vehicles + [extra_vehicle]

    # Re-run the solver with the expanded fleet
    result = run_optimization(
        shipments=shipments,
        vehicles=expanded_fleet,
        compatibility_graph=compatibility_graph,
    )

    new_metrics = result.get("plan_metrics", {})

    # Compute new cost from baseline
    from backend.app.optimizer.baseline import compute_baseline
    baseline = compute_baseline(shipments, vehicles)
    baseline_cost = baseline["total_cost"]

    new_trucks = new_metrics.get("total_trucks", 0)
    new_saving_pct = new_metrics.get("cost_saving_pct", 0)
    new_cost = baseline_cost * (1 - new_saving_pct / 100)

    shadow_price = original_cost - new_cost
    improvement_pct = (shadow_price / original_cost * 100) if original_cost > 0 else 0

    return {
        "shadow_price": round(max(shadow_price, 0), 2),
        "original_cost": round(original_cost, 2),
        "new_cost_with_extra_truck": round(new_cost, 2),
        "improvement_pct": round(max(improvement_pct, 0), 1),
        "original_trucks": len(vehicles),
        "expanded_trucks": new_trucks,
        "extra_vehicle_type": largest.get("vehicle_type", "unknown"),
    }


# ---------------------------------------------------------------------------
# 3. Capacity Shadow Price — Value of increasing bottleneck capacity
# ---------------------------------------------------------------------------

def compute_capacity_shadow_price(
    shipments: List[Dict],
    vehicles: List[Dict],
    original_cost: float,
    bottleneck_vehicle_id: str,
    increase_pct: float = 10.0,
    compatibility_graph=None,
) -> Dict:
    """
    Compute the value of increasing a specific truck's capacity.

    Takes the truck with the tightest binding constraint, increases
    its weight and volume capacity by increase_pct%, re-runs the solver,
    and measures the cost difference.
    """
    if not vehicles or not shipments:
        return {"shadow_price": 0, "improvement_pct": 0}

    # Create modified fleet with increased capacity on the target truck
    modified_vehicles = []
    for v in vehicles:
        if v["vehicle_id"] == bottleneck_vehicle_id:
            modified = {
                **v,
                "capacity_weight": v.get("capacity_weight", 0) * (1 + increase_pct / 100),
                "capacity_volume": v.get("capacity_volume", 0) * (1 + increase_pct / 100),
            }
            modified_vehicles.append(modified)
        else:
            modified_vehicles.append(v)

    # Re-run solver
    result = run_optimization(
        shipments=shipments,
        vehicles=modified_vehicles,
        compatibility_graph=compatibility_graph,
    )

    new_metrics = result.get("plan_metrics", {})

    from backend.app.optimizer.baseline import compute_baseline
    baseline = compute_baseline(shipments, vehicles)
    baseline_cost = baseline["total_cost"]

    new_saving_pct = new_metrics.get("cost_saving_pct", 0)
    new_cost = baseline_cost * (1 - new_saving_pct / 100)

    shadow_price = original_cost - new_cost
    improvement_pct = (shadow_price / original_cost * 100) if original_cost > 0 else 0

    return {
        "vehicle_id": bottleneck_vehicle_id,
        "capacity_increase_pct": increase_pct,
        "shadow_price": round(max(shadow_price, 0), 2),
        "original_cost": round(original_cost, 2),
        "new_cost": round(new_cost, 2),
        "improvement_pct": round(max(improvement_pct, 0), 1),
        "new_utilization": new_metrics.get("avg_utilization", 0),
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_sensitivity_analysis(
    assignments: List[Dict],
    shipments: List[Dict],
    vehicles: List[Dict],
    original_cost: float,
    compatibility_graph=None,
) -> Dict:
    """
    Run the full sensitivity analysis suite.

    Called by the sensitivity_node in the LangGraph pipeline.
    Runs all three analyses and packages the results.

    Args:
        assignments: Solver output assignments
        shipments: All shipments
        vehicles: All vehicles
        original_cost: Total cost of the current plan
        compatibility_graph: From the Reason phase (for solver re-runs)

    Returns:
        Dict with constraint_slack, fleet_shadow_price,
        capacity_shadow_price, and a summary with recommendations
    """
    if not assignments:
        return {
            "constraint_slack": [],
            "fleet_shadow_price": {},
            "capacity_shadow_price": {},
            "bottleneck": None,
            "recommendations": [],
        }

    # 1. Constraint slack analysis
    slack_reports = analyze_constraint_slack(assignments, shipments, vehicles)

    # 2. Find the bottleneck truck (highest utilization, binding constraint)
    binding_trucks = [t for t in slack_reports if t["binding_constraint"] != "none"]
    bottleneck = None
    if binding_trucks:
        bottleneck = max(binding_trucks, key=lambda t: t["weight_utilization_pct"])

    # 3. Fleet shadow price
    fleet_shadow = compute_fleet_shadow_price(
        shipments, vehicles, original_cost, compatibility_graph
    )

    # 4. Capacity shadow price on the bottleneck
    capacity_shadow = {}
    if bottleneck:
        capacity_shadow = compute_capacity_shadow_price(
            shipments, vehicles, original_cost,
            bottleneck["vehicle_id"],
            increase_pct=10.0,
            compatibility_graph=compatibility_graph,
        )

    # 5. Generate recommendations
    recommendations = _generate_recommendations(
        slack_reports, fleet_shadow, capacity_shadow, bottleneck
    )

    binding_count = len(binding_trucks)
    total_trucks = len(slack_reports)

    print(f"[Sensitivity] {binding_count}/{total_trucks} trucks have binding constraints. "
          f"Fleet shadow price: ₹{fleet_shadow.get('shadow_price', 0):,.0f}")

    return {
        "constraint_slack": slack_reports,
        "fleet_shadow_price": fleet_shadow,
        "capacity_shadow_price": capacity_shadow,
        "bottleneck": {
            "vehicle_id": bottleneck["vehicle_id"],
            "binding_constraint": bottleneck["binding_constraint"],
            "utilization_pct": bottleneck["weight_utilization_pct"],
        } if bottleneck else None,
        "binding_count": binding_count,
        "total_trucks": total_trucks,
        "recommendations": recommendations,
    }


def _generate_recommendations(
    slack_reports: List[Dict],
    fleet_shadow: Dict,
    capacity_shadow: Dict,
    bottleneck: Optional[Dict],
) -> List[Dict]:
    """Generate actionable recommendations from sensitivity results."""
    recs = []

    # Binding constraint recommendation
    binding_trucks = [t for t in slack_reports if t["binding_constraint"] != "none"]
    if binding_trucks:
        ids = [t["vehicle_id"] for t in binding_trucks]
        recs.append({
            "type": "BINDING_CONSTRAINT",
            "priority": "HIGH",
            "message": (
                f"{len(binding_trucks)} truck(s) at >95% capacity: {', '.join(ids)}. "
                f"Any weight discrepancy could cause overload. "
                f"Consider larger vehicles or splitting shipments."
            ),
        })

    # Fleet shadow price recommendation
    shadow_price = fleet_shadow.get("shadow_price", 0)
    if shadow_price > 0:
        recs.append({
            "type": "FLEET_EXPANSION",
            "priority": "MEDIUM",
            "message": (
                f"Adding one {fleet_shadow.get('extra_vehicle_type', '')} truck "
                f"would save ₹{shadow_price:,.0f} ({fleet_shadow.get('improvement_pct', 0):.1f}% cost reduction). "
                f"This is the shadow price of fleet capacity."
            ),
        })
    else:
        recs.append({
            "type": "FLEET_SUFFICIENT",
            "priority": "LOW",
            "message": "Fleet capacity is sufficient — adding trucks would not reduce cost.",
        })

    # Capacity increase recommendation
    if capacity_shadow and capacity_shadow.get("shadow_price", 0) > 0:
        recs.append({
            "type": "CAPACITY_UPGRADE",
            "priority": "MEDIUM",
            "message": (
                f"Increasing {capacity_shadow['vehicle_id']} capacity by "
                f"{capacity_shadow['capacity_increase_pct']:.0f}% would save "
                f"₹{capacity_shadow['shadow_price']:,.0f} "
                f"({capacity_shadow['improvement_pct']:.1f}% improvement)."
            ),
        })

    # Underutilized trucks
    underutilized = [t for t in slack_reports if t["weight_utilization_pct"] < 50]
    if underutilized:
        ids = [t["vehicle_id"] for t in underutilized]
        recs.append({
            "type": "UNDERUTILIZED",
            "priority": "LOW",
            "message": (
                f"{len(underutilized)} truck(s) below 50% utilization: {', '.join(ids)}. "
                f"Consider consolidating onto fewer, larger vehicles."
            ),
        })

    return recs