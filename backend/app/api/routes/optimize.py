"""
Optimization endpoint — triggers the full consolidation pipeline.

POST /optimize kicks off:
1. Validation Agent checks input data
2. ML compatibility scoring
3. OR-Tools solver builds the plan
4. Insight Agent explains the results

Right now, steps 1-4 are stubbed — this route creates a DRAFT plan
and returns it. We'll wire in the actual solver and agents later.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.shipment import Shipment
from backend.app.models.vehicle import Vehicle
from backend.app.models.plan import ConsolidationPlan, PlanStatusEnum
from backend.app.schemas.plan import PlanResponse

router = APIRouter()


@router.post("/optimize", response_model=PlanResponse)
def run_optimization(db: Session = Depends(get_db)):
    """
    Trigger the optimization pipeline.

    For now, this is a placeholder that:
    - Verifies we have shipments and vehicles in the DB
    - Creates a DRAFT consolidation plan
    - Returns it so the frontend has something to render

    Later, this will call:
    - validation_agent.validate(shipments)
    - compatibility_model.score(shipments)
    - solver.optimize(shipments, vehicles, compatibility_graph)
    - insight_agent.explain(plan)
    """
    # Make sure we actually have data to work with
    shipment_count = db.query(Shipment).count()
    vehicle_count = db.query(Vehicle).count()

    if shipment_count == 0:
        raise HTTPException(status_code=400, detail="No shipments found. Upload shipments first.")
    if vehicle_count == 0:
        raise HTTPException(status_code=400, detail="No vehicles found. Seed vehicle fleet first.")

    # --- PLACEHOLDER: actual optimizer pipeline goes here ---
    # For now, create a draft plan with baseline metrics
    plan = ConsolidationPlan(
        status=PlanStatusEnum.DRAFT,
        total_trucks=0,
        trips_baseline=shipment_count,  # Worst case: 1 trip per shipment
        avg_utilization=0.0,
        cost_saving_pct=0.0,
        carbon_saving_pct=0.0,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    # Return the plan (no assignments or scenarios yet — those come from solver + simulator)
    return PlanResponse(
        id=plan.id,
        created_at=plan.created_at,
        status=plan.status.value,
        total_trucks=plan.total_trucks,
        trips_baseline=plan.trips_baseline,
        avg_utilization=plan.avg_utilization,
        cost_saving_pct=plan.cost_saving_pct,
        carbon_saving_pct=plan.carbon_saving_pct,
        assignments=[],
        scenarios=[],
    )