-- ============================================================
-- AUDIT: Barcode consistency across purchase_logs, sku, supplier_catalog
-- Run with: supabase db query --linked < audit_barcodes.sql
-- ============================================================

-- 1. Purchase_logs barcodes that are MISSING in sku table
SELECT '1. PL barcodes missing in SKU' as check_name;
SELECT DISTINCT pl.barcode, pl.notes, pl.sku_id, s.barcode as sku_barcode, s.product_name as sku_product_name, s.package_weight as sku_package_weight
FROM purchase_logs pl
LEFT JOIN sku s ON s.id = pl.sku_id
WHERE pl.barcode IS NOT NULL
  AND pl.barcode <> ''
  AND (s.barcode IS NULL OR s.barcode <> pl.barcode)
ORDER BY pl.barcode;

-- 2. Purchase_logs barcodes that are MISSING in supplier_catalog
SELECT '2. PL barcodes missing in supplier_catalog' as check_name;
SELECT DISTINCT pl.barcode, pl.notes, pl.supplier_id
FROM purchase_logs pl
WHERE pl.barcode IS NOT NULL
  AND pl.barcode <> ''
  AND NOT EXISTS (
    SELECT 1 FROM supplier_catalog sc
    WHERE sc.supplier_id = pl.supplier_id
      AND (sc.barcode = pl.barcode OR sc.supplier_sku = pl.barcode)
  )
ORDER BY pl.barcode;

-- 3. SKU records without barcodes but have purchase_logs with barcodes
SELECT '3. SKUs that can be filled from PL barcodes' as check_name;
SELECT DISTINCT s.id as sku_id, s.sku_code, s.product_name, s.barcode as current_barcode, pl.barcode as pl_barcode
FROM sku s
JOIN purchase_logs pl ON pl.sku_id = s.id
WHERE s.barcode IS NULL
  AND pl.barcode IS NOT NULL
  AND pl.barcode <> ''
ORDER BY s.sku_code;

-- 4. Check specific barcode 8853256001510 (Chrysanthemum) — verify 300g vs 100g
SELECT '4. Chrysanthemum barcode check' as check_name;
SELECT 'purchase_logs' as source, pl.barcode, pl.notes, pl.price_per_unit, pl.total_price
FROM purchase_logs pl WHERE pl.barcode = '8853256001510'
UNION ALL
SELECT 'sku', s.barcode, s.product_name || ' | weight: ' || COALESCE(s.package_weight, 'NULL'), NULL, NULL
FROM sku s WHERE s.barcode = '8853256001510'
UNION ALL
SELECT 'supplier_catalog', sc.barcode, sc.product_name || ' | weight: ' || COALESCE(sc.package_weight, 'NULL'), sc.last_seen_price, NULL
FROM supplier_catalog sc WHERE sc.barcode = '8853256001510' OR sc.supplier_sku = '8853256001510'
UNION ALL
SELECT 'nomenclature', NULL, n.name || ' | unit: ' || COALESCE(n.base_unit, 'NULL'), n.cost_per_unit, NULL
FROM nomenclature n WHERE n.name ILIKE '%chrysanthemum%';

-- 5. Check specific barcode 80228486 — verify price correction 109→189
SELECT '5. Barcode 80228486 price check' as check_name;
SELECT 'purchase_logs' as source, pl.barcode, pl.notes, pl.price_per_unit, pl.total_price, pl.invoice_date
FROM purchase_logs pl WHERE pl.barcode = '80228486'
UNION ALL
SELECT 'sku', s.barcode, s.product_name, NULL, NULL, NULL
FROM sku s WHERE s.barcode = '80228486'
UNION ALL
SELECT 'supplier_catalog', sc.barcode, sc.product_name, sc.last_seen_price, NULL, NULL
FROM supplier_catalog sc WHERE sc.barcode = '80228486' OR sc.supplier_sku = '80228486'
UNION ALL
SELECT 'nomenclature', NULL, n.name, n.cost_per_unit, NULL, NULL
FROM nomenclature n
WHERE n.id IN (SELECT nomenclature_id FROM sku WHERE barcode = '80228486');

-- 6. Summary stats
SELECT '6. Summary' as check_name;
SELECT
  (SELECT count(*) FROM purchase_logs WHERE barcode IS NOT NULL AND barcode <> '') as pl_with_barcode,
  (SELECT count(*) FROM purchase_logs WHERE barcode IS NULL OR barcode = '') as pl_without_barcode,
  (SELECT count(*) FROM sku WHERE barcode IS NOT NULL AND barcode <> '') as sku_with_barcode,
  (SELECT count(*) FROM sku WHERE barcode IS NULL OR barcode = '') as sku_without_barcode,
  (SELECT count(DISTINCT barcode) FROM purchase_logs WHERE barcode IS NOT NULL AND barcode <> '') as unique_barcodes_in_pl;
