# SVKM's NMIMS

## Mukesh Patel School of Technology Management & Engineering

### A.Y. 2025 - 26

### Course: Database Management Systems

---

# Project Report

**Program:** B.Tech Computer Science

**Semester:** IV

**Name of the Project:** Lorri AI — Autonomous Freight Load Consolidation Platform

---

### Details of Project Members

| Batch | Roll No. | Name |
|---|---|---|
| - | E043 | Muaaz Shaikh |
| - | E046 | Vaishnavi Parashar |
| - | E056 | Manikya Rathore |
| - | E051 | Aditya Rajkumar |

**Date of Submission:** April 2026

---

### Contribution of Each Project Member

| Roll No. | Name | Contribution |
|---|---|---|
| E043 | Muaaz Shaikh | AI & Backend — FastAPI server, LangGraph agentic pipeline, 4 LLM agents, Pydantic schemas, SQLAlchemy ORM models, database migration system, API routes |
| E046 | Vaishnavi Parashar | Database — Schema design (14 tables), SQL migration scripts (up/down), normalization, ER modeling, SQLite/PostgreSQL dual support, indexing strategy |
| E056 | Manikya Rathore | Frontend — React 18 dashboard, Tailwind CSS theming, Recharts visualizations, Leaflet route maps, Axios API client, state management |
| E051 | Aditya Rajkumar | Operations Research & Optimization — OR-Tools CP-SAT MIP solver, FFD heuristic, route optimization (TSP), sensitivity analysis, warehouse queue analysis (M/M/1), scenario simulation engine |

**GitHub Link:** https://github.com/muaazshaikh/Lorri_Hackathon

---

## Table of Contents

| Sr No. | Topic | Page No. |
|---|---|---|
| 1 | Problem Statement | 1 |
| 2 | Components of Database Design | 2 |
| 3 | Entity Relationship Diagram | 5 |
| 4 | Relational Model | 6 |
| 5 | Normalization | 8 |
| 6 | SQL Queries | 10 |
| 7 | Project Demonstration | 18 |
| 8 | Self-Learning Beyond Classroom | 20 |
| 9 | Learning from the Project | 21 |
| 10 | Challenges Faced | 22 |
| 11 | Conclusion | 23 |

---

## I. Problem Statement

Indian logistics networks suffer from severe inefficiency in freight transportation. The typical last-mile and inter-city freight model assigns one truck per shipment, resulting in trucks running at only 40-60% capacity. This leads to:

- **Wasted capacity**: trucks travel half-empty, increasing the cost per kilogram shipped
- **Excess carbon emissions**: more trucks on the road means more fuel burned for the same freight volume
- **SLA breaches**: without intelligent scheduling, high-priority shipments share routes with low-priority ones, causing delays
- **No visibility**: operators have no way to compare "what-if" scenarios (e.g., what happens if 30% of the fleet is unavailable?)

**Lorri AI** solves this by building an autonomous freight consolidation platform that groups compatible shipments onto shared trucks. The system uses a database of shipments, vehicles, customers, depots, drivers, and lane rates to feed an optimization pipeline that:

1. **Validates** incoming shipment data for quality (missing fields, impossible time windows, capacity exceedance)
2. **Scores** all shipment pairs for compatibility using a machine learning model (14 features, RandomForest classifier)
3. **Enforces** hard safety policies (hazmat cannot share a truck with food cargo)
4. **Solves** the assignment problem using Google OR-Tools CP-SAT (Mixed Integer Programming)
5. **Simulates** 4 what-if scenarios (strict SLA, flexible SLA, vehicle shortage, demand surge)
6. **Logs** every optimization run for audit and ML retraining

The database is the backbone of this system — it stores the inputs (shipments, vehicles, customers, depots, drivers, lane rates), the outputs (consolidation plans, assignments, scenario results), operational events (shipment lifecycle tracking, alerts), and learning data (optimization outcomes, ML model versions, feedback).

**Key results achieved:**
- Truck usage reduced by 60% (20 shipments → 8 trucks)
- Average utilization increased from ~55% to 97.2%
- Cost savings of 32.5%
- Route distance reduced by 13.5% via TSP optimization

---

## II. Components of Database Design

### Entities and Their Attributes

#### 1. Shipments
The core input entity. Each row represents a freight shipment to be consolidated.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **shipment_id** | VARCHAR | **PRIMARY KEY** | User-provided ID (e.g. "SH-0001") |
| origin | VARCHAR | NOT NULL | Origin city |
| destination | VARCHAR | NOT NULL | Destination city |
| pickup_time | TIMESTAMP | NOT NULL | Earliest pickup window |
| delivery_time | TIMESTAMP | NOT NULL | Latest delivery deadline |
| weight | REAL | NOT NULL | Weight in kg |
| volume | REAL | NOT NULL | Volume in cubic meters |
| priority | VARCHAR | DEFAULT 'MEDIUM' | LOW, MEDIUM, or HIGH |
| special_handling | VARCHAR | NULLABLE | "refrigerated", "fragile", "hazardous", "oversized" |
| status | VARCHAR | DEFAULT 'PENDING' | PENDING, ASSIGNED, IN_TRANSIT, DELIVERED |
| customer_id | VARCHAR | FK → customers | Which customer owns this shipment |

#### 2. Vehicles
Fleet inventory. The optimizer assigns shipments to vehicles respecting capacity constraints.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **vehicle_id** | VARCHAR | **PRIMARY KEY** | Fleet ID (e.g. "V001") |
| vehicle_type | VARCHAR | NOT NULL | "small_tempo", "medium_truck", "large_trailer", "refrigerated" |
| capacity_weight | REAL | NOT NULL | Max payload in kg |
| capacity_volume | REAL | NOT NULL | Max volume in m³ |
| operating_cost | REAL | NOT NULL | Cost per trip (INR) |
| driver_id | VARCHAR | FK → drivers | Assigned driver |

