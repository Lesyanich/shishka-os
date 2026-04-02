-- Migration 080: Add receipt_pages TEXT[] for multi-page receipt support
-- Replaces the 3 fixed URL fields (supplier/bank/tax) with a flexible array
-- Old columns kept for backward compatibility; frontend reads from receipt_pages

ALTER TABLE expense_ledger
  ADD COLUMN IF NOT EXISTS receipt_pages TEXT[] DEFAULT '{}';

-- Backfill: merge existing non-null URLs into the array
UPDATE expense_ledger
SET receipt_pages = ARRAY_REMOVE(
  ARRAY_REMOVE(
    ARRAY_REMOVE(
      ARRAY[receipt_supplier_url, receipt_bank_url, tax_invoice_url],
      NULL
    ),
    NULL
  ),
  NULL
)
WHERE receipt_supplier_url IS NOT NULL
   OR receipt_bank_url IS NOT NULL
   OR tax_invoice_url IS NOT NULL;

COMMENT ON COLUMN expense_ledger.receipt_pages IS 'Ordered array of receipt page URLs. Replaces fixed 3-URL fields for N-page support.';
