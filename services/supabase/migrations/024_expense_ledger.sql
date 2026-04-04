-- ════════════════════════════════════════════════════════════
-- Migration 024: Expense Ledger, Multi-currency & Receipt Storage
-- Phase 4.1 — Universal financial journal for OpEx/CapEx
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- PART 1: expense_ledger table
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expense_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date      DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Classification
  flow_type             TEXT NOT NULL DEFAULT 'OpEx'
                        CHECK (flow_type IN ('OpEx', 'CapEx')),
  category_code         INTEGER REFERENCES fin_categories(code),
  sub_category_code     INTEGER REFERENCES fin_sub_categories(sub_code),
  supplier_id           UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  -- Description
  details               TEXT NOT NULL DEFAULT '',

  -- Multi-currency
  amount_original       NUMERIC NOT NULL DEFAULT 0 CHECK (amount_original >= 0),
  currency              TEXT NOT NULL DEFAULT 'THB',
  exchange_rate         NUMERIC NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  amount_thb            NUMERIC GENERATED ALWAYS AS (amount_original * exchange_rate) STORED,

  -- Payment
  paid_by               TEXT DEFAULT '',
  payment_method        TEXT DEFAULT 'cash'
                        CHECK (payment_method IN ('cash', 'transfer', 'card', 'other')),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'cancelled')),

  -- Receipt URLs (Supabase Storage)
  receipt_supplier_url  TEXT,
  receipt_bank_url      TEXT,
  tax_invoice_url       TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expense_ledger_date
  ON expense_ledger(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_expense_ledger_flow
  ON expense_ledger(flow_type);
CREATE INDEX IF NOT EXISTS idx_expense_ledger_category
  ON expense_ledger(category_code);
CREATE INDEX IF NOT EXISTS idx_expense_ledger_supplier
  ON expense_ledger(supplier_id);

-- Updated_at trigger
CREATE TRIGGER trg_expense_ledger_updated_at
  BEFORE UPDATE ON expense_ledger
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE expense_ledger IS 'Universal financial journal — OpEx + CapEx with multi-currency support';
COMMENT ON COLUMN expense_ledger.amount_thb IS 'Auto-calculated: amount_original × exchange_rate';

-- ════════════════════════════════════════════════════════════
-- PART 2: Supabase Storage — receipts bucket
-- ════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: allow public read
CREATE POLICY "Public read receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts');

-- Storage RLS: allow authenticated upload
CREATE POLICY "Authenticated upload receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'receipts');

-- Storage RLS: allow authenticated delete own files
CREATE POLICY "Authenticated delete receipts"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'receipts');

-- ════════════════════════════════════════════════════════════
-- PART 3: RLS + Realtime for expense_ledger
-- ════════════════════════════════════════════════════════════

ALTER TABLE expense_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_ledger_select" ON expense_ledger
  FOR SELECT USING (true);
CREATE POLICY "expense_ledger_insert" ON expense_ledger
  FOR INSERT WITH CHECK (true);
CREATE POLICY "expense_ledger_update" ON expense_ledger
  FOR UPDATE USING (true);
CREATE POLICY "expense_ledger_delete" ON expense_ledger
  FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE expense_ledger;
