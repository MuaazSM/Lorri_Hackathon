# BACKEND.md

Complete reference for the Lorri AI backend — a FastAPI application that orchestrates an agentic freight consolidation pipeline using LangGraph, OR-Tools, and scikit-learn.

---

## Entry Point

**`backend/app/main.py`** is the single boot file. It:
- Creates the FastAPI app instance
- Configures CORS middleware (origins from `ALLOWED_ORIGINS` env var, defaults to `localhost:3000`)
- Registers all seven routers
- Calls `Base.metadata.create_all()` on startup to create any missing tables

Run with:
```bash
uvicorn backend.app.main:app --reload   # from repo root
```

---

## Configuration

**`backend/app/core/config.py`** — a single `Settings` class, imported as `settings` everywhere.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./dev.db` | DB connection — auto-converts `postgres://` → `postgresql://` for SQLAlchemy 2.x compat |
| `OPENAI_API_KEY` | `""` | For LangChain agents — app starts and degrades gracefully without it |
| `GOOGLE_API_KEY` | set in `.env` | Gemini 2.0 Flash for LLM narrative generation |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS whitelist for frontend |

---

## Layer Architecture

The backend is split into five clean layers. Data flows top-to-bottom:

```
API Routes (FastAPI)
     ↓
LangGraph Pipeline (agents/langgraph_pipeline.py)
     ↓  ↓  ↓  ↓
   Agents       Tools
(validation,   (data loading,
 insight,       scoring, solving,
 relaxation,    simulation,
 scenario)      logging)
     ↓
Optimizer (OR-Tools CP-SAT + heuristic)
     ↓
ML Layer (scikit-learn RandomForest)
     ↓
Database (SQLAlchemy ORM → SQLite/PostgreSQL)
```

---

## API Routes (`backend/app/api/routes/`)

Each file is an `APIRouter` registered in `main.py`.

| Method | Path | File | What it does |
|---|---|---|---|
| `POST` | `/shipments` | `shipments.py` | Create one or many shipments (accepts single object or list) |
| `GET` | `/shipments` | `shipments.py` | Filtered + paginated shipment list |
| `POST` | `/optimize` | `optimize.py` | **Trigger full pipeline** — thin wrapper over `run_pipeline()` |
| `GET` | `/plan/{id}` | `plan.py` | Fetch a saved consolidation plan with assignments |
| `POST` | `/simulate` | `simulate.py` | Run 4 scenarios on an existing plan |
| `GET` | `/metrics` | `metrics.py` | Latest before/after metrics |
| `GET` | `/history` | `metrics.py` | Past optimization runs from `optimization_outcomes` |
| `POST` | `/dev/seed` | `seed.py` | Seed synthetic or Solomon benchmark data |
| `POST` | `/upload/shipments` | `upload.py` | CSV/Excel shipment upload |
| `POST` | `/upload/vehicles` | `upload.py` | CSV/Excel vehicle upload |
| `GET` | `/health` | `main.py` | Health probe |

**`POST /optimize` query params:**

| Param | Default | Effect |
|---|---|---|
| `run_simulation` | `true` | Whether to run 4 scenario simulations |
| `run_llm` | `true` | Whether to call Gemini for narratives |
| `cost_weight` | `0.40` | Weight for cost in balanced scenario scoring |
| `sla_weight` | `0.35` | Weight for SLA |
| `carbon_weight` | `0.25` | Weight for carbon emissions |

The route persists the plan, assignments, and scenario results to the DB after the pipeline returns, then injects the DB-generated IDs into the response.

---

## LangGraph Pipeline (`backend/app/agents/langgraph_pipeline.py`)

The core intelligence. Implements **Observe → Reason → Decide → Act → Learn** as a `StateGraph`.

### AgentState

A `TypedDict` that flows through every node. Key fields:

| Field | Set by | Purpose |
|---|---|---|
| `shipments`, `vehicles`, `config` | Route / data tool | Pipeline inputs |
| `validation_report` | `validation_node` | Observe phase — data quality result |
| `compatibility_scores` | `compatibility_node` | Reason phase — ML pair scores + graph |
| `guardrail_result` | `guardrail_node` | Decide phase — policy violations |
| `consolidation_plan` | `solver_node` | Act phase — vehicle assignments |
| `scenario_results` | `simulation_node` | 4-scenario simulation outputs |
| `insights` | `insight_node` | LLM narrative + risk flags |
| `scenario_analysis` | `scenario_rec_node` | Agent 4 recommendations |
| `metrics` | `metrics_node` | Learn phase — before/after metrics |
| `retry_count` | Pipeline control | Solver retry counter |
| `step_timings` | All nodes | Per-step duration tracking |

### Graph Flow

