-- Phase 2A — Price Book: supplier price comparison built on supplier_catalog.
--
-- The owner needs to see, per ingredient/packaging, every supplier that sells
-- it and at what price — side by side — and to RECORD a competitive quote so a
-- comparison (e.g. the branded cups) is never lost to a chat session again.
-- All of this rides on the EXISTING supplier_catalog table (no new comparison
-- table, per the owner's constraint).
--
-- Deliverables:
--   1. v_price_comparison         — one row per (item x supplier), freshest row
--   2. v_price_comparison_summary — one row per item: best/worst/spread + cost
--   3. fn_record_supplier_quote   — append a manual quote (source='quote')
--   4. fn_set_canonical_cost      — deliberately promote a catalog row to cost
--
-- Reversible: DROP the views + functions (see DOWN block at the tail).

-- 1. Per (item, supplier) comparison, de-duplicated to the freshest catalog row
--    (there is NO unique (supplier_id, nomenclature_id) constraint, and the
--    scrape/receipt loops create duplicate rows). unit_cost normalises
--    last_seen_price to per-base-unit exactly like fn_seed_raw_cost_from_catalog
--    (÷ conversion_factor). source is collapsed to a stable family because the
--    raw source column holds 30+ free-text values.
CREATE OR REPLACE VIEW public.v_price_comparison
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    sc.id AS catalog_id,
    sc.nomenclature_id,
    sc.supplier_id,
    sc.last_seen_price,
    sc.conversion_factor,
    sc.source,
    sc.verified_at,
    sc.updated_at,
    sc.product_name,
    sc.original_name,
    ROW_NUMBER() OVER (
      PARTITION BY sc.nomenclature_id, sc.supplier_id
      ORDER BY sc.updated_at DESC NULLS LAST, sc.verified_at DESC NULLS LAST
    ) AS rn
  FROM public.supplier_catalog sc
  WHERE sc.nomenclature_id IS NOT NULL
    AND sc.last_seen_price IS NOT NULL
)
SELECT
  r.nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS item_name,
  n.base_unit,
  n.cost_per_unit AS current_cost,
  r.catalog_id,
  r.supplier_id,
  s.name AS supplier_name,
  r.last_seen_price,
  ROUND(r.last_seen_price / COALESCE(NULLIF(r.conversion_factor, 0), 1), 4) AS unit_cost,
  CASE
    WHEN r.source ILIKE '%quote%' THEN 'quote'
    WHEN r.source ILIKE '%receipt%' OR r.source ILIKE '%ocr%' THEN 'receipt'
    WHEN r.source ILIKE '%makro%' OR r.source ILIKE '%scrape%' OR r.source ILIKE '%api%'
      OR r.source ILIKE '%web%' OR r.source ILIKE 'line%' OR r.source ILIKE '%lazada%'
      OR r.source ILIKE '%shopee%' OR r.source ILIKE '%sangdamrong%' OR r.source ILIKE '%tops%'
      OR r.source ILIKE '%homepro%' THEN 'scrape'
    ELSE 'manual'
  END AS source_family,
  r.product_name,
  r.original_name,
  r.verified_at,
  r.updated_at
FROM ranked r
JOIN public.nomenclature n ON n.id = r.nomenclature_id
JOIN public.suppliers s ON s.id = r.supplier_id
WHERE r.rn = 1
  AND (n.product_code LIKE 'RAW-%' OR n.product_code LIKE 'NF-PKG%')
  AND COALESCE(n.is_deleted, false) = false
  AND COALESCE(s.is_deleted, false) = false;

GRANT SELECT ON public.v_price_comparison TO authenticated;

-- 2. One row per item: how many suppliers, best/worst/spread, current cost.
--    LEFT JOIN so RAW/packaging items with ZERO supplier rows still appear
--    (e.g. the sauce cups) — that is exactly where the owner records the first
--    quote, so the comparison has a permanent home.
CREATE OR REPLACE VIEW public.v_price_comparison_summary
WITH (security_invoker = true) AS
SELECT
  n.id AS nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS item_name,
  n.base_unit,
  n.cost_per_unit AS current_cost,
  -- Packaging is grouped by CATEGORY code (NF-PKG-*, e.g. NF-PKG-CNT), not by
  -- product_code — every cup/box/lid is itself a RAW-% item.
  CASE WHEN cat.code LIKE 'NF-PKG%' THEN 'packaging' ELSE 'ingredient' END AS item_group,
  COUNT(pc.catalog_id) AS supplier_count,
  MIN(pc.unit_cost) AS best_price,
  MAX(pc.unit_cost) AS worst_price,
  ROUND(AVG(pc.unit_cost), 4) AS avg_price,
  (ARRAY_AGG(pc.supplier_name ORDER BY pc.unit_cost ASC NULLS LAST))[1] AS best_supplier,
  CASE
    WHEN MIN(pc.unit_cost) > 0 AND COUNT(pc.catalog_id) > 1
    THEN ROUND((MAX(pc.unit_cost) - MIN(pc.unit_cost)) / MIN(pc.unit_cost) * 100, 1)
    ELSE NULL
  END AS spread_pct