#### 3. Customers
Shipment owners. Enables per-customer SLA tracking and contract rate discounts.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **customer_id** | VARCHAR | **PRIMARY KEY** | External ID (e.g. "CUST-001") |
| name | VARCHAR | NOT NULL | Company name |
| email | VARCHAR | NULLABLE | Contact email |
| phone | VARCHAR | NULLABLE | Contact phone |
| sla_tier | VARCHAR | DEFAULT 'STANDARD' | STANDARD, PREMIUM, or EXPRESS |
| contract_rate_discount | REAL | DEFAULT 0.0 | % discount on lane rates |
| created_at | TIMESTAMP | DEFAULT NOW | Registration timestamp |

#### 4. Depots
Physical warehouse/hub locations with coordinates and capacity.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **depot_id** | VARCHAR | **PRIMARY KEY** | Hub ID (e.g. "DEP-BOM-01") |
| name | VARCHAR | NOT NULL | Depot display name |
| city | VARCHAR | NOT NULL | City for grouping |
| lat | REAL | NULLABLE | Latitude (WGS84) |
| lng | REAL | NULLABLE | Longitude (WGS84) |
| operating_hours_start | VARCHAR | DEFAULT '06:00' | Dock opening time (HH:MM) |
| operating_hours_end | VARCHAR | DEFAULT '22:00' | Dock closing time (HH:MM) |
| dock_count | INTEGER | DEFAULT 1 | Number of loading docks |
| queue_capacity | INTEGER | DEFAULT 10 | Max vehicles that can queue |
| is_active | INTEGER | DEFAULT 1 | 1=active, 0=decommissioned |

#### 5. Drivers
Truck operators with licensing, certification, and availability.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **driver_id** | VARCHAR | **PRIMARY KEY** | Driver ID (e.g. "DRV-001") |
| name | VARCHAR | NOT NULL | Full name |
| phone | VARCHAR | NULLABLE | Contact number |
| license_type | VARCHAR | DEFAULT 'STANDARD' | STANDARD or HMV |
| hazmat_certified | INTEGER | DEFAULT 0 | 1=yes, 0=no |
| max_hours | REAL | DEFAULT 11.0 | Max driving hours per shift |
| home_depot_id | VARCHAR | FK → depots | Default start location |
| is_available | INTEGER | DEFAULT 1 | 1=available, 0=unavailable |

#### 6. Lane Rates
Per-route pricing data replacing flat vehicle costs.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **lane_id** | INTEGER | **PRIMARY KEY, AUTO** | Auto-generated |
| origin | VARCHAR | NOT NULL | Origin city |
| destination | VARCHAR | NOT NULL | Destination city |
| cost_per_kg | REAL | NULLABLE | Weight-based rate |
| cost_per_trip | REAL | NULLABLE | Flat rate per trip |
| transit_time_hrs | REAL | NULLABLE | Expected transit hours |
| distance_km | REAL | NULLABLE | Lane distance in km |
| effective_from | TIMESTAMP | DEFAULT NOW | Rate validity start |
| effective_to | TIMESTAMP | NULLABLE | NULL = still active |

#### 7. Consolidation Plans
Top-level optimization result. One row per `/optimize` API call.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **id** | INTEGER | **PRIMARY KEY, AUTO** | Plan ID |
| created_at | TIMESTAMP | DEFAULT NOW | When plan was created |
| status | VARCHAR | DEFAULT 'DRAFT' | DRAFT, OPTIMIZED, EXECUTED |
| total_trucks | INTEGER | NULLABLE | Trucks used by optimizer |
| trips_baseline | INTEGER | NULLABLE | Trips without consolidation |
| avg_utilization | REAL | NULLABLE | Average utilization 0-100 |
| cost_saving_pct | REAL | NULLABLE | % cost saved vs baseline |
| carbon_saving_pct | REAL | NULLABLE | % carbon saved vs baseline |

#### 8. Plan Assignments
Maps one vehicle to its assigned shipments within a plan.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **id** | INTEGER | **PRIMARY KEY, AUTO** | Assignment ID |
| plan_id | INTEGER | FK → consolidation_plans | Which plan |
| vehicle_id | VARCHAR | FK → vehicles | Which vehicle |
| shipment_ids | TEXT | NOT NULL | JSON array of shipment IDs |
| utilization_pct | REAL | NULLABLE | Vehicle fill % (0-100) |
| route_detour_km | REAL | NULLABLE | Extra km from multi-stop |
| driver_id | VARCHAR | FK → drivers | Driver who executed the trip |

#### 9. Scenario Results
Stores output of each simulation scenario. Each plan gets 4 rows.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **id** | INTEGER | **PRIMARY KEY, AUTO** | Result ID |
| plan_id | INTEGER | FK → consolidation_plans | Which plan |
| scenario_type | VARCHAR | NOT NULL | STRICT_SLA, FLEXIBLE_SLA, VEHICLE_SHORTAGE, DEMAND_SURGE |
| trucks_used | INTEGER | NULLABLE | Trucks needed under scenario |
| avg_utilization | REAL | NULLABLE | Utilization under scenario |
| total_cost | REAL | NULLABLE | Total cost |
| carbon_emissions | REAL | NULLABLE | kg CO2 equivalent |
| sla_success_rate | REAL | NULLABLE | % shipments meeting SLA |

