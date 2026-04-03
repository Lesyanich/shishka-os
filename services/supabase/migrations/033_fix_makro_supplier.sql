-- ═══════════════════════════════════════════════════════════════════
-- Migration 033: Fix Makro Supplier — INSERT + Link to Receipt
-- ═══════════════════════════════════════════════════════════════════
-- Problem: "Makro" was never in the suppliers table.
--          Migration 032 UPDATE didn't match anything.
--          The Makro test receipt has supplier_id = NULL.
--
-- Fix:    1. INSERT "Makro" supplier with category_code = 4100
--         2. UPDATE the Makro receipt: link supplier, fix category, bump date
--         3. Add supplier_name ILIKE fallback + AUTO-CREATE to fn_approve_receipt
--            CEO RULE: new supplier_name → auto-insert into suppliers table
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────
-- PART 1: Create Makro supplier
-- ─────────────────────────────────────────────────────────

INSERT INTO suppliers (name, category_code, sub_category_code)
VALUES ('Makro', 4100, NULL)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────
-- PART 2: Link the orphaned Makro receipt to this supplier
--         Also fix category and bump date to today
-- ─────────────────────────────────────────────────────────

UPDATE expense_ledger
SET
  supplier_id      = (SELECT id FROM suppliers WHERE name = 'Makro' LIMIT 1),
  category_code    = 4100,
  transaction_date = CURRENT_DATE
WHERE supplier_id IS NULL
  AND details ILIKE '%Makro%';


-- ─────────────────────────────────────────────────────────
-- PART 3: Fix fn_approve_receipt — add supplier_name ILIKE
--         fallback so AI-parsed names get resolved
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_approve_receipt(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense_id       UUID;
  v_supplier_id      UUID;
  v_supplier_name    TEXT;
  v_category_code    INTEGER;
  v_sub_category_code INTEGER;
  v_item             JSONB;
BEGIN
  -- ── 1. Resolve supplier: payload.supplier_id > ILIKE name lookup ──
  IF p_payload->>'supplier_id' IS NOT NULL AND p_payload->>'supplier_id' <> '' THEN
    v_supplier_id := (p_payload->>'supplier_id')::UUID;
  END IF;

  -- Fallback: try matching by supplier_name (AI-parsed)
  IF v_supplier_id IS NULL THEN
    v_supplier_name := p_payload->>'supplier_name';
    IF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
      SELECT id INTO v_supplier_id
      FROM suppliers
      WHERE name ILIKE v_supplier_name
      LIMIT 1;

      -- AUTO-CREATE: if supplier_name provided but not found → create new supplier
      IF v_supplier_id IS NULL THEN
        INSERT INTO suppliers (name, category_code)
        VALUES (v_supplier_name, 2000)  -- default to Operating Expenses
        RETURNING id INTO v_supplier_id;
      END IF;
    END IF;
  END IF;

  -- ── 2. Resolve category: payload > supplier default > 2000 (Operating Expenses) ──
  v_category_code := (p_payload->>'category_code')::INTEGER;
  v_sub_category_code := (p_payload->>'sub_category_code')::INTEGER;

  -- If category not set in payload, try supplier default
  IF v_category_code IS NULL AND v_supplier_id IS NOT NULL THEN
    SELECT s.category_code, s.sub_category_code
    INTO v_category_code, v_sub_category_code
    FROM suppliers s
    WHERE s.id = v_supplier_id;
  END IF;

  -- Ultimate fallback: Operating Expenses
  IF v_category_code IS NULL THEN
    v_category_code := 2000;
  END IF;

  -- ── 3. INSERT into expense_ledger (Hub) ──
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
    v_category_code,
    v_sub_category_code,
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

  -- ── 4. INSERT food_items → purchase_logs (Spoke 1) ──
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

  -- ── 5. INSERT capex_items → capex_transactions (Spoke 2) ──
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
        v_category_code,
        (SELECT name FROM suppliers WHERE id = v_supplier_id),
        v_item->>'name',
        v_expense_id
      );
    END LOOP;
  END IF;

  -- ── 6. INSERT opex_items (Spoke 3) ──
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

  -- ── 7. Return success ──
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
IS 'Phase 4.5c: Atomic Hub+3Spokes insert with supplier_name ILIKE + auto-create + default category fallback';
