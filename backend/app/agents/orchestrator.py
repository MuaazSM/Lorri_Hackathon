"""
Agent Orchestrator — Sequential pipeline that wires all 4 agents together.

This is the brain of the system. Instead of the optimize route manually
calling each agent, it calls orchestrator.run() which handles the full
pipeline: Validate → Solve → Insight → Simulate → Scenario Recommend.

Each step's output feeds into the next, and the orchestrator tracks
timing, step statuses, and errors so we know exactly what happened
during a run.

Design principles:
- Single entry point: one function call, one unified response
- Error isolation: if one agent fails, the pipeline continues
  (LLM narratives go null, but structured outputs still flow)
- Configurable: skip simulation, skip LLM calls, adjust weights
- Consistent response shape: every field is always present (null if skipped)

Pipeline:
    Step 1: Validation Agent → blocks if critical errors
    Step 2: OR Solver → placeholder until real solver is wired in
    Step 2b: Relaxation Agent → only if solver has unassigned shipments
    Step 3: Insight Agent → analyzes plan quality
    Step 4: Simulation + Scenario Agent → runs 4 scenarios and recommends
"""

import time
from typing import List, Dict, Optional
from backend.app.agents.validation_agent import run_validation
from backend.app.agents.insight_agent import run_insight_analysis
from backend.app.agents.relaxation_agent import run_relaxation_analysis
from backend.app.agents.scenario_agent import run_scenario_analysis


# Pipeline configuration defaults

DEFAULT_CONFIG = {
    # Whether to run the simulation + scenario recommendation step.
    # Set to False for faster runs during development or when you
    # only care about the optimization result, not scenario comparison.
    "run_simulation": True,

    # Whether to generate LLM narratives (requires GOOGLE_API_KEY).
    # Set to False for faster runs or when no API key is available.
    # Structured outputs still work without LLM — only the natural
    # language summaries are skipped.
    "run_llm": True,

    # Scenario comparison weights for the balanced recommendation.
    # These can be overridden per request from the frontend.
    "cost_weight": 0.40,
    "sla_weight": 0.35,
    "carbon_weight": 0.25,
}


# Step result builder

def _step_result(
    name: str,
    status: str,
    duration_ms: float,
    output: Optional[Dict] = None,
    error: Optional[str] = None,
) -> Dict:
    """
    Build a metadata entry for one pipeline step.

    Tracks what happened at each stage so the frontend can show
    a pipeline progress indicator and the team can debug issues.

    Args:
        name: Human-readable step name (e.g. "Validation Agent")
        status: "completed", "skipped", "failed", "blocked"
        duration_ms: How long this step took in milliseconds
        output: The step's output dict (or None if it didn't run)
        error: Error message if the step failed
    """
    return {
        "step": name,
        "status": status,
        "duration_ms": round(duration_ms, 1),
        "error": error,
    }


# Placeholder solver

def _run_placeholder_solver(
    shipments: List[Dict],
    vehicles: List[Dict],
) -> Dict:
    """
    Placeholder for the OR-Tools solver.

    Returns a fake solver result so the rest of the pipeline can run.
    When the real solver is built, replace this function's internals
    and everything downstream will just work.

    The solver result format is the contract between the solver and
    the rest of the pipeline:
    - assigned: list of assignment dicts (vehicle → shipments)
    - unassigned: list of shipment dicts that couldn't be placed
    - is_infeasible: True if no valid plan exists at all
    - plan_metrics: summary stats for the ConsolidationPlan row
    """
    # For now, pretend all shipments are assigned successfully
    # with some reasonable placeholder metrics
    return {
        "assigned": [],        # Real solver fills this with vehicle-to-shipment mappings
        "unassigned": [],      # Real solver puts leftover shipments here
        "is_infeasible": False,
        "plan_metrics": {
            "total_trucks": 0,
            "trips_baseline": len(shipments),
            "avg_utilization": 0.0,
            "cost_saving_pct": 0.0,
            "carbon_saving_pct": 0.0,
        },
    }


# Placeholder simulation engine

def _run_placeholder_simulation(
    shipments: List[Dict],
    vehicles: List[Dict],
) -> List[Dict]:
    """
    Placeholder for the scenario simulation engine.

    Returns dummy metrics for all 4 scenarios. When the real simulation
    engine is built, it will re-run the solver with modified constraints
    for each scenario type.

    The values here are designed to show realistic trade-offs:
    - STRICT_SLA: best SLA, highest cost
    - FLEXIBLE_SLA: best cost + carbon, moderate SLA
    - VEHICLE_SHORTAGE: fewest trucks, high utilization, lower SLA
    - DEMAND_SURGE: stress test, everything worse
    """
    return [
        {
            "scenario_type": "STRICT_SLA",
            "trucks_used": 12,
            "avg_utilization": 72.5,
            "total_cost": 45000.0,
            "carbon_emissions": 1200.0,
            "sla_success_rate": 95.0,
        },
        {
            "scenario_type": "FLEXIBLE_SLA",
            "trucks_used": 9,
            "avg_utilization": 85.3,
            "total_cost": 35000.0,
            "carbon_emissions": 950.0,
            "sla_success_rate": 88.0,
        },
        {
            "scenario_type": "VEHICLE_SHORTAGE",
            "trucks_used": 7,
            "avg_utilization": 91.0,
            "total_cost": 38000.0,
            "carbon_emissions": 1050.0,
            "sla_success_rate": 78.0,
        },
        {
            "scenario_type": "DEMAND_SURGE",
            "trucks_used": 15,
            "avg_utilization": 68.0,
            "total_cost": 55000.0,
            "carbon_emissions": 1500.0,
            "sla_success_rate": 70.0,
        },
    ]


