-- ═══════════════════════════════════════════════════════════════
-- Migration 048: Production Task Target + Multi-Output Support
-- Phase 7.1: DB Architecture Audit — Issue #1 (KDS & Production)
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM: production_tasks has no FK to what product is being produced.
--          Description is a free-text field. KDS can't filter/group by
--          target product. Variance analysis (Actual vs Theoretical)
--          requires parsing JSONB.
--
-- SOLUTION: Add target_nomenclature_id + target_quantity to production_tasks.
--           Create production_task_outputs for multi-output (by-products).
--
-- EXAMPLE: Cook task "Sous-Vide Chicken" produces:
--   - Primary: 7 kg PF-CHICKEN-SV (is_primary = true)
--   - By-product: 3 kg PF-CHICKEN-BROTH (is_primary = false)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. ALTER production_tasks: add target product columns ───

ALTER TABLE public.production_tasks
  ADD COLUMN IF NOT EXISTS target_nomenclature_id UUID
    REFERENCES public.nomenclature(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_quantity NUMERIC;

COMMENT ON COLUMN public.production_tasks.target_nomenclature_id
  IS 'FK to the primary product this task produces. Replaces free-text description for analytics and KDS filtering.';
COMMENT ON COLUMN public.production_tasks.target_quantity
  IS 'Planned output quantity in base_unit of the target nomenclature.';

-- Index for joins (e.g., "show all tasks producing item X")
CREATE INDEX IF NOT EXISTS idx_pt_target_nom
  ON public.production_tasks(target_nomenclature_id)
  WHERE target_nomenclature_id IS NOT NULL;

-- ─── 2. CREATE production_task_outputs ───

CREATE TABLE IF NOT EXISTS public.production_task_outputs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES public.production_tasks(id) ON DELETE CASCADE,
  nomenclature_id   UUID NOT NULL REFERENCES public.nomenclature(id) ON DELETE RESTRICT,
  planned_quantity  NUMERIC,
  actual_quantity   NUMERIC,
  is_primary        BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, nomenclature_id)
);

COMMENT ON TABLE public.production_task_outputs
  IS 'Multi-output tracker for production tasks. Primary output + by-products (e.g., whey from cheese, broth from boiled chicken).';
COMMENT ON COLUMN public.production_task_outputs.is_primary
  IS 'true = main product, false = by-product. Exactly one row per task should be primary.';
COMMENT ON COLUMN public.production_task_outputs.planned_quantity
  IS 'Expected output quantity in nomenclature base_unit.';
COMMENT ON COLUMN public.production_task_outputs.actual_quantity
  IS 'Actual weighed output. Used for yield variance analysis.';

CREATE INDEX IF NOT EXISTS idx_pto_task ON public.production_task_outputs(task_id);
CREATE INDEX IF NOT EXISTS idx_pto_nom  ON public.production_task_outputs(nomenclature_id);

-- ─── 3. RLS (admin panel uses anon key) ───

ALTER TABLE public.production_task_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pto_select" ON public.production_task_outputs
  FOR SELECT USING (true);

CREATE POLICY "pto_insert" ON public.production_task_outputs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "pto_update" ON public.production_task_outputs
  FOR UPDATE USING (true);

-- ─── 4. Realtime ───

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.production_task_outputs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 5. Backfill: extract target from existing tasks ───
-- Best-effort: tasks created by fn_approve_plan have description = nomenclature.name
-- Tasks from fn_process_new_order encode BOM ingredients, not the target — skip those.

UPDATE public.production_tasks pt
SET target_nomenclature_id = n.id
FROM public.nomenclature n
WHERE pt.target_nomenclature_id IS NULL
  AND pt.order_id IS NULL
  AND pt.description IS NOT NULL
  AND LOWER(TRIM(pt.description)) = LOWER(TRIM(n.name));
