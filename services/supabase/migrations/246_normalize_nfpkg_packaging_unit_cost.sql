-- ============================================================
-- Migration 246: Normalize NF-PKG packaging unit cost (pack -> per-piece)
--
-- CONTEXT: Packaging lives as nomenclature rows under category NF-PKG.
-- Their cost_per_unit was the per-PACK receipt price while base_unit was a
-- mix of 'pcs'/'pack', so "1 unit" did not mean "1 piece". Before packaging
-- can be attached to dishes as BOM lines (Packaging-as-BOM initiative,
-- MC 2385d288), per-piece cost must be correct.
--
-- PACK COUNTS verified via Makro Pro scraper (store ST166 Rawai, 2026-06-07):
--   ARO Bio Food Box 600ml  -> Makro 931899  ฿119 / 50 pcs
--   ARO Bio 2-Comp Box 1000 -> Makro 931887  ฿229 / 50 pcs
--   ARO Bio Burger Box       -> Makro 931904  ฿139 / 50 pcs
--   ARO Pizza Box 8"         -> Makro 865872  ฿89  / 10 pcs
--   White Paper Bowls 1X50   -> 50 pcs (name); kept stored receipt price
--   PET bowl lids            -> 50 pcs assumed (ARO bowl/flat lids ship x50)
--   Clear Zipper Bags 25x38  -> 62 pcs (name)
--
-- SAFETY: none of these 9 rows appear in any bom_structures yet, so this
-- changes NO dish cost today. It only corrects the per-piece basis.
-- Only nomenclature is touched; supplier_catalog / conversion_factor are
-- intentionally left alone (approve_receipt UoM logic is fragile).
-- ============================================================

BEGIN;

WITH pkg(code, new_cost, note) AS (
  VALUES
    ('RAW-AUTO-b7ee4d39', 159.0 / 50, 'White Paper Bowl 500ml/16oz, 1X50 (stored receipt price)'),
    ('RAW-AUTO-71eeeaea', 259.0 / 50, 'White Paper Bowl 1300ml/50oz, 1X50 (stored receipt price)'),
    ('RAW-AUTO-b5d98656', 119.0 / 50, 'PET Lid 500/750ml bowls, pack 50 assumed'),
    ('RAW-AUTO-1fd316f7', 129.0 / 50, 'PET Lid 1100/1300ml bowls, pack 50 assumed'),
    ('RAW-AUTO-63af7a5f', 119.0 / 50, 'ARO Bio Food Box 600ml, Makro 931899 (refreshed)'),
    ('RAW-AUTO-37e9da70', 229.0 / 50, 'ARO Bio 2-Comp Box 1000ml, Makro 931887 (refreshed)'),
    ('RAW-AUTO-57abef9e', 139.0 / 50, 'ARO Bio Burger Box, Makro 931904 (refreshed)'),
    ('RAW-AUTO-efdbc7fa',  89.0 / 10, 'ARO Pizza Box 8in, Makro 865872 (refreshed)'),
    ('RAW-AUTO-c0c91c9b', 150.0 / 62, 'Clear Zipper Bags 25x38 62pcs (stored receipt price)')
)
UPDATE nomenclature n
SET cost_per_unit = round(pkg.new_cost::numeric, 4),
    base_unit     = 'pcs'
FROM pkg
WHERE n.product_code = pkg.code;

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
  '246_normalize_nfpkg_packaging_unit_cost.sql',
  'claude-code',
  'Phase 1 of Packaging-as-BOM (MC 2385d288): normalize 9 NF-PKG container rows to per-piece cost (base_unit=pcs). Pack counts verified via Makro scraper ST166. No BOM refs yet -> zero dish cost impact.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