# Main orchestrator

def run_pipeline(
    shipments: List[Dict],
    vehicles: List[Dict],
    config: Optional[Dict] = None,
) -> Dict:
    """
    Run the full agent pipeline: Validate → Solve → Insight → Simulate → Recommend.

    This is THE function that the /optimize endpoint calls. One call,
    one unified response. Each step feeds into the next, and the
    orchestrator handles timing, error isolation, and skipping.

    Args:
        shipments: List of shipment dicts (already converted from ORM)
        vehicles: List of vehicle dicts (already converted from ORM)
        config: Optional overrides for pipeline behavior. Keys:
            - run_simulation (bool): whether to run scenarios
            - run_llm (bool): whether to generate LLM narratives
            - cost_weight, sla_weight, carbon_weight (float): scenario weights

    Returns:
        Unified response dict with:
        - validation: always present
        - plan: present if validation passed
        - insights: present if plan was generated
        - relaxation: present if solver had issues
        - scenarios: present if simulation ran
        - scenario_analysis: present if scenarios were generated
        - pipeline_metadata: timing and status for each step
    """
    # Merge user config with defaults
    cfg = {**DEFAULT_CONFIG, **(config or {})}

    # If run_llm is False, temporarily unset the API key so agents
    # skip their LLM calls without needing to change their code
    import os
    original_key = os.getenv("GOOGLE_API_KEY", "")
    if not cfg["run_llm"]:
        os.environ["GOOGLE_API_KEY"] = ""

    # Initialize the response — every field is always present
    response = {
        "validation": None,
        "plan": None,
        "insights": None,
        "relaxation": None,
        "scenarios": None,
        "scenario_analysis": None,
        "pipeline_metadata": {
            "steps": [],
            "total_duration_ms": 0,
            "config": cfg,
        },
    }

    pipeline_start = time.time()

    # STEP 1: Validation Agent
    step_start = time.time()
    try:
        validation_report = run_validation(shipments, vehicles)
        response["validation"] = validation_report

        step_status = "completed"
        step_error = None
    except Exception as e:
        # If validation itself crashes, we can't proceed safely
        response["validation"] = {
            "is_valid": False,
            "errors": [{"severity": "ERROR", "shipment_id": None, "field": None,
                        "message": f"Validation agent crashed: {str(e)}"}],
            "warnings": [],
            "info": [],
            "summary_counts": {"total_shipments": len(shipments), "total_vehicles": len(vehicles),
                               "error_count": 1, "warning_count": 0, "info_count": 0},
            "llm_summary": None,
        }
        validation_report = response["validation"]
        step_status = "failed"
        step_error = str(e)

    step_duration = (time.time() - step_start) * 1000
    response["pipeline_metadata"]["steps"].append(
        _step_result("Validation Agent", step_status, step_duration, error=step_error)
    )

    # If validation found critical errors, stop the pipeline here.
    # No point running the solver on bad data.
    if not validation_report.get("is_valid", False):
        # Restore API key and return early
        if not cfg["run_llm"]:
            os.environ["GOOGLE_API_KEY"] = original_key

        total_duration = (time.time() - pipeline_start) * 1000
        response["pipeline_metadata"]["total_duration_ms"] = round(total_duration, 1)

        # Mark remaining steps as blocked
        for step_name in ["OR Solver", "Insight Agent", "Simulation Engine", "Scenario Agent"]:
            response["pipeline_metadata"]["steps"].append(
                _step_result(step_name, "blocked", 0, error="Blocked by validation errors")
            )

        return response

    # STEP 2: OR Solver
    step_start = time.time()
    try:
        solver_result = _run_placeholder_solver(shipments, vehicles)

        # Build the plan dict from solver output
        plan_metrics = solver_result["plan_metrics"]
        response["plan"] = {
            "status": "INFEASIBLE" if solver_result["is_infeasible"] else "OPTIMIZED",
            "total_trucks": plan_metrics["total_trucks"],
            "trips_baseline": plan_metrics["trips_baseline"],
            "avg_utilization": plan_metrics["avg_utilization"],
            "cost_saving_pct": plan_metrics["cost_saving_pct"],
            "carbon_saving_pct": plan_metrics["carbon_saving_pct"],
            "assignments": solver_result["assigned"],
        }

        step_status = "completed"
        step_error = None
    except Exception as e:
        # Solver crash — create a failed plan entry
        response["plan"] = {
            "status": "FAILED",
            "error": str(e),
            "assignments": [],
        }
        solver_result = {"assigned": [], "unassigned": shipments, "is_infeasible": True,
                         "plan_metrics": {"total_trucks": 0, "trips_baseline": len(shipments),
                                          "avg_utilization": 0, "cost_saving_pct": 0, "carbon_saving_pct": 0}}
        step_status = "failed"
        step_error = str(e)

    step_duration = (time.time() - step_start) * 1000
    response["pipeline_metadata"]["steps"].append(
        _step_result("OR Solver", step_status, step_duration, error=step_error)
    )

    # STEP 2b: Relaxation Agent (only if solver had issues)
    unassigned = solver_result.get("unassigned", [])
    is_infeasible = solver_result.get("is_infeasible", False)

    if unassigned or is_infeasible:
        step_start = time.time()
        try:
            relaxation_report = run_relaxation_analysis(
                all_shipments=shipments,
                unassigned_shipments=unassigned,
                vehicles=vehicles,
                is_fully_infeasible=is_infeasible,
            )
            response["relaxation"] = relaxation_report
            step_status = "completed"
            step_error = None
        except Exception as e:
            response["relaxation"] = {
                "is_feasible": False,
                "error": f"Relaxation agent crashed: {str(e)}",
                "suggestions": [],
            }
            step_status = "failed"
            step_error = str(e)

        step_duration = (time.time() - step_start) * 1000
        response["pipeline_metadata"]["steps"].append(
            _step_result("Relaxation Agent", step_status, step_duration, error=step_error)
        )
    else:
        response["pipeline_metadata"]["steps"].append(
            _step_result("Relaxation Agent", "skipped", 0, error="Plan is feasible — no relaxation needed")
        )

    # STEP 3: Insight Agent
    step_start = time.time()
    try:
        insights = run_insight_analysis(
            plan=response["plan"],
            assignments=solver_result.get("assigned", []),
            shipments=shipments,
            vehicles=vehicles,
        )
        response["insights"] = insights
        step_status = "completed"
        step_error = None
    except Exception as e:
        response["insights"] = {
            "error": f"Insight agent crashed: {str(e)}",
            "plan_summary": {},
            "lane_insights": [],
            "risk_flags": [],
            "recommendations": [],
            "llm_narrative": None,
        }
        step_status = "failed"
        step_error = str(e)

    step_duration = (time.time() - step_start) * 1000
    response["pipeline_metadata"]["steps"].append(
        _step_result("Insight Agent", step_status, step_duration, error=step_error)
    )

    # STEP 4: Simulation + Scenario Recommendation Agent
    if cfg["run_simulation"]:
        # Step 4a: Run simulation engine
        step_start = time.time()
        try:
            scenario_results = _run_placeholder_simulation(shipments, vehicles)
            response["scenarios"] = scenario_results
            sim_status = "completed"
            sim_error = None
        except Exception as e:
            response["scenarios"] = []
            scenario_results = []
            sim_status = "failed"
            sim_error = str(e)

        step_duration = (time.time() - step_start) * 1000
        response["pipeline_metadata"]["steps"].append(
            _step_result("Simulation Engine", sim_status, step_duration, error=sim_error)
        )

        # Step 4b: Run Scenario Recommendation Agent
        if scenario_results:
            step_start = time.time()
            try:
                scenario_analysis = run_scenario_analysis(
                    scenarios=scenario_results,
                    cost_weight=cfg["cost_weight"],
                    sla_weight=cfg["sla_weight"],
                    carbon_weight=cfg["carbon_weight"],
                )
                response["scenario_analysis"] = scenario_analysis
                step_status = "completed"
                step_error = None
            except Exception as e:
                response["scenario_analysis"] = {
                    "error": f"Scenario agent crashed: {str(e)}",
                    "recommendations": {},
                }
                step_status = "failed"
                step_error = str(e)

            step_duration = (time.time() - step_start) * 1000
            response["pipeline_metadata"]["steps"].append(
                _step_result("Scenario Agent", step_status, step_duration, error=step_error)
            )
        else:
            response["pipeline_metadata"]["steps"].append(
                _step_result("Scenario Agent", "skipped", 0, error="No scenario results to analyze")
            )
    else:
        # Simulation was skipped by config
        response["pipeline_metadata"]["steps"].append(
            _step_result("Simulation Engine", "skipped", 0, error="Skipped by config")
        )
        response["pipeline_metadata"]["steps"].append(
            _step_result("Scenario Agent", "skipped", 0, error="Skipped by config")
        )

    # Finalize

    # Restore the API key if we suppressed it
    if not cfg["run_llm"]:
        os.environ["GOOGLE_API_KEY"] = original_key

    # Record total pipeline duration
    total_duration = (time.time() - pipeline_start) * 1000
    response["pipeline_metadata"]["total_duration_ms"] = round(total_duration, 1)

    return response