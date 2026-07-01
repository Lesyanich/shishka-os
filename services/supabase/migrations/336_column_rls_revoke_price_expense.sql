-- 336_column_rls_revoke_price_expense.sql
-- Column-level RLS CUTOVER (Phase 4.3) — MC c2a5d578
-- Spec: docs/security/column-rls-rpc-design-2026-06-29.md
--
-- Pairs with the frontend cutover (same release): every price / expense-amount edit now
-- routes through the owner-gated SECURITY DEFINER RPCs created in migration 334
-- (fn_set_dish_price, fn_set_expense_amount), which assert fn_is_owner() and write a
-- value_change_audit row. This migration removes the direct column UPDATE grant so the
-- RPCs become the ONLY way to change these values.
--
-- ⚠ APPLY ONLY TOGETHER WITH the frontend release. The REVOKEs break any direct
--   .update({ price }) / .update({ amount_original }) until the caller uses the RPC.
--   Frontend call sites migrated: useMenuDishes, useMenuData, RecipeBuilder (price),
--   chef _writeTools update_dish_price, useExpenseLedger (amount_original/exchange_rate).
--
-- SCOPE NOTE — sku_balances.quantity is intentionally DEFERRED here. Its only direct
--   writer is the cook-facing waste log (operational, must NOT be owner-gated), and the
--   connected-stock epic is actively rebuilding that surface. fn_set_sku_quantity already
--   exists (mig 334) for when the connected-stock epic gates quantity on its own terms.
BEGIN;

-- 1) nomenclature.price — sale price changes are owner-only (via fn_set_dish_price) -----
REVOKE UPDATE (price) ON public.nomenclature FROM authenticated, anon;

-- 2) expense_ledger.amount_original / exchange_rate — owner-only (via fn_set_expense_amount)
REVOKE UPDATE (amount_original, exchange_rate) ON public.expense_ledger FROM authenticated, anon;

-- ============================================================
-- Self-register in migration_log (RULE-MIGRATION-TRACKING).
-- Runs only when this migration is actually executed (Phase 4, CEO-gated).
-- ============================================================
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '336_column_rls_revoke_price_expense.sql',
  'Column-level RLS cutover (Phase 4.3): REVOKE UPDATE on nomenclature.price and expense_ledger.amount_original/exchange_rate from authenticated,anon. Edits now route through owner-gated RPCs from mig 334 (fn_set_dish_price, fn_set_expense_amount). sku_balances.quantity deferred to the connected-stock epic.',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
