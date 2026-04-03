-- ============================================================
-- Migration 065: fn_approve_receipt v11
-- Phase 12.2 — Add receiving_records side effect for audit trail
-- ============================================================
-- CHANGE FROM v10:
--   After processing all food items, creates:
--   - receiving_records (source='receipt') — unified audit trail
--   - receiving_lines (qty_expected = qty_received, no discrepancy)
--   This ensures Path A (receipt scan) receipts also appear in
--   the unified receiving history alongside Path B (PO) deliveries.
--
-- All other logic unchanged from v10 (058_rpc_sku_aware.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_approve_receipt(p_payload JSONB)
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
  v_sku_id            UUID;
  v_item_name         TEXT;
  v_item_unit         TEXT;
  v_auto_count        INTEGER := 0;
  v_sku_auto_count    INTEGER := 0;
  -- v6: UoM conversion variables
  v_conv_factor       NUMERIC;
  v_raw_qty           NUMERIC;
  v_final_qty         NUMERIC;
  v_raw_unit_price    NUMERIC;
  v_final_unit_price  NUMERIC;
  v_total_price       NUMERIC;
  -- v8: auto-derive variables
  v_auto_fin_sub      INTEGER;
  -- v10: SKU variables
  v_item_barcode      TEXT;
  v_item_brand        TEXT;
  v_item_package      TEXT;
  -- v11: Receiving audit trail
  v_receiving_id      UUID;
  v_food_count        INTEGER := 0;
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

  -- ── 3. INSERT expense_ledger (Hub) ──
  INSERT INTO expense_ledger (
    transaction_date, flow_type, category_code, sub_category_code,
    supplier_id, details, comments, invoice_number,
    amount_original, currency, exchange_rate,
    discount_total, vat_amount, delivery_fee,
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
    COALESCE((p_payload->>'delivery_fee')::NUMERIC, 0),
    COALESCE(p_payload->>'paid_by', ''),
    COALESCE(p_payload->>'payment_method', 'cash'),
    COALESCE(p_payload->>'status', 'paid'),
    COALESCE((p_payload->>'has_tax_invoice')::BOOLEAN, false),
    p_payload->>'receipt_supplier_url',
    p_payload->>'receipt_bank_url',
    p_payload->>'tax_invoice_url'
  )
  RETURNING id INTO v_expense_id;

  -- ── v11: Create receiving_records for audit trail ──
  INSERT INTO public.receiving_records (
    source, expense_id, received_by, notes, status
  ) VALUES (
    'receipt', v_expense_id, auth.uid(), 'Auto-created from receipt approval', 'reconciled'
  )
  RETURNING id INTO v_receiving_id;

  -- ── 4. INSERT food_items → purchase_logs (Spoke 1) ──
  IF p_payload->'food_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'food_items') > 0 THEN

    -- v8: Auto-derive sub_category_code from first food item's category
    IF v_sub_category_code IS NULL THEN
      v_auto_fin_sub := NULL;
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'food_items') LIMIT 1
      LOOP
        IF v_item->>'nomenclature_id' IS NOT NULL
           AND v_item->>'nomenclature_id' <> ''
           AND v_item->>'nomenclature_id' <> '__NEW__' THEN
          SELECT pc.default_fin_sub_code
          INTO v_auto_fin_sub
          FROM nomenclature n
          JOIN product_categories pc ON pc.id = n.category_id
          WHERE n.id = (v_item->>'nomenclature_id')::UUID
            AND pc.default_fin_sub_code IS NOT NULL;
        END IF;
      END LOOP;

      IF v_auto_fin_sub IS NOT NULL THEN
        UPDATE expense_ledger
        SET sub_category_code = v_auto_fin_sub
        WHERE id = v_expense_id;
        v_sub_category_code := v_auto_fin_sub;
      END IF;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'food_items')
    LOOP
      v_nom_id    := NULL;
      v_sku_id    := NULL;
      v_item_name := COALESCE(v_item->>'name', 'Unknown item');
      v_item_unit := COALESCE(v_item->>'unit', 'pcs');

      -- ── 4a. Resolve nomenclature_id ──
      IF v_item->>'nomenclature_id' IS NOT NULL
         AND v_item->>'nomenclature_id' <> ''
         AND v_item->>'nomenclature_id' <> '__NEW__' THEN
        v_nom_id := (v_item->>'nomenclature_id')::UUID;
      END IF;

      -- AUTO-CREATE nomenclature if not mapped
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

      -- ── 4b. v10: Resolve SKU ──
      v_item_barcode := v_item->>'barcode';
      v_item_brand   := v_item->>'brand';
      v_item_package := v_item->>'package_weight';

      -- Strategy 1: Lookup by barcode (most reliable)
      IF v_item_barcode IS NOT NULL AND v_item_barcode <> '' THEN
        SELECT id INTO v_sku_id
        FROM public.sku
        WHERE barcode = v_item_barcode
        LIMIT 1;
      END IF;

      -- Strategy 2: Lookup via supplier_catalog (supplier_sku or original_name → sku_id)
      IF v_sku_id IS NULL AND v_supplier_id IS NOT NULL THEN
        SELECT sc.sku_id INTO v_sku_id
        FROM public.supplier_catalog sc
        WHERE sc.supplier_id = v_supplier_id
          AND sc.sku_id IS NOT NULL
          AND (
            (sc.supplier_sku IS NOT NULL AND sc.supplier_sku = (v_item->>'supplier_sku'))
            OR (sc.original_name IS NOT NULL AND sc.original_name = v_item_name)
            OR sc.nomenclature_id = v_nom_id
          )
        ORDER BY sc.match_count DESC
        LIMIT 1;
      END IF;

      -- Strategy 3: Lookup by nomenclature_id (fallback — first active SKU)
      IF v_sku_id IS NULL THEN
        SELECT id INTO v_sku_id
        FROM public.sku
        WHERE nomenclature_id = v_nom_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

      -- Strategy 4: Auto-create SKU if still not found
      IF v_sku_id IS NULL THEN
        INSERT INTO public.sku (
          sku_code, nomenclature_id,
          barcode, product_name, brand,
          package_weight
        ) VALUES (
          public.fn_generate_sku_code(),
          v_nom_id,
          NULLIF(v_item_barcode, ''),
          v_item_name,
          v_item_brand,
          v_item_package
        )
        RETURNING id INTO v_sku_id;
        v_sku_auto_count := v_sku_auto_count + 1;
      END IF;

      -- ── 4c. UoM Conversion from supplier_catalog ──
      v_conv_factor := NULL;
      IF v_supplier_id IS NOT NULL THEN
        SELECT sc.conversion_factor
        INTO v_conv_factor
        FROM supplier_catalog sc
        WHERE sc.supplier_id = v_supplier_id
          AND (sc.sku_id = v_sku_id OR sc.nomenclature_id = v_nom_id)
          AND sc.conversion_factor IS NOT NULL
        ORDER BY
          CASE WHEN sc.sku_id = v_sku_id THEN 0 ELSE 1 END,
          sc.match_count DESC
        LIMIT 1;
      END IF;

      -- ── 4d. Calculate converted quantity and unit price ──
      v_raw_qty        := COALESCE((v_item->>'quantity')::NUMERIC, 1);
      v_raw_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
      v_total_price    := COALESCE((v_item->>'total_price')::NUMERIC, 0);

      IF v_conv_factor IS NOT NULL AND v_conv_factor > 0 THEN
        v_final_qty := v_raw_qty * v_conv_factor;
        IF v_final_qty > 0 THEN
          v_final_unit_price := v_total_price / v_final_qty;
        ELSE
          v_final_unit_price := v_raw_unit_price;
        END IF;
      ELSE
        v_final_qty        := v_raw_qty;
        v_final_unit_price := v_raw_unit_price;
      END IF;

      -- ── 4e. INSERT purchase_logs with sku_id ──
      INSERT INTO purchase_logs (
        nomenclature_id, sku_id, supplier_id, quantity, price_per_unit,
        total_price, invoice_date, expense_id, notes
      ) VALUES (
        v_nom_id,
        v_sku_id,
        v_supplier_id,
        v_final_qty,
        v_final_unit_price,
        v_total_price,
        COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
        v_expense_id,
        v_item_name
      );

      -- ── 4f. v10: UPSERT sku_balances (increment quantity on purchase) ──
      IF v_sku_id IS NOT NULL THEN
        INSERT INTO public.sku_balances (sku_id, nomenclature_id, quantity, last_received_at)
        VALUES (v_sku_id, v_nom_id, v_final_qty, now())
        ON CONFLICT (sku_id) DO UPDATE SET
          quantity = sku_balances.quantity + EXCLUDED.quantity,
          last_received_at = now();
      END IF;

      -- ── 4g. v11: INSERT receiving_line for audit trail ──
      INSERT INTO public.receiving_lines (
        receiving_id, nomenclature_id, sku_id,
        qty_expected, qty_received, qty_rejected,
        unit_price_actual
      ) VALUES (
        v_receiving_id, v_nom_id, v_sku_id,
        v_final_qty,    -- qty_expected = qty_received (receipt = truth)
        v_final_qty,
        0,
        v_final_unit_price
      );

      v_food_count := v_food_count + 1;
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
    'ok',              true,
    'expense_id',      v_expense_id,
    'food_count',      v_food_count,
    'capex_count',     COALESCE(jsonb_array_length(p_payload->'capex_items'), 0),
    'opex_count',      COALESCE(jsonb_array_length(p_payload->'opex_items'), 0),
    'auto_created',    v_auto_count,
    'sku_auto_created', v_sku_auto_count,
    'receiving_id',    v_receiving_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.fn_approve_receipt(JSONB)
  IS 'Phase 12: v11 — Adds receiving_records + receiving_lines as audit trail (source=receipt, status=reconciled). All v10 logic preserved: SKU resolution, sku_balances UPSERT, Hub+3Spokes.';
