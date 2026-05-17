-- Migration 182: recipes_flow HACCP critical control points
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.4
-- Adds is_ccp flag + ccp_check_text per step. Seeds existing chicken-grill probe + blast-chill as CCPs.

BEGIN;

ALTER TABLE public.recipes_flow
  ADD COLUMN IF NOT EXISTS is_ccp          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ccp_check_text  TEXT;

-- ccp_check_text required when is_ccp=true
ALTER TABLE public.recipes_flow
  DROP CONSTRAINT IF EXISTS chk_ccp_text_when_ccp;
ALTER TABLE public.recipes_flow
  ADD CONSTRAINT chk_ccp_text_when_ccp CHECK (
    NOT is_ccp OR ccp_check_text IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_recipes_flow_ccp
  ON public.recipes_flow(nomenclature_id) WHERE is_ccp = true;

-- Seed: defensive backfill per RULE-MIGRATION-COLUMN-EXISTENCE.
-- Idempotent — re-runs only affect rows where ccp_check_text is still NULL.

-- Poultry grilling: match by either internal_temp_c = 74 (canonical) OR poultry product
-- (covers live data where internal_temp_c may be NULL despite the instruction text mentioning 74C).
UPDATE public.recipes_flow rf
SET is_ccp = true,
    ccp_check_text = 'Probe must read >= 74 C in thickest part before transferring to chill.'
FROM public.nomenclature n
WHERE n.id = rf.nomenclature_id
  AND rf.operation_name = 'Grilling'
  AND rf.ccp_check_text IS NULL
  AND (
    rf.internal_temp_c = 74
    OR n.product_category = 'poultry'
    OR n.product_code ~* 'CHICKEN|POULTRY|TURKEY|DUCK'
  );

-- All blast chilling steps are CCPs (HACCP requirement for cook-chill).
UPDATE public.recipes_flow
SET is_ccp = true,
    ccp_check_text = 'Core temperature must reach <= 4 C within 90 minutes.'
WHERE operation_name = 'Blast Chilling'
  AND ccp_check_text IS NULL;

COMMENT ON COLUMN public.recipes_flow.is_ccp IS 'HACCP Critical Control Point flag — step requires explicit cook verification before proceeding.';
COMMENT ON COLUMN public.recipes_flow.ccp_check_text IS 'What the cook must verify and log (e.g. probe reading, core temp).';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '182_recipes_flow_haccp_ccp.sql',
  'claude-code',
  'HACCP CCP flag + check_text on recipes_flow steps. Seeds chicken-grill probe + blast-chill steps as CCPs.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
