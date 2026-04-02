-- ============================================================
-- Migration 083: Add raw_parse JSONB to expense_ledger
-- Stores the FULL parsed receipt data from Claude agent.
-- Contains ALL fields read from receipt (barcodes, addresses,
-- phone numbers, etc.) — even those not currently used.
-- Enables future data mining without re-reading receipt photos.
-- ============================================================

ALTER TABLE public.expense_ledger
ADD COLUMN IF NOT EXISTS raw_parse JSONB;

COMMENT ON COLUMN public.expense_ledger.raw_parse
  IS 'Full parsed receipt data from Claude agent. Contains all extracted fields for future use.';
