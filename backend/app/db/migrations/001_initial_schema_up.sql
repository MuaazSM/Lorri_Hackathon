-- ============================================================================
-- Migration 001: Initial Schema (UP)
-- Creates all tables for the Lorri AI freight consolidation platform.
-- Compatible with both SQLite and PostgreSQL.
-- ============================================================================

-- --------------------------------------------------------------------------
-- ENUM TYPE CREATION (PostgreSQL only)
-- SQLite stores enums as VARCHAR; PostgreSQL needs explicit CREATE TYPE.
-- Wrap in DO blocks so they're skipped on SQLite.
-- --------------------------------------------------------------------------

-- For PostgreSQL: create enum types first.
-- If running on SQLite, skip this section (SQLite ignores CREATE TYPE).

-- Priority levels for shipments
CREATE TABLE IF NOT EXISTS _pg_check (id INTEGER);
DROP TABLE IF EXISTS _pg_check;

-- NOTE: If running PostgreSQL, execute these before the CREATE TABLEs:
--   CREATE TYPE priority_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH');
--   CREATE TYPE status_enum AS ENUM ('PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED');
--   CREATE TYPE plan_status_enum AS ENUM ('DRAFT', 'OPTIMIZED', 'EXECUTED');
--   CREATE TYPE scenario_type_enum AS ENUM ('STRICT_SLA', 'FLEXIBLE_SLA', 'VEHICLE_SHORTAGE', 'DEMAND_SURGE');

-- --------------------------------------------------------------------------
-- TABLE: shipments
-- Core input entity. Each row is a freight shipment to be consolidated.
-- The optimizer reads these and groups them into vehicle loads.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
    shipment_id   VARCHAR     PRIMARY KEY,   -- User-provided ID (e.g. "S001")
    origin        VARCHAR     NOT NULL,      -- Origin city/location
    destination   VARCHAR     NOT NULL,      -- Destination city/location
    pickup_time   TIMESTAMP   NOT NULL,      -- Earliest pickup window
    delivery_time TIMESTAMP   NOT NULL,      -- Latest delivery window
    weight        REAL        NOT NULL,      -- Weight in kg
    volume        REAL        NOT NULL,      -- Volume in cubic meters
    priority      VARCHAR     DEFAULT 'MEDIUM',  -- LOW | MEDIUM | HIGH
    special_handling VARCHAR  DEFAULT NULL,   -- Free-text: "refrigerated", "fragile", etc.
    status        VARCHAR     DEFAULT 'PENDING'  -- PENDING | ASSIGNED | IN_TRANSIT | DELIVERED
);

CREATE INDEX IF NOT EXISTS idx_shipments_shipment_id ON shipments(shipment_id);

-- --------------------------------------------------------------------------
-- TABLE: vehicles
-- Fleet inventory. Each row is one truck available for assignment.
-- The solver assigns shipments to vehicles respecting weight/volume caps.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id      VARCHAR   PRIMARY KEY,   -- User-provided ID (e.g. "V001")
    vehicle_type    VARCHAR   NOT NULL,      -- "small", "medium", "large", "refrigerated"
    capacity_weight REAL      NOT NULL,      -- Max weight in kg
    capacity_volume REAL      NOT NULL,      -- Max volume in cubic meters
    operating_cost  REAL      NOT NULL       -- Cost per trip (currency units)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_id ON vehicles(vehicle_id);

-- --------------------------------------------------------------------------
-- TABLE: consolidation_plans
-- Top-level result of each /optimize call. One row per optimization run.
-- Stores summary metrics displayed on the dashboard.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consolidation_plans (
    id               INTEGER   PRIMARY KEY AUTOINCREMENT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- When the plan was created
    status           VARCHAR   DEFAULT 'DRAFT',            -- DRAFT | OPTIMIZED | EXECUTED
    total_trucks     INTEGER   DEFAULT NULL,               -- Trucks used by optimizer
    trips_baseline   INTEGER   DEFAULT NULL,               -- Trips without consolidation
    avg_utilization  REAL      DEFAULT NULL,               -- Average utilization 0-100
    cost_saving_pct  REAL      DEFAULT NULL,               -- % cost saved vs baseline
    carbon_saving_pct REAL     DEFAULT NULL                -- % carbon saved vs baseline
);