#### 10. Optimization Outcomes
Full audit log of every optimization run. Used for ML retraining.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **id** | INTEGER | **PRIMARY KEY, AUTO** | Outcome ID |
| created_at | TIMESTAMP | DEFAULT NOW | When recorded |
| plan_id | INTEGER | NULLABLE | FK → plans (nullable: run may fail) |
| solver_used | VARCHAR | NULLABLE | "MIP", "HEURISTIC", or "NONE" |
| solver_status | VARCHAR | NULLABLE | "OPTIMAL", "FEASIBLE", "INFEASIBLE" |
| is_feasible | INTEGER | DEFAULT 1 | 1=true, 0=false |
| retry_count | INTEGER | DEFAULT 0 | Retries after infeasibility |
| total_shipments | INTEGER | NULLABLE | Input count |
| total_vehicles | INTEGER | NULLABLE | Available count |
| trucks_used | INTEGER | NULLABLE | Trucks in final plan |
| utilization_achieved | REAL | NULLABLE | Avg utilization |
| cost_saving_pct | REAL | NULLABLE | % cost saved |
| carbon_saving_pct | REAL | NULLABLE | % carbon saved |
| trip_reduction_pct | REAL | NULLABLE | % trips reduced |
| pipeline_duration_ms | REAL | NULLABLE | Execution time in ms |
| constraint_violations | TEXT | NULLABLE | JSON array |
| scenario_results | TEXT | NULLABLE | JSON array |
| metrics_json | TEXT | NULLABLE | JSON dict |
| assignments_json | TEXT | NULLABLE | JSON array |
| compatibility_stats | TEXT | NULLABLE | JSON dict |
| pipeline_steps | TEXT | NULLABLE | JSON array |

#### 11. Shipment Events
Lifecycle audit trail for every shipment state transition.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **event_id** | INTEGER | **PRIMARY KEY, AUTO** | Event ID |
| shipment_id | VARCHAR | FK → shipments | Which shipment |
| event_type | VARCHAR | NOT NULL | CREATED, PICKED_UP, IN_TRANSIT, DELAYED, DELIVERED, SLA_BREACH |
| timestamp | TIMESTAMP | DEFAULT NOW | When event occurred |
| location | VARCHAR | NULLABLE | City or depot |
| notes | TEXT | NULLABLE | Free-text context |

#### 12. ML Model Versions
Tracks every training run of the compatibility model.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **version_id** | INTEGER | **PRIMARY KEY, AUTO** | Version ID |
| trained_at | TIMESTAMP | DEFAULT NOW | Training timestamp |
| model_type | VARCHAR | DEFAULT 'RandomForest' | Algorithm name |
| training_samples | INTEGER | NULLABLE | Pairs used for training |
| accuracy | REAL | NULLABLE | Overall accuracy (0-1) |
| f1_score | REAL | NULLABLE | F1 score (0-1) |
| precision_score | REAL | NULLABLE | Precision (0-1) |
| recall_score | REAL | NULLABLE | Recall (0-1) |
| feature_importances | TEXT | NULLABLE | JSON dict |
| hyperparameters | TEXT | NULLABLE | JSON dict |
| model_path | VARCHAR | NULLABLE | Path to .joblib file |
| is_active | INTEGER | DEFAULT 0 | 1=active, 0=archived |
| notes | TEXT | NULLABLE | Reason for retraining |

#### 13. Alerts
Operational notifications with acknowledge/resolve workflow.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **alert_id** | INTEGER | **PRIMARY KEY, AUTO** | Alert ID |
| alert_type | VARCHAR | NOT NULL | SLA_BREACH, CAPACITY_WARNING, DELAY, INFEASIBILITY, ANOMALY |
| severity | VARCHAR | DEFAULT 'MEDIUM' | LOW, MEDIUM, HIGH, CRITICAL |
| shipment_id | VARCHAR | FK → shipments (nullable) | Related shipment |
| plan_id | INTEGER | FK → plans (nullable) | Related plan |
| vehicle_id | VARCHAR | FK → vehicles (nullable) | Related vehicle |
| message | TEXT | NOT NULL | Human-readable description |
| created_at | TIMESTAMP | DEFAULT NOW | When alert was raised |
| acknowledged | INTEGER | DEFAULT 0 | 1=seen, 0=pending |
| acknowledged_at | TIMESTAMP | NULLABLE | When acknowledged |
| resolved | INTEGER | DEFAULT 0 | 1=fixed, 0=open |
| resolved_at | TIMESTAMP | NULLABLE | When resolved |

#### 14. Feedback
Post-execution plan reviews comparing predicted vs actual metrics.

| Attribute | Type | Constraint | Description |
|---|---|---|---|
| **feedback_id** | INTEGER | **PRIMARY KEY, AUTO** | Feedback ID |
| plan_id | INTEGER | FK → consolidation_plans | Which plan |
| submitted_at | TIMESTAMP | DEFAULT NOW | Submission time |
| rating | INTEGER | NULLABLE | 1-5 star rating |
| actual_utilization | REAL | NULLABLE | Real utilization (0-100) |
| actual_cost | REAL | NULLABLE | Real total cost |
| actual_carbon | REAL | NULLABLE | Real emissions |
| sla_met_pct | REAL | NULLABLE | % that actually met SLA |
| notes | TEXT | NULLABLE | Qualitative feedback |

### Relationships and Cardinality

