-- ============================================================================
-- Migration 002: New Tables (DOWN)
-- Rolls back all 8 new tables and the ALTER TABLE additions.
-- ============================================================================

-- --------------------------------------------------------------------------
-- SQLite does not support DROP COLUMN. To roll back the ALTER TABLEs on
-- SQLite, you would need to recreate the tables. For PostgreSQL:
--
--   ALTER TABLE shipments DROP COLUMN IF EXISTS customer_id;
--   ALTER TABLE vehicles DROP COLUMN IF EXISTS driver_id;
--   ALTER TABLE plan_assignments DROP COLUMN IF EXISTS driver_id;
--
-- On SQLite the added columns will remain but be unused after the
-- referencing tables are dropped. This is a known SQLite limitation.
-- --------------------------------------------------------------------------

-- Drop new tables in reverse dependency order
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS ml_model_versions;
DROP TABLE IF EXISTS shipment_events;
DROP TABLE IF EXISTS lane_rates;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS depots;
DROP TABLE IF EXISTS customers;