-- --------------------------------------------------------------------------
-- TABLE: plan_assignments
-- Maps one vehicle to its assigned shipments within a plan.
-- One row per vehicle used. A plan with 5 trucks → 5 rows here.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_assignments (
    id              INTEGER   PRIMARY KEY AUTOINCREMENT,
    plan_id         INTEGER   NOT NULL,                    -- FK → consolidation_plans.id
    vehicle_id      VARCHAR   NOT NULL,                    -- FK → vehicles.vehicle_id
    shipment_ids    TEXT      NOT NULL,                    -- JSON array: '["S001","S003"]'
    utilization_pct REAL      DEFAULT NULL,                -- Vehicle fill % (0-100)
    route_detour_km REAL      DEFAULT NULL,                -- Extra km from multi-stop

    FOREIGN KEY (plan_id)    REFERENCES consolidation_plans(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
);

-- --------------------------------------------------------------------------
-- TABLE: scenario_results
-- Stores output of each simulation scenario per plan.
-- Each plan gets exactly 4 rows (one per scenario type).
-- Used by Agent 4 (Scenario Recommender) for trade-off comparison.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenario_results (
    id               INTEGER   PRIMARY KEY AUTOINCREMENT,
    plan_id          INTEGER   NOT NULL,                   -- FK → consolidation_plans.id
    scenario_type    VARCHAR   NOT NULL,                   -- STRICT_SLA | FLEXIBLE_SLA | VEHICLE_SHORTAGE | DEMAND_SURGE
    trucks_used      INTEGER   DEFAULT NULL,               -- Trucks needed under scenario
    avg_utilization  REAL      DEFAULT NULL,               -- Utilization under scenario (0-100)
    total_cost       REAL      DEFAULT NULL,               -- Total cost under scenario
    carbon_emissions REAL      DEFAULT NULL,               -- kg CO2 equivalent
    sla_success_rate REAL      DEFAULT NULL,               -- % shipments meeting SLA (0-100)

    FOREIGN KEY (plan_id) REFERENCES consolidation_plans(id)
);

-- --------------------------------------------------------------------------
-- TABLE: optimization_outcomes
-- Full audit log of every optimization run. One row per pipeline execution.
-- Used for historical tracking, debugging, and ML model retraining.
-- Complex nested data stored as JSON strings in TEXT columns.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS optimization_outcomes (
    id                    INTEGER   PRIMARY KEY AUTOINCREMENT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    plan_id               INTEGER   DEFAULT NULL,          -- FK → consolidation_plans.id (nullable: run may fail)
    solver_used           VARCHAR   DEFAULT NULL,          -- "MIP", "HEURISTIC", or "NONE"
    solver_status         VARCHAR   DEFAULT NULL,          -- "OPTIMAL", "FEASIBLE", "INFEASIBLE", "TIMEOUT"
    is_feasible           INTEGER   DEFAULT 1,             -- 1=true, 0=false (SQLite-friendly boolean)
    retry_count           INTEGER   DEFAULT 0,             -- Retries after infeasibility
    total_shipments       INTEGER   DEFAULT NULL,          -- Input shipment count
    total_vehicles        INTEGER   DEFAULT NULL,          -- Available vehicle count
    trucks_used           INTEGER   DEFAULT NULL,          -- Trucks in final plan
    utilization_achieved  REAL      DEFAULT NULL,          -- Avg utilization 0-100
    cost_saving_pct       REAL      DEFAULT NULL,          -- % cost saved
    carbon_saving_pct     REAL      DEFAULT NULL,          -- % carbon saved
    trip_reduction_pct    REAL      DEFAULT NULL,          -- % trips reduced
    pipeline_duration_ms  REAL      DEFAULT NULL,          -- Pipeline time in ms
    constraint_violations TEXT      DEFAULT NULL,          -- JSON array of violation dicts
    scenario_results      TEXT      DEFAULT NULL,          -- JSON array of scenario dicts
    metrics_json          TEXT      DEFAULT NULL,          -- JSON dict: before/after metrics
    assignments_json      TEXT      DEFAULT NULL,          -- JSON array of assignment dicts
    compatibility_stats   TEXT      DEFAULT NULL,          -- JSON dict: pair counts, compat rate
    pipeline_steps        TEXT      DEFAULT NULL           -- JSON array: [{step, status, duration_ms}]
);
