-- ============================================================================
-- Migration 002: New Tables (UP)
-- Adds: drivers, depots, customers, lane_rates, shipment_events,
--        ml_model_versions, alerts, feedback
-- Also adds foreign key columns to existing tables (shipments, vehicles,
--        plan_assignments) to link them to the new entities.
-- Compatible with both SQLite and PostgreSQL.
-- ============================================================================


-- --------------------------------------------------------------------------
-- TABLE: customers
-- Who owns the shipment. Enables per-customer SLA tracking and reporting.
-- Created first because shipments will reference it.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    customer_id       VARCHAR   PRIMARY KEY,          -- External ID (e.g. "CUST-001")
    name              VARCHAR   NOT NULL,             -- Company / contact name
    email             VARCHAR   DEFAULT NULL,         -- Contact email
    phone             VARCHAR   DEFAULT NULL,         -- Contact phone
    sla_tier          VARCHAR   DEFAULT 'STANDARD',   -- STANDARD | PREMIUM | EXPRESS
    contract_rate_discount REAL DEFAULT 0.0,          -- % discount on lane rates (0-100)
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- --------------------------------------------------------------------------
-- TABLE: depots
-- Warehouse / hub locations. Gives the optimizer real coordinates and
-- capacity data instead of relying on city-name lookups.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS depots (
    depot_id          VARCHAR   PRIMARY KEY,          -- External ID (e.g. "DEP-BOM-01")
    name              VARCHAR   NOT NULL,             -- Depot display name
    city              VARCHAR   NOT NULL,             -- City for grouping
    lat               REAL      DEFAULT NULL,         -- Latitude (WGS84)
    lng               REAL      DEFAULT NULL,         -- Longitude (WGS84)
    operating_hours_start VARCHAR DEFAULT '06:00',    -- HH:MM — dock opening time
    operating_hours_end   VARCHAR DEFAULT '22:00',    -- HH:MM — dock closing time
    dock_count        INTEGER   DEFAULT 1,            -- Number of loading docks
    queue_capacity    INTEGER   DEFAULT 10,           -- Max vehicles that can queue
    is_active         INTEGER   DEFAULT 1             -- 1=active, 0=decommissioned
);


-- --------------------------------------------------------------------------
-- TABLE: drivers
-- Truck operators. Vehicles exist but had no driver — this blocks real
-- dispatch. The solver can now add driver-hours and certification constraints.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
    driver_id         VARCHAR   PRIMARY KEY,          -- External ID (e.g. "DRV-001")
    name              VARCHAR   NOT NULL,             -- Driver full name
    phone             VARCHAR   DEFAULT NULL,         -- Contact number
    license_type      VARCHAR   DEFAULT 'STANDARD',   -- STANDARD | HMV (Heavy Motor Vehicle)
    hazmat_certified  INTEGER   DEFAULT 0,            -- 1=yes, 0=no — guardrail uses this
    max_hours         REAL      DEFAULT 11.0,         -- Max driving hours per shift (Indian MV Act: 8-11h)
    home_depot_id     VARCHAR   DEFAULT NULL,         -- FK → depots.depot_id — default start location
    is_available      INTEGER   DEFAULT 1,            -- 1=available, 0=on leave/rest

    FOREIGN KEY (home_depot_id) REFERENCES depots(depot_id)
);


-- --------------------------------------------------------------------------
-- TABLE: lane_rates
-- Per-lane pricing. Currently cost is only per-vehicle (flat operating_cost).
-- This lets the solver use origin-destination-specific costs in its objective.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lane_rates (
    lane_id           INTEGER   PRIMARY KEY AUTOINCREMENT,
    origin            VARCHAR   NOT NULL,             -- Origin city/depot
    destination       VARCHAR   NOT NULL,             -- Destination city/depot
    cost_per_kg       REAL      DEFAULT NULL,         -- Rate per kg for this lane
    cost_per_trip     REAL      DEFAULT NULL,         -- Flat rate per truck-trip
    transit_time_hrs  REAL      DEFAULT NULL,         -- Expected transit hours
    distance_km       REAL      DEFAULT NULL,         -- Lane distance (replaces synthetic get_distance)
    effective_from    TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Rate validity start
    effective_to      TIMESTAMP DEFAULT NULL          -- NULL = still active
);

CREATE INDEX IF NOT EXISTS idx_lane_rates_origin_dest ON lane_rates(origin, destination);


-- --------------------------------------------------------------------------
-- TABLE: shipment_events
-- Audit trail for shipment lifecycle. The status field on shipments is a
-- single state; this table records every transition with timestamp + location.
-- Enables real SLA breach detection (not just predictions).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipment_events (
    event_id          INTEGER   PRIMARY KEY AUTOINCREMENT,
    shipment_id       VARCHAR   NOT NULL,             -- FK → shipments.shipment_id
    event_type        VARCHAR   NOT NULL,             -- CREATED | PICKED_UP | IN_TRANSIT | DELAYED | DELIVERED | SLA_BREACH
    timestamp         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    location          VARCHAR   DEFAULT NULL,         -- City or depot where event occurred
    notes             TEXT      DEFAULT NULL,          -- Free-text context (e.g. "delayed due to rain")

    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id)
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_events_type ON shipment_events(event_type);


