# DEMO.md — Lorri AI Technical Deep Dive

An in-depth walkthrough of every layer in the Lorri AI freight consolidation platform — what each technology does and exactly how we use it.

---

## 1. Frontend

### React 18 — Component Architecture

The UI is a single-page application built with **React 18**. Five page components map to five routes via **React Router DOM 6**:

| Route | Page Component | Purpose |
|---|---|---|
| `/` | `Home.jsx` | Landing page — hero section, 3D globe, animated stats |
| `/shipments` | `Shipments.jsx` | Shipment table, CSV upload, interactive route map |
| `/optimize` | `Optimize.jsx` | Trigger optimizer, view plan + metrics dashboard |
| `/scenarios` | `Scenarios.jsx` | 4-scenario what-if comparison cards |
| `/insights` | `Insights.jsx` | LangGraph agent pipeline output — 4 agent cards |

Each page sets a `data-page` attribute on `<body>`, which drives **per-page CSS variable theming** — Home is amber, Shipments is cyan, Optimize is emerald, Scenarios is violet, Insights is rose. This gives each page a distinct accent color and glow without duplicating styles.

### State Management — React Context + Custom Hooks

Global state lives in `AppContext.jsx`, accessed via `useApp()`. Three custom hooks encapsulate logic:

- **`useShipments()`** — shipment CRUD, loading state, error handling. Wraps `shipmentApi.getAll()` and `shipmentApi.create()`.
- **`useOptimizer()`** — orchestrates the full optimization flow: calls `optimizeApi.run()`, then `simulateApi.run()`, then `metricsApi.get()`. Includes `transformPlan()` to reshape the backend response into the frontend's display format.
- **`useInView()`** — IntersectionObserver hook (threshold 0.3, 300ms delay) that triggers animations when elements scroll into view.

No Redux or external state library — Context + hooks is sufficient for this app's data flow.

### Vite — Build & Dev Server

**Vite 7** serves as the build tool:
- Dev server on port **3000** with Hot Module Replacement
- API proxy: `/api` requests forward to `http://localhost:8000` (avoids CORS in dev)
- Production build: `npm run build` outputs optimized static assets

### Tailwind CSS — Styling System

Tailwind 3.4 handles utility classes, but most visual identity comes from **custom CSS**:
- **Dark theme** — surface `#0a0a0a`, cards `#111111`, white text
- **Three custom fonts** — Syne (display headings), DM Sans (body), JetBrains Mono (data labels)
- **Animated backgrounds** — dual radial-gradient glows with staggered `glowPulse` keyframes
- **Dot-grid texture** via CSS `radial-gradient`

### Visualization Libraries

**Recharts** — used on the Optimize page for the before/after metrics bar chart. `ResponsiveContainer` + `BarChart` with custom dark-themed tooltips comparing baseline vs. optimized values (cost, carbon, utilization).

**Leaflet + React-Leaflet** — used on the Shipments page for an interactive route map. OpenStreetMap tiles with a dark filter (`brightness(0.5) saturate(0.4)`), circle markers for cities, and color-coded polyline routes per consolidation group. City coordinates for 9 Indian hubs stored in `demoData.js`.

**Globe.gl** — 3D WebGL globe on the Home page showing arcs between Mumbai, Pune, and Delhi. **Lazy-loaded at 800ms** to avoid GPU contention with the CSS blur-word animation running simultaneously. Memoized outside the Home component to prevent unmount/remount on state changes.

### Axios — API Client (`services/api.js`)

A single Axios instance with:
- Base URL from `VITE_API_URL` env var (defaults to `http://localhost:8000`)
- **120-second timeout** (optimization can take time for large inputs)
- **Response interceptor** that auto-unwraps `.data` and extracts error messages into a consistent format

Exports typed API objects: `shipmentApi`, `uploadApi`, `optimizeApi`, `simulateApi`, `metricsApi`, `historyApi`.

### Animation System

- **Blur-word sweep** — title text starts at `filter: blur(6px); opacity: 0` and sweeps to clear with staggered delays per word. Uses `will-change: transform, opacity, filter` for GPU promotion.
- **`fadeSlideUp`** — standard entrance: `opacity: 0; translateY(16px)` → visible
- **Counter animations** — stats count up with ease-out cubic-bezier timing, triggered by `useInView`
- **Fox mascot** (`FoxMascot.jsx`) — animated SVG with float (3.5s), tilt (2s), bounce (0.6s) keyframes, plus click-to-spin interaction

