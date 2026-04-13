-- Migration 113: Extend existing tables for scheduling engine
-- Adds fields to equipment, nomenclature, recipes_flow, staff, production_tasks

BEGIN;

-- ─── 1. equipment extensions ───
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS preheat_min INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_category_group TEXT,
  ADD COLUMN IF NOT EXISTS cleaning_time_min INT DEFAULT 10;

-- NOTE: capacity_unit already exists in the original schema (see 070_equipment_enrichment.sql)

COMMENT ON COLUMN public.equipment.preheat_min IS 'Minutes needed to preheat (0 for non-thermal)';
COMMENT ON COLUMN public.equipment.product_category_group IS 'For contamination buffer: fish, meat, bakery, vegan';
COMMENT ON COLUMN public.equipment.cleaning_time_min IS 'Deep clean time in minutes when product category changes';

-- ─── 2. nomenclature extensions ───
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS norm_waste_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS storage_type TEXT DEFAULT 'chilled'
    CHECK (storage_type IN ('ambient','chilled','frozen')),
  ADD COLUMN IF NOT EXISTS defrost_hours INT,
  ADD COLUMN IF NOT EXISTS product_category TEXT
    CHECK (product_category IN ('fish','meat','poultry','dairy','bakery','vegan','neutral'));

COMMENT ON COLUMN public.nomenclature.norm_waste_pct IS 'Expected waste percentage for this product';
COMMENT ON COLUMN public.nomenclature.storage_type IS 'Storage requirement: ambient, chilled, or frozen';
COMMENT ON COLUMN public.nomenclature.defrost_hours IS 'Hours needed for defrosting if frozen';
COMMENT ON COLUMN public.nomenclature.product_category IS 'Allergen/contamination category';

-- ─── 3. recipes_flow extensions ───
ALTER TABLE public.recipes_flow
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS haccp_checkpoint BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS haccp_type TEXT
    CHECK (haccp_type IN ('temperature','sanitation','visual','weight')),
  ADD COLUMN IF NOT EXISTS haccp_target_value NUMERIC,
  ADD COLUMN IF NOT EXISTS haccp_tolerance NUMERIC,
  ADD COLUMN IF NOT EXISTS scaling_rule TEXT DEFAULT 'linear'
    CHECK (scaling_rule IN ('linear','none','custom')),
  ADD COLUMN IF NOT EXISTS target_equipment_category_id UUID,
  -- NOTE: target_equipment_category_id is UUID per spec; equipment.category is currently TEXT.
  -- A lookup table may be introduced later. For now this is a soft reference.
  ADD COLUMN IF NOT EXISTS transition_time_max INTERVAL;

COMMENT ON COLUMN public.recipes_flow.media_url IS 'Photo or video URL for step reference';
COMMENT ON COLUMN public.recipes_flow.haccp_checkpoint IS 'If true, this step blocks until checkpoint is passed';
COMMENT ON COLUMN public.recipes_flow.target_equipment_category_id IS 'Which equipment category is needed (routing via recipe, not equipment)';
COMMENT ON COLUMN public.recipes_flow.transition_time_max IS 'Max allowed delay before next step starts (food safety)';

-- ─── 4. staff extensions ───
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS assigned_zone_id UUID REFERENCES public.locations(id);

COMMENT ON COLUMN public.staff.assigned_zone_id IS 'Current shift zone assignment (FK to locations)';

-- ─── 5. production_tasks extensions ───
ALTER TABLE public.production_tasks
  ADD COLUMN IF NOT EXISTS gross_weight NUMERIC,
  ADD COLUMN IF NOT EXISTS schedule_run_id UUID REFERENCES public.schedule_runs(id),
  ADD COLUMN IF NOT EXISTS batch_group_key TEXT,
  ADD COLUMN IF NOT EXISTS is_preheat BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_defrost BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_target_id UUID REFERENCES public.production_targets(id);

COMMENT ON COLUMN public.production_tasks.gross_weight IS 'Raw input weight captured at step 1';
COMMENT ON COLUMN public.production_tasks.schedule_run_id IS 'Which schedule generation created this task';
COMMENT ON COLUMN public.production_tasks.batch_group_key IS 'Key for merged batches (e.g. PF-QUINOA-2026-04-15)';
COMMENT ON COLUMN public.production_tasks.is_preheat IS 'Auto-generated preheat micro-task';
COMMENT ON COLUMN public.production_tasks.is_defrost IS 'Auto-generated D-1 defrost task';
COMMENT ON COLUMN public.production_tasks.parent_target_id IS 'Which production target originated this task';

CREATE INDEX IF NOT EXISTS idx_pt_schedule_run ON public.production_tasks(schedule_run_id)
  WHERE schedule_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pt_parent_target ON public.production_tasks(parent_target_id)
  WHERE parent_target_id IS NOT NULL;

-- ─── 6. Self-register in migration_log ───
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '113_scheduling_schema_extensions.sql',
  'Extend equipment, nomenclature, recipes_flow, staff, production_tasks with scheduling fields',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
