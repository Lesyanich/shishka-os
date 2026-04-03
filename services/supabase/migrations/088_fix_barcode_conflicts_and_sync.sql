-- ============================================================
-- Migration 088: Fix barcode conflicts + sync PL→SKU + enrich data
-- ============================================================
-- Applied manually in 3 steps via SQL Editor (2026-04-02):
--   Step 1: Fix PL barcode conflicts (80228486, 9300657790028)
--   Step 2: Sync PL barcodes → SKU (DISTINCT ON, longest barcode wins)
--   Step 3: Enrich SKU data from Makro parser (brand, package_weight)
--
-- Results: SKU barcodes 75→97/100, 6 SKUs enriched with Makro data
-- ============================================================

-- ═══ STEP 1: Fix PL barcode conflicts ═══

-- Remove barcode 80228486 from Red Wine Vinegar (belongs to Balsamic only per Makro)
UPDATE purchase_logs SET barcode = NULL
WHERE barcode = '80228486' AND notes ILIKE '%Red Wine%';

-- Remove barcode 9300657790028 from Edamame (belongs to Green Peas only per Makro)
UPDATE purchase_logs SET barcode = NULL
WHERE barcode = '9300657790028' AND notes ILIKE '%Edamame%';

-- ═══ STEP 2: Sync PL barcodes → SKU ═══

UPDATE sku SET barcode = sub.best_barcode
FROM (
  SELECT DISTINCT ON (pl.sku_id)
    pl.sku_id,
    pl.barcode as best_barcode
  FROM purchase_logs pl
  WHERE pl.barcode IS NOT NULL
    AND pl.barcode <> ''
    AND pl.sku_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM sku s2
      WHERE s2.barcode = pl.barcode
        AND s2.id <> pl.sku_id
    )
  ORDER BY pl.sku_id, length(pl.barcode) DESC, pl.barcode
) sub
WHERE sku.id = sub.sku_id
  AND sku.barcode IS NULL;

-- ═══ STEP 3: Enrich SKU data from Makro parser ═══

-- Chrysanthemum: 300g (NOT 100g), brand MAKRO
UPDATE sku SET package_weight = '300g', brand = 'MAKRO'
WHERE barcode = '8853256001510' OR id = '3014e7bd-4ec3-4530-b6a2-6f4e9d49e0ea';

-- MDH Bombay Biryani Masala: 100g
UPDATE sku SET package_weight = '100g', brand = 'MDH'
WHERE id = '119a52f6-3aeb-4787-a2bd-5069cd630679';

-- Mixed Five Bean: 500g
UPDATE sku SET package_weight = '500g', brand = 'MAKRO'
WHERE id = '331acd8e-2969-4638-b8d4-cade52125bc0';

-- Ponti Balsamic Vinegar: 500ml
UPDATE sku SET package_weight = '500ml', brand = 'PONTI'
WHERE id = '2068a869-9d32-46a6-b144-97faf28d434a';

-- Ponti Red Wine Vinegar: 500ml (no barcode available on Makro site)
UPDATE sku SET package_weight = '500ml', brand = 'PONTI'
WHERE id = '74fcc0fc-aa56-4b9b-89f3-90ac93ca9ff2';

-- Frozen Strawberry: brand is SAVEPAK (not Chef Pack)
UPDATE sku SET package_weight = '1kg', brand = 'SAVEPAK',
  product_name = 'SAVEPAK Frozen Strawberry 1kg'
WHERE id = '490c50d7-1fa4-4a25-9dc2-22b478678df3';