---

## 2. Backend

### FastAPI — Web Framework (`main.py`)

FastAPI is the ASGI web framework. A single `app` instance:

1. **CORS middleware** — `ALLOWED_ORIGINS` env var (defaults to `localhost:3000`), `allow_methods=["*"]`, `allow_headers=["*"]`
2. **7 routers registered** — shipments, optimize, plan, simulate, metrics, seed (`/dev` prefix), upload
3. **Startup hook** — `Base.metadata.create_all(bind=engine)` ensures tables exist
4. **Swagger docs** auto-generated at `/docs` from Pydantic schemas and route decorators

Run with `uvicorn backend.app.main:app --reload` — Uvicorn is the ASGI server, `--reload` watches for file changes in dev.

### Pydantic — Validation & Serialization

Pydantic does three things for us:

**1. Request validation** — When a client POSTs to `/shipments`, FastAPI deserializes the JSON body into a `ShipmentCreate` model:

```python
class ShipmentCreate(BaseModel):
    shipment_id: str
    origin: str
    destination: str
    pickup_time: datetime       # Auto-parses ISO 8601 strings
    delivery_time: datetime
    weight: float
    volume: float
    priority: str = "MEDIUM"    # Default value if omitted
    special_handling: Optional[str] = None
```

If any field is missing, wrong type, or fails validation, FastAPI returns a 422 with a structured error — the route handler never sees bad data.

**2. Response serialization** — ORM objects (SQLAlchemy models) are converted to JSON via response models:

```python
class ShipmentResponse(BaseModel):
    shipment_id: str
    origin: str
    ...
    model_config = {"from_attributes": True}  # Read from ORM attributes
```

`from_attributes=True` tells Pydantic to read `obj.shipment_id` instead of `obj["shipment_id"]`, bridging SQLAlchemy's attribute-based access to JSON output.

**3. OpenAPI generation** — Every schema auto-generates Swagger documentation. `PlanResponse` nests `List[PlanAssignmentResponse]` and `List[ScenarioResultResponse]`, and Swagger shows the full nested structure.

Schemas live in `backend/app/schemas/` — separate from ORM models so the API contract can evolve independently of the database schema.

### SQLAlchemy — ORM Layer

SQLAlchemy 2.x provides the object-relational mapping:

- **`Base = declarative_base()`** (`db/base.py`) — all models inherit from this
- **`engine`** (`db/session.py`) — created from `settings.DATABASE_URL` with SQLite-specific `check_same_thread=False`
- **`SessionLocal`** — session factory with `autocommit=False`, `autoflush=False` for explicit transaction control
- **`get_db()`** — FastAPI dependency that yields a session and closes it in `finally`:

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Every route that touches the DB uses `db: Session = Depends(get_db)`.

### API Endpoints

| Method | Path | What it does |
|---|---|---|
| `POST` | `/shipments` | Create one or many shipments (accepts single or list) |
| `GET` | `/shipments` | Filtered + paginated list (origin, destination, priority, status) |
| `POST` | `/optimize` | **Trigger full LangGraph pipeline** — thin wrapper over `run_pipeline()` |
| `GET` | `/plan/{id}` | Fetch plan with nested assignments + scenarios |
| `POST` | `/simulate` | Run 4 scenarios on an existing plan |
| `GET` | `/metrics` | Before/after metrics for a plan |
| `GET` | `/history` | Past optimization runs from outcomes table |
| `POST` | `/dev/seed` | Generate synthetic or Solomon benchmark data |
| `POST` | `/upload/shipments` | CSV/Excel upload (multipart form) |
| `POST` | `/upload/vehicles` | CSV/Excel upload (multipart form) |
| `GET` | `/health` | Health probe |

`POST /optimize` accepts query params: `run_simulation` (bool), `run_llm` (bool), `cost_weight`, `sla_weight`, `carbon_weight`. The route invokes the pipeline, persists the plan/assignments/scenarios to the DB, injects DB-generated IDs into the response, and returns.