| Relationship | Cardinality | Participation |
|---|---|---|
| Customer **owns** Shipments | 1:N | Customer: partial, Shipment: partial |
| Shipment **has** Shipment Events | 1:N | Shipment: partial, Event: total |
| Depot **houses** Drivers | 1:N | Depot: partial, Driver: partial |
| Driver **drives** Vehicle | 1:1 | Driver: partial, Vehicle: partial |
| Driver **executes** Plan Assignment | 1:N | Driver: partial, Assignment: partial |
| Vehicle **is assigned in** Plan Assignment | 1:N | Vehicle: partial, Assignment: total |
| Consolidation Plan **contains** Plan Assignments | 1:N | Plan: total, Assignment: total |
| Consolidation Plan **has** Scenario Results | 1:N (exactly 4) | Plan: partial, Result: total |
| Consolidation Plan **has** Feedback | 1:N | Plan: partial, Feedback: total |
| Consolidation Plan **logged as** Optimization Outcome | 1:1 | Plan: partial, Outcome: partial |
| Shipment **referenced in** Alerts | 1:N | Shipment: partial, Alert: partial |
| Consolidation Plan **referenced in** Alerts | 1:N | Plan: partial, Alert: partial |
| Vehicle **referenced in** Alerts | 1:N | Vehicle: partial, Alert: partial |
| Lane Rate **connects** Origin-Destination (cities) | N:M | Lane Rate: total, Cities: partial |

---

## III. Entity Relationship Diagram

*(ER Diagram to be inserted here)*

---

## IV. Relational Model

Converting the ER diagram to relations using standard mapping rules:

### Tables Obtained

```
1.  customers (customer_id PK, name, email, phone, sla_tier, contract_rate_discount, created_at)

2.  depots (depot_id PK, name, city, lat, lng, operating_hours_start, operating_hours_end,
            dock_count, queue_capacity, is_active)

3.  drivers (driver_id PK, name, phone, license_type, hazmat_certified, max_hours,
             home_depot_id FK→depots, is_available)

4.  shipments (shipment_id PK, origin, destination, pickup_time, delivery_time, weight, volume,
               priority, special_handling, status, customer_id FK→customers)

5.  vehicles (vehicle_id PK, vehicle_type, capacity_weight, capacity_volume, operating_cost,
              driver_id FK→drivers)

6.  lane_rates (lane_id PK, origin, destination, cost_per_kg, cost_per_trip, transit_time_hrs,
                distance_km, effective_from, effective_to)

7.  consolidation_plans (id PK, created_at, status, total_trucks, trips_baseline,
                         avg_utilization, cost_saving_pct, carbon_saving_pct)

8.  plan_assignments (id PK, plan_id FK→consolidation_plans, vehicle_id FK→vehicles,
                      shipment_ids, utilization_pct, route_detour_km, driver_id FK→drivers)

9.  scenario_results (id PK, plan_id FK→consolidation_plans, scenario_type, trucks_used,
                      avg_utilization, total_cost, carbon_emissions, sla_success_rate)

10. optimization_outcomes (id PK, created_at, plan_id FK→consolidation_plans, solver_used,
                           solver_status, is_feasible, retry_count, total_shipments,
                           total_vehicles, trucks_used, utilization_achieved, cost_saving_pct,
                           carbon_saving_pct, trip_reduction_pct, pipeline_duration_ms,
                           constraint_violations, scenario_results, metrics_json,
                           assignments_json, compatibility_stats, pipeline_steps)

11. shipment_events (event_id PK, shipment_id FK→shipments, event_type, timestamp,
                     location, notes)

12. ml_model_versions (version_id PK, trained_at, model_type, training_samples, accuracy,
                       f1_score, precision_score, recall_score, feature_importances,
                       hyperparameters, model_path, is_active, notes)

13. alerts (alert_id PK, alert_type, severity, shipment_id FK→shipments,
            plan_id FK→consolidation_plans, vehicle_id FK→vehicles, message,
            created_at, acknowledged, acknowledged_at, resolved, resolved_at)

14. feedback (feedback_id PK, plan_id FK→consolidation_plans, submitted_at, rating,
              actual_utilization, actual_cost, actual_carbon, sla_met_pct, notes)
```

### Foreign Key Map

| Child Table | FK Column | References |
|---|---|---|
| shipments | customer_id | customers(customer_id) |
| vehicles | driver_id | drivers(driver_id) |
| drivers | home_depot_id | depots(depot_id) |
| plan_assignments | plan_id | consolidation_plans(id) |
| plan_assignments | vehicle_id | vehicles(vehicle_id) |
| plan_assignments | driver_id | drivers(driver_id) |
| scenario_results | plan_id | consolidation_plans(id) |
| shipment_events | shipment_id | shipments(shipment_id) |
| alerts | shipment_id | shipments(shipment_id) |
| alerts | plan_id | consolidation_plans(id) |
| alerts | vehicle_id | vehicles(vehicle_id) |
| feedback | plan_id | consolidation_plans(id) |

---

## V. Normalization

### 1NF (First Normal Form)
All tables satisfy 1NF:
- Every column contains atomic (indivisible) values
- Each row is uniquely identified by a primary key
- No repeating groups

**Note on `shipment_ids` in `plan_assignments`:** This column stores a JSON array (`'["SH-0001","SH-0003"]'`) as TEXT. This is a deliberate denormalization — a proper join table (`assignment_shipments`) with (`assignment_id`, `shipment_id`) would satisfy strict 1NF. We chose JSON-as-TEXT for query simplicity and SQLite compatibility, accepting the trade-off.

**Note on `optimization_outcomes` TEXT columns:** Columns like `constraint_violations`, `metrics_json`, `assignments_json` store complex nested JSON as TEXT. These are audit/logging fields — querying their internals is rare, so denormalization into a single wide table is practical. A fully normalized design would require 5+ additional tables for a rarely-queried audit log.

