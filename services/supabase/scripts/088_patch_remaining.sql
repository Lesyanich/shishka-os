-- ============================================================
-- Patch: remaining steps from 088 after partial apply
-- Fixes 1-4 already applied. This runs Fix 5 (v3) + Fix 6.
-- ============================================================

-- ── Fix 5: Sync barcodes from purchase_logs → supplier_catalog ──
-- Problem: multiple SC rows can match same (supplier_id, barcode) via sku_id OR original_name
-- Solution: pick ONE SC row per (supplier_id, barcode) pair, prefer sku_id match
WITH candidates AS (
  SELECT DISTINCT ON (pb.supplier_id, pb.barcode)
    sc.id as sc_id,
    pb.barcode as new_barcode
  FROM purchase_logs pb
  JOIN supplier_catalog sc
    ON sc.supplier_id = pb.supplier_id
    AND (sc.sku_id = pb.sku_id OR sc.original_name = pb.notes)
  WHERE pb.barcode IS NOT NULL
    AND pb.barcode <> ''
    AND pb.supplier_id IS NOT NULL
    AND pb.sku_id IS NOT NULL
    AND sc.barcode IS NULL
    -- No other SC row for this supplier already has this barcode
    AND NOT EXISTS (
      SELECT 1 FROM supplier_catalog sc2
      WHERE sc2.supplier_id = pb.supplier_id
        AND sc2.barcode = pb.barcode
    )
  ORDER BY pb.supplier_id, pb.barcode,
    CASE WHEN sc.sku_id = pb.sku_id THEN 0 ELSE 1 END
)
UPDATE public.supplier_catalog sc
SET barcode = c.new_barcode,
    updated_at = now()
FROM candidates c
WHERE sc.id = c.sc_id;

-- ── Fix 6: Enrich SKU data from Makro parser results ──
UPDATE public.sku
SET package_weight = '300g', brand = 'MAKRO'
WHERE barcode = '8853256001510'
   OR id = '3014e7bd-4ec3-4530-b6a2-6f4e9d49e0ea';

UPDATE public.sku
SET package_weight = '100g', brand = 'MDH'
WHERE id = '119a52f6-3aeb-4787-a2bd-5069cd630679';

UPDATE public.sku
SET package_weight = '500g', brand = 'MAKRO'
WHERE id = '331acd8e-2969-4638-b8d4-cade52125bc0';

UPDATE public.sku
SET package_weight = '500ml', brand = 'PONTI'
WHERE id = '2068a869-9d32-46a6-b144-97faf28d434a';

UPDATE public.sku
SET package_weight = '500ml', brand = 'PONTI'
WHERE id = '74fcc0fc-aa56-4b9b-89f3-90ac93ca9ff2';
