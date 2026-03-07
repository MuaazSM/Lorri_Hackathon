"""
Optimization endpoint — triggers the full consolidation pipeline.

POST /optimize kicks off:
1. Validation Agent checks input data 
2. ML compatibility scoring (TODO)
3. OR-Tools solver builds the plan (TODO — placeholder for now)
4. Insight Agent explains the results 
5. Constraint Relaxation Agent diagnoses infeasibility 

Returns a consistent JSON shape every time:
- validation: always present
- plan: present only if validation passed and solver ran
- insights: present only if a plan was generated
- relaxation: present only if solver had unassigned shipments or infeasibility
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.shipment import Shipment
from backend.app.models.vehicle import Vehicle
from backend.app.models.plan import ConsolidationPlan, PlanStatusEnum
from backend.app.agents.validation_agent import run_validation
from backend.app.agents.insight_agent import run_insight_analysis
from backend.app.agents.relaxation_agent import run_relaxation_analysis

router = APIRouter()


@router.post("/optimize")
def run_optimization(db: Session = Depends(get_db)):
    """
    Trigger the optimization pipeline.

    Always returns a 200 with a consistent response shape:
    {
        "validation": { ... },       // always present
        "plan": { ... } | null,      // null if validation failed
        "insights": { ... } | null,  // null if no plan generated
        "relaxation": { ... } | null // null if plan is fully feasible
    }

    The frontend uses these four sections to render different panels:
    - validation.is_valid → show validation issues or proceed
    - plan → show plan summary and assignments
    - insights → show agent insights panel with lane commentary
    - relaxation → show infeasibility diagnosis and fix suggestions
    """
    # Step 0: Load all shipments and vehicles from the DB
    # Convert ORM objects to plain dicts so the agents
    # don't need to know about SQLAlchemy internals.
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

    # Handle empty database — no point running anything on nothing
    if not shipments:
        return {
            "validation": {
                "is_valid": False,
                "errors": [{"severity": "ERROR", "shipment_id": None, "field": None,
                            "message": "No shipments found. Upload shipments first via POST /shipments or POST /dev/seed."}],
                "warnings": [],
                "info": [],
                "summary_counts": {"total_shipments": 0, "total_vehicles": len(vehicles),
                                   "error_count": 1, "warning_count": 0, "info_count": 0},
                "llm_summary": None,
            },
            "plan": None,
            "insights": None,
            "relaxation": None,
        }

    if not vehicles:
        return {
            "validation": {
                "is_valid": False,
                "errors": [{"severity": "ERROR", "shipment_id": None, "field": None,
                            "message": "No vehicles found. Seed vehicle fleet first via POST /dev/seed."}],
                "warnings": [],
                "info": [],
                "summary_counts": {"total_shipments": len(shipments), "total_vehicles": 0,
                                   "error_count": 1, "warning_count": 0, "info_count": 0},
                "llm_summary": None,
            },
            "plan": None,
            "insights": None,
            "relaxation": None,
        }

    # Step 1: Run the Validation Agent
    validation_report = run_validation(shipments, vehicles)

    # If validation found critical errors, stop here.
    if not validation_report["is_valid"]:
        return {
            "validation": validation_report,
            "plan": None,
            "insights": None,
            "relaxation": None,
        }

    # Step 2: TODO — ML compatibility scoring
    # compatibility_graph = compatibility_model.score(shipments)

    # Step 3: TODO — OR-Tools solver
    # solver_result = solver.optimize(shipments, vehicles, compatibility_graph)
    # assigned_shipments = solver_result["assigned"]
    # unassigned_shipments = solver_result["unassigned"]
    # is_infeasible = solver_result["is_infeasible"]

    # PLACEHOLDER: simulate solver output until real solver is wired in
    # For now, pretend all shipments are assigned (no infeasibility).
    # When the solver is integrated, replace these with actual solver output.
    assigned_shipments = shipments
    unassigned_shipments = []   # Will be populated by real solver
    is_infeasible = False       # Will be set by real solver
    solver_assignments = []     # Will contain vehicle-to-shipment mappings

    # Create the plan in the database
    plan = ConsolidationPlan(
        status=PlanStatusEnum.DRAFT if is_infeasible else PlanStatusEnum.OPTIMIZED,
        total_trucks=0,
        trips_baseline=len(shipments),
        avg_utilization=0.0,
        cost_saving_pct=0.0,
        carbon_saving_pct=0.0,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    # Build the plan dict for the response
    plan_dict = {
        "id": plan.id,
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "status": plan.status.value,
        "total_trucks": plan.total_trucks,
        "trips_baseline": plan.trips_baseline,
        "avg_utilization": plan.avg_utilization,
        "cost_saving_pct": plan.cost_saving_pct,
        "carbon_saving_pct": plan.carbon_saving_pct,
        "assignments": [],
        "scenarios": [],
    }

    # Step 4: Run the Insight Agent
    insights = run_insight_analysis(
        plan=plan_dict,
        assignments=solver_assignments,
        shipments=shipments,
        vehicles=vehicles,
    )

    # Step 5: Run the Relaxation Agent (only if there are issues)
    # This agent activates when the solver couldn't assign all shipments.
    # It diagnoses why and suggests the smallest fixes to make it work.
    relaxation = None
    if unassigned_shipments or is_infeasible:
        relaxation = run_relaxation_analysis(
            all_shipments=shipments,
            unassigned_shipments=unassigned_shipments,
            vehicles=vehicles,
            is_fully_infeasible=is_infeasible,
        )

    return {
        "validation": validation_report,
        "plan": plan_dict,
        "insights": insights,
        "relaxation": relaxation,
    }