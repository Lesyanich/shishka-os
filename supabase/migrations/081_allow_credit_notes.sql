-- 081: Allow negative amounts for credit notes / returns
-- Context: Makro and other suppliers issue credit notes (ใบลดหนี้) when products
-- are returned. These should be recorded as negative COGS entries so they
-- automatically reduce period expenses in financial reports.
--
-- Tables affected:
--   1. expense_ledger.amount_original  (was >= 0, now <> 0)
--   2. purchase_logs.quantity           (was > 0,  now <> 0)
--   3. purchase_logs.total_price        (was >= 0, removed)
--   4. receiving_lines.qty_received     (was >= 0, removed — allows negative for returns)
--
-- Convention: negative values = credit note/return, positive = normal purchase.

BEGIN;

-- 1. expense_ledger: allow negative amounts
ALTER TABLE public.expense_ledger
  DROP CONSTRAINT IF EXISTS expense_ledger_amount_original_check;
ALTER TABLE public.expense_ledger
  ADD CONSTRAINT expense_ledger_amount_original_check
  CHECK (amount_original <> 0);

-- 2. purchase_logs: allow negative quantity
ALTER TABLE public.purchase_logs
  DROP CONSTRAINT IF EXISTS purchase_logs_quantity_check;
ALTER TABLE public.purchase_logs
  ADD CONSTRAINT purchase_logs_quantity_check
  CHECK (quantity <> 0);

-- 3. purchase_logs: allow negative total_price
ALTER TABLE public.purchase_logs
  DROP CONSTRAINT IF EXISTS purchase_logs_total_price_check;

-- 4. receiving_lines: allow negative qty_received for returns
ALTER TABLE public.receiving_lines
  DROP CONSTRAINT IF EXISTS receiving_lines_qty_received_check;

COMMIT;
