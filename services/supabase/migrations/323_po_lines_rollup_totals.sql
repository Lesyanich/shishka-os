-- QA BUG fc6a3916 — PO header subtotal/grand_total were never computed for
-- draft/in-flight purchase orders, so the PO list showed no order value.
--
-- ROOT CAUSE: fn_create_purchase_order inserts po_lines but never rolls their
-- total_expected up into purchase_orders.subtotal/grand_total, and there was no
-- trigger on po_lines to do it. Header totals only appeared at reconciliation
-- (fn_approve_po sets grand_total = the actual invoice amount).
--
-- FIX (option b from the task): an AFTER INSERT/UPDATE/DELETE trigger on
-- po_lines recomputes the header from the line estimates. po_lines.total_expected
-- is a GENERATED column (qty_ordered * COALESCE(unit_price_expected, 0)), so the
-- subtotal is just its SUM.
--
--   subtotal    = Σ po_lines.total_expected
--   grand_total = subtotal - discount_total + vat_amount + delivery_fee
--
-- CRITICAL: skip POs in 'reconciled'/'cancelled' status. fn_approve_po overwrites
-- grand_total with the real invoice total (amount_original) and subtotal with the
-- actual received value at reconciliation — the rollup must NOT clobber those
-- actuals. po_lines are not edited after reconciliation, but the guard makes the
-- invariant explicit and safe.
--
-- Reversible: DROP TRIGGER + DROP FUNCTION (see DOWN block at the tail).

-- 1. Recompute one PO's header totals from its line estimates.
CREATE OR REPLACE FUNCTION public.fn_po_rollup_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id UUID := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  UPDATE public.purchase_orders po
  SET subtotal    = roll.s,
      grand_total = roll.s
                    - COALESCE(po.discount_total, 0)
                    + COALESCE(po.vat_amount, 0)
                    + COALESCE(po.delivery_fee, 0)
  FROM (
    SELECT COALESCE(SUM(pl.total_expected), 0) AS s
    FROM public.po_lines pl
    WHERE pl.po_id = v_po_id
  ) roll
  WHERE po.id = v_po_id
    AND po.status NOT IN ('reconciled', 'cancelled');

  RETURN NULL; -- AFTER trigger: return value ignored
END;
$$;

-- 2. Fire on every line mutation so the header stays in sync across all edit
--    paths (create, reconciliation panel line edits, manual deletes).
DROP TRIGGER IF EXISTS trg_po_lines_rollup ON public.po_lines;
CREATE TRIGGER trg_po_lines_rollup
AFTER INSERT OR UPDATE OR DELETE ON public.po_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_po_rollup_totals();

-- 3. Backfill existing non-reconciled POs whose totals were left NULL.
UPDATE public.purchase_orders po
SET subtotal    = roll.s,
    grand_total = roll.s
                  - COALESCE(po.discount_total, 0)
                  + COALESCE(po.vat_amount, 0)
                  + COALESCE(po.delivery_fee, 0)
FROM (
  SELECT pl.po_id, COALESCE(SUM(pl.total_expected), 0) AS s
  FROM public.po_lines pl
  GROUP BY pl.po_id
) roll
WHERE po.id = roll.po_id
  AND po.status NOT IN ('reconciled', 'cancelled');

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '323_po_lines_rollup_totals.sql',
  'claude-code',
  NULL,
  'QA fc6a3916: fn_po_rollup_totals() + AFTER INS/UPD/DEL trigger on po_lines recomputes purchase_orders.subtotal/grand_total from line estimates (skips reconciled/cancelled to preserve fn_approve_po actuals); backfills existing draft POs'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP TRIGGER IF EXISTS trg_po_lines_rollup ON public.po_lines;
-- DROP FUNCTION IF EXISTS public.fn_po_rollup_totals();
