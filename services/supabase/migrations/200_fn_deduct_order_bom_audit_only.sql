-- Migration 200 — fn_deduct_order_bom: audit-only (no sku_balances UPDATE)
--
-- Why: mig 199 wrote against `inventory_balances` assuming the original
-- single-balance-per-nomenclature schema from mig 017. That table was dropped
-- in mig 058 and replaced by `sku_balances` (per-SKU per-nomenclature)
-- which requires a sku_id to UPDATE — not derivable from a Loyverse line item.
--
-- For T5 v1 we log every BOM consumption to stock_movements (audit ledger
-- already created in mig 199) but skip the stock-balance UPDATE. A future
-- migration will add an explicit FIFO/specific deduction RPC against
-- sku_balances once business rules (FIFO/LIFO, batch selection) are decided.
--
-- Net effect right now:
--   • stock_movements gets one row per BOM leaf per receipt — full audit ✓
--   • sku_balances unchanged — projection-only mismatch to be reconciled later
--   • inventory_balances reference REMOVED from fn_deduct_order_bom

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_deduct_order_bom(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_already TIMESTAMPTZ;
  v_item    RECORD;
  v_mod     RECORD;
  v_leaf    RECORD;
BEGIN
  SELECT bom_deducted_at INTO v_already
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_deduct_order_bom: order % not found', p_order_id;
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN; -- idempotent
  END IF;

  -- Walk each order_item: log BOM-leaf deductions at depth=1
  FOR v_item IN
    SELECT id AS order_item_id, nomenclature_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    FOR v_leaf IN
      SELECT nomenclature_id AS nom_id, required_qty
      FROM public.fn_explode_bom(v_item.nomenclature_id, v_item.quantity)
      WHERE depth = 1
    LOOP
      INSERT INTO public.stock_movements (
        nomenclature_id, qty_delta, reason,
        order_id, order_item_id, notes
      ) VALUES (
        v_leaf.nom_id, -v_leaf.required_qty, 'loyverse_sale',
        p_order_id, v_item.order_item_id,
        'audit-only; balance reconciliation deferred to FIFO RPC'
      );
    END LOOP;
  END LOOP;

  -- Walk each order_item_modifier with a bound modifier_id (MOD-* nomenclature)
  FOR v_mod IN
    SELECT oim.id AS oim_id, oim.order_item_id, oim.modifier_id,
           oim.quantity AS mod_qty, oi.quantity AS item_qty
    FROM public.order_item_modifiers oim
    JOIN public.order_items oi ON oi.id = oim.order_item_id
    WHERE oi.order_id = p_order_id
      AND oim.modifier_id IS NOT NULL
  LOOP
    FOR v_leaf IN
      SELECT nomenclature_id AS nom_id, required_qty
      FROM public.fn_explode_bom(v_mod.modifier_id, v_mod.mod_qty * v_mod.item_qty)
      WHERE depth = 1
    LOOP
      INSERT INTO public.stock_movements (
        nomenclature_id, qty_delta, reason,
        order_id, order_item_id, order_item_modifier_id, notes
      ) VALUES (
        v_leaf.nom_id, -v_leaf.required_qty, 'loyverse_sale',
        p_order_id, v_mod.order_item_id, v_mod.oim_id,
        'audit-only; balance reconciliation deferred to FIFO RPC'
      );
    END LOOP;
  END LOOP;

  UPDATE public.orders SET bom_deducted_at = now() WHERE id = p_order_id;
END;
$$;

COMMENT ON FUNCTION public.fn_deduct_order_bom(UUID) IS
  'T5 v2: Audit-only BOM consumption log. Writes stock_movements rows for every depth=1 BOM leaf of order_items + order_item_modifiers. Does NOT update sku_balances (requires FIFO/batch selection — future RPC). Idempotent via orders.bom_deducted_at.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '200_fn_deduct_order_bom_audit_only.sql',
  'claude-code',
  'Rewrite fn_deduct_order_bom to skip sku_balances UPDATE (table was inventory_balances pre-mig-058, now sku_balances needs FIFO logic). Audit-only mode: only stock_movements gets rows.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
