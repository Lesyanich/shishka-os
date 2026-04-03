-- ═══════════════════════════════════════════════════════════════════
-- Migration 032: Fix Ledger Visibility — Supplier Default Categories
-- ═══════════════════════════════════════════════════════════════════
-- Problem:  fn_approve_receipt creates expense_ledger rows with
--           category_code = NULL when the user doesn't explicitly
--           pick a category in StagingArea. This makes rows invisible
--           in filtered views and violates CEO rule:
--           "1 RECEIPT = 1 ROW in expense_ledger — ALWAYS visible"
--
-- Fix:     1. Add category_code / sub_category_code to suppliers table
--          2. Set default categories for known suppliers
--          3. Backfill expense_ledger NULL categories from supplier defaults
--          4. Fix fn_approve_receipt to read supplier defaults as fallback
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────
-- PART 1: Add default category columns to suppliers
-- ─────────────────────────────────────────────────────────

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS category_code INTEGER REFERENCES fin_categories(code),
  ADD COLUMN IF NOT EXISTS sub_category_code INTEGER;

COMMENT ON COLUMN suppliers.category_code IS 'Default financial category for expenses from this supplier';
COMMENT ON COLUMN suppliers.sub_category_code IS 'Default financial sub-category for expenses from this supplier';


-- ─────────────────────────────────────────────────────────
-- PART 2: Set default categories for known suppliers
--         4100 = Raw Materials / Food
--         4101 = Produce (Veg/Fruit)
--         2200 = Utilities
--         1200 = Kitchen Equipment
--         1100 = Construction / Fit-out
--         2100 = Rental (Space)
--         3100 = Legal & Professional
--         2400 = Marketing & Branding
--         2500 = Delivery / Logistics
--         2300 = Maintenance & Repair
--         3200 = Visa & Work Permits
--         1400 = IT Software License
-- ─────────────────────────────────────────────────────────

-- Food suppliers → 4100 Raw Materials / Food
UPDATE suppliers SET category_code = 4100 WHERE name IN (
  'Tops',
  'Makro'
) AND category_code IS NULL;

-- Construction / Fit-out → 1100
UPDATE suppliers SET category_code = 1100 WHERE name IN (
  'Richi Construction',
  'Pimonphan pha',
  'Ram'
) AND category_code IS NULL;

-- Kitchen Equipment → 1200
UPDATE suppliers SET category_code = 1200 WHERE name IN (
  'Japanese second hand',
  'Shandong Lingfan Technology Co., Ltd.',
  'New Ton',
  'Sarah cargo company China'
) AND category_code IS NULL;

-- Furniture & Fixtures → 1300
UPDATE suppliers SET category_code = 1300 WHERE name IN (
  'Home pro',
  'Global house',
  'Lazada'
) AND category_code IS NULL;

-- Marketing → 2400
UPDATE suppliers SET category_code = 2400 WHERE name IN (
  'P N advertising',
  'Stiker guy',
  'Google Asia Pacific Pte. Ltd.'
) AND category_code IS NULL;

-- Rental → 2100
UPDATE suppliers SET category_code = 2100 WHERE name = 'landlord-1' AND category_code IS NULL;

-- Utilities → 2200
UPDATE suppliers SET category_code = 2200 WHERE name LIKE '%การประปา%' AND category_code IS NULL;

-- Legal → 3100
UPDATE suppliers SET category_code = 3100 WHERE name = 'lawyer-1' AND category_code IS NULL;

-- IT → 1400
UPDATE suppliers SET category_code = 1400 WHERE name = 'Host' AND category_code IS NULL;

-- Operating Expenses (general fallback for uncategorized suppliers)
UPDATE suppliers SET category_code = 2000 WHERE category_code IS NULL;


-- ─────────────────────────────────────────────────────────
-- PART 3: Backfill expense_ledger rows with NULL category
--         from their supplier's default category
-- ─────────────────────────────────────────────────────────

UPDATE expense_ledger el
SET
  category_code     = s.category_code,
  sub_category_code = COALESCE(el.sub_category_code, s.sub_category_code)
FROM suppliers s
WHERE el.supplier_id = s.id
  AND el.category_code IS NULL
  AND s.category_code IS NOT NULL;

-- For rows without supplier but still NULL category → set to 2000 (Operating Expenses)
UPDATE expense_ledger
SET category_code = 2000
WHERE category_code IS NULL;


-- ─────────────────────────────────────────────────────────
-- PART 4: Fix fn_approve_receipt — supplier default fallback
--         If payload has no category_code, look up supplier's
--         default category from suppliers table
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_approve_receipt(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense_id       UUID;
  v_supplier_id      UUID;
  v_category_code    INTEGER;
  v_sub_category_code INTEGER;
  v_item             JSONB;
BEGIN
  -- ── 1. Read supplier_id from payload (resolved by frontend dropdown) ──
  IF p_payload->>'supplier_id' IS NOT NULL AND p_payload->>'supplier_id' <> '' THEN
    v_supplier_id := (p_payload->>'supplier_id')::UUID;
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
IS 'Phase 4.5b: Atomic Hub+3Spokes insert with supplier default category fallback';
