"""
Warehouse Queuing Model — M/M/1 congestion analysis per origin.

Models each warehouse (origin city) as an M/M/1 queue to detect
congestion before the solver builds a plan. If the solver sends
too many trucks to one warehouse in a short time window, the trucks
will queue up waiting to load — adding delays that breach SLAs.

Uses classical queuing theory:
  λ = arrival rate (trucks per hour arriving at warehouse)
  μ = service rate (trucks loaded per hour, based on loading time)
  ρ = λ/μ = utilization (>0.85 = congestion risk)
  Lq = λ²/(μ(μ-λ)) = avg queue length
  Wq = Lq/λ = avg wait time in queue
  W = Wq + 1/μ = avg time in system (wait + loading)

Little's Law: L = λW (avg items in system = arrival rate × avg time)

Reference: Unit 6 of Operations Research syllabus —
Kendall's notation, M/M/1 model, steady state behavior.
"""

from typing import List, Dict, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import math


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Average time to load one truck at a warehouse (in hours).
# This is μ⁻¹ — the mean service time.
# Indian freight loading typically takes 30-60 minutes.
DEFAULT_LOADING_TIME_HOURS = 0.5  # 30 minutes

# Time window to analyze for arrival rate.
# We look at how many trucks arrive within this window.
DEFAULT_ANALYSIS_WINDOW_HOURS = 4.0

# Utilization threshold for congestion warning.
# ρ > 0.85 means the queue grows faster than it's served.
CONGESTION_THRESHOLD = 0.85

# Critical congestion — queue is unstable
CRITICAL_THRESHOLD = 0.95


# ---------------------------------------------------------------------------
# Time parsing helper
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


# ---------------------------------------------------------------------------
# Pre-optimization queue analysis
# ---------------------------------------------------------------------------