### Configuration (`core/config.py`)

A `Settings` class loaded once as a singleton:
- `DATABASE_URL` — defaults to `sqlite:///./dev.db`, auto-converts Render's `postgres://` to `postgresql://` for SQLAlchemy 2.x compatibility
- `OPENAI_API_KEY` / `GOOGLE_API_KEY` — for LLM features, app starts without them

---

## 3. Database

### Dual Database Support

- **SQLite** (dev) — file-based at `./dev.db`, zero setup, auto-created on first run. `check_same_thread=False` required because FastAPI's async workers share connections across threads.
- **PostgreSQL** (prod) — provisioned via Docker Compose (`docker-compose.yml`) or Render's managed database. Injected via `DATABASE_URL` env var.

### Schema — 14 Tables

**Core tables** (Migration 001):

| Table | PK | Purpose |
|---|---|---|
| `shipments` | `shipment_id` (VARCHAR) | Freight shipments — origin, destination, time windows, weight, volume, priority, status |
| `vehicles` | `vehicle_id` (VARCHAR) | Fleet — type, weight/volume capacity, operating cost |
| `consolidation_plans` | `id` (INTEGER AUTO) | Optimization results — trucks used, utilization, savings |
| `plan_assignments` | `id` (INTEGER AUTO) | Vehicle → shipments mapping (shipment_ids as JSON TEXT) |
| `scenario_results` | `id` (INTEGER AUTO) | 4 rows per plan — one per simulation scenario |
| `optimization_outcomes` | `id` (INTEGER AUTO) | Full audit log with JSON blobs for metrics, violations, timings |

**Extended tables** (Migration 002):

| Table | Purpose |
|---|---|
| `customers` | Shipment owners — SLA tier (STANDARD/PREMIUM/EXPRESS), contract rate discounts |
| `depots` | Physical hubs — lat/lng, operating hours, dock count, queue capacity |
| `drivers` | Truck operators — license type, hazmat certification, max hours, home depot |
| `lane_rates` | Per-route pricing — cost/kg, cost/trip, transit time, distance, validity dates |
| `shipment_events` | Lifecycle audit trail — CREATED → PICKED_UP → IN_TRANSIT → DELIVERED/SLA_BREACH |
| `ml_model_versions` | ML training history — accuracy, F1, feature importances, is_active flag |
| `alerts` | Operational notifications — type, severity, acknowledge/resolve workflow |
| `feedback` | Post-execution plan reviews — rating, actual vs predicted metrics |

### SQL Migration System (`db/migrate.py`)

Instead of Alembic, we use a lightweight SQL-based migration runner:

```bash
PYTHONPATH=. python -m backend.app.db.migrate up       # Apply pending
PYTHONPATH=. python -m backend.app.db.migrate down     # Rollback last
PYTHONPATH=. python -m backend.app.db.migrate status   # Show state
```

- Each migration is a pair: `NNN_name_up.sql` + `NNN_name_down.sql`
- A `schema_migrations` table tracks applied versions
- `create_all()` is kept as a safety net on startup — only creates tables that don't exist

### Key Design Decisions

| Decision | Why |
|---|---|
| **JSON stored as TEXT** | SQLite has no native JSON type. TEXT works on both SQLite and PostgreSQL. App serializes with `json.dumps()`/`json.loads()`. |
| **String primary keys** | Shipments and vehicles use user-provided IDs from external systems — no surrogate key mapping needed. |
| **Integer booleans** (0/1) | SQLite has no native BOOLEAN. `is_feasible INTEGER DEFAULT 1` is the standard pattern. |
| **Nullable `plan_id` on outcomes** | Failed optimization runs still get logged. A NOT NULL constraint would prevent logging failures. |
| **`AUTOINCREMENT`** | Prevents ID reuse after deletion — important for audit tables. |

---

## 4. ML (Machine Learning)

### Model Architecture

A **scikit-learn RandomForest classifier** (400 trees, max_depth=25, balanced class weights) predicts whether two shipments are compatible for consolidation onto the same truck.

**Performance**: F1 = 0.84, Precision = 91%, Recall = 77%, Accuracy = 94%.

### Feature Engineering — 14 Features Per Pair