```
validation_node
  ├─[invalid]──────────────────────────────────────────► END
  └─[valid]──► compatibility_node ──► guardrail_node
                                        ├─[violated]──► compatibility_node (re-score)
                                        └─[clear]────► solver_node
                                                          ├─[infeasible + retries left]──► relaxation_node ──► solver_node
                                                          ├─[infeasible + exhausted]─────────────────────────► END
                                                          └─[feasible]──► simulation_node ──► insight_node
                                                                            ──► scenario_rec_node ──► metrics_node ──► END
```

Each node owns specific fields in `AgentState` and never modifies another node's output.

---

## Four LLM Agents (`backend/app/agents/`)

Each agent optionally calls **Google Gemini 2.0 Flash** via LangChain. If `GOOGLE_API_KEY` is not set, the agent skips narrative generation and returns structured data only.

| Agent | File | Phase | Role |
|---|---|---|---|
| **Validation Agent** | `validation_agent.py` | Observe | 15+ data quality checks — gates the pipeline on failure. Catches missing fields, invalid time windows, impossible weights, duplicate IDs. |
| **Insight Agent** | `insight_agent.py` | Act (post-solve) | Generates natural language plan explanations, per-lane insights, and risk flags (e.g. "3 shipments close to SLA breach"). |
| **Relaxation Agent** | `relaxation_agent.py` | Act (on infeasibility) | Diagnoses why the solver couldn't find a solution — identifies the blocking constraint and suggests which to relax (time window slack, weight limit, priority downgrade). |
| **Scenario Agent** | `scenario_agent.py` | Learn | Multi-objective scoring of the 4 simulation scenarios. Weights cost/SLA/carbon per the `cost_weight`/`sla_weight`/`carbon_weight` config to produce a ranked recommendation. |

---

## Six Tools (`backend/app/agents/tools/`)

Tools are the nodes that do actual work (no LLM calls). Each tool reads from `AgentState` and writes a specific output field.

| Tool | File | Input → Output |
|---|---|---|
| **Shipment Data Tool** | `shipment_data_tool.py` | DB → `state.shipments`, `state.vehicles` |
| **Compatibility Scoring Tool** | `compatibility_scoring_tool.py` | Shipments → ML scores → networkx graph → `state.compatibility_scores` |
| **Optimization Tool** | `optimization_tool.py` | Shipments + graph → runs solver/heuristic → `state.consolidation_plan` |
| **Scenario Simulation Tool** | `scenario_simulation_tool.py` | Plan → re-runs solver under 4 constraint variations → `state.scenario_results` |
| **Constraint Relaxation Tool** | `constraint_relaxation_tool.py` | Infeasible plan → analyzes blocking constraints → feeds `relaxation_node` |
| **Outcome Logging Tool** | `outcome_logging_tool.py` | Final state → persists to `optimization_outcomes` → triggers ML retraining |

---

## Guardrail (`backend/app/agents/guardrail.py`)

Sits between compatibility scoring and the solver. Enforces **hard operational policies** that the ML model is not allowed to override:

1. **Cargo safety**: hazardous cargo cannot share a truck with refrigerated, fragile, or oversized cargo
2. **Priority SLA**: HIGH-priority shipments cannot be co-loaded with LOW-priority if it creates delay risk
3. **Special handling**: conflicting handling requirements are removed from the graph

If any policy is violated, the pipeline is sent back to re-score compatibility with the violating edges removed.

---

## Optimizer (`backend/app/optimizer/`)

### Solver Strategy

| Condition | Strategy | File |
|---|---|---|
| ≤ 50 shipments | **CP-SAT (exact MIP)** | `solver.py` |
| > 50 shipments | **FFD + Local Search (heuristic)** | `heuristic.py` |
| OR-Tools not installed | Heuristic fallback | Auto-detected |

### MIP Formulation (`solver.py`)

- **Decision variable**: `x[i,k] = 1` if shipment `i` assigned to truck `k`
- **Objective**: minimize `Σ TripCost_k · y_k − α · Utilization_k`
- **Constraints**: weight capacity, volume capacity, each shipment assigned exactly once, only compatible pairs share a truck
- **Time limit**: 30 seconds before returning best-found solution

### Compatibility Filters (`compatibility.py`)

Applied after the ML model scores pairs, before the solver:

| Filter | Threshold |
|---|---|
| Time window overlap | ≥ 5% overlap required |
| Route detour | ≤ 500 km added distance |
| Special handling conflicts | Forbidden pairs removed |

### Supporting Modules

| File | Purpose |
|---|---|
| `baseline.py` | Computes no-consolidation reference (one truck per shipment) |
| `metrics.py` | Calculates before/after cost, utilization, carbon, trip reduction |
| `route_optimizer.py` | Advanced multi-stop route optimization |
| `sensitivity.py` | Post-optimization sensitivity — how much can constraints flex |
| `warehouse_queue.py` | Warehouse congestion analysis for pickup/delivery windows |

---

## ML Layer (`backend/app/ml/`)

### Model: `CompatibilityModel` (`compatibility_model.py`)

Predicts whether two shipments can share a truck.

