-- ═══════════════════════════════════════════════════════════════
-- Migration 058: SKU-Aware RPCs + Drop inventory_balances
-- Phase 10: Update all functions to use sku_balances / v_inventory_by_nomenclature
-- ═══════════════════════════════════════════════════════════════
-- DEPENDS ON: 057_sku_layer.sql (sku, sku_balances, v_inventory_by_nomenclature)
--
-- Changes:
--   1. fn_approve_receipt v10: SKU resolution + sku_balances UPSERT
--   2. fn_update_cost_on_purchase v3: read from v_inventory_by_nomenclature
--   3. fn_run_mrp v2: read from v_inventory_by_nomenclature
--   4. fn_predictive_procurement v3: read from v_inventory_by_nomenclature
--   5. DROP inventory_balances (replaced by sku_balances)
-- ═══════════════════════════════════════════════════════════════


-- ─── 1. fn_approve_receipt v10 (SKU-aware) ───

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
    'food_count',      COALESCE(jsonb_array_length(p_payload->'food_items'), 0),
    'capex_count',     COALESCE(jsonb_array_length(p_payload->'capex_items'), 0),
    'opex_count',      COALESCE(jsonb_array_length(p_payload->'opex_items'), 0),
    'auto_created',    v_auto_count,
    'sku_auto_created', v_sku_auto_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.fn_approve_receipt(JSONB)
  IS 'Phase 10: v10 — SKU-aware. Resolves sku_id (barcode→supplier_catalog→nomenclature→auto-create). Writes purchase_logs.sku_id + UPSERTs sku_balances. v9 supplier_catalog SSoT preserved. v8 auto-derive preserved. v7 delivery_fee preserved. v6 UoM preserved. Hub+3Spokes.';


-- ─── 2. fn_update_cost_on_purchase v3 (read from v_inventory_by_nomenclature) ───

CREATE OR REPLACE FUNCTION public.fn_update_cost_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_qty  NUMERIC;
    v_current_cost NUMERIC;
    v_new_wac      NUMERIC;
BEGIN
    -- v3: Read from v_inventory_by_nomenclature instead of inventory_balances
    SELECT
        COALESCE(v.quantity, 0),
        COALESCE(n.cost_per_unit, 0)
    INTO v_current_qty, v_current_cost
    FROM public.nomenclature n
    LEFT JOIN public.v_inventory_by_nomenclature v ON v.nomenclature_id = n.id
    WHERE n.id = NEW.nomenclature_id;

    -- WAC formula (unchanged from v2)
    IF (v_current_qty + NEW.quantity) > 0 THEN
        v_new_wac := (v_current_qty * v_current_cost + NEW.quantity * NEW.price_per_unit)
                     / (v_current_qty + NEW.quantity);
    ELSE
        v_new_wac := NEW.price_per_unit;
    END IF;

    UPDATE public.nomenclature
    SET cost_per_unit = ROUND(v_new_wac, 4),
        updated_at    = now()
    WHERE id = NEW.nomenclature_id;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_update_cost_on_purchase()
  IS 'Phase 10: v3 — WAC from v_inventory_by_nomenclature (was inventory_balances). Calculates Weighted Average Cost on purchase_logs INSERT.';


-- ─── 3. fn_run_mrp v2 (read from v_inventory_by_nomenclature) ───