### 2NF (Second Normal Form)
All tables satisfy 2NF:
- Already in 1NF
- No partial dependencies exist — every non-key attribute depends on the **entire** primary key

Since all tables use single-column primary keys (not composite), 2NF is automatically satisfied. There are no composite keys where a non-key attribute could depend on only part of the key.

### 3NF (Third Normal Form)
All tables satisfy 3NF:
- Already in 2NF
- No transitive dependencies — every non-key attribute depends **directly** on the primary key, not through another non-key attribute

**Analysis of key tables:**

- **shipments**: `origin`, `destination`, `weight`, `volume`, `priority`, `status` all depend directly on `shipment_id`. `customer_id` is a foreign key, not a transitive dependency.
- **vehicles**: `vehicle_type`, `capacity_weight`, `capacity_volume`, `operating_cost` all depend directly on `vehicle_id`. No attribute determines another non-key attribute.
- **drivers**: `hazmat_certified` depends on `driver_id`, not on `license_type` (a driver could have HMV license but not hazmat certification).
- **lane_rates**: `cost_per_kg` and `cost_per_trip` are independent pricing models for the same lane, not derivable from each other.
- **alerts**: `acknowledged_at` depends on `acknowledged` (only set when acknowledged=1), but `acknowledged` depends on `alert_id`, so the chain is `alert_id → acknowledged → acknowledged_at`. This is a transitive dependency in strict terms. However, we keep it denormalized because splitting it into a separate `alert_acknowledgments` table adds complexity for a simple boolean+timestamp pair.

### BCNF (Boyce-Codd Normal Form)
All tables satisfy BCNF:
- Already in 3NF
- For every functional dependency X → Y, X is a superkey

Since all tables use single-column primary keys and all non-key attributes depend only on that key, every determinant is a superkey. No violations.

---

## VI. SQL Queries

### A. Table Creation (Migration 001 — Core Schema)

```sql
-- Migration system tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR   PRIMARY KEY,
    applied_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```sql
-- Shipments: core input entity
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
CREATE INDEX IF NOT EXISTS idx_shipments_shipment_id ON shipments(shipment_id);
```

```sql
-- Vehicles: fleet inventory
CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id      VARCHAR   PRIMARY KEY,
    vehicle_type    VARCHAR   NOT NULL,
    capacity_weight REAL      NOT NULL,
    capacity_volume REAL      NOT NULL,
    operating_cost  REAL      NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_id ON vehicles(vehicle_id);
```

```sql
-- Consolidation plans: optimization results
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

```sql
-- Plan assignments: vehicle-to-shipment mapping
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

```sql
-- Scenario results: 4 simulation outputs per plan
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

```sql
-- Optimization outcomes: full audit log
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

### B. Table Creation (Migration 002 — Extended Schema)

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

-- ALTER existing tables to link to new entities
ALTER TABLE shipments ADD COLUMN customer_id VARCHAR DEFAULT NULL REFERENCES customers(customer_id);
ALTER TABLE vehicles ADD COLUMN driver_id VARCHAR DEFAULT NULL REFERENCES drivers(driver_id);
ALTER TABLE plan_assignments ADD COLUMN driver_id VARCHAR DEFAULT NULL REFERENCES drivers(driver_id);
```

### C. Sample Data Insertion

