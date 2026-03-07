"""
Simulation endpoint — runs 4 scenario simulations on an existing plan.

POST /simulate takes a plan_id and generates results for:
- STRICT_SLA: tight time windows, no flexibility
- FLEXIBLE_SLA: relaxed windows for better consolidation
- VEHICLE_SHORTAGE: fewer trucks available (stress test)
- DEMAND_SURGE: higher shipment volume (capacity test)

Each scenario produces metrics that Agent 4 (Scenario Recommender)
later compares to suggest the best operational strategy.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.plan import ConsolidationPlan, ScenarioResult, ScenarioTypeEnum
from backend.app.schemas.plan import ScenarioResultResponse
from typing import List

router = APIRouter()


@router.post("/simulate", response_model=List[ScenarioResultResponse])
def run_simulation(plan_id: int, db: Session = Depends(get_db)):
    """
    Run all 4 scenario simulations for a given plan.

    Right now this generates placeholder metrics for each scenario.
    Later, each scenario will re-run the optimizer with tweaked constraints:
    - STRICT_SLA → original time windows, no relaxation
    - FLEXIBLE_SLA → windows expanded by ±30 min
    - VEHICLE_SHORTAGE → only 70% of fleet available
    - DEMAND_SURGE → shipment count multiplied by 1.5x
    """
    # Verify the plan exists before running simulations
    plan = db.query(ConsolidationPlan).filter(ConsolidationPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan {plan_id} not found.")

    # Clear any previous simulation results for this plan
    # (in case the user re-runs simulations after tweaking data)
    db.query(ScenarioResult).filter(ScenarioResult.plan_id == plan_id).delete()
    db.commit()

    # --- PLACEHOLDER: actual simulation engine goes here ---
    # For now, generate dummy metrics for each scenario type.
    # These will be replaced by real solver re-runs with modified constraints.
    placeholder_scenarios = [
        {
            "scenario_type": ScenarioTypeEnum.STRICT_SLA,
            "trucks_used": 12,
            "avg_utilization": 72.5,
            "total_cost": 45000.0,
            "carbon_emissions": 1200.0,
            "sla_success_rate": 95.0,
        },
        {
            "scenario_type": ScenarioTypeEnum.FLEXIBLE_SLA,
            "trucks_used": 9,
            "avg_utilization": 85.3,
            "total_cost": 35000.0,
            "carbon_emissions": 950.0,
            "sla_success_rate": 88.0,
        },
        {
            "scenario_type": ScenarioTypeEnum.VEHICLE_SHORTAGE,
            "trucks_used": 7,
            "avg_utilization": 91.0,
            "total_cost": 38000.0,
            "carbon_emissions": 1050.0,
            "sla_success_rate": 78.0,
        },
        {
            "scenario_type": ScenarioTypeEnum.DEMAND_SURGE,
            "trucks_used": 15,
            "avg_utilization": 68.0,
            "total_cost": 55000.0,
            "carbon_emissions": 1500.0,
            "sla_success_rate": 70.0,
        },
    ]

    created = []
    for scenario_data in placeholder_scenarios:
        result = ScenarioResult(plan_id=plan_id, **scenario_data)
        db.add(result)
        created.append(result)

    db.commit()

    # Refresh to pick up auto-generated IDs
    for c in created:
        db.refresh(c)

    return [ScenarioResultResponse.model_validate(c) for c in created]