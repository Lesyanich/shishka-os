-- 342_categorize_remaining_orphans.sql
-- Clear the last 9 Uncategorized items deferred by mig 341: bottled water & soft
-- drinks and protein/performance supplements had no raw bucket, and the 2 Potato
-- Pita dishes had no menu section. CEO 2026-07-01: create simple raw buckets (the
-- exact process categorization doesn't matter for these), Potato Pita -> Bread & Crackers.
--
-- 1) New L3 raw category F-BEV-SOF "💧 Water & Soft Drinks" under F-BEV (siblings'
--    default_fin_sub_code = 4110) -> ice, mineral water, soda, tonic.
-- 2) New L3 raw category F-SUP-PRO "💪 Protein & Supplements" under F-SUP (siblings'
--    default_fin_sub_code = 4103) -> whey, creatine, MCT oil.
-- 3) SALE-PITA_POTATO + SALE-PITA_POTATO_SET3 -> KP-FIN-BRC "🥖 Bread & Crackers".
--
-- L3 categories require default_fin_sub_code (chk: level<3 OR default_fin_sub_code NOT
-- NULL; FK -> fin_sub_categories.sub_code). Idempotent: categories via NOT EXISTS;
-- item UPDATEs guarded by category_id IS NULL. Reversible: re-NULL the 9 items and
-- deactivate/delete the 2 new raw categories.
--
-- After this pass, active Uncategorized (category_id IS NULL) should be 0.

BEGIN;

-- 1. Water & Soft Drinks (raw).
INSERT INTO product_categories (id, code, name, name_th, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), 'F-BEV-SOF', '💧 Water & Soft Drinks', 'น้ำ & น้ำอัดลม',
       (SELECT id FROM product_categories WHERE code='F-BEV'),
       3,
       (SELECT COALESCE(MAX(sort_order),0)+1 FROM product_categories WHERE parent_id=(SELECT id FROM product_categories WHERE code='F-BEV')),
       4110, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code='F-BEV-SOF');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='F-BEV-SOF'), updated_at=now()
 WHERE product_code IN ('RAW-ICE_CUBES','RAW-MONT_FLEUR_500','RAW-SINGHA_SODA_325ML','RAW-TONIC_WATER')
   AND category_id IS NULL;

-- 2. Protein & Supplements (raw).
INSERT INTO product_categories (id, code, name, name_th, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), 'F-SUP-PRO', '💪 Protein & Supplements', 'โปรตีน & อาหารเสริม',
       (SELECT id FROM product_categories WHERE code='F-SUP'),
       3,
       (SELECT COALESCE(MAX(sort_order),0)+1 FROM product_categories WHERE parent_id=(SELECT id FROM product_categories WHERE code='F-SUP')),
       4103, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code='F-SUP-PRO');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='F-SUP-PRO'), updated_at=now()
 WHERE product_code IN ('RAW-WHEY_PROTEIN','RAW-CREATINE','RAW-MCT_OIL')
   AND category_id IS NULL;

-- 3. Potato Pita dishes -> 🥖 Bread & Crackers menu section.
UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-FIN-BRC'), updated_at=now()
 WHERE product_code IN ('SALE-PITA_POTATO','SALE-PITA_POTATO_SET3')
   AND category_id IS NULL;

INSERT INTO migration_log (filename, status, notes)
VALUES (
  '342_categorize_remaining_orphans.sql',
  'success',
  'Cleared the last 9 Uncategorized: new F-BEV-SOF Water & Soft Drinks (ice/water/soda/tonic) + F-SUP-PRO Protein & Supplements (whey/creatine/MCT); Potato Pita dishes -> KP-FIN-BRC Bread & Crackers. Finishes the orphan cleanup started in mig 341. CEO 2026-07-01.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