CREATE OR REPLACE FUNCTION public.fn_run_mrp(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_date DATE;
  v_prep  JSONB;
  v_proc  JSONB;
BEGIN
  -- 0. Validate plan
  SELECT target_date INTO v_target_date
  FROM production_plans WHERE id = p_plan_id;

  IF v_target_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan not found');
  END IF;

  -- 1. Prep requirements (PF + MOD)
  DROP TABLE IF EXISTS _mrp_prep;
  CREATE TEMP TABLE _mrp_prep ON COMMIT DROP AS
  WITH prep_gross AS (
    SELECT
      bs.ingredient_id AS nid,
      SUM(pt.target_qty * bs.quantity_per_unit) AS gross
    FROM plan_targets pt
    JOIN bom_structures bs ON bs.parent_id = pt.nomenclature_id
    JOIN nomenclature n ON n.id = bs.ingredient_id
    WHERE pt.plan_id = p_plan_id
      AND (n.product_code LIKE 'PF-%' OR n.product_code LIKE 'MOD-%')
    GROUP BY bs.ingredient_id
  ),
  prep_stock AS (
    SELECT
      ib.nomenclature_id AS nid,
      COALESCE(SUM(ib.weight), 0) AS avail
    FROM inventory_batches ib
    WHERE ib.status IN ('sealed', 'opened')
      AND (ib.expires_at IS NULL OR ib.expires_at > v_target_date::TIMESTAMPTZ)
      AND ib.nomenclature_id IN (SELECT nid FROM prep_gross)
    GROUP BY ib.nomenclature_id
  )
  SELECT
    g.nid,
    g.gross,
    COALESCE(s.avail, 0) AS on_hand,
    GREATEST(g.gross - COALESCE(s.avail, 0), 0) AS net
  FROM prep_gross g
  LEFT JOIN prep_stock s ON s.nid = g.nid;

  -- 2. RAW requirements (v2: read from v_inventory_by_nomenclature)
  DROP TABLE IF EXISTS _mrp_raw;
  CREATE TEMP TABLE _mrp_raw ON COMMIT DROP AS
  WITH raw_sources AS (
    SELECT
      bs.ingredient_id AS nid,
      SUM(p.net * bs.quantity_per_unit) AS gross
    FROM _mrp_prep p
    JOIN bom_structures bs ON bs.parent_id = p.nid
    JOIN nomenclature n ON n.id = bs.ingredient_id
    WHERE p.net > 0
      AND n.product_code LIKE 'RAW-%'
    GROUP BY bs.ingredient_id

    UNION ALL

    SELECT
      bs.ingredient_id AS nid,
      SUM(pt.target_qty * bs.quantity_per_unit) AS gross
    FROM plan_targets pt
    JOIN bom_structures bs ON bs.parent_id = pt.nomenclature_id
    JOIN nomenclature n ON n.id = bs.ingredient_id
    WHERE pt.plan_id = p_plan_id
      AND n.product_code LIKE 'RAW-%'
    GROUP BY bs.ingredient_id
  ),
  raw_agg AS (
    SELECT nid, SUM(gross) AS gross
    FROM raw_sources
    GROUP BY nid
  ),
  raw_stock AS (
    -- v2: Changed from inventory_balances to v_inventory_by_nomenclature
    SELECT
      v.nomenclature_id AS nid,
      COALESCE(v.quantity, 0) AS avail
    FROM v_inventory_by_nomenclature v
    WHERE v.nomenclature_id IN (SELECT nid FROM raw_agg)
  )
  SELECT
    a.nid,
    a.gross,
    COALESCE(s.avail, 0) AS on_hand,
    GREATEST(a.gross - COALESCE(s.avail, 0), 0) AS net
  FROM raw_agg a
  LEFT JOIN raw_stock s ON s.nid = a.nid;

  -- 3. Build prep_schedule JSON
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'nomenclature_id', p.nid,
    'product_code',    n.product_code,
    'name',            n.name,
    'gross_qty',       ROUND(p.gross, 3),
    'on_hand',         ROUND(p.on_hand, 3),
    'net_qty',         ROUND(p.net, 3),
    'base_unit',       n.base_unit
  ) ORDER BY n.product_code), '[]'::jsonb)
  INTO v_prep
  FROM _mrp_prep p
  JOIN nomenclature n ON n.id = p.nid
  WHERE p.net > 0;

  -- 4. Build procurement_list JSON
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'nomenclature_id', r.nid,
    'product_code',    n.product_code,
    'name',            n.name,
    'gross_qty',       ROUND(r.gross, 3),
    'on_hand',         ROUND(r.on_hand, 3),
    'net_qty',         ROUND(r.net, 3),
    'base_unit',       n.base_unit,
    'cost_per_unit',   COALESCE(n.cost_per_unit, 0),
    'estimated_cost',  ROUND(r.net * COALESCE(n.cost_per_unit, 0), 2)
  ) ORDER BY n.product_code), '[]'::jsonb)
  INTO v_proc
  FROM _mrp_raw r
  JOIN nomenclature n ON n.id = r.nid
  WHERE r.net > 0;

  -- 5. Cache results
  UPDATE production_plans
  SET mrp_result = jsonb_build_object(
    'prep_schedule',    v_prep,
    'procurement_list', v_proc,
    'calculated_at',    now()
  )
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',          true,
    'prep_schedule',    v_prep,
    'procurement_list', v_proc
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.fn_run_mrp(UUID)
  IS 'Phase 10: v2 — MRP reads RAW inventory from v_inventory_by_nomenclature (was inventory_balances). PF/MOD still from inventory_batches.';


