-- Migration 161: Add launch_phase to nomenclature
-- Tracks which rollout phase a menu item belongs to (1=MVP, 2=expansion, etc.)
-- Orthogonal to is_available — a Phase 2 item stays is_available=false until that phase launches.

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS launch_phase SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.nomenclature.launch_phase
  IS 'Menu rollout phase: 1=MVP opening, 2=expansion, etc. Orthogonal to is_available.';

CREATE INDEX IF NOT EXISTS idx_nomenclature_launch_phase
  ON public.nomenclature (launch_phase);

-- ─── Migration log ────────────────────────────────────────────────
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '161_nomenclature_launch_phase.sql',
  'claude-code',
  'Add launch_phase SMALLINT to nomenclature for phased menu rollout (1=MVP, 2=expansion).'
) ON CONFLICT DO NOTHING;
