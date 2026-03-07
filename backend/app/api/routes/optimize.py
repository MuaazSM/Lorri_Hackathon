"""
Optimization endpoint — triggers the full LangGraph agent pipeline.

POST /optimize loads data from the DB, runs the LangGraph state graph
(Validate → Reason → Decide → Act → Learn), saves results to the DB,
and returns the unified response.

Query params for pipeline configuration:
- run_simulation: run the 4 scenario simulations (default true)
- run_llm: generate LLM narratives via Gemini (default true)
- cost_weight / sla_weight / carbon_weight: scenario comparison weights
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.shipment import Shipment
from backend.app.models.vehicle import Vehicle
from backend.app.models.plan import (
    ConsolidationPlan, PlanAssignment, ScenarioResult,
    PlanStatusEnum, ScenarioTypeEnum,
)
from backend.app.agents.langgraph_pipeline import run_pipeline
import json

router = APIRouter()


def _empty_response(message: str, count: int, is_vehicle_error: bool = False) -> dict:
    """
    Build a standardized response for when the database is empty.
    Keeps the response shape consistent so the frontend doesn't
    need special handling for edge cases.
    """
    return {
        "validation": {
            "is_valid": False,
            "errors": [{"severity": "ERROR", "shipment_id": None, "field": None, "message": message}],
            "warnings": [], "info": [],
            "summary_counts": {
                "total_shipments": 0 if not is_vehicle_error else count,
                "total_vehicles": count if not is_vehicle_error else 0,
                "error_count": 1, "warning_count": 0, "info_count": 0,
            },
            "llm_summary": None,
        },
        "plan": None, "compatibility": None, "guardrail": None,
        "insights": None, "relaxation": None,
        "scenarios": None, "scenario_analysis": None, "metrics": None,
        "pipeline_metadata": {"steps": [], "total_duration_ms": 0, "retry_count": 0, "config": {}},
    }


@router.post("/optimize")
def run_optimization(
    run_simulation: bool = Query(True, description="Whether to run scenario simulations"),
    run_llm: bool = Query(True, description="Whether to generate LLM narratives (needs GOOGLE_API_KEY)"),
    cost_weight: float = Query(0.40, ge=0, le=1, description="Cost weight for balanced scenario scoring"),
    sla_weight: float = Query(0.35, ge=0, le=1, description="SLA weight for balanced scenario scoring"),
    carbon_weight: float = Query(0.25, ge=0, le=1, description="Carbon weight for balanced scenario scoring"),
    db: Session = Depends(get_db),
):
    """
    Trigger the full LangGraph optimization pipeline.

    This endpoint:
    1. Loads all shipments and vehicles from the database
    2. Runs the LangGraph state graph (all 9 nodes with conditional routing)
    3. Saves the resulting plan, assignments, and scenario results to the DB
    4. Returns the unified response with all agent + solver outputs

    The response always has the same shape — null fields for steps that
    didn't run. The frontend renders different panels based on what's present.
    """
    # --- Load data from DB and convert to plain dicts ---
    shipment_rows = db.query(Shipment).all()
    vehicle_rows = db.query(Vehicle).all()

    shipments = [
        {
            "shipment_id": s.shipment_id,
            "origin": s.origin,
            "destination": s.destination,
            "pickup_time": s.pickup_time.isoformat() if s.pickup_time else None,
            "delivery_time": s.delivery_time.isoformat() if s.delivery_time else None,
            "weight": s.weight,
            "volume": s.volume,
            "priority": s.priority.value if s.priority else None,
            "special_handling": s.special_handling,
            "status": s.status.value if s.status else None,
        }
        for s in shipment_rows
    ]

    vehicles = [
        {
            "vehicle_id": v.vehicle_id,
            "vehicle_type": v.vehicle_type,
            "capacity_weight": v.capacity_weight,
            "capacity_volume": v.capacity_volume,
            "operating_cost": v.operating_cost,
        }
        for v in vehicle_rows
    ]

    # Handle empty database
    if not shipments:
        return _empty_response(
            "No shipments found. Upload shipments first via POST /shipments or POST /dev/seed.",
            len(vehicles),
        )
    if not vehicles:
        return _empty_response(
            "No vehicles found. Seed vehicle fleet first via POST /dev/seed.",
            len(shipments), is_vehicle_error=True,
        )

    # --- Run the LangGraph pipeline ---
    config = {
        "run_simulation": run_simulation,
        "run_llm": run_llm,
        "cost_weight": cost_weight,
        "sla_weight": sla_weight,
        "carbon_weight": carbon_weight,
    }

    result = run_pipeline(shipments, vehicles, config)

    # --- Persist results to DB ---
    plan_data = result.get("plan")
    if plan_data and plan_data.get("status") not in ("FAILED", None):
        db_status = PlanStatusEnum.DRAFT if plan_data.get("is_infeasible") else PlanStatusEnum.OPTIMIZED

        db_plan = ConsolidationPlan(
            status=db_status,
            total_trucks=plan_data.get("total_trucks", 0),
            trips_baseline=plan_data.get("trips_baseline", 0),
            avg_utilization=plan_data.get("avg_utilization", 0),
            cost_saving_pct=plan_data.get("cost_saving_pct", 0),
            carbon_saving_pct=plan_data.get("carbon_saving_pct", 0),
        )
        db.add(db_plan)
        db.commit()
        db.refresh(db_plan)

        # Inject DB-generated ID into the response
        result["plan"]["id"] = db_plan.id
        result["plan"]["created_at"] = db_plan.created_at.isoformat() if db_plan.created_at else None

        # Save assignments
        for assignment in plan_data.get("assigned", []):
            db_assignment = PlanAssignment(
                plan_id=db_plan.id,
                vehicle_id=assignment.get("vehicle_id", ""),
                shipment_ids=json.dumps(assignment.get("shipment_ids", [])),
                utilization_pct=assignment.get("utilization_pct"),
                route_detour_km=assignment.get("route_detour_km"),
            )
            db.add(db_assignment)

        # Save scenario results
        for scenario in (result.get("scenarios") or []):
            try:
                scenario_type = ScenarioTypeEnum(scenario.get("scenario_type", ""))
            except ValueError:
                continue

            db_scenario = ScenarioResult(
                plan_id=db_plan.id,
                scenario_type=scenario_type,
                trucks_used=scenario.get("trucks_used"),
                avg_utilization=scenario.get("avg_utilization"),
                total_cost=scenario.get("total_cost"),
                carbon_emissions=scenario.get("carbon_emissions"),
                sla_success_rate=scenario.get("sla_success_rate"),
            )
            db.add(db_scenario)

        db.commit()

    return result