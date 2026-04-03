-- ════════════════════════════════════════════════════════════
-- Migration 030: Smart Receipt Routing — Hub & Spoke Architecture
-- Phase 4.4: AI Receipt Clustering & Smart Line-Item Routing
-- Date: 2026-03-10
-- ════════════════════════════════════════════════════════════
-- Hub:    expense_ledger  (total amount + receipt images)
-- Spoke1: purchase_logs   (food items)       — via expense_id FK
-- Spoke2: capex_transactions (equipment)     — via expense_id FK
-- Spoke3: opex_items      (consumables, NEW) — via expense_id FK
-- ════════════════════════════════════════════════════════════

-- ─── PART A: Add invoice_number to expense_ledger ─────────

ALTER TABLE expense_ledger
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

COMMENT ON COLUMN expense_ledger.invoice_number
  IS 'Invoice/receipt number extracted by AI or entered manually';

-- ─── PART B: Add expense_id FK to purchase_logs + fix RLS ─

ALTER TABLE purchase_logs
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expense_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_logs_expense
  ON purchase_logs(expense_id);

-- Fix RLS: admin panel uses anon key, current policy is authenticated-only (migration 021)
DROP POLICY IF EXISTS "purchase_logs_select" ON purchase_logs;
CREATE POLICY "purchase_logs_select" ON purchase_logs
  FOR SELECT USING (true);

-- ─── PART C: Add expense_id FK to capex_transactions + enable RLS ─

-- Note: capex_transactions was deployed from archived migration
-- 03_Development/database/003_capex_analytics.sql (62 rows in production).
-- It is NOT in the active supabase/migrations/ pipeline.
-- This ALTER adds the Hub→Spoke FK link.

ALTER TABLE capex_transactions
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expense_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_capex_transactions_expense
  ON capex_transactions(expense_id);

-- Enable RLS (was never enabled on this table)
ALTER TABLE capex_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "capex_transactions_select" ON capex_transactions
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "capex_transactions_insert" ON capex_transactions
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "capex_transactions_update" ON capex_transactions
    FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── PART D: Create opex_items table (Spoke 3) ───────────