```sql
-- Insert customers
INSERT INTO customers (customer_id, name, email, sla_tier, contract_rate_discount) VALUES
('CUST-001', 'Reliance Logistics', 'ops@reliance.com', 'PREMIUM', 12.0),
('CUST-002', 'Tata Freight Services', 'dispatch@tata.com', 'EXPRESS', 8.5),
('CUST-003', 'Flipkart Supply Chain', 'logistics@flipkart.com', 'STANDARD', 0.0),
('CUST-004', 'Amazon India Transport', 'freight@amazon.in', 'PREMIUM', 10.0),
('CUST-005', 'Mahindra Logistics', 'transport@mahindra.com', 'STANDARD', 5.0),
('CUST-006', 'Delhivery Express', 'ops@delhivery.com', 'EXPRESS', 15.0),
('CUST-007', 'Blue Dart Cargo', 'cargo@bluedart.com', 'PREMIUM', 7.0),
('CUST-008', 'GATI Freight', 'logistics@gati.com', 'STANDARD', 3.0),
('CUST-009', 'Rivigo Transport', 'dispatch@rivigo.com', 'STANDARD', 0.0),
('CUST-010', 'Ecom Express', 'ops@ecomexpress.com', 'PREMIUM', 6.0);

-- Insert depots
INSERT INTO depots (depot_id, name, city, lat, lng, dock_count, queue_capacity) VALUES
('DEP-BOM-01', 'Mumbai Central Hub', 'Mumbai', 19.0760, 72.8777, 8, 20),
('DEP-DEL-01', 'Delhi NCR Warehouse', 'Delhi', 28.7041, 77.1025, 10, 25),
('DEP-BLR-01', 'Bangalore Tech Hub', 'Bangalore', 12.9716, 77.5946, 6, 15),
('DEP-CHN-01', 'Chennai Port Depot', 'Chennai', 13.0827, 80.2707, 5, 12),
('DEP-HYD-01', 'Hyderabad Logistics Park', 'Hyderabad', 17.3850, 78.4867, 7, 18),
('DEP-PUN-01', 'Pune Industrial Zone', 'Pune', 18.5204, 73.8567, 4, 10),
('DEP-AMD-01', 'Ahmedabad Distribution', 'Ahmedabad', 23.0225, 72.5714, 5, 12),
('DEP-KOL-01', 'Kolkata Eastern Hub', 'Kolkata', 22.5726, 88.3639, 6, 14),
('DEP-JAI-01', 'Jaipur Northern Depot', 'Jaipur', 26.9124, 75.7873, 4, 10),
('DEP-MUM-02', 'Navi Mumbai Warehouse', 'Mumbai', 19.0330, 73.0297, 6, 16);

-- Insert drivers
INSERT INTO drivers (driver_id, name, phone, license_type, hazmat_certified, max_hours, home_depot_id) VALUES
('DRV-001', 'Rajesh Kumar', '9876543210', 'HMV', 1, 11.0, 'DEP-BOM-01'),
('DRV-002', 'Amit Singh', '9876543211', 'HMV', 0, 10.0, 'DEP-DEL-01'),
('DRV-003', 'Suresh Patil', '9876543212', 'STANDARD', 0, 8.0, 'DEP-PUN-01'),
('DRV-004', 'Mohammed Ali', '9876543213', 'HMV', 1, 11.0, 'DEP-CHN-01'),
('DRV-005', 'Vikram Rao', '9876543214', 'HMV', 0, 10.0, 'DEP-BLR-01'),
('DRV-006', 'Pradeep Sharma', '9876543215', 'STANDARD', 0, 9.0, 'DEP-JAI-01'),
('DRV-007', 'Sanjay Gupta', '9876543216', 'HMV', 1, 11.0, 'DEP-HYD-01'),
('DRV-008', 'Ravi Verma', '9876543217', 'HMV', 0, 10.0, 'DEP-KOL-01'),
('DRV-009', 'Deepak Yadav', '9876543218', 'STANDARD', 0, 8.0, 'DEP-AMD-01'),
('DRV-010', 'Kiran Reddy', '9876543219', 'HMV', 1, 11.0, 'DEP-HYD-01');

-- Insert vehicles
INSERT INTO vehicles (vehicle_id, vehicle_type, capacity_weight, capacity_volume, operating_cost, driver_id) VALUES
('V001', 'large_trailer', 15000, 50.0, 15000, 'DRV-001'),
('V002', 'medium_truck', 7000, 25.0, 8000, 'DRV-002'),
('V003', 'small_tempo', 2000, 8.0, 3000, 'DRV-003'),
('V004', 'refrigerated', 5000, 18.0, 12000, 'DRV-004'),
('V005', 'large_trailer', 15000, 50.0, 15000, 'DRV-005'),
('V006', 'medium_truck', 7000, 25.0, 8000, 'DRV-006'),
('V007', 'medium_truck', 7000, 25.0, 8000, 'DRV-007'),
('V008', 'small_tempo', 2000, 8.0, 3000, 'DRV-008'),
('V009', 'refrigerated', 5000, 18.0, 12000, 'DRV-009'),
('V010', 'large_trailer', 15000, 50.0, 15000, 'DRV-010');

-- Insert shipments
INSERT INTO shipments (shipment_id, origin, destination, pickup_time, delivery_time, weight, volume, priority, special_handling, customer_id) VALUES
('SH-0001', 'Chennai', 'Jaipur', '2025-06-15 08:00:00', '2025-06-17 20:00:00', 3405.1, 12.5, 'HIGH', NULL, 'CUST-001'),
('SH-0002', 'Bangalore', 'Kolkata', '2025-06-15 09:00:00', '2025-06-18 18:00:00', 647.8, 3.2, 'MEDIUM', NULL, 'CUST-002'),
('SH-0003', 'Bangalore', 'Kolkata', '2025-06-15 09:30:00', '2025-06-18 16:00:00', 1944.9, 8.1, 'MEDIUM', NULL, 'CUST-003'),
('SH-0004', 'Kolkata', 'Jaipur', '2025-06-15 07:00:00', '2025-06-18 22:00:00', 4234.7, 15.8, 'LOW', 'fragile', 'CUST-004'),
('SH-0005', 'Chennai', 'Delhi', '2025-06-15 10:00:00', '2025-06-17 18:00:00', 4292.1, 16.0, 'HIGH', NULL, 'CUST-005'),
('SH-0006', 'Pune', 'Hyderabad', '2025-06-15 06:00:00', '2025-06-16 20:00:00', 2898.1, 10.5, 'MEDIUM', 'refrigerated', 'CUST-006'),
('SH-0007', 'Pune', 'Kolkata', '2025-06-15 08:00:00', '2025-06-18 20:00:00', 1350.6, 5.5, 'MEDIUM', NULL, 'CUST-007'),
('SH-0008', 'Kolkata', 'Ahmedabad', '2025-06-15 07:30:00', '2025-06-18 18:00:00', 4519.5, 17.2, 'LOW', NULL, 'CUST-008'),
('SH-0009', 'Chennai', 'Hyderabad', '2025-06-15 11:00:00', '2025-06-16 22:00:00', 2948.6, 11.0, 'MEDIUM', NULL, 'CUST-009'),
('SH-0010', 'Pune', 'Chennai', '2025-06-15 09:00:00', '2025-06-17 16:00:00', 4011.7, 14.8, 'HIGH', NULL, 'CUST-010');

-- Insert lane rates
INSERT INTO lane_rates (origin, destination, cost_per_kg, cost_per_trip, transit_time_hrs, distance_km) VALUES
('Mumbai', 'Delhi', 2.5, 15000, 24.0, 1400),
('Mumbai', 'Pune', 1.0, 3000, 3.0, 150),
('Chennai', 'Bangalore', 1.5, 5000, 6.0, 350),
('Delhi', 'Jaipur', 1.2, 4000, 5.0, 280),
('Kolkata', 'Delhi', 2.8, 16000, 26.0, 1500),
('Pune', 'Hyderabad', 2.0, 8000, 10.0, 560),
('Chennai', 'Hyderabad', 1.8, 7000, 9.0, 630),
('Bangalore', 'Kolkata', 3.0, 18000, 30.0, 1870),
('Kolkata', 'Ahmedabad', 2.5, 14000, 28.0, 1900),
('Chennai', 'Delhi', 3.2, 20000, 32.0, 2200);
```

