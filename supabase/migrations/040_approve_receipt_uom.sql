-- ═══════════════════════════════════════════════════════════════════
-- Migration 040: fn_approve_receipt v6 — UoM Conversion on Approval
-- Phase 6.4 — Apply conversion_factor when writing purchase_logs
-- ═══════════════════════════════════════════════════════════════════
-- Problem: CEO buys "2 bags of lemons" (bag = 0.5 kg each).
-- v5 writes quantity=2, price_per_unit=50 to purchase_logs.
-- But kitchen tracks lemons in kg, so inventory shows "2 bags"
-- instead of "1 kg". cost_per_unit propagates wrong value.
--
-- Fix: Look up conversion_factor from supplier_item_mapping.
-- If found: quantity = 2 × 0.5 = 1 kg, price_per_unit = 100/1 = 100 THB/kg
-- If NULL:  quantity and price_per_unit stay as-is (backwards compat).
--
-- Invariant preserved: total_price is NEVER changed by conversion.
-- Only quantity and price_per_unit are recalculated.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_approve_receipt(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense_id        UUID;
  v_supplier_id       UUID;
  v_supplier_name     TEXT;
  v_category_code     INTEGER;
  v_sub_category_code INTEGER;
  v_item              JSONB;
  v_nom_id            UUID;
  v_item_name         TEXT;
  v_item_unit         TEXT;
  v_auto_count        INTEGER := 0;
  -- v6: UoM conversion variables
  v_conv_factor       NUMERIC;
  v_raw_qty           NUMERIC;
  v_final_qty         NUMERIC;
  v_raw_unit_price    NUMERIC;
  v_final_unit_price  NUMERIC;
  v_total_price       NUMERIC;
BEGIN
  -- ── 1. Resolve supplier: payload.supplier_id > ILIKE name > AUTO-CREATE ──
  IF p_payload->>'supplier_id' IS NOT NULL AND p_payload->>'supplier_id' <> '' THEN
    v_supplier_id := (p_payload->>'supplier_id')::UUID;
  END IF;

  IF v_supplier_id IS NULL THEN
    v_supplier_name := p_payload->>'supplier_name';
    IF v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
      SELECT id INTO v_supplier_id
      FROM suppliers
      WHERE name ILIKE v_supplier_name
      LIMIT 1;

      -- AUTO-CREATE supplier if not found
      IF v_supplier_id IS NULL THEN
        INSERT INTO suppliers (name, category_code)
        VALUES (v_supplier_name, 2000)
        RETURNING id INTO v_supplier_id;
      END IF;
    END IF;
  END IF;

  -- ── 2. Resolve category: payload > supplier default > 2000 ──
  v_category_code := (p_payload->>'category_code')::INTEGER;
  v_sub_category_code := (p_payload->>'sub_category_code')::INTEGER;

  IF v_category_code IS NULL AND v_supplier_id IS NOT NULL THEN
    SELECT s.category_code, s.sub_category_code
    INTO v_category_code, v_sub_category_code
    FROM suppliers s WHERE s.id = v_supplier_id;
  END IF;

  IF v_category_code IS NULL THEN
    v_category_code := 2000;
  END IF;

  -- ── 3. INSERT expense_ledger (Hub) — with discount_total, vat_amount ──
  INSERT INTO expense_ledger (
    transaction_date, flow_type, category_code, sub_category_code,
    supplier_id, details, comments, invoice_number,
    amount_original, currency, exchange_rate,
    discount_total, vat_amount,
    paid_by, payment_method, status, has_tax_invoice,
    receipt_supplier_url, receipt_bank_url, tax_invoice_url
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
    COALESCE((p_payload->>'discount_total')::NUMERIC, 0),
    COALESCE((p_payload->>'vat_amount')::NUMERIC, 0),
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
  --    v6: Apply UoM conversion from supplier_item_mapping
  --    Invariant: total_price is NEVER changed. Only qty + unit_price recalculated.
  IF p_payload->'food_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'food_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'food_items')
    LOOP
      v_nom_id    := NULL;
      v_item_name := COALESCE(v_item->>'name', 'Unknown item');
      v_item_unit := COALESCE(v_item->>'unit', 'pcs');

      -- Try provided nomenclature_id
      IF v_item->>'nomenclature_id' IS NOT NULL
         AND v_item->>'nomenclature_id' <> ''
         AND v_item->>'nomenclature_id' <> '__NEW__' THEN
        v_nom_id := (v_item->>'nomenclature_id')::UUID;
      END IF;

      -- AUTO-CREATE: no nomenclature_id → create new RAW-AUTO-* entry
      IF v_nom_id IS NULL THEN
        INSERT INTO nomenclature (product_code, name, type, base_unit)
        VALUES (
          'RAW-AUTO-' || substr(md5(random()::text), 1, 8),
          v_item_name,
          'good',
          v_item_unit
        )
        RETURNING id INTO v_nom_id;
        v_auto_count := v_auto_count + 1;
      END IF;

      -- ── v6: UoM Conversion Lookup ──
      -- Look up conversion_factor from supplier_item_mapping
      -- for this (supplier, nomenclature) pair.
      -- If NULL or not found → factor = 1 (no conversion, backwards compat).
      v_conv_factor := NULL;
      IF v_supplier_id IS NOT NULL THEN
        SELECT sim.conversion_factor
        INTO v_conv_factor
        FROM supplier_item_mapping sim
        WHERE sim.supplier_id = v_supplier_id
          AND sim.nomenclature_id = v_nom_id
          AND sim.conversion_factor IS NOT NULL
        ORDER BY sim.match_count DESC
        LIMIT 1;
      END IF;

      -- ── v6: Calculate converted quantity and unit price ──
      v_raw_qty        := COALESCE((v_item->>'quantity')::NUMERIC, 1);
      v_raw_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
      v_total_price    := COALESCE((v_item->>'total_price')::NUMERIC, 0);

      IF v_conv_factor IS NOT NULL AND v_conv_factor > 0 THEN
        -- Convert: 2 bags × 0.5 kg/bag = 1 kg
        v_final_qty := v_raw_qty * v_conv_factor;
        -- Recalc unit price: 100 THB / 1 kg = 100 THB/kg
        -- Use total_price as the anchor (it never changes)
        IF v_final_qty > 0 THEN
          v_final_unit_price := v_total_price / v_final_qty;
        ELSE
          v_final_unit_price := v_raw_unit_price;
        END IF;
      ELSE
        -- No conversion: pass through as-is
        v_final_qty        := v_raw_qty;
        v_final_unit_price := v_raw_unit_price;
      END IF;

      INSERT INTO purchase_logs (
        nomenclature_id, supplier_id, quantity, price_per_unit,
        total_price, invoice_date, expense_id, notes
      ) VALUES (
        v_nom_id,
        v_supplier_id,
        v_final_qty,
        v_final_unit_price,
        v_total_price,
        COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
        v_expense_id,
        v_item_name
      );
    END LOOP;
  END IF;

  -- ── 5. INSERT capex_items → capex_transactions (Spoke 2) ──
  IF p_payload->'capex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'capex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'capex_items')
    LOOP
      INSERT INTO capex_transactions (
        transaction_id, amount_thb, transaction_date, transaction_type,
        category_code, vendor, details, expense_id
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
        expense_id, description, quantity, unit, unit_price, total_price
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
    'ok',           true,
    'expense_id',   v_expense_id,
    'food_count',   COALESCE(jsonb_array_length(p_payload->'food_items'), 0),
    'capex_count',  COALESCE(jsonb_array_length(p_payload->'capex_items'), 0),
    'opex_count',   COALESCE(jsonb_array_length(p_payload->'opex_items'), 0),
    'auto_created', v_auto_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION fn_approve_receipt(JSONB)
IS 'Phase 6.4: UoM Conversion — applies conversion_factor from supplier_item_mapping, recalculates qty + unit_price, preserves total_price. Hub+3Spokes.';