def analyze_warehouse_congestion(
    shipments: List[Dict],
    loading_time_hours: float = DEFAULT_LOADING_TIME_HOURS,
    analysis_window_hours: float = DEFAULT_ANALYSIS_WINDOW_HOURS,
) -> Dict:
    """
    Analyze potential warehouse congestion BEFORE optimization.

    Groups shipments by origin city and pickup time window.
    For each warehouse, computes M/M/1 queuing metrics to predict
    whether trucks will experience loading delays.

    This runs BEFORE the solver so congestion warnings can inform
    the optimization — the insight agent can recommend staggering
    pickups or splitting across shifts.

    Args:
        shipments: All shipments in the batch
        loading_time_hours: Average time to load one truck (μ⁻¹)
        analysis_window_hours: Time window for arrival rate computation

    Returns:
        Dict with per-warehouse metrics and overall congestion summary
    """
    if not shipments:
        return {"warehouses": [], "congested_count": 0, "total_warehouses": 0}

    # Service rate: trucks that can be loaded per hour
    mu = 1.0 / loading_time_hours  # e.g., 2 trucks/hour for 30-min loading

    # Group shipments by origin city
    origin_groups = defaultdict(list)
    for s in shipments:
        origin = s.get("origin", "Unknown")
        origin_groups[origin].append(s)

    warehouse_reports = []
    congested_count = 0
    critical_count = 0

    for origin, group in origin_groups.items():
        n_shipments = len(group)

        # Parse pickup times to find the time window
        pickup_times = []
        for s in group:
            pt = _parse_time(s.get("pickup_time"))
            if pt:
                pickup_times.append(pt)

        # Compute the actual time span of pickups at this warehouse
        if len(pickup_times) >= 2:
            pickup_times.sort()
            time_span_hours = (pickup_times[-1] - pickup_times[0]).total_seconds() / 3600
            # Use actual span or analysis window, whichever is larger
            effective_window = max(time_span_hours, 1.0)  # At least 1 hour
        else:
            effective_window = analysis_window_hours

        # Arrival rate: trucks per hour
        lambda_rate = n_shipments / effective_window

        # Utilization
        rho = lambda_rate / mu

        # M/M/1 metrics (only valid when ρ < 1)
        if rho < 1.0:
            # Average number in queue (Lq)
            lq = (rho ** 2) / (1 - rho)
            # Average wait time in queue (Wq) in hours
            wq = lq / lambda_rate if lambda_rate > 0 else 0
            # Average time in system (W = Wq + 1/μ)
            w = wq + (1 / mu)
            # Average number in system (L = λW)
            l = lambda_rate * w

            queue_stable = True
        else:
            # Queue is unstable — arrivals faster than service
            lq = float('inf')
            wq = float('inf')
            w = float('inf')
            l = float('inf')
            queue_stable = False

        # Determine congestion level
        if rho >= CRITICAL_THRESHOLD:
            congestion_level = "CRITICAL"
            critical_count += 1
            congested_count += 1
        elif rho >= CONGESTION_THRESHOLD:
            congestion_level = "WARNING"
            congested_count += 1
        elif rho >= 0.7:
            congestion_level = "MODERATE"
        else:
            congestion_level = "LOW"

        # Format wait time for display
        if queue_stable and wq < 100:
            wait_minutes = round(wq * 60, 1)
            system_minutes = round(w * 60, 1)
        else:
            wait_minutes = None  # Infinite / unstable
            system_minutes = None

        warehouse_reports.append({
            "warehouse": origin,
            "shipment_count": n_shipments,
            "time_window_hours": round(effective_window, 1),
            "arrival_rate_per_hour": round(lambda_rate, 2),
            "service_rate_per_hour": round(mu, 2),
            "utilization_rho": round(min(rho, 9.99), 3),
            "avg_queue_length": round(lq, 1) if queue_stable and lq < 100 else "∞",
            "avg_wait_minutes": wait_minutes,
            "avg_system_minutes": system_minutes,
            "avg_in_system": round(l, 1) if queue_stable and l < 100 else "∞",
            "congestion_level": congestion_level,
            "queue_stable": queue_stable,
            "message": _generate_warehouse_message(
                origin, n_shipments, rho, wait_minutes, congestion_level
            ),
        })

    # Sort by utilization descending — most congested first
    warehouse_reports.sort(key=lambda w: w["utilization_rho"], reverse=True)

    total_warehouses = len(warehouse_reports)

    print(f"[Queue Analysis] {total_warehouses} warehouses analyzed. "
          f"{congested_count} congested (ρ > {CONGESTION_THRESHOLD}), "
          f"{critical_count} critical (ρ > {CRITICAL_THRESHOLD}).")

    return {
        "warehouses": warehouse_reports,
        "congested_count": congested_count,
        "critical_count": critical_count,
        "total_warehouses": total_warehouses,
        "loading_time_minutes": round(loading_time_hours * 60, 0),
        "congestion_threshold": CONGESTION_THRESHOLD,
        "recommendations": _generate_queue_recommendations(
            warehouse_reports, congested_count, loading_time_hours
        ),
    }


# ---------------------------------------------------------------------------
# Post-optimization queue analysis
# ---------------------------------------------------------------------------