CREATE TABLE IF NOT EXISTS opex_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES expense_ledger(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity    NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit        TEXT DEFAULT 'pcs',
  unit_price  NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price NUMERIC NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE opex_items
  IS 'Consumable line items from receipts — Spoke 3 in Hub & Spoke architecture';

CREATE INDEX IF NOT EXISTS idx_opex_items_expense
  ON opex_items(expense_id);

-- RLS
ALTER TABLE opex_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opex_items_select" ON opex_items
  FOR SELECT USING (true);

CREATE POLICY "opex_items_insert" ON opex_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "opex_items_update" ON opex_items
  FOR UPDATE USING (true);

CREATE POLICY "opex_items_delete" ON opex_items
  FOR DELETE USING (true);

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE opex_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── PART E: RPC fn_approve_receipt(JSONB) ────────────────
-- Atomic transaction: inserts Hub (expense_ledger) + Spokes
-- (purchase_logs, capex_transactions, opex_items) in one TX.
-- Pattern follows fn_create_batches_from_task (migration 018).
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_approve_receipt(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense_id  UUID;
  v_supplier_id UUID;
  v_item        JSONB;
BEGIN
  -- ── 1. Read supplier_id from payload (resolved by frontend dropdown) ──
  IF p_payload->>'supplier_id' IS NOT NULL AND p_payload->>'supplier_id' <> '' THEN
    v_supplier_id := (p_payload->>'supplier_id')::UUID;
  END IF;

  -- ── 2. INSERT into expense_ledger (Hub) ──
  INSERT INTO expense_ledger (
    transaction_date,
    flow_type,
    category_code,
    sub_category_code,
    supplier_id,
    details,
    comments,
    invoice_number,
    amount_original,
    currency,
    exchange_rate,
    paid_by,
    payment_method,
    status,
    has_tax_invoice,
    receipt_supplier_url,
    receipt_bank_url,
    tax_invoice_url
  ) VALUES (
    COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
    COALESCE(p_payload->>'flow_type', 'OpEx'),
    (p_payload->>'category_code')::INTEGER,
    (p_payload->>'sub_category_code')::INTEGER,
    v_supplier_id,
    COALESCE(p_payload->>'details', ''),
    p_payload->>'comments',
    p_payload->>'invoice_number',
    COALESCE((p_payload->>'amount_original')::NUMERIC, 0),
    COALESCE(p_payload->>'currency', 'THB'),
    COALESCE((p_payload->>'exchange_rate')::NUMERIC, 1),
    COALESCE(p_payload->>'paid_by', ''),
    COALESCE(p_payload->>'payment_method', 'cash'),
    COALESCE(p_payload->>'status', 'paid'),
    COALESCE((p_payload->>'has_tax_invoice')::BOOLEAN, false),
    p_payload->>'receipt_supplier_url',
    p_payload->>'receipt_bank_url',
    p_payload->>'tax_invoice_url'
  )
  RETURNING id INTO v_expense_id;

  -- ── 3. INSERT food_items → purchase_logs (Spoke 1) ──
  IF p_payload->'food_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'food_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'food_items')
    LOOP
      INSERT INTO purchase_logs (
        nomenclature_id,
        supplier_id,
        quantity,
        price_per_unit,
        total_price,
        invoice_date,
        expense_id,
        notes
      ) VALUES (
        (v_item->>'nomenclature_id')::UUID,
        v_supplier_id,
        COALESCE((v_item->>'quantity')::NUMERIC, 1),
        COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        COALESCE((v_item->>'total_price')::NUMERIC, 0),
        COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
        v_expense_id,
        v_item->>'name'
      );
    END LOOP;
  END IF;

  -- ── 4. INSERT capex_items → capex_transactions (Spoke 2) ──
  IF p_payload->'capex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'capex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'capex_items')
    LOOP
      INSERT INTO capex_transactions (
        transaction_id,
        amount_thb,
        transaction_date,
        transaction_type,
        category_code,
        vendor,
        details,
        expense_id
      ) VALUES (
        'RCV-' || substr(gen_random_uuid()::TEXT, 1, 8),
        COALESCE((v_item->>'total_price')::NUMERIC, 0),
        COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
        'purchase',
        (p_payload->>'category_code')::INTEGER,
        (SELECT name FROM suppliers WHERE id = v_supplier_id),
        v_item->>'name',
        v_expense_id
      );
    END LOOP;
  END IF;

  -- ── 5. INSERT opex_items (Spoke 3) ──
  IF p_payload->'opex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'opex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'opex_items')
    LOOP
      INSERT INTO opex_items (
        expense_id,
        description,
        quantity,
        unit,
        unit_price,
        total_price
      ) VALUES (
        v_expense_id,
        COALESCE(v_item->>'description', v_item->>'name', ''),
        COALESCE((v_item->>'quantity')::NUMERIC, 1),
        COALESCE(v_item->>'unit', 'pcs'),
        COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        COALESCE((v_item->>'total_price')::NUMERIC, 0)
      );
    END LOOP;
  END IF;

  -- ── 6. Return success ──
  RETURN jsonb_build_object(
    'ok',          true,
    'expense_id',  v_expense_id,
    'food_count',  COALESCE(jsonb_array_length(p_payload->'food_items'), 0),
    'capex_count', COALESCE(jsonb_array_length(p_payload->'capex_items'), 0),
    'opex_count',  COALESCE(jsonb_array_length(p_payload->'opex_items'), 0)
  );

EXCEPTION WHEN OTHERS THEN
  -- PL/pgSQL auto-rollback on exception
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION fn_approve_receipt(JSONB)
  IS 'Atomic receipt approval: inserts expense_ledger (Hub) + spoke line items in a single transaction';
