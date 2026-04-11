# DB.md

Database schema documentation for Lorri AI. Explains every SQL statement in the migration scripts and how they map to the SQLAlchemy ORM models.

## Migration System

Migrations live in `backend/app/db/migrations/`. Each migration has an **up** (apply) and **down** (rollback) script.

```bash
# From repo root:
PYTHONPATH=. python -m backend.app.db.migrate up       # Apply all pending migrations
PYTHONPATH=. python -m backend.app.db.migrate down     # Rollback last migration
PYTHONPATH=. python -m backend.app.db.migrate status   # Show applied vs pending
```

A `schema_migrations` tracking table records which versions have been applied. The migration runner (`backend/app/db/migrate.py`) reads `.sql` files, executes them, and logs the version.

### ORM ↔ SQL Mapping

The SQL scripts and the SQLAlchemy models in `backend/app/models/` describe the **same schema**. The ORM models are the source of truth for application code (queries, inserts). The SQL scripts are the source of truth for schema creation and deployment.

| SQL Migration | ORM Model | File |
|---|---|---|
| `CREATE TABLE shipments` | `Shipment` | `models/shipment.py` |
| `CREATE TABLE vehicles` | `Vehicle` | `models/vehicle.py` |
| `CREATE TABLE consolidation_plans` | `ConsolidationPlan` | `models/plan.py` |
| `CREATE TABLE plan_assignments` | `PlanAssignment` | `models/plan.py` |
| `CREATE TABLE scenario_results` | `ScenarioResult` | `models/plan.py` |
| `CREATE TABLE optimization_outcomes` | `OptimizationOutcome` | `models/outcome.py` |
| `CREATE TABLE customers` | `Customer` | `models/customer.py` |
| `CREATE TABLE depots` | `Depot` | `models/depot.py` |
| `CREATE TABLE drivers` | `Driver` | `models/driver.py` |
| `CREATE TABLE lane_rates` | `LaneRate` | `models/lane_rate.py` |
| `CREATE TABLE shipment_events` | `ShipmentEvent` | `models/shipment_event.py` |
| `CREATE TABLE ml_model_versions` | `MLModelVersion` | `models/ml_model_version.py` |
| `CREATE TABLE alerts` | `Alert` | `models/alert.py` |
| `CREATE TABLE feedback` | `Feedback` | `models/feedback.py` |

---

## Migration 001: Initial Schema

### `shipments` — Core input entity

```sql
CREATE TABLE IF NOT EXISTS shipments (
    shipment_id   VARCHAR     PRIMARY KEY,
    origin        VARCHAR     NOT NULL,
    destination   VARCHAR     NOT NULL,
    pickup_time   TIMESTAMP   NOT NULL,
    delivery_time TIMESTAMP   NOT NULL,
    weight        REAL        NOT NULL,
    volume        REAL        NOT NULL,
    priority      VARCHAR     DEFAULT 'MEDIUM',
    special_handling VARCHAR  DEFAULT NULL,
    status        VARCHAR     DEFAULT 'PENDING'
);
```

| Statement | Explanation |
|---|---|
| `CREATE TABLE IF NOT EXISTS shipments` | Creates the table only if it doesn't already exist, making the migration idempotent (safe to re-run). |
| `shipment_id VARCHAR PRIMARY KEY` | User-provided string ID (e.g. "S001"). VARCHAR rather than INTEGER because IDs come from external systems. Primary key enforces uniqueness and creates an implicit index. |
| `origin VARCHAR NOT NULL` | Origin city. `NOT NULL` ensures every shipment has a starting location — the optimizer needs this for route/detour calculations. |
| `destination VARCHAR NOT NULL` | Destination city. Same reasoning as origin. |
| `pickup_time TIMESTAMP NOT NULL` | Earliest time the shipment can be picked up. `TIMESTAMP` stores date + time. The compatibility engine checks time overlap between shipments sharing a truck. |
| `delivery_time TIMESTAMP NOT NULL` | Latest acceptable delivery time. The solver uses `pickup_time`/`delivery_time` as the time window constraint. |
| `weight REAL NOT NULL` | Shipment weight in kg. `REAL` (floating point) because freight weights aren't always whole numbers. Used in vehicle capacity constraints: `SUM(weight) <= capacity_weight`. |
| `volume REAL NOT NULL` | Shipment volume in m³. Same as weight — used in the volume capacity constraint. |
| `priority VARCHAR DEFAULT 'MEDIUM'` | Enum stored as string: `LOW`, `MEDIUM`, `HIGH`. `DEFAULT 'MEDIUM'` means shipments without explicit priority get medium treatment. HIGH-priority shipments get stricter SLA enforcement in the solver. |
| `special_handling VARCHAR DEFAULT NULL` | Free-text field for requirements like "refrigerated" or "fragile". Nullable because most shipments don't need special handling. The ML compatibility model uses this to prevent incompatible pairings (e.g. fragile + oversized). |
| `status VARCHAR DEFAULT 'PENDING'` | Tracks pipeline state: `PENDING` → `ASSIGNED` → `IN_TRANSIT` → `DELIVERED`. New shipments start as `PENDING`. Updated to `ASSIGNED` when the optimizer places them in a plan. |