def analyze_post_optimization_congestion(
    assignments: List[Dict],
    shipments: List[Dict],
    loading_time_hours: float = DEFAULT_LOADING_TIME_HOURS,
) -> Dict:
    """
    Analyze warehouse congestion AFTER optimization.

    Checks how many trucks the solver is actually sending to each
    warehouse. Even if pre-optimization looked fine, consolidation
    might bunch multiple shipments onto trucks that all depart from
    the same origin.

    Args:
        assignments: Solver output assignments
        shipments: All shipments for lookup
        loading_time_hours: Average loading time per truck

    Returns:
        Dict with per-warehouse post-optimization metrics
    """
    if not assignments:
        return {"warehouses": [], "congested_count": 0}

    shipment_lookup = {s.get("shipment_id", ""): s for s in shipments}
    mu = 1.0 / loading_time_hours

    # Count trucks going to each origin
    origin_truck_count = defaultdict(int)
    origin_shipment_count = defaultdict(int)

    for assignment in assignments:
        sids = assignment.get("shipment_ids", [])
        origins_for_truck = set()
        for sid in sids:
            s = shipment_lookup.get(sid, {})
            origin = s.get("origin", "")
            if origin:
                origins_for_truck.add(origin)
                origin_shipment_count[origin] += 1

        # Each unique origin this truck visits counts as one arrival
        for origin in origins_for_truck:
            origin_truck_count[origin] += 1

    # Compute M/M/1 metrics for post-optimization
    results = []
    congested = 0

    for origin, truck_count in origin_truck_count.items():
        # Assume trucks arrive within a 4-hour window
        lambda_rate = truck_count / DEFAULT_ANALYSIS_WINDOW_HOURS
        rho = lambda_rate / mu

        congestion_level = "LOW"
        if rho >= CRITICAL_THRESHOLD:
            congestion_level = "CRITICAL"
            congested += 1
        elif rho >= CONGESTION_THRESHOLD:
            congestion_level = "WARNING"
            congested += 1

        results.append({
            "warehouse": origin,
            "trucks_arriving": truck_count,
            "shipments_from_here": origin_shipment_count[origin],
            "utilization_rho": round(min(rho, 9.99), 3),
            "congestion_level": congestion_level,
        })

    results.sort(key=lambda r: r["utilization_rho"], reverse=True)

    return {
        "warehouses": results,
        "congested_count": congested,
    }


# ---------------------------------------------------------------------------
# Message and recommendation generators
# ---------------------------------------------------------------------------

def _generate_warehouse_message(
    origin: str, count: int, rho: float,
    wait_minutes: Optional[float], level: str,
) -> str:
    """Generate a human-readable message for one warehouse."""
    if level == "CRITICAL":
        return (
            f"{origin} warehouse: {count} shipments, ρ={rho:.2f} (CRITICAL). "
            f"Queue is near-unstable — trucks will face severe delays. "
            f"Stagger pickup times or split across shifts immediately."
        )
    elif level == "WARNING":
        wait_str = f"{wait_minutes:.0f} min" if wait_minutes else "significant"
        return (
            f"{origin} warehouse: {count} shipments, ρ={rho:.2f}. "
            f"Expected wait: {wait_str} per truck. "
            f"Consider staggering pickups or adding loading capacity."
        )
    elif level == "MODERATE":
        return (
            f"{origin} warehouse: {count} shipments, ρ={rho:.2f}. "
            f"Moderate load — manageable but monitor during peak hours."
        )
    else:
        return (
            f"{origin} warehouse: {count} shipments, ρ={rho:.2f}. "
            f"Low congestion — no delays expected."
        )


def _generate_queue_recommendations(
    warehouse_reports: List[Dict],
    congested_count: int,
    loading_time_hours: float,
) -> List[Dict]:
    """Generate recommendations based on queuing analysis."""
    recs = []

    if congested_count == 0:
        recs.append({
            "type": "QUEUE_HEALTHY",
            "priority": "LOW",
            "message": "All warehouses operating below congestion threshold. No scheduling changes needed.",
        })
        return recs

    # Congested warehouses
    congested = [w for w in warehouse_reports if w["congestion_level"] in ("WARNING", "CRITICAL")]
    for wh in congested:
        if wh["congestion_level"] == "CRITICAL":
            recs.append({
                "type": "CRITICAL_CONGESTION",
                "priority": "HIGH",
                "message": (
                    f"{wh['warehouse']}: ρ={wh['utilization_rho']:.2f} — "
                    f"arrival rate exceeds service capacity. "
                    f"Split {wh['shipment_count']} shipments across two pickup windows "
                    f"or add a second loading dock."
                ),
            })
        else:
            wait = wh.get("avg_wait_minutes")
            wait_str = f"~{wait:.0f} min wait" if wait else "elevated wait times"
            recs.append({
                "type": "CONGESTION_WARNING",
                "priority": "MEDIUM",
                "message": (
                    f"{wh['warehouse']}: ρ={wh['utilization_rho']:.2f}, {wait_str}. "
                    f"Stagger {wh['shipment_count']} pickup times by "
                    f"{loading_time_hours * 60:.0f}+ minutes to reduce queue buildup."
                ),
            })

    return recs