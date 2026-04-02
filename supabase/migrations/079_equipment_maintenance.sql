-- Migration 079: Equipment maintenance log table
-- =====================================================================
-- Context: Chef requested tracking of equipment maintenance, cleaning
-- schedules, and service history. Currently only `last_service_date`
-- exists on the equipment table — this creates a proper maintenance log.
--
-- Priority: P3 (planning, not blocking production)

-- ─── 1. Create table ────────────────────────────────────────────

CREATE TABLE public.equipment_maintenance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id  UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,

  -- Maintenance type
  type          TEXT NOT NULL CHECK (type IN (
    'cleaning',        -- daily/weekly cleaning
    'calibration',     -- probe/scale calibration
    'preventive',      -- scheduled preventive maintenance
    'repair',          -- unplanned repair
    'inspection',      -- safety/HACCP inspection
    'replacement'      -- part replacement
  )),

  -- Scheduling
  scheduled_at  TIMESTAMPTZ,            -- when it was planned for
  completed_at  TIMESTAMPTZ,            -- when actually done
  next_due_at   TIMESTAMPTZ,            -- next occurrence (for recurring)

  -- Details
  description   TEXT NOT NULL,           -- what was done / needs to be done
  performed_by  UUID REFERENCES staff(id),
  cost_thb      NUMERIC DEFAULT 0,       -- maintenance cost
  parts_used    TEXT,                     -- parts/materials used

  -- Status
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'in_progress', 'completed', 'overdue', 'cancelled'
  )),

  -- Outcome
  result_notes  TEXT,                    -- outcome notes
  downtime_min  INT DEFAULT 0,           -- equipment downtime in minutes

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Indexes ─────────────────────────────────────────────────

CREATE INDEX idx_eq_maintenance_equipment ON equipment_maintenance(equipment_id);
CREATE INDEX idx_eq_maintenance_status ON equipment_maintenance(status)
  WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX idx_eq_maintenance_next_due ON equipment_maintenance(next_due_at)
  WHERE next_due_at IS NOT NULL AND status = 'scheduled';

-- ─── 3. Auto-update updated_at ──────────────────────────────────

CREATE TRIGGER trg_eq_maintenance_updated_at
  BEFORE UPDATE ON equipment_maintenance
  FOR EACH ROW
  EXECUTE FUNCTION fn_recipes_flow_updated_at();
  -- Reuses the generic updated_at trigger function from migration 074

-- ─── 4. Auto-update equipment.last_service_date ─────────────────
-- When a maintenance record is completed, update the parent equipment.

CREATE OR REPLACE FUNCTION fn_maintenance_update_equipment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
    UPDATE equipment
    SET last_service_date = NEW.completed_at::date
    WHERE id = NEW.equipment_id
      AND (last_service_date IS NULL OR last_service_date < NEW.completed_at::date);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maintenance_update_equipment
  AFTER INSERT OR UPDATE ON equipment_maintenance
  FOR EACH ROW
  EXECUTE FUNCTION fn_maintenance_update_equipment();

-- ─── 5. RLS ─────────────────────────────────────────────────────

ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY eq_maintenance_anon_read ON equipment_maintenance
  FOR SELECT TO anon USING (true);

CREATE POLICY eq_maintenance_auth_full ON equipment_maintenance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 6. Comments ────────────────────────────────────────────────

COMMENT ON TABLE equipment_maintenance IS 'Equipment maintenance, cleaning, and service log. Linked to equipment table.';
COMMENT ON COLUMN equipment_maintenance.type IS 'Maintenance category: cleaning, calibration, preventive, repair, inspection, replacement';
COMMENT ON COLUMN equipment_maintenance.next_due_at IS 'For recurring maintenance — when the next occurrence is due';
COMMENT ON COLUMN equipment_maintenance.downtime_min IS 'Equipment downtime caused by this maintenance (minutes)';
