-- ============================================================
-- Migration 158 — supplier tax_id smart match (RECONSTRUCTED)
-- ============================================================
-- RECONSTRUCTED 2026-05-04 from prod schema (pg_dump output).
-- Original applied 2026-04-24 by claude-code; the file was never
-- committed. This is a pure transcription — zero logic edits —
-- so future fn_approve_receipt changes have the v15 context
-- (tax_id → supplier_aliases → name ILIKE → auto-create lookup
-- chain) visible in git history.
--
-- Changes:
--   1. suppliers.tax_id (TEXT, nullable) — Thai taxpayer ID
--   2. idx_suppliers_tax_id — UNIQUE, partial (tax_id NOT NULL AND NOT is_deleted)
--   3. fn_approve_receipt v15 — adds tax_id matching as primary supplier resolver
--
-- Already applied to prod. ALTER/INDEX use IF NOT EXISTS;
-- function uses CREATE OR REPLACE; self-register uses ON CONFLICT
-- DO NOTHING — so re-application is idempotent.
-- See MC 2a11f374, parent triage bea94c9d (done).
-- ============================================================

-- 1. Add tax_id column to suppliers
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS tax_id TEXT;

COMMENT ON COLUMN public.suppliers.tax_id
  IS 'Thai taxpayer ID (เลขประจำตัวผู้เสียภาษี), 13 digits. Unique identifier printed on every tax invoice. Primary key for supplier matching.';

-- 2. Unique partial index — tax_id must be unique among non-deleted suppliers
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_tax_id
  ON public.suppliers USING btree (tax_id)
  WHERE tax_id IS NOT NULL AND is_deleted = false;

