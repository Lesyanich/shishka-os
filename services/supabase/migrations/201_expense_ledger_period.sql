-- 201_expense_ledger_period.sql
--
-- Add period_start / period_end to expense_ledger so a single payment row can
-- carry the months it covers. Cash basis = transaction_date (when paid);
-- accrual basis = period (which months the expense actually relates to).
--
-- Driver: 2026-05-14 Lesia paid 60,000 THB to Central Food Retail Co., Ltd.
-- covering L-2 TOPS rent for Feb+Mar+Apr 2026. With one row at transaction_date
-- 2026-05-14, "This Month" view shows the cash outflow; with period columns
-- populated, future P&L queries can allocate 20k each to Feb/Mar/Apr.
--
-- MC task: 00cf8d54.

BEGIN;

ALTER TABLE public.expense_ledger
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end   DATE;

COMMENT ON COLUMN public.expense_ledger.period_start IS
  'For accrual: first day of the period this expense covers. NULL for one-shot purchases. Required for rent / utilities / subscriptions / insurance.';
COMMENT ON COLUMN public.expense_ledger.period_end IS
  'For accrual: last day of the period this expense covers (inclusive). NULL if same as period_start (single-month) or one-shot purchase.';

-- Useful range constraint
ALTER TABLE public.expense_ledger
  DROP CONSTRAINT IF EXISTS expense_ledger_period_chk,
  ADD  CONSTRAINT          expense_ledger_period_chk
    CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start);

-- Index for accrual P&L queries
CREATE INDEX IF NOT EXISTS expense_ledger_period_start_idx
  ON public.expense_ledger (period_start) WHERE period_start IS NOT NULL;

-- Extend fn_approve_receipt (v10) — accept period_start / period_end.
-- Only the INSERT block changes; everything else is preserved verbatim from v9.
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
  v_conv_factor       NUMERIC;
  v_raw_qty           NUMERIC;
  v_final_qty         NUMERIC;
  v_raw_unit_price    NUMERIC;
  v_final_unit_price  NUMERIC;
  v_total_price       NUMERIC;
  v_auto_fin_sub      INTEGER;
BEGIN
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

  -- v10: include period_start, period_end
  INSERT INTO expense_ledger (
    transaction_date, flow_type, category_code, sub_category_code,
    supplier_id, details, comments, invoice_number,
    amount_original, currency, exchange_rate,
    discount_total, vat_amount, delivery_fee,
    paid_by, payment_method, status, has_tax_invoice,
    receipt_supplier_url, receipt_bank_url, tax_invoice_url,
    period_start, period_end
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
    NULLIF(p_payload->>'period_start', '')::DATE,
    NULLIF(p_payload->>'period_end', '')::DATE
  )
  RETURNING id INTO v_expense_id;

  -- Spokes (food_items, capex_items, opex_items) — unchanged from v9
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
      v_nom_id    := NULL;
      v_item_name := COALESCE(v_item->>'name', 'Unknown item');
      v_item_unit := COALESCE(v_item->>'unit', 'pcs');

      IF v_item->>'nomenclature_id' IS NOT NULL
         AND v_item->>'nomenclature_id' <> ''
         AND v_item->>'nomenclature_id' <> '__NEW__' THEN
        v_nom_id := (v_item->>'nomenclature_id')::UUID;
      END IF;

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

      v_conv_factor := NULL;
      IF v_supplier_id IS NOT NULL THEN
        SELECT sc.conversion_factor
        INTO v_conv_factor
        FROM supplier_catalog sc
        WHERE sc.supplier_id = v_supplier_id
          AND sc.nomenclature_id = v_nom_id
          AND sc.conversion_factor IS NOT NULL
        ORDER BY sc.match_count DESC
        LIMIT 1;
      END IF;

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
  IS 'v10 — adds period_start / period_end passthrough for rent/utilities/subscriptions accrual. v9 supplier_catalog SSoT preserved. v8 auto-derive preserved. v7 delivery_fee preserved. v6 UoM preserved. Hub+3Spokes.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '201_expense_ledger_period.sql',
  'claude-opus-session-361c0f7d',
  'Add period_start / period_end to expense_ledger + fn_approve_receipt v10. Driver MC 00cf8d54 (TOPS rent Feb-Apr 2026, paid 2026-05-14 via director''s loan from Lesia).'
);

COMMIT;