```sql
CREATE INDEX IF NOT EXISTS idx_shipments_shipment_id ON shipments(shipment_id);
```

Explicit index on the primary key. Redundant for most databases (PK already creates an index) but ensures consistent behavior across SQLite and PostgreSQL. Maps to `index=True` on the ORM column.

---

### `vehicles` — Fleet inventory

```sql
CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id      VARCHAR   PRIMARY KEY,
    vehicle_type    VARCHAR   NOT NULL,
    capacity_weight REAL      NOT NULL,
    capacity_volume REAL      NOT NULL,
    operating_cost  REAL      NOT NULL
);
```

| Statement | Explanation |
|---|---|
| `vehicle_id VARCHAR PRIMARY KEY` | String ID (e.g. "V001", "TRUCK-MH-1234"). String PK because vehicle identifiers come from fleet management systems. Referenced by `plan_assignments.vehicle_id` as a foreign key. |
| `vehicle_type VARCHAR NOT NULL` | Category label: "small", "medium", "large", "refrigerated". Used for display and filtering, not as a constraint in the solver. |
| `capacity_weight REAL NOT NULL` | Max payload in kg. The solver enforces `SUM(shipment.weight) <= capacity_weight` for each vehicle. |
| `capacity_volume REAL NOT NULL` | Max volume in m³. Same constraint as weight — whichever fills up first is the binding constraint. |
| `operating_cost REAL NOT NULL` | Cost per trip. Feeds directly into the solver's objective function: `minimize SUM(operating_cost)` over all used trucks. |

---

### `consolidation_plans` — Optimization results

```sql
CREATE TABLE IF NOT EXISTS consolidation_plans (
    id               INTEGER   PRIMARY KEY AUTOINCREMENT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status           VARCHAR   DEFAULT 'DRAFT',
    total_trucks     INTEGER   DEFAULT NULL,
    trips_baseline   INTEGER   DEFAULT NULL,
    avg_utilization  REAL      DEFAULT NULL,
    cost_saving_pct  REAL      DEFAULT NULL,
    carbon_saving_pct REAL     DEFAULT NULL
);
```