The `extract_features()` function in `ml/training_data.py` computes:

| Feature | How it's computed | Importance |
|---|---|---|
| `weight_ratio` | min(w_a, w_b) / max(w_a, w_b) | ~8% |
| `volume_ratio` | min(v_a, v_b) / max(v_a, v_b) | ~8% |
| `same_origin` | 1.0 if origins match | ~5% |
| `same_destination` | 1.0 if destinations match | ~5% |
| `origin_destination_match` | 1.0 if one's origin = other's destination | ~3% |
| `pickup_time_diff_hours` | abs diff, capped at 48h | ~7% |
| `delivery_time_diff_hours` | abs diff, capped at 96h | ~7% |
| `pickup_overlap` | 1.0 if pickups within 3 hours | **~31%** |
| `priority_gap` | abs(priority_a - priority_b) as int | ~5% |
| `priority_high_present` | 1.0 if either is HIGH | ~3% |
| `special_handling_match` | 1.0 if both have same handling | ~4% |
| `special_handling_conflict` | 1.0 if forbidden pair (hazmat+fragile) | ~3% |
| `combined_weight_util_proxy` | (w_a + w_b) / 15000, capped at 2.0 | ~6% |
| `combined_volume_util_proxy` | (v_a + v_b) / 50.0, capped at 2.0 | ~5% |

The most important feature is **pickup time proximity** (~31%) — shipments with overlapping pickup windows are far more likely to share a truck.

### Training Pipeline

```
generate_training_data(n_pairs=15000, n_shipments=400, noise_rate=0.05)
    │
    ├─ Generate 400 synthetic shipments across 9 Indian cities
    ├─ Sample 15,000 unique pairs
    ├─ Label each pair using weighted heuristic (same origin=0.25, overlap=0.15, ...)
    ├─ Flip 5% of labels randomly (noise → prevents overfitting)
    │
    ▼
StandardScaler.fit_transform(X_train)
    │
    ▼
Train both RandomForest(400 trees) AND LogisticRegression(C=0.5)
    │
    ├─ Evaluate both on test set (80/20 stratified split)
    ├─ Pick winner by F1 score (RandomForest wins)
    │
    ▼
Save to ml/model/: compatibility_model.joblib, scaler.joblib, metadata.joblib
```

### Prediction Flow

```
score_shipment_pairs(shipments, vehicles, threshold=0.6)
    │
    ├─ Load/train model (singleton CompatibilityModel)
    ├─ For all unique pairs: extract_features() → scaler.transform() → model.predict_proba()[:, 1]
    ├─ Build networkx Graph: add edge if P(compatible) ≥ threshold
    │
    ▼
Apply hard rule-based filters (compatibility.py):
    ├─ Time overlap ≥ 5% of shorter window
    ├─ Route detour ≤ 500 km
    ├─ No forbidden handling pairs
    ├─ Combined weight+volume fits at least one vehicle
    │
    ▼
Return: graph_object (for solver), edges (ranked by score), stats
```

### Retraining Loop

`outcome_logging_tool.py` counts rows in `optimization_outcomes`. Every 10 outcomes, it triggers `model.train_with_outcomes()`:
- Extracts real pairs from optimization results (shipments on same truck = positive, different trucks = negative)
- Blends with synthetic data (ratio shifts toward real data as outcomes accumulate)
- Retrains and saves updated model

---

## 5. AI (Agentic Intelligence)

### LangGraph — Pipeline Orchestration

The core intelligence is a **LangGraph StateGraph** in `agents/langgraph_pipeline.py`. It implements the **Observe → Reason → Decide → Act → Learn** framework as a directed graph with typed state and conditional edges.

### AgentState — Typed Pipeline State

A `TypedDict` that flows through every node:

