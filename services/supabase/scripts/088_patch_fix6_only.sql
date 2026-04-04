-- ============================================================
-- Patch: Fix 6 only (SKU enrichment from Makro parser)
-- Fixes 1-4 already applied. Fix 5 (supplier_catalog sync) skipped —
-- v12 learning loop will fill supplier_catalog on next receipt.
-- ============================================================

-- Chrysanthemum: confirm 300g weight (NOT 100g)
UPDATE public.sku
SET package_weight = '300g', brand = 'MAKRO'
WHERE barcode = '8853256001510'
   OR id = '3014e7bd-4ec3-4530-b6a2-6f4e9d49e0ea';

-- MDH Bombay Biryani Masala: 100g
UPDATE public.sku
SET package_weight = '100g', brand = 'MDH'
WHERE id = '119a52f6-3aeb-4787-a2bd-5069cd630679';

-- Mixed Five Bean: 500g
UPDATE public.sku
SET package_weight = '500g', brand = 'MAKRO'
WHERE id = '331acd8e-2969-4638-b8d4-cade52125bc0';

-- Ponti Balsamic Vinegar: 500ml
UPDATE public.sku
SET package_weight = '500ml', brand = 'PONTI'
WHERE id = '2068a869-9d32-46a6-b144-97faf28d434a';

-- Ponti Red Wine Vinegar: 500ml
UPDATE public.sku
SET package_weight = '500ml', brand = 'PONTI'
WHERE id = '74fcc0fc-aa56-4b9b-89f3-90ac93ca9ff2';

-- SAVEPAK Frozen Strawberry (was "Chef Pack")
UPDATE public.sku
SET package_weight = '1kg', brand = 'SAVEPAK',
    product_name = 'SAVEPAK Frozen Strawberry 1kg'
WHERE id = '490c50d7-1fa4-4a25-9dc2-22b478678df3';
