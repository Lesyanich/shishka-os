-- ============================================================
-- Migration 082: Backfill SKU barcodes + supplier linkage
-- Two-part recovery:
--   Part 1: Link SKUs to suppliers via purchase_logs history
--   Part 2: Extract barcodes from receipt_jobs.result JSONB
-- ============================================================

-- ── Part 1: Create supplier_catalog entries from purchase_logs ──
-- Every purchase_log has (sku_id, supplier_id, nomenclature_id).
-- This gives us the SKU↔Supplier link that's missing from supplier_catalog.

WITH purchase_links AS (
  SELECT
    pl.supplier_id,
    pl.nomenclature_id,
    pl.sku_id,
    pl.notes AS product_name,
    COUNT(*) AS purchase_count
  FROM public.purchase_logs pl
  WHERE pl.sku_id IS NOT NULL
    AND pl.supplier_id IS NOT NULL
  GROUP BY pl.supplier_id, pl.nomenclature_id, pl.sku_id, pl.notes
)
INSERT INTO public.supplier_catalog (
  supplier_id, nomenclature_id, sku_id,
  original_name, match_count, source
)
SELECT
  plink.supplier_id,
  plink.nomenclature_id,
  plink.sku_id,
  plink.product_name,
  plink.purchase_count,
  'backfill_082'
FROM purchase_links plink
WHERE NOT EXISTS (
  SELECT 1 FROM public.supplier_catalog sc
  WHERE sc.supplier_id = plink.supplier_id
    AND (
      sc.sku_id = plink.sku_id
      OR (sc.nomenclature_id = plink.nomenclature_id
          AND sc.sku_id IS NULL)
    )
)
ON CONFLICT DO NOTHING;

-- Also set sku_id on existing supplier_catalog rows where it's NULL
-- but we can match via nomenclature_id + supplier_id from purchase_logs
UPDATE public.supplier_catalog sc
SET sku_id = pl_best.sku_id
FROM (
  SELECT DISTINCT ON (pl.supplier_id, pl.nomenclature_id)
    pl.supplier_id,
    pl.nomenclature_id,
    pl.sku_id
  FROM public.purchase_logs pl
  WHERE pl.sku_id IS NOT NULL
    AND pl.supplier_id IS NOT NULL
  ORDER BY pl.supplier_id, pl.nomenclature_id, pl.invoice_date DESC
) pl_best
WHERE sc.supplier_id = pl_best.supplier_id
  AND sc.nomenclature_id = pl_best.nomenclature_id
  AND sc.sku_id IS NULL;


-- ── Part 2: Extract barcodes from receipt_jobs.result ──
-- Gemini extracted barcodes into line_items[].supplier_sku.
-- Match by product name (translated_name) → sku.product_name.

-- Step 2a: Build a lookup of (product_name → barcode) from receipt_jobs
-- Take the MOST RECENT barcode per product name for reliability.
WITH receipt_barcodes AS (
  SELECT DISTINCT ON (lower(trim(li->>'translated_name')))
    trim(li->>'supplier_sku')             AS barcode,
    lower(trim(li->>'translated_name'))   AS name_lower,
    trim(li->>'translated_name')          AS name_original
  FROM public.receipt_jobs rj,
       jsonb_array_elements(rj.result->'line_items') AS li
  WHERE rj.status = 'completed'
    AND rj.result IS NOT NULL
    AND rj.result->'line_items' IS NOT NULL
    AND jsonb_typeof(rj.result->'line_items') = 'array'
    AND li->>'supplier_sku' IS NOT NULL
    AND trim(li->>'supplier_sku') ~ '^\d{8,14}$'
  ORDER BY lower(trim(li->>'translated_name')), rj.completed_at DESC
)
UPDATE public.sku
SET barcode = rb.barcode
FROM receipt_barcodes rb
WHERE sku.barcode IS NULL
  AND sku.is_active = true
  AND lower(trim(sku.product_name)) = rb.name_lower;

-- Step 2b: Also try matching by original_name (Thai name stored in sku.product_name)
WITH receipt_barcodes_orig AS (
  SELECT DISTINCT ON (lower(trim(li->>'original_name')))
    trim(li->>'supplier_sku')             AS barcode,
    lower(trim(li->>'original_name'))     AS name_lower
  FROM public.receipt_jobs rj,
       jsonb_array_elements(rj.result->'line_items') AS li
  WHERE rj.status = 'completed'
    AND rj.result IS NOT NULL
    AND rj.result->'line_items' IS NOT NULL
    AND jsonb_typeof(rj.result->'line_items') = 'array'
    AND li->>'supplier_sku' IS NOT NULL
    AND trim(li->>'supplier_sku') ~ '^\d{8,14}$'
    AND li->>'original_name' IS NOT NULL
  ORDER BY lower(trim(li->>'original_name')), rj.completed_at DESC
)
UPDATE public.sku
SET barcode = rbo.barcode
FROM receipt_barcodes_orig rbo
WHERE sku.barcode IS NULL
  AND sku.is_active = true
  AND lower(trim(sku.product_name)) = rbo.name_lower
  AND NOT EXISTS (
    SELECT 1 FROM public.sku s2
    WHERE s2.barcode = rbo.barcode AND s2.id <> sku.id
  );

-- Step 2c: Try matching via makro_name (verified Makro product name)
WITH receipt_barcodes_makro AS (
  SELECT DISTINCT ON (lower(trim(li->>'makro_name')))
    trim(li->>'supplier_sku')           AS barcode,
    lower(trim(li->>'makro_name'))      AS name_lower
  FROM public.receipt_jobs rj,
       jsonb_array_elements(rj.result->'line_items') AS li
  WHERE rj.status = 'completed'
    AND rj.result IS NOT NULL
    AND rj.result->'line_items' IS NOT NULL
    AND jsonb_typeof(rj.result->'line_items') = 'array'
    AND li->>'supplier_sku' IS NOT NULL
    AND trim(li->>'supplier_sku') ~ '^\d{8,14}$'
    AND li->>'makro_name' IS NOT NULL
    AND li->>'makro_name' <> ''
  ORDER BY lower(trim(li->>'makro_name')), rj.completed_at DESC
)
UPDATE public.sku
SET barcode = rbm.barcode
FROM receipt_barcodes_makro rbm
WHERE sku.barcode IS NULL
  AND sku.is_active = true
  AND lower(trim(sku.product_name)) = rbm.name_lower
  AND NOT EXISTS (
    SELECT 1 FROM public.sku s2
    WHERE s2.barcode = rbm.barcode AND s2.id <> sku.id
  );


-- ── Part 3: Propagate barcodes to supplier_catalog ──
-- Now that sku.barcode is filled, copy it to supplier_catalog rows
UPDATE public.supplier_catalog sc
SET
  barcode = s.barcode,
  supplier_sku = COALESCE(sc.supplier_sku, s.barcode)
FROM public.sku s
WHERE sc.sku_id = s.id
  AND s.barcode IS NOT NULL
  AND sc.barcode IS NULL;


-- ── Verification query (run manually to check results) ──
-- SELECT
--   COUNT(*) AS total_skus,
--   COUNT(barcode) AS with_barcode,
--   COUNT(*) - COUNT(barcode) AS without_barcode
-- FROM public.sku
-- WHERE is_active = true;
--
-- SELECT
--   COUNT(*) AS total_catalog,
--   COUNT(sku_id) AS with_sku_id,
--   COUNT(barcode) AS with_barcode
-- FROM public.supplier_catalog;