```python
class AgentState(TypedDict):
    # Inputs
    shipments: List[Dict]
    vehicles: List[Dict]
    config: Dict                    # run_llm, run_simulation, weights

    # Observe
    validation_report: Dict         # Data quality checks

    # Reason
    compatibility_scores: Dict      # ML scores + networkx graph
    queue_analysis: Dict            # Warehouse congestion

    # Decide
    guardrail_result: Dict          # Policy violation checks

    # Act
    consolidation_plan: Dict        # Solver output
    relaxation: Dict                # Infeasibility diagnosis

    # Learn
    scenario_results: List[Dict]    # 4 simulation outputs
    insights: Dict                  # Plan explanation
    scenario_analysis: Dict         # Multi-objective recommendation
    sensitivity_analysis: Dict      # Post-optimization analysis
    metrics: Dict                   # Before/after comparison

    # Control
    retry_count: int                # Solver retry counter
    step_timings: List[Dict]        # [{step, status, duration_ms}]
    error: Optional[str]            # Early termination reason
```

Each node reads what it needs, writes its output field, and never modifies another node's output.

### Pipeline Graph — 12 Nodes, 5 Conditional Edges

```
shipment_data_node ──[empty DB?]──► END
        │
validation_node ──[invalid?]──► END
        │
compatibility_node (ML scoring)
        │
queue_analysis_node (M/M/1 queueing)
        │
guardrail_node ──[CRITICAL + first attempt?]──► compatibility_node (re-score)
        │
solver_node ──[infeasible + retries < 2?]──► relaxation_node ──► solver_node
        │         └──[infeasible + exhausted]──► insight_node (skip simulation)
        │
route_optimization_node (TSP per truck)
        │
simulation_node (4 scenarios)
        │
insight_node (Agent 2)
        │
sensitivity_node
        │
scenario_rec_node (Agent 4)
        │
metrics_node ──► outcome_logging_node ──► END
```

### Four LLM Agents

Each agent optionally calls **Google Gemini 2.0 Flash** via LangChain. If `GOOGLE_API_KEY` is not set, the agent returns structured data without narrative text — the pipeline continues normally.

#### Agent 1: Validation Agent (`validation_agent.py`)

Runs 15+ data quality checks at three severity levels:

- **ERROR** (blocks pipeline): missing required fields, duplicate IDs, negative weight, delivery ≤ pickup, invalid datetime
- **WARNING** (degrades quality): pickup time in the past, tight windows for long distances, weight exceeds all vehicles, no reefer trucks for refrigerated cargo
- **INFO** (observations): high shipment-to-vehicle ratio, origin imbalance, all-MEDIUM priority

If any ERRORs exist, `is_valid=False` and the pipeline terminates.

#### Agent 2: Insight Agent (`insight_agent.py`)

Post-optimization explainability. Generates four outputs:

1. **Plan summary** — total shipments, trucks used, fleet usage %, utilization distribution (excellent ≥85% / good ≥75% / fair ≥50% / poor), trip reduction %
2. **Lane insights** — per-truck analysis: origin→destination lanes, consolidation count, utilization rating, weight/volume/distance
3. **Risk flags** — `CAPACITY_RISK` (>90% util), `UNDERUTILIZED` (<50%), `SINGLE_SHIPMENT`, `SLA_RISK` (HIGH priority + multi-stop + >50km detour), `MIXED_PRIORITY` (HIGH + LOW on same truck)
4. **Recommendations** — strategic suggestions: relax time windows, separate HIGH priority vehicles, fleet right-sizing

#### Agent 3: Relaxation Agent (`relaxation_agent.py`)

Activates only when the solver returns `INFEASIBLE`. Diagnoses four constraint types:

- **Time window conflicts** — finds pairs on the same lane with non-overlapping windows, calculates exact minutes of relaxation needed
- **Capacity bottlenecks** — shipments exceeding all vehicle capacities, suggests split count: `ceil(weight / max_capacity)`
- **Fleet gaps** — total demand > total capacity, missing vehicle types (e.g. no reefer trucks)
- **Compatibility conflicts** — forbidden cargo pairs (hazmat + fragile/refrigerated/oversized)

Returns suggestions: `RELAX_WINDOW`, `SPLIT_SHIPMENT`, `ADD_VEHICLE`, `RESOLVE_COMPATIBILITY`.

#### Agent 4: Scenario Agent (`scenario_agent.py`)

Multi-objective comparison of the 4 simulation scenarios. Weighted scoring:

```
balanced_score = 0.40 × normalized_cost + 0.35 × normalized_sla + 0.25 × normalized_carbon
```

