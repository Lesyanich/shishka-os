-- =============================================================================
-- Migration: 001_initial_schema.sql
-- Project:   Shishka Healthy Kitchen — Supabase Cloud Infrastructure
-- Date:      2026-03-07
-- Author:    Lead Backend Developer
-- Strategy:  SAFE — uses ALTER TABLE IF NOT EXISTS and CREATE TABLE IF NOT EXISTS.
--            Does NOT drop or truncate any existing data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1: EQUIPMENT
-- Existing table: has TEXT primary key (code), capacity_unit TEXT
-- This migration: adds unit_id (capex link), last_service_date, 
--                 renames capacity_unit → capacity_uom (alias via new column),
--                 ensures syrve_uuid exists for SYRVE sync (gemini.md P0 rule)
-- ---------------------------------------------------------------------------

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS unit_id          TEXT,           -- CapEx asset reference code
  ADD COLUMN IF NOT EXISTS syrve_uuid       UUID,           -- SYRVE system UUID (P0 rule)
  ADD COLUMN IF NOT EXISTS capacity_uom     TEXT            -- mirrored from capacity_unit
    GENERATED ALWAYS AS (capacity_unit) STORED,
  ADD COLUMN IF NOT EXISTS last_service_date DATE;          -- updated on maintenance completion

COMMENT ON COLUMN equipment.id IS 'Human-readable code (e.g. oven_1). Kept for UX compatibility.';
COMMENT ON COLUMN equipment.syrve_uuid IS 'UUID from SYRVE API. Required for nomenclature sync (gemini.md P0).';
COMMENT ON COLUMN equipment.unit_id IS 'Links to capex_assets for ROI tracking.';
COMMENT ON COLUMN equipment.last_service_date IS 'Updated automatically on maintenance_logs INSERT.';

-- ---------------------------------------------------------------------------
-- SECTION 2: MAINTENANCE LOGS
-- Brand new table. Tracks all servicing events per equipment unit.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    TEXT        NOT NULL REFERENCES equipment(id),
  service_type    TEXT        NOT NULL
                  CHECK (service_type IN (
                    'cleaning_daily',
                    'cleaning_deep',
                    'lubrication',
                    'inspection',
                    'filter_replacement',
                    'vendor_service',
                    'repair',
                    'calibration'
                  )),
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by    BIGINT,     -- Telegram user_id of the technician
  duration_min    INTEGER,
  result          TEXT        NOT NULL DEFAULT 'done'
                  CHECK (result IN ('done', 'skipped', 'issue_found', 'deferred')),
  notes           TEXT,
  next_due_date   DATE,       -- when the next service of this type is due
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE maintenance_logs IS 'Complete history of all maintenance events for each equipment unit.';

-- Auto-update equipment.last_service_date on INSERT into maintenance_logs
CREATE OR REPLACE FUNCTION sync_equipment_last_service()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE equipment
    SET last_service_date = NEW.completed_at::date
  WHERE id = NEW.equipment_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_last_service ON maintenance_logs;
CREATE TRIGGER trg_sync_last_service
  AFTER INSERT ON maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION sync_equipment_last_service();

-- ---------------------------------------------------------------------------
-- SECTION 3: NOMENCLATURE SYNC
-- Lightweight sync table: maps internal product_code to SYRVE system UUID.
-- This is the bridge between legacy products.code (TEXT) and SYRVE UUID (P0).
-- Full nomenclature tables (groups, categories, sizes, prices) are in 002_*.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS nomenclature_sync (
  product_code    TEXT        PRIMARY KEY,       -- local code used in recipes_flow & daily_plan
  syrve_system_id UUID        NOT NULL,          -- UUID from SYRVE /api/1/nomenclature (P0)
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL DEFAULT 'good'
                  CHECK (type IN ('good', 'dish', 'modifier', 'modifier_group', 'service')),
  measure_unit    TEXT,                          -- 'kg' | 'liter' | 'piece' | 'port'
  is_deleted      BOOLEAN     NOT NULL DEFAULT false,   -- soft delete — never hard delete (P0)
  synced_at       TIMESTAMPTZ,                   -- timestamp of last successful SYRVE sync
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_syrve_system_id UNIQUE (syrve_system_id)  -- 1:1 with SYRVE
);

COMMENT ON TABLE nomenclature_sync IS 'Single source of truth for SYRVE ↔ Supabase product mapping. syrve_system_id is the authoritative ID per gemini.md P0 rules.';
COMMENT ON COLUMN nomenclature_sync.product_code IS 'Local human-readable code. FK target for recipes_flow, daily_plan.';
COMMENT ON COLUMN nomenclature_sync.syrve_system_id IS 'UUID from SYRVE. Must match exactly. Required by gemini.md Data Integrity Rule 1.';

