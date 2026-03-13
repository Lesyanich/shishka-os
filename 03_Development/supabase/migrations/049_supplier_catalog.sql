-- ═══════════════════════════════════════════════════════════════
-- Migration 049: Unified Supplier Catalog (SSoT Merge)
-- Phase 7.1: DB Architecture Audit — Issue #2 (Procurement SSoT)
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM: Two tables map supplier→nomenclature with overlapping data:
--   supplier_item_mapping (035+039): receipt mapping, UoM conversion
--   supplier_products     (042+043+046): verified catalog, pricing, packaging
--   Both have supplier_id + nomenclature_id. Risk of desync.
--
-- SOLUTION: Merge into supplier_catalog. Create backward-compat views
--           so existing frontend code (useSupplierMapping.ts) and RPCs
--           continue working without immediate changes.
--
-- fn_approve_receipt v9: queries supplier_catalog instead of SIM.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. CREATE supplier_catalog ───

CREATE TABLE IF NOT EXISTS public.supplier_catalog (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  nomenclature_id   UUID REFERENCES public.nomenclature(id) ON DELETE CASCADE,

  -- From supplier_item_mapping (receipt mapping engine, migrations 035+039)
  supplier_sku      TEXT,
  original_name     TEXT,
  match_count       INT NOT NULL DEFAULT 0,
  purchase_unit     TEXT,
  conversion_factor NUMERIC,
  base_unit         TEXT,

  -- From supplier_products (verified catalog, migrations 042+043+046)
  barcode           TEXT,
  product_name      TEXT,
  product_name_th   TEXT,
  brand             TEXT,
  brand_id          UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  full_title        TEXT,
  package_weight    TEXT,
  package_qty       NUMERIC,
  package_unit      TEXT,
  package_type      TEXT,
  category_code     INTEGER REFERENCES public.fin_categories(code),
  sub_category_code INTEGER REFERENCES public.fin_sub_categories(sub_code),
  last_seen_price   NUMERIC,
  source            TEXT DEFAULT 'manual',
  verified_at       TIMESTAMPTZ,

  -- Common
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supplier_catalog
  IS 'Unified supplier product catalog (Phase 7.1 SSoT merge). Combines receipt mapping (match_count, UoM conversion) with verified product info (barcode, pricing, packaging). Single source of truth for procurement.';

-- ─── 2. Indexes ───

-- Receipt mapping engine lookups (SKU or name per supplier)
CREATE INDEX idx_sc_sku ON public.supplier_catalog(supplier_id, supplier_sku)
  WHERE supplier_sku IS NOT NULL;
CREATE INDEX idx_sc_name ON public.supplier_catalog(supplier_id, original_name)
  WHERE original_name IS NOT NULL;

-- Product catalog lookups (barcode)
CREATE UNIQUE INDEX idx_sc_supplier_barcode ON public.supplier_catalog(supplier_id, barcode)
  WHERE barcode IS NOT NULL;
CREATE INDEX idx_sc_barcode ON public.supplier_catalog(barcode)
  WHERE barcode IS NOT NULL;

-- Nomenclature joins
CREATE INDEX idx_sc_nom ON public.supplier_catalog(nomenclature_id)
  WHERE nomenclature_id IS NOT NULL;

-- ─── 3. RLS ───

ALTER TABLE public.supplier_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sc_select" ON public.supplier_catalog FOR SELECT USING (true);
CREATE POLICY "sc_insert" ON public.supplier_catalog FOR INSERT WITH CHECK (true);
CREATE POLICY "sc_update" ON public.supplier_catalog FOR UPDATE USING (true);

-- ─── 4. updated_at trigger (reuse fn_set_updated_at from migration 035) ───

CREATE TRIGGER trg_sc_updated_at
  BEFORE UPDATE ON public.supplier_catalog
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─── 5. Realtime ───

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_catalog;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 6. Migrate data from supplier_item_mapping ───
-- These are receipt-mapping records. nomenclature_id is always NOT NULL.
-- NOTE: purchase_unit, conversion_factor, base_unit may not exist if migration 039
-- was not applied. Use DO block with EXCEPTION handler for safety.

DO $$
BEGIN
  -- Try with UoM columns (added by migration 039)
  INSERT INTO public.supplier_catalog (
    supplier_id, nomenclature_id,
    supplier_sku, original_name, match_count,
    purchase_unit, conversion_factor, base_unit,
    created_at, updated_at
  )
  SELECT
    sim.supplier_id, sim.nomenclature_id,
    sim.supplier_sku, sim.original_name, COALESCE(sim.match_count, 1),
    sim.purchase_unit, sim.conversion_factor, sim.base_unit,
    sim.created_at, sim.updated_at
  FROM public.supplier_item_mapping sim;
EXCEPTION WHEN undefined_column THEN
  -- Fallback: UoM columns don't exist, insert without them
  INSERT INTO public.supplier_catalog (
    supplier_id, nomenclature_id,
    supplier_sku, original_name, match_count,
    created_at, updated_at
  )
  SELECT
    sim.supplier_id, sim.nomenclature_id,
    sim.supplier_sku, sim.original_name, COALESCE(sim.match_count, 1),
    sim.created_at, sim.updated_at
  FROM public.supplier_item_mapping sim;
END $$;

-- ─── 7. Migrate data from supplier_products ───
-- Verified catalog records. May or may not have nomenclature_id.
-- Strategy: merge into existing rows where supplier_id+nomenclature_id match,
-- otherwise insert new rows.

-- 7a. Update existing rows (matched by supplier_id + nomenclature_id)
UPDATE public.supplier_catalog sc
SET
  barcode           = COALESCE(sc.barcode, sp.barcode),
  product_name      = COALESCE(sc.product_name, sp.product_name),
  product_name_th   = COALESCE(sc.product_name_th, sp.product_name_th),
  brand             = COALESCE(sc.brand, sp.brand),
  brand_id          = COALESCE(sc.brand_id, sp.brand_id),
  full_title        = COALESCE(sc.full_title, sp.full_title),
  package_weight    = COALESCE(sc.package_weight, sp.package_weight),
  package_qty       = COALESCE(sc.package_qty, sp.package_qty),
  package_unit      = COALESCE(sc.package_unit, sp.package_unit),
  package_type      = COALESCE(sc.package_type, sp.package_type),
  category_code     = COALESCE(sc.category_code, sp.category_code),
  sub_category_code = COALESCE(sc.sub_category_code, sp.sub_category_code),
  last_seen_price   = COALESCE(sp.last_seen_price, sc.last_seen_price),
  source            = COALESCE(sp.source, sc.source),
  verified_at       = COALESCE(sp.verified_at, sc.verified_at),
  updated_at        = now()
FROM public.supplier_products sp
WHERE sp.supplier_id = sc.supplier_id
  AND sp.nomenclature_id IS NOT NULL
  AND sp.nomenclature_id = sc.nomenclature_id;

-- 7b. Insert rows from supplier_products that had no match in supplier_catalog
INSERT INTO public.supplier_catalog (
  supplier_id, nomenclature_id,
  barcode, product_name, product_name_th,
  brand, brand_id, full_title,
  package_weight, package_qty, package_unit, package_type,
  category_code, sub_category_code,
  last_seen_price, source, verified_at,
  created_at, updated_at
)
SELECT
  sp.supplier_id, sp.nomenclature_id,
  sp.barcode, sp.product_name, sp.product_name_th,
  sp.brand, sp.brand_id, sp.full_title,
  sp.package_weight, sp.package_qty, sp.package_unit, sp.package_type,
  sp.category_code, sp.sub_category_code,
  sp.last_seen_price, sp.source, sp.verified_at,
  sp.created_at, sp.updated_at
FROM public.supplier_products sp
WHERE NOT EXISTS (
  SELECT 1 FROM public.supplier_catalog sc
  WHERE sc.supplier_id = sp.supplier_id
    AND (
      (sp.nomenclature_id IS NOT NULL AND sc.nomenclature_id = sp.nomenclature_id)
      OR (sp.barcode IS NOT NULL AND sc.barcode = sp.barcode AND sc.supplier_id = sp.supplier_id)
    )
);

-- ─── 8. DROP old tables → CREATE backward-compat views ───

-- 8a. Drop triggers on old tables
DROP TRIGGER IF EXISTS trg_sim_updated_at ON public.supplier_item_mapping;
DROP TRIGGER IF EXISTS trg_sp_updated_at ON public.supplier_products;

-- 8b. Remove from Realtime publication (ignore errors if not in publication)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.supplier_item_mapping;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.supplier_products;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- 8c. Drop old tables (CASCADE drops RLS policies, indexes, constraints)
DROP TABLE IF EXISTS public.supplier_item_mapping CASCADE;
DROP TABLE IF EXISTS public.supplier_products CASCADE;

-- 8d. Create backward-compat views (same column set as original tables)
CREATE OR REPLACE VIEW public.supplier_item_mapping AS
SELECT
  id,
  supplier_id,
  supplier_sku,
  original_name,
  nomenclature_id,
  match_count,
  purchase_unit,
  conversion_factor,
  base_unit,
  created_at,
  updated_at
FROM public.supplier_catalog
WHERE nomenclature_id IS NOT NULL;

COMMENT ON VIEW public.supplier_item_mapping
  IS 'DEPRECATED backward-compat view over supplier_catalog. Phase 7.1. Use supplier_catalog directly. Will be removed in Phase 8.';

CREATE OR REPLACE VIEW public.supplier_products AS
SELECT
  id,
  supplier_id,
  barcode,
  product_name,
  product_name_th,
  brand,
  brand_id,
  full_title,
  package_weight,
  package_qty,
  package_unit,
  package_type,
  category_code,
  sub_category_code,
  nomenclature_id,
  last_seen_price,
  source,
  verified_at,
  created_at,
  updated_at
FROM public.supplier_catalog
WHERE barcode IS NOT NULL;

COMMENT ON VIEW public.supplier_products
  IS 'DEPRECATED backward-compat view over supplier_catalog. Phase 7.1. Use supplier_catalog directly. Will be removed in Phase 8.';

-- ─── 9. UPDATE fn_approve_receipt → v9 (supplier_catalog SSoT) ───
-- Only change from v8: line ~169 queries supplier_catalog instead of supplier_item_mapping

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
  -- v8: auto-derive variables
  v_auto_fin_sub      INTEGER;
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

  -- ── 3. INSERT expense_ledger (Hub) — v7: with delivery_fee ──
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
  --    v6: Apply UoM conversion from supplier_catalog (was supplier_item_mapping)
  --    v8: Auto-derive sub_category_code from product_categories
  IF p_payload->'food_items' IS NOT NULL
     AND jsonb_array_length(p_payload->'food_items') > 0 THEN

    -- v8: If Hub has no sub_category_code, try auto-derive from first food item's category
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

      -- ── v9: UoM Conversion from supplier_catalog (was supplier_item_mapping) ──
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

      -- ── v6: Calculate converted quantity and unit price ──
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
  IS 'Phase 7.1: v9 — supplier_catalog SSoT (was supplier_item_mapping). v8 auto-derive preserved. v7 delivery_fee preserved. v6 UoM preserved. Hub+3Spokes.';