Produces:
- **Per-objective rankings** — which scenario wins on cost, SLA, and carbon independently
- **Four recommendations** — cost-optimized, SLA-optimized, carbon-optimized, and balanced
- **Trade-off matrix** — pairwise comparison showing "X% cheaper but Ypp lower SLA"
- **Dominance detection** — identifies scenarios that are strictly better/worse on all metrics

### Guardrail (`agents/guardrail.py`)

Sits between ML scoring (Reason) and the solver (Act). Enforces three **non-negotiable** policies:

1. **Cargo safety**: hazardous + refrigerated/fragile/oversized → CRITICAL (edges removed)
2. **Priority SLA**: HIGH + LOW on same truck → WARNING (flagged)
3. **Handling match**: different dedicated handling types → INFO (flagged)

CRITICAL violations trigger a loop back to `compatibility_node` to re-score with the violating edges removed.

### Six Tool Nodes (`agents/tools/`)

| Tool | What it does |
|---|---|
| `shipment_data_tool` | Opens a DB session, queries all shipments + vehicles, converts ORM → dict, closes session |
| `compatibility_scoring_tool` | Loads/trains ML model, scores all pairs, builds networkx graph, applies hard filters |
| `optimization_tool` | Selects solver (MIP ≤50, heuristic >50), runs it, returns assignments |
| `scenario_simulation_tool` | Applies 4 constraint modifications, re-runs solver for each, computes SLA success |
| `constraint_relaxation_tool` | Analyzes infeasibility — time conflicts, capacity bottlenecks, fleet gaps |
| `outcome_logging_tool` | Persists `OptimizationOutcome` row, checks retraining threshold (every 10 runs) |

---

## 6. OR (Operations Research)

### CP-SAT Solver — Exact Optimization (`optimizer/solver.py`)

For ≤50 shipments, we use **Google OR-Tools CP-SAT** (Constraint Programming with SAT solver). This formulates load consolidation as a Mixed Integer Program:

**Decision variables:**
- `x[i,k]` ∈ {0,1} — shipment `i` assigned to vehicle `k`
- `y[k]` ∈ {0,1} — vehicle `k` is used (carries ≥1 shipment)

**Objective function:**
```
minimize: Σ_k (operating_cost_k × y[k]) − α × Σ_{i,k} (utilization_bonus × x[i,k])
```
Where α = 0.1 balances cost minimization against utilization maximization. Costs and utilization are scaled by 100 for integer arithmetic (CP-SAT works with integers).

**Constraints:**
1. **One assignment**: `Σ_k x[i,k] = 1` for every shipment — each goes on exactly one truck
2. **Weight capacity**: `Σ_i (weight_i × x[i,k]) ≤ capacity_weight_k` per vehicle
3. **Volume capacity**: `Σ_i (volume_i × x[i,k]) ≤ capacity_volume_k` per vehicle
4. **Vehicle linking**: `y[k] = 1` if and only if any `x[i,k] = 1` (enforced via `OnlyEnforceIf`)
5. **Hard incompatibility**: `x[i,k] + x[j,k] ≤ 1` for forbidden pairs (hazmat+fragile, non-overlapping time windows)