-- ─── 4. fn_predictive_procurement v3 (read from v_inventory_by_nomenclature) ───

CREATE OR REPLACE FUNCTION public.fn_predictive_procurement(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_name    TEXT;
  v_target       RECORD;
  v_all_items    JSONB := '[]'::jsonb;
  v_target_items JSONB;
BEGIN
  SELECT name INTO v_plan_name
  FROM public.production_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Plan not found');
  END IF;

  FOR v_target IN
    SELECT pt.nomenclature_id, pt.target_qty, n.product_code, n.name
    FROM public.plan_targets pt
    JOIN public.nomenclature n ON n.id = pt.nomenclature_id
    WHERE pt.plan_id = p_plan_id
  LOOP
    WITH RECURSIVE bom_tree AS (
      SELECT
        bs.ingredient_id,
        bs.quantity_per_unit * v_target.target_qty AS needed_qty,
        1 AS depth
      FROM public.bom_structures bs
      WHERE bs.parent_id = v_target.nomenclature_id

      UNION ALL

      SELECT
        bs2.ingredient_id,
        bt.needed_qty * bs2.quantity_per_unit AS needed_qty,
        bt.depth + 1
      FROM bom_tree bt
      JOIN public.bom_structures bs2 ON bs2.parent_id = bt.ingredient_id
      WHERE bt.depth < 10
    ),
    leaf_ingredients AS (
      SELECT
        bt.ingredient_id,
        SUM(bt.needed_qty) AS total_needed
      FROM bom_tree bt
      WHERE NOT EXISTS (
        SELECT 1 FROM public.bom_structures bs3
        WHERE bs3.parent_id = bt.ingredient_id
      )
      GROUP BY bt.ingredient_id
    )
    -- v3: Changed from inventory_balances to v_inventory_by_nomenclature
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'nomenclature_id', li.ingredient_id,
      'product_code', n.product_code,
      'name', n.name,
      'unit', COALESCE(n.base_unit, 'kg'),
      'needed', ROUND(li.total_needed, 4),
      'on_hand', ROUND(COALESCE(v.quantity, 0), 4),
      'shortage', ROUND(GREATEST(li.total_needed - COALESCE(v.quantity, 0), 0), 4),
      'source_product', v_target.name,
      'source_qty', v_target.target_qty
    )), '[]'::jsonb)
    INTO v_target_items
    FROM leaf_ingredients li
    JOIN public.nomenclature n ON n.id = li.ingredient_id
    LEFT JOIN public.v_inventory_by_nomenclature v ON v.nomenclature_id = li.ingredient_id;

    v_all_items := v_all_items || v_target_items;
  END LOOP;

  -- Deduplicate
  RETURN jsonb_build_object(
    'ok', true,
    'plan_id', p_plan_id,
    'plan_name', v_plan_name,
    'items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nomenclature_id', sub.ingredient_id,
        'product_code', sub.product_code,
        'name', sub.ingredient_name,
        'unit', sub.unit,
        'needed', ROUND(sub.total_needed, 4),
        'on_hand', ROUND(sub.on_hand, 4),
        'shortage', ROUND(GREATEST(sub.total_needed - sub.on_hand, 0), 4)
      ) ORDER BY GREATEST(sub.total_needed - sub.on_hand, 0) DESC), '[]'::jsonb)
      FROM (
        SELECT
          (elem->>'nomenclature_id')::UUID AS ingredient_id,
          elem->>'product_code' AS product_code,
          elem->>'name' AS ingredient_name,
          elem->>'unit' AS unit,
          SUM((elem->>'needed')::NUMERIC) AS total_needed,
          MAX((elem->>'on_hand')::NUMERIC) AS on_hand
        FROM jsonb_array_elements(v_all_items) AS elem
        GROUP BY (elem->>'nomenclature_id')::UUID, elem->>'product_code', elem->>'name', elem->>'unit'
      ) sub
    )
  );
END;
$$;

COMMENT ON FUNCTION public.fn_predictive_procurement(UUID)
  IS 'Phase 10: v3 — reads from v_inventory_by_nomenclature (was inventory_balances). Multi-target BOM walk from plan_targets.';


-- ─── 5. DROP inventory_balances ───
-- All RPCs now read from v_inventory_by_nomenclature (aggregation of sku_balances).
-- Frontend useInventory.ts will be updated to use sku_balances directly.

DROP TABLE IF EXISTS public.inventory_balances CASCADE;