-- --------------------------------------------------------------------------
-- TABLE: ml_model_versions
-- Tracks every model training run. Currently the model retrains automatically
-- but there's no record of which version produced which predictions.
-- Enables quality drift monitoring and rollback.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_model_versions (
    version_id        INTEGER   PRIMARY KEY AUTOINCREMENT,
    trained_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    model_type        VARCHAR   DEFAULT 'RandomForest', -- Algorithm name
    training_samples  INTEGER   DEFAULT NULL,            -- Number of pairs used
    accuracy          REAL      DEFAULT NULL,            -- Overall accuracy (0-1)
    f1_score          REAL      DEFAULT NULL,            -- F1 score (0-1)
    precision_score   REAL      DEFAULT NULL,            -- Precision (0-1)
    recall_score      REAL      DEFAULT NULL,            -- Recall (0-1)
    feature_importances TEXT    DEFAULT NULL,             -- JSON dict: {feature_name: importance}
    hyperparameters   TEXT      DEFAULT NULL,             -- JSON dict: {n_estimators, max_depth, ...}
    model_path        VARCHAR   DEFAULT NULL,            -- Path to saved .joblib file
    is_active         INTEGER   DEFAULT 0,               -- 1=currently used for scoring, 0=archived
    notes             TEXT      DEFAULT NULL              -- Free-text: why retrained, what changed
);


-- --------------------------------------------------------------------------
-- TABLE: alerts
-- System alerts for SLA breaches, capacity issues, delays, and anomalies.
-- Populated by pipeline agents and event triggers.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    alert_id          INTEGER   PRIMARY KEY AUTOINCREMENT,
    alert_type        VARCHAR   NOT NULL,             -- SLA_BREACH | CAPACITY_WARNING | DELAY | INFEASIBILITY | ANOMALY
    severity          VARCHAR   DEFAULT 'MEDIUM',     -- LOW | MEDIUM | HIGH | CRITICAL
    shipment_id       VARCHAR   DEFAULT NULL,         -- FK → shipments.shipment_id (nullable: not all alerts are shipment-specific)
    plan_id           INTEGER   DEFAULT NULL,         -- FK → consolidation_plans.id (nullable)
    vehicle_id        VARCHAR   DEFAULT NULL,         -- FK → vehicles.vehicle_id (nullable)
    message           TEXT      NOT NULL,             -- Human-readable alert description
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged      INTEGER   DEFAULT 0,            -- 1=seen/handled, 0=pending
    acknowledged_at   TIMESTAMP DEFAULT NULL,         -- When the alert was acknowledged
    resolved          INTEGER   DEFAULT 0,            -- 1=resolved, 0=open
    resolved_at       TIMESTAMP DEFAULT NULL,         -- When the alert was resolved

    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id),
    FOREIGN KEY (plan_id)     REFERENCES consolidation_plans(id),
    FOREIGN KEY (vehicle_id)  REFERENCES vehicles(vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON alerts(resolved);


-- --------------------------------------------------------------------------
-- TABLE: feedback
-- Post-execution feedback on consolidation plans. Closes the learning loop
-- by comparing predicted metrics against actual outcomes.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id       INTEGER   PRIMARY KEY AUTOINCREMENT,
    plan_id           INTEGER   NOT NULL,             -- FK → consolidation_plans.id
    submitted_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rating            INTEGER   DEFAULT NULL,         -- 1-5 star rating of plan quality
    actual_utilization REAL     DEFAULT NULL,         -- What utilization actually was (0-100)
    actual_cost       REAL      DEFAULT NULL,         -- Actual total cost after execution
    actual_carbon     REAL      DEFAULT NULL,         -- Actual carbon emissions
    sla_met_pct       REAL      DEFAULT NULL,         -- % shipments that actually met SLA (0-100)
    notes             TEXT      DEFAULT NULL,          -- Free-text feedback

    FOREIGN KEY (plan_id) REFERENCES consolidation_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_plan ON feedback(plan_id);


-- --------------------------------------------------------------------------
-- ALTER existing tables to link to new entities
-- --------------------------------------------------------------------------

-- Link shipments to customers
ALTER TABLE shipments ADD COLUMN customer_id VARCHAR DEFAULT NULL REFERENCES customers(customer_id);

-- Link vehicles to their assigned driver (nullable — not always assigned)
ALTER TABLE vehicles ADD COLUMN driver_id VARCHAR DEFAULT NULL REFERENCES drivers(driver_id);

-- Link plan_assignments to the driver who executed the trip
ALTER TABLE plan_assignments ADD COLUMN driver_id VARCHAR DEFAULT NULL REFERENCES drivers(driver_id);
