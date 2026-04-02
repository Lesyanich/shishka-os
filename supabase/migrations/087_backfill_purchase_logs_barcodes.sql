-- ============================================================
-- Migration 087: Backfill purchase_logs.barcode from existing data
-- ============================================================
-- Sources (in priority order):
--   1. sku.barcode (most reliable — unique per SKU)
--   2. supplier_catalog.barcode (fallback for SKUs without barcode)
--   3. supplier_catalog.supplier_sku (numeric barcodes stored as SKU)
-- ============================================================

-- Step 1: Fill from sku.barcode (primary source)
UPDATE public.purchase_logs pl
SET barcode = s.barcode
FROM public.sku s
WHERE pl.sku_id = s.id
  AND s.barcode IS NOT NULL
  AND s.barcode <> ''
  AND pl.barcode IS NULL;

-- Step 2: Fill from supplier_catalog.barcode (where SKU had no barcode)
UPDATE public.purchase_logs pl
SET barcode = sc.barcode
FROM public.supplier_catalog sc
WHERE pl.barcode IS NULL
  AND sc.barcode IS NOT NULL
  AND sc.barcode <> ''
  AND sc.supplier_id = pl.supplier_id
  AND (
    sc.sku_id = pl.sku_id
    OR sc.nomenclature_id = pl.nomenclature_id
  );

-- Step 3: Fill from supplier_catalog.supplier_sku (numeric barcodes stored as supplier_sku)
UPDATE public.purchase_logs pl
SET barcode = sc.supplier_sku
FROM public.supplier_catalog sc
WHERE pl.barcode IS NULL
  AND sc.supplier_sku IS NOT NULL
  AND sc.supplier_sku ~ '^\d{8,14}$'  -- EAN-8 to ITF-14 format
  AND sc.supplier_id = pl.supplier_id
  AND (
    sc.sku_id = pl.sku_id
    OR sc.nomenclature_id = pl.nomenclature_id
  );

-- Step 4: Also backfill sku.barcode from supplier_catalog where sku has no barcode
UPDATE public.sku s
SET barcode = sc.barcode
FROM public.supplier_catalog sc
WHERE s.barcode IS NULL
  AND sc.sku_id = s.id
  AND sc.barcode IS NOT NULL
  AND sc.barcode <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.sku s2
    WHERE s2.barcode = sc.barcode AND s2.id <> s.id
  );