**Solver config**: 4 parallel workers, 30-second time limit. Returns `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, or `TIMEOUT`.

### FFD Heuristic — Fast Approximation (`optimizer/heuristic.py`)

For >50 shipments, the MIP becomes intractable. We use **First-Fit Decreasing** bin packing + local search:

**Phase 1 — FFD Packing:**
1. Sort shipments by weight descending (heaviest first)
2. Sort vehicles by capacity descending (largest first)
3. For each shipment: try to fit into the first existing truck with enough remaining weight + volume + compatibility with all current shipments on that truck
4. If no truck works, open a new one from the pool

**Phase 2 — Local Search (50 iterations):**
1. Find the truck with lowest utilization
2. Try to redistribute ALL its shipments to other trucks
3. If successful, eliminate that truck (one fewer trip)
4. Repeat until no improvement

### Route Optimization — TSP Per Truck (`optimizer/route_optimizer.py`)

After assignment, each truck has multiple pickup/delivery stops. We solve a **Travelling Salesman Problem** per truck to minimize total distance:

- **OR-Tools RoutingModel** with `PATH_CHEAPEST_ARC` initial solution + `GUIDED_LOCAL_SEARCH` metaheuristic, 5-second time limit
- Collects unique origins + destinations, builds a distance matrix from the city-pair lookup
- **Fallback**: brute-force permutations for ≤8 cities, original order for >8

Returns: optimized stop sequence, distance saved vs. naive order, savings percentage.

### Simulation Scenarios (`agents/tools/scenario_simulation_tool.py`)

Four what-if scenarios re-run the solver with modified inputs:

| Scenario | Modification | Tests |
|---|---|---|
| **STRICT_SLA** | No changes (baseline) | Current constraints feasibility |
| **FLEXIBLE_SLA** | Time windows ±30 minutes | Whether flexibility improves consolidation |
| **VEHICLE_SHORTAGE** | Fleet reduced to 70% | Resilience to truck unavailability |
| **DEMAND_SURGE** | Weights × 1.3, volumes × 1.3 | Capacity under 30% demand increase |

Each scenario runs the full solver, optimizes routes, then computes SLA success against the **original** (unmodified) time windows — measuring how many shipments would still meet their real deadlines.

### Sensitivity Analysis (`optimizer/sensitivity.py`)

Post-optimization analysis identifying where investments yield highest ROI:

1. **Constraint slack** — per-truck: weight/volume utilization %, binding constraint classification (>95% = binding). Identifies bottleneck trucks.
2. **Fleet shadow price** — simulates adding one truck: re-runs optimizer, measures cost reduction. "How much should you pay for an additional vehicle?"
3. **Capacity shadow price** — simulates +10% capacity on the most constrained truck: re-runs optimizer, measures savings. "Is upgrading the bottleneck truck worth it?"

### Warehouse Queue Analysis (`optimizer/warehouse_queue.py`)

**M/M/1 queueing model** (Poisson arrivals, exponential service time) per warehouse:

- **λ** = trucks arriving per hour (shipment count / effective pickup window)
- **μ** = trucks serviced per hour (default: 2 trucks/hr = 30-min loading)
- **ρ** = λ/μ (utilization — must be <1 for stability)

Computed metrics: average queue length `Lq = ρ²/(1-ρ)`, average wait time `Wq = Lq/λ`, time in system `W = Wq + 1/μ`.

Congestion levels: **LOW** (ρ<0.70), **MODERATE** (0.70–0.85), **WARNING** (0.85–0.95), **CRITICAL** (≥0.95).

### Baseline & Metrics (`optimizer/baseline.py`, `optimizer/metrics.py`)

**Baseline** = no consolidation: every shipment gets its own truck (cheapest one that fits). This produces reference values for cost, carbon, trips, and utilization.

**Metrics engine** computes the before/after comparison:
- Trip reduction: `(baseline_trips - trucks_used) / baseline_trips × 100`
- Cost savings: `(baseline_cost - optimized_cost) / baseline_cost × 100`
- Carbon savings: distance reduction × 0.8 kg CO₂/km emission factor
- Per-truck breakdown: weight, volume, utilization, distance, carbon

---

## End-to-End Flow

```
User clicks "Optimize" on frontend
    │
    ▼
POST /optimize (FastAPI route)
    │
    ▼
run_pipeline() — LangGraph StateGraph
    │
    ├─ shipment_data_tool: Load from DB (SQLAlchemy)
    ├─ validation_agent: 15+ quality checks
    ├─ compatibility_scoring_tool: scikit-learn RF → networkx graph
    ├─ queue_analysis: M/M/1 per warehouse
    ├─ guardrail: 3 hard policy checks
    ├─ optimization_tool: OR-Tools CP-SAT or FFD heuristic
    ├─ route_optimizer: TSP per truck
    ├─ scenario_simulation: 4 what-if re-runs
    ├─ insight_agent: Plan explanation + risk flags
    ├─ sensitivity: Shadow prices + bottleneck analysis
    ├─ scenario_agent: Multi-objective recommendation
    ├─ metrics: Before/after computation
    └─ outcome_logging: Persist + retraining check
    │
    ▼
Response → Persist to DB → Return JSON
    │
    ▼
Frontend renders: plan cards, metrics chart, route map, scenario comparison, agent insights
```
