-- Migration 208: Add structured Merrychef columns to recipes_flow
-- temperature_c already exists (migration 074) — only add fan_pct and microwave_pct

ALTER TABLE public.recipes_flow
  ADD COLUMN IF NOT EXISTS fan_pct smallint
    CONSTRAINT chk_fan_pct CHECK (fan_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS microwave_pct smallint
    CONSTRAINT chk_microwave_pct CHECK (microwave_pct BETWEEN 0 AND 100);

COMMENT ON COLUMN public.recipes_flow.fan_pct IS
  'Merrychef fan power percentage (0-100)';
COMMENT ON COLUMN public.recipes_flow.microwave_pct IS
  'Merrychef microwave power percentage (0-100)';

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '208_recipes_flow_merrychef_columns.sql',
    'claude-code',
    'Add fan_pct, microwave_pct to recipes_flow for Merrychef KDS display. MC task be2263b4.'
) ON CONFLICT (filename) DO NOTHING;
