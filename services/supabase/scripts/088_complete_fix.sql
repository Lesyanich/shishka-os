-- ============================================================
-- Complete barcode fix: all steps in one script
-- Run in Supabase SQL Editor (each statement individually if needed)
-- ============================================================

-- ═══ STEP 1: Fix PL barcode conflicts ═══

-- 1a. Remove barcode 80228486 from Red Wine Vinegar (belongs to Balsamic only)
UPDATE purchase_logs SET barcode = NULL
WHERE barcode = '80228486' AND notes ILIKE '%Red Wine%';

-- 1b. Remove barcode 9300657790028 from Edamame (belongs to Green Peas only)
UPDATE purchase_logs SET barcode = NULL
WHERE barcode = '9300657790028' AND notes ILIKE '%Edamame%';

-- ═══ STEP 2: Sync PL barcodes → SKU (one barcode per SKU) ═══
-- Chinese Garlic has 2 barcodes (214259, 834947) — pick longer/EAN-like one
-- Use: for each SKU, pick the most "EAN-like" barcode (longest numeric)

UPDATE sku SET barcode = sub.best_barcode
FROM (
  SELECT DISTINCT ON (pl.sku_id)
    pl.sku_id,
    pl.barcode as best_barcode
  FROM purchase_logs pl
  WHERE pl.barcode IS NOT NULL
    AND pl.barcode <> ''
    AND pl.sku_id IS NOT NULL
    -- Skip barcodes that already exist on ANOTHER sku
    AND NOT EXISTS (
      SELECT 1 FROM sku s2
      WHERE s2.barcode = pl.barcode
        AND s2.id <> pl.sku_id
    )
  ORDER BY pl.sku_id,
    length(pl.barcode) DESC,  -- prefer longer (EAN-13 > internal codes)
    pl.barcode
) sub
WHERE sku.id = sub.sku_id
  AND sku.barcode IS NULL;