| Property | Value |
|---|---|
| Algorithm | scikit-learn RandomForest |
| Trees | 400 |
| Max depth | 25 |
| Class weights | Balanced |
| F1 | 0.84 |
| Accuracy | 94% |

**14 input features** (extracted per shipment pair):

| Feature | Importance |
|---|---|
| `time_overlap_pct` | 31.4% (most important) |
| `route_distance` | ~12% |
| `weight_ratio`, `volume_ratio` | ~8% each |
| `pickup_time_diff`, `delivery_time_diff` | ~7% each |
| `priority_diff`, `handling_match` | ~5% each |
| Binary flags: `same_lane`, `hazmat_conflict`, `refrigeration_match`, etc. | remainder |

**Training data** (`training_data.py`): 15,000 synthetic pairs generated from 400 shipments covering 9 Indian cities. Retraining blends synthetic data with real `optimization_outcomes` as actual results accumulate.

**Model persistence**: saved to `ml/model/` as `.joblib` files. Loaded on init; skips retraining if a saved model exists. Retraining triggered automatically by `outcome_logging_tool.py` after N new outcomes.

---

## Data Layer

### ORM Models (`backend/app/models/`)

**Core tables** (Migration 001):

| File | Models |
|---|---|
| `shipment.py` | `Shipment`, `PriorityEnum`, `StatusEnum` |
| `vehicle.py` | `Vehicle` |
| `plan.py` | `ConsolidationPlan`, `PlanAssignment`, `ScenarioResult`, `PlanStatusEnum`, `ScenarioTypeEnum` |
| `outcome.py` | `OptimizationOutcome` |

**Extended tables** (Migration 002):

| File | Models | Purpose |
|---|---|---|
| `customer.py` | `Customer`, `SLATierEnum` | Shipment owners — per-customer SLA tracking |
| `depot.py` | `Depot` | Physical hubs with lat/lng, hours, dock capacity |
| `driver.py` | `Driver` | Truck operators — hours, hazmat cert, home depot |
| `lane_rate.py` | `LaneRate` | Per-route pricing and distance data |
| `shipment_event.py` | `ShipmentEvent`, `EventTypeEnum` | Lifecycle audit trail (CREATED → DELIVERED) |
| `ml_model_version.py` | `MLModelVersion` | ML training history and quality tracking |
| `alert.py` | `Alert`, `AlertTypeEnum`, `AlertSeverityEnum` | Operational alerts with ack/resolve workflow |
| `feedback.py` | `Feedback` | Post-execution plan ratings and actual metrics |

**Cross-table links** (added in Migration 002):
- `shipments.customer_id` → `customers`
- `vehicles.driver_id` → `drivers`
- `plan_assignments.driver_id` → `drivers`

All models import from `db/base.py` which defines the shared `Base = declarative_base()`.

### Pydantic Schemas (`backend/app/schemas/`)

Separate from ORM models. Used for request/response validation at the API boundary. The split means the DB schema can evolve independently of the API contract.

### Database Session (`backend/app/db/session.py`)

- `engine`: SQLAlchemy engine, created from `settings.DATABASE_URL`
- `SessionLocal`: session factory (`autocommit=False`, `autoflush=False`)
- `get_db()`: FastAPI dependency — yields a session per request, closes in `finally` block

SQLite gets `check_same_thread=False` so FastAPI's workers don't crash. PostgreSQL doesn't need it.

### Migrations (`backend/app/db/`)

SQL-based migration system alongside the ORM:

```bash
PYTHONPATH=. python -m backend.app.db.migrate up       # Apply pending migrations
PYTHONPATH=. python -m backend.app.db.migrate down     # Rollback last migration
PYTHONPATH=. python -m backend.app.db.migrate status   # Show applied vs pending
```

Migration scripts: `db/migrations/NNN_name_up.sql` / `NNN_name_down.sql`. A `schema_migrations` table tracks which versions have been applied. `create_all()` is kept as a safety net in `on_startup` for dev. See `db/DB.md` for full per-column documentation.

---

## Data Loaders (`backend/app/data_loader/`)

| File | Purpose |
|---|---|
| `synthetic_generator.py` | Generates realistic Indian freight data (9 cities, realistic weights/volumes/windows) for seeding and ML training |
| `solomon_mapper.py` | Maps Solomon VRPTW benchmark instances (C101, R101) to Lorri's shipment format for solver validation |

---

## Error Handling Patterns

- **Validation failure**: `validation_node` sets `error` in `AgentState` and the graph terminates at `END`. The route returns the validation report with a failure status.
- **Solver infeasibility**: `solver_node` sets `is_infeasible=True`. The conditional edge sends the state to `relaxation_node`, which loosens constraints and re-runs. After `MAX_RETRIES` exhausted, the pipeline ends.
- **Missing API key**: All four agents catch `LLM unavailable` errors and return structured output without narrative text. The pipeline continues normally.
- **OR-Tools not installed**: `optimization_tool.py` detects `ORTOOLS_AVAILABLE=False` and falls back to the heuristic automatically.
