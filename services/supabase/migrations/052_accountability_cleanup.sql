-- ═══════════════════════════════════════════════════════════════
-- Migration 052: Accountability + Cosmetic Cleanup
-- Phase 7.1: DB Architecture Audit — Issue #6 (Cosmetic)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. ADD created_by to expense_ledger ───
-- waste_logs already has logged_by (migration 017)
-- stock_transfers already has transferred_by (migration 018)
-- expense_ledger is the missing one.

ALTER TABLE public.expense_ledger
  ADD COLUMN IF NOT EXISTS created_by UUID;

COMMENT ON COLUMN public.expense_ledger.created_by
  IS 'UUID of the user who created this expense. NULL until Supabase Auth is implemented (Phase 8). Will be populated by fn_approve_receipt via fn_current_user_id().';

-- ─── 2. DEPRECATE ghost tables ───
-- IMPORTANT: These tables CANNOT be dropped — they are actively referenced by:
--   recipes_flow:
--     - fn_start_production_task (migration 016) reads recipes_flow via flow_step_id
--     - fn_create_batches_from_task (migration 018) joins recipes_flow
--     - production_tasks.flow_step_id FK → recipes_flow
--     - useCookTasks.ts (frontend) selects flow_step_id
--   daily_plan:
--     - fn_predictive_procurement (migration 017) reads daily_plan
--
-- SAFE APPROACH: Mark as deprecated. DROP after RPCs are rewritten to use
-- production_tasks.target_nomenclature_id (from migration 048).

COMMENT ON TABLE public.recipes_flow IS
  'DEPRECATED (Phase 7.1). Used by fn_start_production_task and fn_create_batches_from_task. Will be removed when RPCs migrate to production_tasks.target_nomenclature_id. Do NOT add new data.';

COMMENT ON TABLE public.daily_plan IS
  'DEPRECATED (Phase 7.1). Used by fn_predictive_procurement. Will be removed when procurement logic migrates to production_plans/plan_targets. Do NOT add new data.';

-- ─── 3. Audit log: row counts for deprecated tables ───

DO $$
DECLARE
  v_rf_count INTEGER;
  v_dp_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_rf_count FROM public.recipes_flow;
  SELECT COUNT(*) INTO v_dp_count FROM public.daily_plan;
  RAISE NOTICE 'Deprecated tables audit — recipes_flow: % rows, daily_plan: % rows (marked deprecated, NOT dropped)',
    v_rf_count, v_dp_count;
END $$;
