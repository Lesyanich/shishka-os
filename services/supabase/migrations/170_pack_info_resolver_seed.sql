-- ============================================================
-- Migration 170: Pack-Info Resolver — schema + rule seed
--
-- Spec: docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md
-- MC initiative: e8df7bc4-3b1b-448f-be78-5292d0542b4f
--
-- Adds confidence_score, source_payload, status to
-- data_health_decisions; extends decision_source CHECK; seeds
-- new NOMENCLATURE_AUTO_PACK_FILL rule.
-- ============================================================

BEGIN;

-- 1. Schema additions (idempotent)
ALTER TABLE public.data_health_decisions
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC,
  ADD COLUMN IF NOT EXISTS source_payload   JSONB,
  ADD COLUMN IF NOT EXISTS status           TEXT
       DEFAULT 'applied';

-- Backfill status for any pre-existing rows
UPDATE public.data_health_decisions SET status = 'applied' WHERE status IS NULL;

-- Make status NOT NULL after backfill
ALTER TABLE public.data_health_decisions
  ALTER COLUMN status SET NOT NULL;

-- Add CHECK constraint (drop-then-add for idempotency)
ALTER TABLE public.data_health_decisions
  DROP CONSTRAINT IF EXISTS data_health_decisions_status_check;
ALTER TABLE public.data_health_decisions
  ADD CONSTRAINT data_health_decisions_status_check
    CHECK (status IN ('pending', 'applied', 'rejected', 'skip'));

-- 2. Extend decision_source CHECK
ALTER TABLE public.data_health_decisions
  DROP CONSTRAINT IF EXISTS data_health_decisions_decision_source_check;
ALTER TABLE public.data_health_decisions
  ADD CONSTRAINT data_health_decisions_decision_source_check
    CHECK (decision_source IN (
      'rule_auto', 'ceo_review', 'manual_edit', 'skip',
      'rule_auto_conflict', 'rule_auto_cost_pending'
    ));

-- 3. Partial index for fast review-queue queries
CREATE INDEX IF NOT EXISTS idx_dhd_pending
  ON public.data_health_decisions (entity_kind, decided_at DESC)
  WHERE status = 'pending';

-- 4. Seed new rule
INSERT INTO public.data_health_rules
  (rule_code, title, description, entity_kind, metric,
   detect_sql, fix_strategy, severity, auto_apply,
   confidence, created_by)
VALUES (
  'NOMENCLATURE_AUTO_PACK_FILL',
  'Auto-fill pack info from supplier_catalog/makro-lookup cascade',
  'Resolves base_unit + package_weight via cascade: supplier_catalog → makro-lookup. Pack-related fields auto-applied at confidence>=0.9; cost_per_unit always queued for CEO review.',
  'nomenclature',
  'missing_pack_info',
  $sql$
    SELECT n.id AS entity_id, n.product_code, n.name,
           jsonb_build_object(
             'current_unit',  n.base_unit,
             'has_purchases', EXISTS (SELECT 1 FROM purchase_logs p WHERE p.nomenclature_id = n.id),
             'cost',          n.cost_per_unit
           ) AS extra_json
      FROM public.nomenclature n
     WHERE n.is_deleted = false
       AND n.base_unit IN ('pcs','bag','bottle','pack')
       AND EXISTS (SELECT 1 FROM purchase_logs p WHERE p.nomenclature_id = n.id)
  $sql$,
  'auto_fill_from_resolver',
  'warn',
  TRUE,
  0.90,
  'claude-opus-session-72f2077a'
)
ON CONFLICT (rule_code) DO NOTHING;

-- 5. migration_log self-register
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '170_pack_info_resolver_seed.sql',
  'claude-opus-session-72f2077a',
  'Pack-Info Resolver Phase 1 schema. Spec: 2026-05-08-pack-info-resolver-design.md. MC initiative: e8df7bc4.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