### D. Migration Script

```bash
# Apply all pending migrations
PYTHONPATH=. python -m backend.app.db.migrate up

# Rollback last migration
PYTHONPATH=. python -m backend.app.db.migrate down

# Check migration status
PYTHONPATH=. python -m backend.app.db.migrate status
```

### E. Analytical Queries

**Q1: Find total weight and shipment count per origin city, ordered by weight descending**
```sql
SELECT origin,
       COUNT(*) AS shipment_count,
       ROUND(SUM(weight), 1) AS total_weight_kg
FROM shipments
GROUP BY origin
ORDER BY total_weight_kg DESC;
```

**Q2: Find vehicles with utilization above 90% across all plans**
```sql
SELECT pa.vehicle_id, v.vehicle_type, pa.utilization_pct, pa.plan_id
FROM plan_assignments pa
JOIN vehicles v ON pa.vehicle_id = v.vehicle_id
WHERE pa.utilization_pct > 90.0
ORDER BY pa.utilization_pct DESC;
```

**Q3: Compare scenario results for a specific plan**
```sql
SELECT scenario_type, trucks_used, avg_utilization, total_cost,
       carbon_emissions, sla_success_rate
FROM scenario_results
WHERE plan_id = 1
ORDER BY total_cost ASC;
```

**Q4: Find customers with the most HIGH-priority shipments**
```sql
SELECT c.customer_id, c.name, c.sla_tier,
       COUNT(*) AS high_priority_count
FROM customers c
JOIN shipments s ON c.customer_id = s.customer_id
WHERE s.priority = 'HIGH'
GROUP BY c.customer_id, c.name, c.sla_tier
ORDER BY high_priority_count DESC;
```

**Q5: List all unresolved alerts with severity HIGH or CRITICAL**
```sql
SELECT a.alert_id, a.alert_type, a.severity, a.message,
       a.created_at, s.origin, s.destination
FROM alerts a
LEFT JOIN shipments s ON a.shipment_id = s.shipment_id
WHERE a.resolved = 0 AND a.severity IN ('HIGH', 'CRITICAL')
ORDER BY a.created_at DESC;
```

**Q6: Calculate average cost savings across all successful optimization runs**
```sql
SELECT solver_used,
       COUNT(*) AS total_runs,
       ROUND(AVG(cost_saving_pct), 1) AS avg_cost_saving,
       ROUND(AVG(utilization_achieved), 1) AS avg_utilization,
       ROUND(AVG(pipeline_duration_ms), 0) AS avg_duration_ms
FROM optimization_outcomes
WHERE is_feasible = 1
GROUP BY solver_used;
```

**Q7: Find lanes with the highest cost per km**
```sql
SELECT origin, destination, distance_km, cost_per_trip,
       ROUND(cost_per_trip / distance_km, 2) AS cost_per_km
FROM lane_rates
WHERE distance_km > 0 AND effective_to IS NULL
ORDER BY cost_per_km DESC;
```

**Q8: Track shipment lifecycle — all events for a specific shipment**
```sql
SELECT event_type, timestamp, location, notes
FROM shipment_events
WHERE shipment_id = 'SH-0001'
ORDER BY timestamp ASC;
```

**Q9: Find drivers available with hazmat certification**
```sql
SELECT d.driver_id, d.name, d.license_type, d.max_hours,
       dep.name AS home_depot, dep.city
FROM drivers d
LEFT JOIN depots dep ON d.home_depot_id = dep.depot_id
WHERE d.hazmat_certified = 1 AND d.is_available = 1;
```

**Q10: Compare predicted vs actual utilization from feedback**
```sql
SELECT cp.id AS plan_id,
       cp.avg_utilization AS predicted_util,
       f.actual_utilization AS actual_util,
       ROUND(f.actual_utilization - cp.avg_utilization, 1) AS diff,
       f.rating
FROM consolidation_plans cp
JOIN feedback f ON cp.id = f.plan_id
WHERE f.actual_utilization IS NOT NULL
ORDER BY ABS(f.actual_utilization - cp.avg_utilization) DESC;
```

---

## VII. Project Demonstration

### Tools / Software / Libraries Used

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18, Vite 7, Tailwind CSS 3.4 | Dashboard UI |
| Frontend | Recharts, Leaflet, Globe.gl | Data visualization, route maps, 3D globe |
| Backend | FastAPI, Uvicorn, Pydantic | REST API, validation, serialization |
| Database | SQLAlchemy (ORM), SQLite (dev), PostgreSQL (prod) | Data persistence |
| AI Agents | LangGraph, LangChain, Google Gemini 2.0 Flash | Agentic pipeline, LLM narratives |
| ML | scikit-learn (RandomForest, 400 trees) | Shipment pair compatibility scoring |
| OR | Google OR-Tools CP-SAT, OR-Tools Routing | MIP solver, TSP route optimization |
| DevOps | Docker, Docker Compose, Render | Containerization, deployment |

### Screenshots and Description

*(Screenshots of the running application to be inserted here)*

