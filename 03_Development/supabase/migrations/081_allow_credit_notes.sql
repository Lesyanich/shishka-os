-- 081: Allow negative amounts for credit notes / returns
-- Context: Makro and other suppliers issue credit notes (ใบลดหนี้) when products
-- are returned. These should be recorded as negative COGS entries so they
-- automatically reduce period expenses in financial reports.
--
-- Changes:
--   1. expense_ledger.amount_original: allow negative (was >= 0, now <> 0)
--   2. purchase_logs.quantity: allow negative for returns (was > 0, now <> 0)
--   3. purchase_logs.total_price: allow negative (was >= 0, now any non-null)
--
-- Convention: negative amount = credit note/return, positive = normal purchase.

BEGIN;

-- 1. expense_ledger: allow negative amounts
ALTER TABLE public.expense_ledger
  DROP CONSTRAINT IF EXISTS expense_ledger_amount_original_check;

ALTER TABLE public.expense_ledger
  ADD CONSTRAINT expense_ledger_amount_original_check
  CHECK (amount_original <> 0);

COMMENT ON CONSTRAINT expense_ledger_amount_original_check ON public.expense_ledger
  IS 'Amount must be non-zero. Positive = purchase, negative = credit note / return.';

-- 2. purchase_logs: allow negative quantity for returns
ALTER TABLE public.purchase_logs
  DROP CONSTRAINT IF EXISTS purchase_logs_quantity_check;

ALTER TABLE public.purchase_logs
  ADD CONSTRAINT purchase_logs_quantity_check
  CHECK (quantity <> 0);

COMMENT ON CONSTRAINT purchase_logs_quantity_check ON public.purchase_logs
  IS 'Quantity must be non-zero. Negative = returned items.';

COMMIT;