-- Link existing products to nomenclature_sync via syrve_id
INSERT INTO nomenclature_sync (product_code, syrve_system_id, name, type)
SELECT 
  code, 
  syrve_id,
  name,
  type
FROM products
WHERE syrve_id IS NOT NULL
ON CONFLICT (product_code) DO UPDATE
  SET syrve_system_id = EXCLUDED.syrve_system_id,
      name            = EXCLUDED.name,
      type            = EXCLUDED.type,
      synced_at       = now();

-- updated_at trigger for nomenclature_sync
DROP TRIGGER IF EXISTS trg_nomenclature_sync_updated_at ON nomenclature_sync;
CREATE TRIGGER trg_nomenclature_sync_updated_at
  BEFORE UPDATE ON nomenclature_sync
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- SECTION 4: RECIPES FLOW — extend existing table
-- Existing: product_code, step_order, operation_name, equipment_id, ...
-- Adding:   requires_capacity (explicit capacity consumption per batch)
-- ---------------------------------------------------------------------------

ALTER TABLE recipes_flow
  ADD COLUMN IF NOT EXISTS requires_capacity NUMERIC NOT NULL DEFAULT 1;
  -- capacity units consumed on equipment per batch (aligns with equipment.capacity_value)

COMMENT ON COLUMN recipes_flow.requires_capacity IS 'How many capacity units this step occupies on equipment. Checked against equipment.capacity_value at task creation.';
COMMENT ON COLUMN recipes_flow.is_bottleneck IS 'true = this step is the throughput-limiting step for the product flow.';

-- Backfill requires_capacity from existing capacity_per_batch where available
UPDATE recipes_flow
  SET requires_capacity = capacity_per_batch
WHERE requires_capacity = 1 AND capacity_per_batch IS NOT NULL AND capacity_per_batch <> 1;

-- ---------------------------------------------------------------------------
-- SECTION 5: PRODUCTION TASKS — extend existing table
-- Existing: UUID PK ✅, plan_id (int), status, capacity_used, actual_start/end
-- Adding:   task_category to differentiate production vs. maintenance tasks
-- ---------------------------------------------------------------------------

ALTER TABLE production_tasks
  ADD COLUMN IF NOT EXISTS task_category TEXT NOT NULL DEFAULT 'production'
    CHECK (task_category IN ('production', 'maintenance', 'cleaning')),
  ADD COLUMN IF NOT EXISTS maintenance_log_id UUID REFERENCES maintenance_logs(id);

COMMENT ON COLUMN production_tasks.task_category IS 'Distinguishes KDS task type: production (default), maintenance, or cleaning.';
COMMENT ON COLUMN production_tasks.maintenance_log_id IS 'FK to maintenance_logs when task_category = maintenance or cleaning.';

-- ---------------------------------------------------------------------------
-- SECTION 6: ROW LEVEL SECURITY — new tables
-- ---------------------------------------------------------------------------

ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nomenclature_sync ENABLE ROW LEVEL SECURITY;

-- maintenance_logs: all authenticated users can read; only admins can INSERT
CREATE POLICY "Authenticated users can view maintenance_logs"
  ON maintenance_logs FOR SELECT TO public
  USING (current_setting('app.tg_user_id', true) IS NOT NULL);

CREATE POLICY "Admin can manage maintenance_logs"
  ON maintenance_logs FOR ALL TO public
  USING (current_setting('app.is_admin', true) = 'true');

-- nomenclature_sync: read-only for all authenticated users; write via sync function only
CREATE POLICY "Authenticated users can view nomenclature_sync"
  ON nomenclature_sync FOR SELECT TO public
  USING (current_setting('app.tg_user_id', true) IS NOT NULL);

CREATE POLICY "Admin can manage nomenclature_sync"
  ON nomenclature_sync FOR ALL TO public
  USING (current_setting('app.is_admin', true) = 'true');

-- ---------------------------------------------------------------------------
-- SECTION 7: INDEXES — performance for common queries
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_equipment
  ON maintenance_logs (equipment_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_type
  ON maintenance_logs (service_type, result);

CREATE INDEX IF NOT EXISTS idx_nomenclature_sync_syrve
  ON nomenclature_sync (syrve_system_id);

CREATE INDEX IF NOT EXISTS idx_production_tasks_category
  ON production_tasks (task_category, status);

CREATE INDEX IF NOT EXISTS idx_recipes_flow_equipment
  ON recipes_flow (equipment_id, is_bottleneck);

-- ---------------------------------------------------------------------------
-- MIGRATION COMPLETE
-- Next: 002_nomenclature_full.sql — full SYRVE nomenclature layer
--       003_capex.sql             — CapEx assets and ROI tables
-- ---------------------------------------------------------------------------