1. **Home Page** — Landing page with 3D globe showing Indian logistics network, animated statistics (97.2% utilization, 32.5% cost savings)
2. **Shipments Page** — Interactive table of 20 seeded shipments with Leaflet map showing origin→destination routes color-coded by consolidation group
3. **Optimize Page** — 3-step progress indicator (ML scoring → MIP solver → AI insights), consolidation plan showing 8 trucks with utilization bars, before/after metrics chart
4. **Scenarios Page** — 4 scenario comparison cards (Strict SLA, Flexible SLA, Vehicle Shortage, Demand Surge) with cost/utilization/SLA/carbon metrics
5. **Insights Page** — 4 AI agent output cards showing validation results, plan insights, relaxation suggestions, and scenario recommendations

---

## VIII. Self-Learning Beyond Classroom

1. **LangGraph State Machines** — We learned to model complex workflows as directed acyclic graphs with typed state (`TypedDict`), conditional edges, and retry loops. This goes beyond traditional sequential programming into declarative pipeline orchestration.

2. **Operations Research (CP-SAT)** — Formulating the freight consolidation problem as a Mixed Integer Program with binary decision variables, capacity constraints, and a composite objective function was entirely self-taught using the OR-Tools documentation.

3. **SQL Migration Systems** — Instead of relying on `CREATE TABLE IF NOT EXISTS` at startup, we built a versioned migration runner with up/down scripts and a tracking table — the same pattern used by Alembic, Rails, and Django in production systems.

4. **Queueing Theory (M/M/1)** — Applied Markov chain queueing models to predict warehouse congestion from shipment arrival rates, using Little's Law to compute expected wait times.

5. **ORM ↔ SQL Dual Design** — Maintaining both SQLAlchemy ORM models and raw SQL migration scripts in sync required understanding how ORMs abstract over raw SQL and when each approach is appropriate.

6. **Pydantic v2 `from_attributes`** — Learned how Pydantic v2's `model_config = {"from_attributes": True}` bridges SQLAlchemy ORM objects to JSON serialization without manual dictionary conversion.

---

## IX. Learning from the Project

1. **Database design drives application architecture** — The choice to use string primary keys (for external system IDs), JSON-as-TEXT (for SQLite compatibility), and nullable foreign keys (for failure logging) shaped every layer of the application.

2. **Normalization trade-offs are real** — Strict 3NF would require splitting `plan_assignments.shipment_ids` into a join table and breaking `optimization_outcomes` into 5+ tables. We learned when denormalization is justified (audit logs, SQLite compatibility) and when it's not.

3. **Migrations prevent data loss** — After the `customer_id` column was added to the ORM model but the SQLite database didn't have it, every query crashed with `no such column: shipments.customer_id`. This taught us why production systems use migration scripts instead of `create_all()`.

4. **Foreign keys enforce data integrity** — Without FK constraints, it would be possible to create plan assignments referencing nonexistent vehicles or scenarios referencing nonexistent plans, leading to orphaned data.

5. **Indexing matters for performance** — Adding composite indexes on `lane_rates(origin, destination)` and `shipment_events(shipment_id)` reduced query times for the most frequent access patterns (lane lookups during optimization, event history per shipment).

---

## X. Challenges Faced

1. **SQLite vs PostgreSQL compatibility** — SQLite lacks native BOOLEAN, JSON, and ENUM types. We used INTEGER for booleans, TEXT for JSON, and VARCHAR for enums. The `check_same_thread=False` SQLite-specific flag was required for FastAPI's multi-threaded workers.

2. **Schema migration on existing databases** — SQLite does not support `ALTER TABLE ... DROP COLUMN`. When rolling back Migration 002, added columns cannot be removed on SQLite — they persist as unused. This is a known SQLite limitation that PostgreSQL does not have.

3. **ORM ↔ SQL synchronization** — Keeping SQLAlchemy model definitions and SQL migration scripts in sync required discipline. A column added to the ORM model but not to the migration script causes runtime errors.

4. **Simulation performance** — Each of the 4 scenario simulations re-runs the full MIP solver (30s time limit) and route optimizer (5s per truck). For 20 shipments with 8 trucks, the total simulation time was ~2 minutes, causing frontend timeout issues. We solved this by making simulations optional via a query parameter.

5. **JSON denormalization querying** — The `shipment_ids` column in `plan_assignments` stores a JSON array as TEXT. Querying "which plans contain shipment SH-0005?" requires `LIKE '%SH-0005%'` or application-level JSON parsing, which is slower than a proper join table.

---

## XI. Conclusion

**Key takeaways:**

1. **A well-designed database is the foundation of an intelligent system.** The 14-table schema we designed supports not just CRUD operations but also ML retraining (via `optimization_outcomes`), operational monitoring (via `alerts` and `shipment_events`), and business intelligence (via `feedback` comparing predicted vs actual metrics).

2. **SQL migration scripts provide production-grade schema management.** The versioned up/down migration system we built ensures reproducible deployments, safe rollbacks, and explicit schema evolution — critical for any database that outlives its first deploy.

3. **Normalization principles guide design, but pragmatism guides implementation.** We applied 1NF through BCNF analysis to every table, then made conscious denormalization decisions (JSON-as-TEXT, wide audit tables) where the trade-offs were justified.

4. **The database connects every layer of the stack.** Shipments flow from CSV upload → SQLAlchemy ORM → ML feature extraction → OR-Tools solver → plan persistence → dashboard visualization. Every layer reads from and writes to the same schema.

5. **Real-world results validate the design.** The database-backed optimization pipeline reduces truck usage by 60%, increases utilization to 97.2%, and saves 32.5% in transportation costs — demonstrating that the schema supports not just data storage but active decision-making.
