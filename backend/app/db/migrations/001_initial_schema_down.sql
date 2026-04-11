-- ============================================================================
-- Migration 001: Initial Schema (DOWN)
-- Drops all tables in reverse dependency order.
-- ============================================================================

-- Drop tables with foreign keys first, then the tables they reference.

DROP TABLE IF EXISTS optimization_outcomes;
DROP TABLE IF EXISTS scenario_results;
DROP TABLE IF EXISTS plan_assignments;
DROP TABLE IF EXISTS consolidation_plans;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS shipments;

-- PostgreSQL only: drop enum types
-- DROP TYPE IF EXISTS scenario_type_enum;
-- DROP TYPE IF EXISTS plan_status_enum;
-- DROP TYPE IF EXISTS status_enum;
-- DROP TYPE IF EXISTS priority_enum;