| Statement | Explanation |
|---|---|
| `id INTEGER PRIMARY KEY AUTOINCREMENT` | Auto-incrementing surrogate key. Unlike shipments/vehicles, plans are system-generated so they get sequential IDs. `AUTOINCREMENT` prevents ID reuse after deletion (SQLite-specific; PostgreSQL uses `SERIAL`). |
| `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | Auto-set on insert. Maps to ORM's `server_default=func.now()`. Used for sorting history and showing "when was this plan created" on the dashboard. |
| `status VARCHAR DEFAULT 'DRAFT'` | Lifecycle: `DRAFT` (solver hasn't run) → `OPTIMIZED` (solver done, assignments final) → `EXECUTED` (acted on operationally). New plans start as `DRAFT`. |
| `total_trucks INTEGER DEFAULT NULL` | Number of trucks the optimizer chose to use. `NULL` until the solver completes. The dashboard shows this as the "after" number vs. `trips_baseline`. |
| `trips_baseline INTEGER DEFAULT NULL` | How many individual trips would be needed without consolidation (one per shipment). Used to calculate trip reduction: `(baseline - total_trucks) / baseline * 100`. |
| `avg_utilization REAL DEFAULT NULL` | Average vehicle fill percentage across all assignments. The optimization's primary quality metric. Values near 100% mean trucks are fully loaded. |
| `cost_saving_pct REAL DEFAULT NULL` | `(baseline_cost - optimized_cost) / baseline_cost * 100`. Displayed on the dashboard as the headline savings figure. |
| `carbon_saving_pct REAL DEFAULT NULL` | Carbon reduction percentage. Proportional to trip/distance reduction since fewer trucks = less fuel = less CO2. |

---

### `plan_assignments` — Vehicle-to-shipment mapping

```sql
CREATE TABLE IF NOT EXISTS plan_assignments (
    id              INTEGER   PRIMARY KEY AUTOINCREMENT,
    plan_id         INTEGER   NOT NULL,
    vehicle_id      VARCHAR   NOT NULL,
    shipment_ids    TEXT      NOT NULL,
    utilization_pct REAL      DEFAULT NULL,
    route_detour_km REAL      DEFAULT NULL,

    FOREIGN KEY (plan_id)    REFERENCES consolidation_plans(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
);
```

| Statement | Explanation |
|---|---|
| `plan_id INTEGER NOT NULL` | Which consolidation plan this assignment belongs to. `NOT NULL` because an assignment without a plan is meaningless. |
| `vehicle_id VARCHAR NOT NULL` | Which vehicle carries these shipments. References the string PK on `vehicles`. |
| `shipment_ids TEXT NOT NULL` | **JSON array stored as text**: `'["S001","S003","S007"]'`. Uses `TEXT` instead of a native JSON column for SQLite compatibility. The application parses this with `json.loads()`. A join table was avoided to keep queries simple — each assignment is one row, not N rows per shipment. |
| `utilization_pct REAL DEFAULT NULL` | How full the vehicle is (0–100), based on the binding constraint (weight or volume, whichever is tighter). Null until calculated. |
| `route_detour_km REAL DEFAULT NULL` | Extra distance from serving multiple pickup/delivery points instead of direct routes. Lower is better. Used by the insight agent to flag inefficient routes. |
| `FOREIGN KEY (plan_id) REFERENCES consolidation_plans(id)` | Enforces referential integrity: can't create an assignment for a plan that doesn't exist. Cascade behavior is handled at the application level. |
| `FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)` | Ensures the assigned vehicle actually exists in the fleet. String FK since vehicles use string primary keys. |

---

### `scenario_results` — Simulation comparisons

```sql
CREATE TABLE IF NOT EXISTS scenario_results (
    id               INTEGER   PRIMARY KEY AUTOINCREMENT,
    plan_id          INTEGER   NOT NULL,
    scenario_type    VARCHAR   NOT NULL,
    trucks_used      INTEGER   DEFAULT NULL,
    avg_utilization  REAL      DEFAULT NULL,
    total_cost       REAL      DEFAULT NULL,
    carbon_emissions REAL      DEFAULT NULL,
    sla_success_rate REAL      DEFAULT NULL,

    FOREIGN KEY (plan_id) REFERENCES consolidation_plans(id)
);
```

| Statement | Explanation |
|---|---|
| `plan_id INTEGER NOT NULL` | Each scenario result belongs to exactly one plan. Each plan gets **4 rows** — one per scenario type. |
| `scenario_type VARCHAR NOT NULL` | One of four simulation scenarios: `STRICT_SLA` (no time flexibility), `FLEXIBLE_SLA` (±30min window slack), `VEHICLE_SHORTAGE` (70% fleet), `DEMAND_SURGE` (1.5x volume). Stored as string enum. |
| `trucks_used INTEGER` | Trucks needed under this scenario's constraints. Strict SLA typically needs more trucks; flexible SLA needs fewer. |
| `avg_utilization REAL` | Utilization under this scenario. Vehicle shortage forces higher utilization; demand surge may lower it. |
| `total_cost REAL` | Total cost under scenario constraints. Used for cost-vs-SLA trade-off analysis. |
| `carbon_emissions REAL` | kg CO2 equivalent. Proportional to trucks used and distance. |
| `sla_success_rate REAL` | Percentage of shipments meeting their delivery window (0–100). Strict SLA typically scores lower; flexible SLA scores higher. This is the key trade-off metric — Agent 4 uses it to recommend which scenario balances cost, SLA, and emissions. |

---

### `optimization_outcomes` — Audit log & ML retraining data

```sql
CREATE TABLE IF NOT EXISTS optimization_outcomes (
    id                    INTEGER   PRIMARY KEY AUTOINCREMENT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    plan_id               INTEGER   DEFAULT NULL,
    solver_used           VARCHAR   DEFAULT NULL,
    solver_status         VARCHAR   DEFAULT NULL,
    is_feasible           INTEGER   DEFAULT 1,
    retry_count           INTEGER   DEFAULT 0,
    total_shipments       INTEGER   DEFAULT NULL,
    total_vehicles        INTEGER   DEFAULT NULL,
    trucks_used           INTEGER   DEFAULT NULL,
    utilization_achieved  REAL      DEFAULT NULL,
    cost_saving_pct       REAL      DEFAULT NULL,
    carbon_saving_pct     REAL      DEFAULT NULL,
    trip_reduction_pct    REAL      DEFAULT NULL,
    pipeline_duration_ms  REAL      DEFAULT NULL,
    constraint_violations TEXT      DEFAULT NULL,
    scenario_results      TEXT      DEFAULT NULL,
    metrics_json          TEXT      DEFAULT NULL,
    assignments_json      TEXT      DEFAULT NULL,
    compatibility_stats   TEXT      DEFAULT NULL,
    pipeline_steps        TEXT      DEFAULT NULL
);
```

| Statement | Explanation |
|---|---|
| `plan_id INTEGER DEFAULT NULL` | **Nullable** FK to `consolidation_plans.id`. Null when the optimization run failed before a plan could be created, or when logging a partial result. No explicit `FOREIGN KEY` constraint — this is intentional to allow logging failures without a valid plan reference. |
| `solver_used VARCHAR` | Which solver ran: `"MIP"` (OR-Tools CP-SAT for ≤50 shipments), `"HEURISTIC"` (FFD + local search for >50), or `"NONE"` if the run failed before solving. |
| `solver_status VARCHAR` | Terminal status: `"OPTIMAL"` (proven best), `"FEASIBLE"` (valid but not proven optimal), `"INFEASIBLE"` (no valid assignment exists), `"TIMEOUT"` (solver time limit hit). |
| `is_feasible INTEGER DEFAULT 1` | Boolean as integer (`1`=true, `0`=false). Uses `INTEGER` instead of `BOOLEAN` because SQLite doesn't have a native boolean type. Default `1` (feasible) — only set to `0` when the solver explicitly reports infeasibility. |
| `retry_count INTEGER DEFAULT 0` | How many times the pipeline retried after an infeasibility. The LangGraph conditional edge sends infeasible results back through the relaxation agent, which loosens constraints and re-runs the solver. |
| `constraint_violations TEXT` | JSON array of violation dicts, e.g. `[{"type": "hazmat", "shipments": ["S003","S007"], "detail": "..."}]`. Populated by the guardrail and relaxation agents. |
| `scenario_results TEXT` | JSON array of the 4 scenario outputs (duplicates `scenario_results` table data for self-contained audit records). |
| `metrics_json TEXT` | JSON dict with full before/after metrics: `{"before": {...}, "after": {...}, "savings": {...}}`. The complete metrics blob for dashboard rendering. |
| `assignments_json TEXT` | JSON array of assignment dicts: `[{"vehicle_id": "V001", "shipments": [...], "utilization": 95.2}]`. Snapshot of the plan at time of logging. |
| `compatibility_stats TEXT` | JSON dict: `{"total_pairs": 190, "compatible_pairs": 87, "compatibility_rate": 0.458, ...}`. ML model stats from the compatibility scoring step. Used to track model quality over time. |
| `pipeline_steps TEXT` | JSON array of timing records: `[{"step": "validation", "status": "ok", "duration_ms": 12.5}, ...]`. Used for performance monitoring and debugging slow pipeline stages. |

---

### Down Migration (Rollback)

```sql
DROP TABLE IF EXISTS optimization_outcomes;
DROP TABLE IF EXISTS scenario_results;
DROP TABLE IF EXISTS plan_assignments;
DROP TABLE IF EXISTS consolidation_plans;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS shipments;
```

Tables are dropped in **reverse dependency order**: child tables (those with foreign keys) first, then parent tables. `IF EXISTS` makes the rollback idempotent. This completely removes all schema and data — use with caution in production.

---

## Migration 002: New Tables

### `customers` — Shipment owners

```sql
CREATE TABLE IF NOT EXISTS customers (
    customer_id       VARCHAR   PRIMARY KEY,
    name              VARCHAR   NOT NULL,
    email             VARCHAR   DEFAULT NULL,
    phone             VARCHAR   DEFAULT NULL,
    sla_tier          VARCHAR   DEFAULT 'STANDARD',
    contract_rate_discount REAL DEFAULT 0.0,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

| Statement | Explanation |
|---|---|
| `customer_id VARCHAR PRIMARY KEY` | External ID from the client's system (e.g. "CUST-001"). String PK for the same reason as shipments/vehicles. |
| `sla_tier VARCHAR DEFAULT 'STANDARD'` | `STANDARD`, `PREMIUM`, or `EXPRESS`. Determines how aggressively the optimizer protects this customer's shipments. EXPRESS maps to HIGH priority in the solver. |
| `contract_rate_discount REAL DEFAULT 0.0` | Percentage discount on lane rates (0–100). Applied during cost calculation in the solver's objective function. Default 0 = no discount. |

---

### `depots` — Physical hub locations

```sql
CREATE TABLE IF NOT EXISTS depots (
    depot_id          VARCHAR   PRIMARY KEY,
    name              VARCHAR   NOT NULL,
    city              VARCHAR   NOT NULL,
    lat               REAL      DEFAULT NULL,
    lng               REAL      DEFAULT NULL,
    operating_hours_start VARCHAR DEFAULT '06:00',
    operating_hours_end   VARCHAR DEFAULT '22:00',
    dock_count        INTEGER   DEFAULT 1,
    queue_capacity    INTEGER   DEFAULT 10,
    is_active         INTEGER   DEFAULT 1
);
```

| Statement | Explanation |
|---|---|
| `lat REAL DEFAULT NULL` / `lng REAL DEFAULT NULL` | WGS84 coordinates. Enables real distance calculations in `route_optimizer.py` instead of the synthetic `get_distance()` function. Nullable because coordinates may not be known initially. |
| `operating_hours_start/end VARCHAR` | HH:MM format strings. The solver should not schedule pickups/deliveries outside this window. Stored as VARCHAR because SQLite has no native TIME type. |
| `dock_count INTEGER DEFAULT 1` | Number of loading docks. `warehouse_queue.py` uses this for congestion analysis — more docks = less waiting. |
| `queue_capacity INTEGER DEFAULT 10` | Max vehicles that can queue at this depot. Prevents the solver from scheduling too many simultaneous arrivals. |
| `is_active INTEGER DEFAULT 1` | Soft delete flag. Decommissioned depots are kept for historical queries but excluded from active routing. |

---

### `drivers` — Truck operators

```sql
CREATE TABLE IF NOT EXISTS drivers (
    driver_id         VARCHAR   PRIMARY KEY,
    name              VARCHAR   NOT NULL,
    phone             VARCHAR   DEFAULT NULL,
    license_type      VARCHAR   DEFAULT 'STANDARD',
    hazmat_certified  INTEGER   DEFAULT 0,
    max_hours         REAL      DEFAULT 11.0,
    home_depot_id     VARCHAR   DEFAULT NULL,
    is_available      INTEGER   DEFAULT 1,

    FOREIGN KEY (home_depot_id) REFERENCES depots(depot_id)
);
```

| Statement | Explanation |
|---|---|
| `license_type VARCHAR DEFAULT 'STANDARD'` | `STANDARD` or `HMV` (Heavy Motor Vehicle). Large trucks require HMV-licensed drivers — the solver can enforce this as a constraint. |
| `hazmat_certified INTEGER DEFAULT 0` | The guardrail checks this before assigning hazardous cargo. A driver without certification cannot carry hazmat loads, regardless of vehicle compatibility. |
| `max_hours REAL DEFAULT 11.0` | Indian Motor Vehicles Act allows 8–11 hours of continuous driving. The solver can add this as a time constraint on route length. |
| `home_depot_id VARCHAR ... REFERENCES depots(depot_id)` | Where this driver starts their shift. The route optimizer uses this to minimize deadhead (empty travel to first pickup). |
| `is_available INTEGER DEFAULT 1` | Drivers on leave or rest are excluded from assignment. Toggled by the dispatch system. |

---

### `lane_rates` — Per-route pricing

```sql
CREATE TABLE IF NOT EXISTS lane_rates (
    lane_id           INTEGER   PRIMARY KEY AUTOINCREMENT,
    origin            VARCHAR   NOT NULL,
    destination       VARCHAR   NOT NULL,
    cost_per_kg       REAL      DEFAULT NULL,
    cost_per_trip     REAL      DEFAULT NULL,
    transit_time_hrs  REAL      DEFAULT NULL,
    distance_km       REAL      DEFAULT NULL,
    effective_from    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    effective_to      TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_lane_rates_origin_dest ON lane_rates(origin, destination);
```

| Statement | Explanation |
|---|---|
| `cost_per_kg REAL` / `cost_per_trip REAL` | Two pricing models: weight-based and flat-rate. The solver can use either or both. Both nullable because some lanes only have one pricing model. |
| `transit_time_hrs REAL` | Expected transit hours. Replaces hardcoded estimates with real lane data for time window feasibility checks. |
| `distance_km REAL` | Actual distance. Replaces the synthetic `get_distance()` lookup with real values. |
| `effective_from` / `effective_to` | Rate validity window. `NULL` effective_to means the rate is still active. Enables historical rate tracking without deleting old rates. |
| `CREATE INDEX ... ON lane_rates(origin, destination)` | Composite index on the two columns used in every lookup. The solver queries rates by origin-destination pair for every shipment. |

---

### `shipment_events` — Lifecycle audit trail

```sql
CREATE TABLE IF NOT EXISTS shipment_events (
    event_id          INTEGER   PRIMARY KEY AUTOINCREMENT,
    shipment_id       VARCHAR   NOT NULL,
    event_type        VARCHAR   NOT NULL,
    timestamp         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    location          VARCHAR   DEFAULT NULL,
    notes             TEXT      DEFAULT NULL,

    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id)
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_events_type ON shipment_events(event_type);
```

| Statement | Explanation |
|---|---|
| `event_type VARCHAR NOT NULL` | `CREATED`, `PICKED_UP`, `IN_TRANSIT`, `DELAYED`, `DELIVERED`, `SLA_BREACH`. While the shipments table has a single `status` field, this table records every transition with full context. |
| `location VARCHAR DEFAULT NULL` | City or depot where the event occurred. Enables geographic tracking and delay pattern analysis. |
| `notes TEXT DEFAULT NULL` | Free-text context (e.g. "delayed 2h due to heavy rain on NH48"). Provides qualitative data that structured fields can't capture. |
| Two indexes | `idx_shipment_events_shipment` for "show me all events for shipment X" queries. `idx_shipment_events_type` for "show me all SLA breaches" dashboard queries. |

---

### `ml_model_versions` — Model training history

```sql
CREATE TABLE IF NOT EXISTS ml_model_versions (
    version_id        INTEGER   PRIMARY KEY AUTOINCREMENT,
    trained_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    model_type        VARCHAR   DEFAULT 'RandomForest',
    training_samples  INTEGER   DEFAULT NULL,
    accuracy          REAL      DEFAULT NULL,
    f1_score          REAL      DEFAULT NULL,
    precision_score   REAL      DEFAULT NULL,
    recall_score      REAL      DEFAULT NULL,
    feature_importances TEXT    DEFAULT NULL,
    hyperparameters   TEXT      DEFAULT NULL,
    model_path        VARCHAR   DEFAULT NULL,
    is_active         INTEGER   DEFAULT 0,
    notes             TEXT      DEFAULT NULL
);
```

| Statement | Explanation |
|---|---|
| `model_type VARCHAR DEFAULT 'RandomForest'` | Currently always RandomForest. Stored explicitly so future model experiments (XGBoost, neural) are tracked without schema changes. |
| `accuracy`, `f1_score`, `precision_score`, `recall_score` | Evaluation metrics from the test split. Enables quality drift detection: if F1 drops across versions, something changed in the data. |
| `feature_importances TEXT` | JSON dict: `{"time_overlap_pct": 0.314, ...}`. Tracks which features the model relies on — shifts in importance signal distribution changes in the shipment data. |
| `hyperparameters TEXT` | JSON dict: `{"n_estimators": 400, "max_depth": 25}`. Enables reproducibility and A/B comparison between training configurations. |
| `is_active INTEGER DEFAULT 0` | Only one version should be active at a time. The compatibility scoring tool loads the active version. Default 0 means new versions are archived until explicitly promoted. |

---

### `alerts` — Operational notifications

```sql
CREATE TABLE IF NOT EXISTS alerts (
    alert_id          INTEGER   PRIMARY KEY AUTOINCREMENT,
    alert_type        VARCHAR   NOT NULL,
    severity          VARCHAR   DEFAULT 'MEDIUM',
    shipment_id       VARCHAR   DEFAULT NULL,
    plan_id           INTEGER   DEFAULT NULL,
    vehicle_id        VARCHAR   DEFAULT NULL,
    message           TEXT      NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged      INTEGER   DEFAULT 0,
    acknowledged_at   TIMESTAMP DEFAULT NULL,
    resolved          INTEGER   DEFAULT 0,
    resolved_at       TIMESTAMP DEFAULT NULL,

    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id),
    FOREIGN KEY (plan_id)     REFERENCES consolidation_plans(id),
    FOREIGN KEY (vehicle_id)  REFERENCES vehicles(vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON alerts(resolved);
```

| Statement | Explanation |
|---|---|
| `alert_type VARCHAR NOT NULL` | `SLA_BREACH`, `CAPACITY_WARNING`, `DELAY`, `INFEASIBILITY`, `ANOMALY`. Categorizes alerts for filtering and routing to the right team. |
| `severity VARCHAR DEFAULT 'MEDIUM'` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Determines notification urgency and dashboard display priority. |
| Three nullable FKs (`shipment_id`, `plan_id`, `vehicle_id`) | Not all alerts are tied to a specific entity. A `CAPACITY_WARNING` may reference a vehicle but no shipment; an `INFEASIBILITY` alert references a plan but no specific vehicle. |
| `acknowledged` / `resolved` workflow | Two-stage lifecycle: an alert is first acknowledged (seen by operator), then resolved (fixed). Both are integer booleans with timestamps. |
| `idx_alerts_unresolved` | Index on `resolved` column. The dashboard's "open alerts" view filters `WHERE resolved = 0` — this index makes that query fast. |

---

### `feedback` — Post-execution plan evaluation

```sql
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id       INTEGER   PRIMARY KEY AUTOINCREMENT,
    plan_id           INTEGER   NOT NULL,
    submitted_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rating            INTEGER   DEFAULT NULL,
    actual_utilization REAL     DEFAULT NULL,
    actual_cost       REAL      DEFAULT NULL,
    actual_carbon     REAL      DEFAULT NULL,
    sla_met_pct       REAL      DEFAULT NULL,
    notes             TEXT      DEFAULT NULL,

    FOREIGN KEY (plan_id) REFERENCES consolidation_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_plan ON feedback(plan_id);
```

| Statement | Explanation |
|---|---|
| `plan_id INTEGER NOT NULL` | Every feedback entry must reference a plan. Unlike outcomes, feedback is only submitted for plans that were actually executed. |
| `rating INTEGER DEFAULT NULL` | 1–5 star score. Simple qualitative metric that captures overall satisfaction. Nullable because some feedback may only include quantitative metrics. |
| `actual_utilization`, `actual_cost`, `actual_carbon`, `sla_met_pct` | Real-world metrics after execution. Comparing these against the optimizer's predictions reveals systematic over/under-estimation the ML model can learn from. |
| `idx_feedback_plan` | Plans may have multiple feedback entries (e.g. from different stakeholders). Index enables fast lookup by plan. |

---

### ALTER TABLE additions (Migration 002)

```sql
ALTER TABLE shipments ADD COLUMN customer_id VARCHAR DEFAULT NULL REFERENCES customers(customer_id);
ALTER TABLE vehicles ADD COLUMN driver_id VARCHAR DEFAULT NULL REFERENCES drivers(driver_id);
ALTER TABLE plan_assignments ADD COLUMN driver_id VARCHAR DEFAULT NULL REFERENCES drivers(driver_id);
```

| Statement | Explanation |
|---|---|
| `shipments.customer_id` | Links each shipment to its owning customer. Nullable because existing shipments were created before the customers table existed. Enables per-customer SLA reporting. |
| `vehicles.driver_id` | Links a vehicle to its default assigned driver. Nullable because not every vehicle has a permanent driver. |
| `plan_assignments.driver_id` | Records which driver executed a specific trip. Different from `vehicles.driver_id` — a vehicle's default driver may not be the one who actually drove the trip. |

---

## Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────────────┐       ┌──────────────┐
│  customers   │       │     shipments        │       │   vehicles   │
├──────────────┤       ├──────────────────────┤       ├──────────────┤
│ customer_id  │◄─FK───│ customer_id      (FK)│       │ vehicle_id   │
│ name         │       │ shipment_id      (PK)│       │ vehicle_type │
│ sla_tier     │       │ origin               │  FK──►│ driver_id(FK)│
│ contract_disc│       │ destination          │       │ capacity_wt  │
└──────────────┘       │ pickup/delivery_time │       │ capacity_vol │
                       │ weight, volume       │       │ operating_cost│
┌──────────────┐       │ priority, status     │       └──────┬───────┘
│   depots     │       └──────────┬───────────┘              │
├──────────────┤                  │                           │
│ depot_id     │◄─FK─┐            │                   ┌──────┴────────┐
│ city, lat/lng│     │    ┌───────┴────────┐          │   drivers     │
│ dock_count   │     │    │shipment_events │          ├───────────────┤
│ queue_cap    │     │    ├────────────────┤     FK──►│ driver_id     │
│ hours        │     │    │ shipment_id(FK)│          │ name, phone   │
└──────────────┘     │    │ event_type     │          │ license_type  │
                     │    │ timestamp      │          │ hazmat_cert   │
                     │    │ location, notes│          │ max_hours     │
                     │    └────────────────┘          │ home_depot(FK)│
                     │                                └───────────────┘
                     └────────────────────┘

┌────────────────────┐     ┌────────────────────────┐
│  plan_assignments  │     │  consolidation_plans   │
├────────────────────┤     ├────────────────────────┤
│ plan_id       (FK)─┼────►│ id                (PK) │◄──┐
│ vehicle_id    (FK) │     │ created_at             │   │
│ driver_id     (FK) │     │ status                 │   │
│ shipment_ids (JSON)│     │ total_trucks           │   │
│ utilization_pct    │     │ avg_utilization         │   │
│ route_detour_km    │     │ cost/carbon_saving_pct  │   │
└────────────────────┘     └────────────────────────┘   │
                                                        │
┌────────────────────┐  ┌───────────────────────────┐   │
│ scenario_results   │  │ optimization_outcomes     │   │
├────────────────────┤  ├───────────────────────────┤   │
│ plan_id       (FK)─┼──│ plan_id        (nullable) │───┘
│ scenario_type      │  │ solver_used/status         │
│ trucks, util, cost │  │ metrics + JSON blobs       │
│ carbon, sla_rate   │  └───────────────────────────┘
└────────────────────┘
                       ┌───────────────────────┐
┌──────────────┐       │   ml_model_versions   │
│   alerts     │       ├───────────────────────┤
├──────────────┤       │ version_id        (PK)│
│ alert_type   │       │ model_type, samples    │
│ severity     │       │ accuracy, f1, prec/rec │
│ shipment(FK) │       │ feature_importances    │
│ plan_id (FK) │       │ hyperparameters        │
│ vehicle(FK)  │       │ is_active              │
│ message      │       └───────────────────────┘
│ ack/resolved │
└──────────────┘       ┌───────────────────────┐
                       │      feedback         │
                       ├───────────────────────┤
                       │ plan_id          (FK) │
                       │ rating                │
                       │ actual_util/cost/co2  │
                       │ sla_met_pct           │
                       └───────────────────────┘

┌───────────────────────┐
│     lane_rates        │
├───────────────────────┤
│ origin, destination   │
│ cost_per_kg/trip      │
│ transit_time, distance│
│ effective_from/to     │
└───────────────────────┘
```

**Notes:**
- `plan_assignments.shipment_ids` references shipments via a JSON array, not a traditional foreign key (deliberate denormalization for query simplicity).
- `lane_rates` links to shipments by matching `origin`/`destination` strings, not via FK (lanes are a reference table, not a relational parent).

---

## Design Decisions

| Decision | Rationale |
|---|---|
| **JSON-as-TEXT columns** | SQLite lacks native JSON type. Storing JSON as TEXT works on both SQLite and PostgreSQL. The app serializes/deserializes with `json.loads()`/`json.dumps()`. |
| **String primary keys** (shipments, vehicles, customers, depots, drivers) | IDs come from external systems, not auto-generated. String PKs avoid an unnecessary surrogate key mapping layer. |
| **Integer booleans** (`is_feasible`, `is_active`, `hazmat_certified`, `acknowledged`, `resolved`) | SQLite has no native `BOOLEAN`. Using `INTEGER` with 0/1 is the standard SQLite pattern. |
| **Nullable `plan_id`** on outcomes | Failed optimization runs still get logged for debugging. A `NOT NULL` constraint would prevent logging failures. |
| **No cascade deletes in SQL** | Cascade behavior is handled in application code (Python). This keeps the SQL portable and prevents accidental cascade deletions. |
| **`AUTOINCREMENT` on integer PKs** | Prevents ID reuse after row deletion. Without it, SQLite can recycle IDs, which could cause confusion in audit logs. |
| **`DEFAULT CURRENT_TIMESTAMP`** | Maps to SQLAlchemy's `server_default=func.now()`. The database sets the timestamp, not the application, ensuring consistency even if the app clock drifts. |
| **VARCHAR for time-of-day** (`operating_hours_start/end`) | SQLite has no native TIME type. HH:MM strings are human-readable and simple to compare lexicographically. |
| **Rate validity via `effective_from/to`** | Soft-expires old rates instead of deleting them. Query with `WHERE effective_to IS NULL` for current rates. Historical rates preserved for auditing. |
| **Separate `feedback` vs `optimization_outcomes`** | Outcomes are system-generated (automatic logging). Feedback is human-generated (post-execution review). Different sources, different trust levels, different schemas. |
| **`ALTER TABLE` for new FKs on existing tables** | Adding nullable columns is non-destructive — existing rows get `NULL`. Avoids recreating tables or backfilling data. |