-- 3. fn_approve_receipt v15 — adds tax_id smart match
CREATE OR REPLACE FUNCTION public.fn_approve_receipt(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_expense_id        UUID;
  v_supplier_id       UUID;
  v_supplier_name     TEXT;
  v_supplier_tax_id   TEXT;
  v_category_code     INTEGER;
  v_sub_category_code INTEGER;
  v_item              JSONB;
  v_nom_id            UUID;
  v_sku_id            UUID;
  v_item_name         TEXT;
  v_item_unit         TEXT;
  v_auto_count        INTEGER := 0;
  v_sku_auto_count    INTEGER := 0;
  v_conv_factor       NUMERIC;
  v_raw_qty           NUMERIC;
  v_final_qty         NUMERIC;
  v_raw_unit_price    NUMERIC;
  v_final_unit_price  NUMERIC;
  v_total_price       NUMERIC;
  v_auto_fin_sub      INTEGER;
  v_item_barcode      TEXT;
  v_item_brand        TEXT;
  v_item_package      TEXT;
  v_receiving_id      UUID;
  v_food_count        INTEGER := 0;
  v_sc_id             UUID;
  v_sc_count          INTEGER := 0;
  v_match_confidence  NUMERIC;
  v_unmatched_count   INTEGER := 0;
  v_fuzzy_nom_id      UUID;
  v_fuzzy_sim         NUMERIC;
BEGIN
  -- ── 1. Resolve supplier (v15: tax_id → alias → name → auto-create) ──

  -- 1a. Explicit supplier_id from payload (manual override)
  IF p_payload->>'supplier_id' IS NOT NULL AND p_payload->>'supplier_id' <> '' THEN
    v_supplier_id := (p_payload->>'supplier_id')::UUID;
  END IF;

  v_supplier_name   := p_payload->>'supplier_name';
  v_supplier_tax_id := NULLIF(TRIM(p_payload->>'supplier_tax_id'), '');

  IF v_supplier_id IS NULL THEN
    -- 1b. Match by tax_id (most reliable — unique per company)
    IF v_supplier_tax_id IS NOT NULL THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE tax_id = v_supplier_tax_id
        AND is_deleted = false
      LIMIT 1;
    END IF;

    -- 1c. Match by supplier_aliases (learned variations)
    IF v_supplier_id IS NULL AND v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
      SELECT sa.supplier_id INTO v_supplier_id
      FROM public.supplier_aliases sa
      JOIN public.suppliers s ON s.id = sa.supplier_id AND s.is_deleted = false
      WHERE LOWER(sa.alias) = LOWER(v_supplier_name)
      LIMIT 1;
    END IF;

    -- 1d. Match by name ILIKE (original behavior)
    IF v_supplier_id IS NULL AND v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
      SELECT id INTO v_supplier_id
      FROM public.suppliers
      WHERE name ILIKE v_supplier_name
        AND is_deleted = false
      LIMIT 1;
    END IF;

    -- 1e. Auto-create new supplier (with tax_id if available)
    IF v_supplier_id IS NULL AND v_supplier_name IS NOT NULL AND v_supplier_name <> '' THEN
      INSERT INTO public.suppliers (name, category_code, tax_id)
      VALUES (v_supplier_name, 2000, v_supplier_tax_id)
      RETURNING id INTO v_supplier_id;
    END IF;

    -- 1f. Backfill tax_id on existing supplier if we matched but tax_id was missing
    IF v_supplier_id IS NOT NULL AND v_supplier_tax_id IS NOT NULL THEN
      UPDATE public.suppliers
      SET tax_id = v_supplier_tax_id, updated_at = now()
      WHERE id = v_supplier_id
        AND tax_id IS NULL;
    END IF;
  END IF;

  -- ── 2. Resolve category ──
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
    receipt_supplier_url, receipt_bank_url, tax_invoice_url,
    raw_parse
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
    p_payload->>'tax_invoice_url',
    p_payload->'raw_parse'
  )
  RETURNING id INTO v_expense_id;

  -- ── Create receiving_records ──
  INSERT INTO public.receiving_records (
    source, expense_id, received_by, notes, status
  ) VALUES (
    'receipt', v_expense_id, auth.uid(), 'Auto-created from receipt approval', 'reconciled'
  )
  RETURNING id INTO v_receiving_id;

  -- ── 4. INSERT food_items → purchase_logs ──
  IF p_payload->'food_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'food_items') > 0 THEN

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
      v_nom_id           := NULL;
      v_sku_id           := NULL;
      v_match_confidence := NULL;
      v_fuzzy_nom_id     := NULL;
      v_fuzzy_sim        := NULL;
      v_item_name := COALESCE(v_item->>'name', 'Unknown item');
      v_item_unit := COALESCE(v_item->>'unit', 'pcs');
      v_item_barcode := v_item->>'barcode';
      v_item_brand   := v_item->>'brand';
      v_item_package := v_item->>'package_weight';

      -- ── 4a. Resolve nomenclature_id (if provided in payload) ──
      IF v_item->>'nomenclature_id' IS NOT NULL
         AND v_item->>'nomenclature_id' <> ''
         AND v_item->>'nomenclature_id' <> '__NEW__' THEN
        v_nom_id := (v_item->>'nomenclature_id')::UUID;
        v_match_confidence := 1.0;
      END IF;

      -- ── 3-LEVEL SMART MATCHING ──

      IF v_nom_id IS NULL THEN
        -- Level 1: BARCODE MATCH via supplier_catalog
        IF v_item_barcode IS NOT NULL AND v_item_barcode <> '' THEN
          SELECT sc.nomenclature_id INTO v_nom_id
          FROM public.supplier_catalog sc
          WHERE sc.barcode = v_item_barcode
            AND sc.nomenclature_id IS NOT NULL
          ORDER BY sc.match_count DESC NULLS LAST
          LIMIT 1;

          IF v_nom_id IS NOT NULL THEN
            v_match_confidence := 0.99;
          END IF;
        END IF;
      END IF;

      IF v_nom_id IS NULL THEN
        -- Also try SKU table directly by barcode
        IF v_item_barcode IS NOT NULL AND v_item_barcode <> '' THEN
          SELECT s.nomenclature_id INTO v_nom_id
          FROM public.sku s
          WHERE s.barcode = v_item_barcode
            AND s.nomenclature_id IS NOT NULL
          LIMIT 1;

          IF v_nom_id IS NOT NULL THEN
            v_match_confidence := 0.99;
          END IF;
        END IF;
      END IF;

      IF v_nom_id IS NULL AND v_supplier_id IS NOT NULL THEN
        -- Level 2: CATALOG LEARNING — original_name match
        SELECT sc.nomenclature_id, sc.match_count
        INTO v_nom_id, v_match_confidence
        FROM public.supplier_catalog sc
        WHERE sc.supplier_id = v_supplier_id
          AND sc.original_name IS NOT NULL
          AND sc.original_name = v_item_name
          AND sc.nomenclature_id IS NOT NULL
        ORDER BY sc.match_count DESC NULLS LAST
        LIMIT 1;

        IF v_nom_id IS NOT NULL THEN
          IF v_match_confidence >= 2 THEN
            v_match_confidence := 0.90;
          ELSE
            v_match_confidence := 0.70;
          END IF;
        END IF;
      END IF;

      IF v_nom_id IS NULL THEN
        -- Level 3: FUZZY TEXT via pg_trgm
        SELECT n.id, similarity(lower(n.name), lower(v_item_name))
        INTO v_fuzzy_nom_id, v_fuzzy_sim
        FROM public.nomenclature n
        WHERE n.is_available = true
          AND n.product_code LIKE 'RAW-%%'
          AND n.product_code NOT LIKE 'RAW-AUTO-%%'
          AND similarity(lower(n.name), lower(v_item_name)) > 0.4
        ORDER BY similarity(lower(n.name), lower(v_item_name)) DESC
        LIMIT 1;

        IF v_fuzzy_nom_id IS NOT NULL AND v_fuzzy_sim > 0.6 THEN
          v_nom_id := v_fuzzy_nom_id;
          v_match_confidence := v_fuzzy_sim;
        END IF;
      END IF;

      -- ── FALLBACK: Insert into unmatched_items queue ──
      IF v_nom_id IS NULL THEN
        INSERT INTO public.unmatched_items (
          expense_id, raw_text, barcode, supplier_id,
          suggested_match, confidence
        ) VALUES (
          v_expense_id, v_item_name, NULLIF(v_item_barcode, ''),
          v_supplier_id, v_fuzzy_nom_id, COALESCE(v_fuzzy_sim, 0)
        );
        v_unmatched_count := v_unmatched_count + 1;

        -- v14: Still create supplier_catalog entry for unmatched items
        IF v_supplier_id IS NOT NULL AND v_item_barcode IS NOT NULL AND v_item_barcode <> '' THEN
          SELECT id INTO v_sc_id
          FROM public.supplier_catalog
          WHERE supplier_id = v_supplier_id
            AND barcode = v_item_barcode
          LIMIT 1;

          IF v_sc_id IS NULL THEN
            INSERT INTO public.supplier_catalog (
              supplier_id, nomenclature_id, sku_id,
              supplier_sku, original_name, barcode,
              product_name, brand, package_weight,
              last_seen_price, match_count, source
            ) VALUES (
              v_supplier_id, NULL, NULL,
              NULLIF(v_item->>'supplier_sku', ''),
              v_item_name,
              v_item_barcode,
              v_item_name,
              v_item_brand,
              v_item_package,
              COALESCE((v_item->>'unit_price')::NUMERIC, 0),
              1,
              'receipt-unmatched'
            );
          ELSE
            UPDATE public.supplier_catalog SET
              match_count = COALESCE(match_count, 0) + 1,
              last_seen_price = COALESCE((v_item->>'unit_price')::NUMERIC, 0),
              updated_at = now()
            WHERE id = v_sc_id;
          END IF;
        END IF;

        CONTINUE;  -- skip purchase_logs/sku for this item
      END IF;

      -- ── Log low-confidence matches for review ──
      IF v_match_confidence IS NOT NULL AND v_match_confidence < 0.85 THEN
        INSERT INTO public.unmatched_items (
          expense_id, raw_text, barcode, supplier_id,
          suggested_match, confidence,
          resolved_to, resolved_at
        ) VALUES (
          v_expense_id, v_item_name, NULLIF(v_item_barcode, ''),
          v_supplier_id, v_nom_id, v_match_confidence,
          v_nom_id, now()
        );
      END IF;

      -- ── 4b. Resolve SKU ──
      IF v_item_barcode IS NOT NULL AND v_item_barcode <> '' THEN
        SELECT id INTO v_sku_id
        FROM public.sku
        WHERE barcode = v_item_barcode
        LIMIT 1;
      END IF;

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

      IF v_sku_id IS NULL THEN
        SELECT id INTO v_sku_id
        FROM public.sku
        WHERE nomenclature_id = v_nom_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
      END IF;

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

      IF v_item_barcode IS NOT NULL AND v_item_barcode <> '' THEN
        UPDATE public.sku
        SET barcode = v_item_barcode
        WHERE id = v_sku_id
          AND barcode IS NULL;
      END IF;

      -- ── 4c. UoM Conversion ──
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

      -- ── 4d. Calculate converted quantity ──
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

      -- ── 4e. INSERT purchase_logs ──
      INSERT INTO purchase_logs (
        nomenclature_id, sku_id, supplier_id, quantity, price_per_unit,
        total_price, invoice_date, expense_id, notes, barcode
      ) VALUES (
        v_nom_id,
        v_sku_id,
        v_supplier_id,
        v_final_qty,
        v_final_unit_price,
        v_total_price,
        COALESCE((p_payload->>'transaction_date')::DATE, CURRENT_DATE),
        v_expense_id,
        v_item_name,
        NULLIF(v_item_barcode, '')
      );

      -- ── 4f. UPSERT sku_balances ──
      IF v_sku_id IS NOT NULL THEN
        INSERT INTO public.sku_balances (sku_id, nomenclature_id, quantity, last_received_at)
        VALUES (v_sku_id, v_nom_id, v_final_qty, now())
        ON CONFLICT (sku_id) DO UPDATE SET
          quantity = sku_balances.quantity + EXCLUDED.quantity,
          last_received_at = now();
      END IF;

      -- ── 4g. UPSERT supplier_catalog (learning loop) ──
      IF v_supplier_id IS NOT NULL THEN
        v_sc_id := NULL;

        SELECT id INTO v_sc_id
        FROM public.supplier_catalog
        WHERE supplier_id = v_supplier_id
          AND (
            (barcode IS NOT NULL AND v_item_barcode IS NOT NULL AND barcode = v_item_barcode)
            OR (sku_id IS NOT NULL AND sku_id = v_sku_id)
            OR (original_name IS NOT NULL AND original_name = v_item_name)
          )
        ORDER BY
          CASE
            WHEN barcode IS NOT NULL AND v_item_barcode IS NOT NULL AND barcode = v_item_barcode THEN 0
            WHEN sku_id IS NOT NULL AND sku_id = v_sku_id THEN 1
            ELSE 2
          END
        LIMIT 1;

        IF v_sc_id IS NOT NULL THEN
          UPDATE public.supplier_catalog SET
            match_count     = COALESCE(match_count, 0) + 1,
            last_seen_price = v_raw_unit_price,
            sku_id          = COALESCE(supplier_catalog.sku_id, v_sku_id),
            nomenclature_id = COALESCE(supplier_catalog.nomenclature_id, v_nom_id),
            barcode         = COALESCE(supplier_catalog.barcode, NULLIF(v_item_barcode, '')),
            brand           = COALESCE(supplier_catalog.brand, v_item_brand),
            package_weight  = COALESCE(supplier_catalog.package_weight, v_item_package),
            updated_at      = now()
          WHERE id = v_sc_id;
        ELSE
          INSERT INTO public.supplier_catalog (
            supplier_id, nomenclature_id, sku_id,
            supplier_sku, original_name, barcode,
            product_name, brand, package_weight,
            last_seen_price, match_count, source
          ) VALUES (
            v_supplier_id, v_nom_id, v_sku_id,
            NULLIF(v_item->>'supplier_sku', ''),
            v_item_name,
            NULLIF(v_item_barcode, ''),
            v_item_name,
            v_item_brand,
            v_item_package,
            v_raw_unit_price,
            1,
            'receipt'
          );
        END IF;

        v_sc_count := v_sc_count + 1;
      END IF;

      -- ── 4h. INSERT receiving_line ──
      INSERT INTO public.receiving_lines (
        receiving_id, nomenclature_id, sku_id,
        qty_expected, qty_received, qty_rejected,
        unit_price_actual
      ) VALUES (
        v_receiving_id, v_nom_id, v_sku_id,
        v_final_qty,
        v_final_qty,
        0,
        v_final_unit_price
      );

      v_food_count := v_food_count + 1;
    END LOOP;
  END IF;

  -- ── 5. INSERT capex_items → capex_transactions ──
  IF p_payload->'capex_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'capex_items') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'capex_items')
    LOOP
      INSERT INTO capex_transactions (
        transaction_id, asset_id, amount_thb, transaction_date, transaction_type,
        category_code, vendor, details, expense_id
      ) VALUES (
        'RCV-' || substr(gen_random_uuid()::TEXT, 1, 8),
        (v_item->>'asset_id')::UUID,
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

  -- ── 6. INSERT opex_items ──
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
    'ok',                        true,
    'expense_id',                v_expense_id,
    'food_count',                v_food_count,
    'capex_count',               COALESCE(jsonb_array_length(p_payload->'capex_items'), 0),
    'opex_count',                COALESCE(jsonb_array_length(p_payload->'opex_items'), 0),
    'auto_created',              0,
    'sku_auto_created',          v_sku_auto_count,
    'supplier_catalog_updated',  v_sc_count,
    'receiving_id',              v_receiving_id,
    'unmatched_count',           v_unmatched_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- ── Self-register ──
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '158_supplier_tax_id_smart_match.sql',
  'claude-code',
  NULL,
  'Reconstructed from prod schema 2026-05-04 (MC 2a11f374). Original applied 2026-04-24.'
) ON CONFLICT (filename) DO NOTHING;