FROM public.nomenclature n
LEFT JOIN public.product_categories cat ON cat.id = n.category_id
LEFT JOIN public.v_price_comparison pc ON pc.nomenclature_id = n.id
WHERE (n.product_code LIKE 'RAW-%' OR n.product_code LIKE 'NF-PKG%' OR cat.code LIKE 'NF-PKG%')
  AND COALESCE(n.is_deleted, false) = false
GROUP BY n.id, n.product_code, n.customer_short_name, n.name, n.base_unit, n.cost_per_unit, cat.code;

GRANT SELECT ON public.v_price_comparison_summary TO authenticated;

-- 3. Record a competitive quote. Finds-or-creates the supplier by name (unless
--    an id is given), then APPENDS a supplier_catalog row tagged source='quote'
--    (never UPDATE — the catalog is an append/learning surface). Inserting with
--    last_seen_price fires trg_sc_seed_raw_cost, which only touches RAW-% items
--    whose cost is still NULL/0 — so this never clobbers an established cost.
CREATE OR REPLACE FUNCTION public.fn_record_supplier_quote(
  p_nomenclature_id uuid,
  p_unit_price numeric,
  p_supplier_name text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supplier_id uuid := p_supplier_id;
  v_base_unit text;
  v_catalog_id uuid;
BEGIN
  IF p_unit_price IS NULL OR p_unit_price <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unit price must be greater than 0');
  END IF;
  IF p_nomenclature_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item is required');
  END IF;

  IF v_supplier_id IS NULL THEN
    IF p_supplier_name IS NULL OR btrim(p_supplier_name) = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Supplier name is required');
    END IF;
    SELECT id INTO v_supplier_id FROM public.suppliers
    WHERE lower(name) = lower(btrim(p_supplier_name)) AND is_deleted = false
    LIMIT 1;
    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (name) VALUES (btrim(p_supplier_name))
      RETURNING id INTO v_supplier_id;
    END IF;
  END IF;

  SELECT base_unit INTO v_base_unit FROM public.nomenclature WHERE id = p_nomenclature_id;

  INSERT INTO public.supplier_catalog
    (supplier_id, nomenclature_id, last_seen_price, conversion_factor, base_unit,
     source, original_name, verified_at)
  VALUES
    (v_supplier_id, p_nomenclature_id, p_unit_price, 1, v_base_unit,
     'quote', NULLIF(btrim(COALESCE(p_note, '')), ''), now())
  RETURNING id INTO v_catalog_id;

  RETURN jsonb_build_object('ok', true, 'catalog_id', v_catalog_id, 'supplier_id', v_supplier_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_record_supplier_quote(uuid, numeric, text, uuid, text) TO authenticated;

-- 4. Deliberately promote a chosen catalog row to the item's official cost.
--    This is the one sanctioned place (besides fn_seed_raw_cost_from_catalog)
--    that writes nomenclature.cost_per_unit directly — and unlike the auto
--    trigger it works for ANY item including NF-PKG packaging (cups), whose
--    cost the RAW-only trigger never seeds.
CREATE OR REPLACE FUNCTION public.fn_set_canonical_cost(p_catalog_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_nom uuid;
  v_price numeric;
  v_conv numeric;
  v_cost numeric;
BEGIN
  SELECT nomenclature_id, last_seen_price, COALESCE(NULLIF(conversion_factor, 0), 1)
  INTO v_nom, v_price, v_conv
  FROM public.supplier_catalog WHERE id = p_catalog_id;

  IF v_nom IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Catalog row is not linked to an item');
  END IF;
  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Catalog row has no usable price');
  END IF;

  v_cost := ROUND(v_price / v_conv, 4);
  UPDATE public.nomenclature
  SET cost_per_unit = v_cost, cost_source = 'manual_quote', updated_at = now()
  WHERE id = v_nom;

  RETURN jsonb_build_object('ok', true, 'nomenclature_id', v_nom, 'cost_per_unit', v_cost);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_set_canonical_cost(uuid) TO authenticated;

-- Cup note: the zero-row packaging items (e.g. RAW-SAUCE_CUP_2OZ,
-- RAW-SAUCE_CUP_LID_2OZ, RAW-BOTTLE_PET_60) intentionally appear in
-- v_price_comparison_summary with supplier_count = 0 (via the LEFT JOIN).
-- Competing quotes cannot be fabricated by a migration — the owner records them
-- in the Price Book (?tab=pricebook&q=cup), which now has a durable home via
-- fn_record_supplier_quote.

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '318_price_book.sql',
  'claude-code',
  NULL,
  'Price Book on supplier_catalog: views v_price_comparison + v_price_comparison_summary (packaging by NF-PKG category), fn_record_supplier_quote (never-lose-a-comparison), fn_set_canonical_cost (deliberate cost promotion incl. packaging)'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP FUNCTION IF EXISTS public.fn_set_canonical_cost(uuid);
-- DROP FUNCTION IF EXISTS public.fn_record_supplier_quote(uuid, numeric, text, uuid, text);
-- DROP VIEW IF EXISTS public.v_price_comparison_summary;
-- DROP VIEW IF EXISTS public.v_price_comparison;
