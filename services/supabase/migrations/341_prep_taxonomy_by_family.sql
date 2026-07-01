-- 341_prep_taxonomy_by_family.sql
-- Break the "Cooked Components" (KP-PRP-RCK) catch-all into cook-legible per-family
-- prep categories, and home the categorizable Uncategorized orphans. Continues the
-- shrimp precedent (mig 340): kitchen prep categories must read clearly to a cook on
-- /menu?view=l1-cook and /kitchen/recipes. CEO decision 2026-07-01: MAXIMAL split —
-- each food family gets its own bucket (even single-item ones).
--
-- WHY: after mig 340 pulled shrimp out, KP-PRP-RCK still held 26 preps doing ~9 jobs
-- at once (proteins + grains + legumes + roasted veg + mashes + cultured dairy +
-- crunch). A cook scanning the L1 prep chips saw one giant "Cooked Components" bucket.
--
-- 1) Creates 9 new L3 prep families under KP-PRP (Prep Components):
--      KP-PRP-CHK 🐔 Chicken, KP-PRP-MEA 🥩 Beef & Lamb, KP-PRP-FSH 🐟 Fish,
--      KP-PRP-GRN 🌾 Cooked Grains, KP-PRP-LEG 🫘 Legumes, KP-PRP-VEG 🥔 Roasted & Baked
--      Veg, KP-PRP-MSH 🥣 Mash & Purée, KP-PRP-DAI 🥛 Cultured Dairy, KP-PRP-CRN 🥜 Crunch.
--    L3 requires default_fin_sub_code (chk_l3_fin_sub_code); siblings use 4150.
-- 2) Moves all 26 KP-PRP-RCK preps into the 9 families (RCK is left ACTIVE but EMPTY —
--    a deprecated landing zone; can be deactivated later on request).
-- 3) Homes the 6 categorizable PF orphans (sauces -> KP-PRP-SAU, dough -> KP-PRP-BRD,
--    marinade -> KP-PRP-MRN) and 3 fruit raw orphans (-> F-PRD-FRU).
-- 4) Soft-deletes the dead merged stub RAW-SHREDED_MOZZARELLA_CHEESE
--    ([MERGED->RAW-CHEESE-MOZZARELLA], 0 BOM references — verified before writing).
--
-- Manakish fillings (beef/lamb/salmon) are grouped by their PROTEIN here (Beef&Lamb /
-- Fish), not kept as "manakish components" — consistent with the by-protein rule.
--
-- DEFERRED to a follow-up pass (needs NEW raw buckets / a menu-section decision, out of
-- this pass's agreed scope): water & soft drinks (RAW-ICE_CUBES, RAW-MONT_FLEUR_500,
-- RAW-SINGHA_SODA_325ML, RAW-TONIC_WATER) have no F-BEV water bucket; protein/performance
-- (RAW-WHEY_PROTEIN, RAW-CREATINE, RAW-MCT_OIL) have no F-SUP bucket; and the 2 Potato
-- Pita dishes (SALE-PITA_POTATO*) need a menu section chosen by the CEO.
--
-- Idempotent: categories via NOT EXISTS; moves guarded by category_id IS DISTINCT FROM;
-- soft-delete guarded by is_deleted=false. Reversible: repoint the 26+9 preps back to
-- KP-PRP-RCK, re-NULL the orphans, un-delete the stub, deactivate/delete the 9 families.

BEGIN;

-- 1. Create the 9 new L3 prep families under KP-PRP, sort_order appended contiguously.
WITH base AS (
  SELECT pc.id AS prp_id,
         (SELECT COALESCE(MAX(sort_order),0) FROM product_categories WHERE parent_id = pc.id) AS max_sort
  FROM product_categories pc WHERE pc.code = 'KP-PRP'
),
fam(code, name, name_th, ord) AS (
  VALUES
    ('KP-PRP-CHK','🐔 Chicken','ไก่',1),
    ('KP-PRP-MEA','🥩 Beef & Lamb','เนื้อวัว & แกะ',2),
    ('KP-PRP-FSH','🐟 Fish','ปลา',3),
    ('KP-PRP-GRN','🌾 Cooked Grains','ธัญพืชหุงสุก',4),
    ('KP-PRP-LEG','🫘 Legumes','ถั่ว',5),
    ('KP-PRP-VEG','🥔 Roasted & Baked Veg','ผักอบ/ย่าง',6),
    ('KP-PRP-MSH','🥣 Mash & Purée','มันบด & เพียวเร',7),
    ('KP-PRP-DAI','🥛 Cultured Dairy','นมหมัก',8),
    ('KP-PRP-CRN','🥜 Crunch','ท็อปปิ้งกรุบกรอบ',9)
)
INSERT INTO product_categories (id, code, name, name_th, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), fam.code, fam.name, fam.name_th, base.prp_id, 3, base.max_sort + fam.ord, 4150, true, false, now(), now()
FROM fam, base
WHERE NOT EXISTS (SELECT 1 FROM product_categories x WHERE x.code = fam.code);

-- 2. Move the 26 Cooked-Components preps into their family. Each guarded for idempotency.
UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-CHK'), updated_at=now()
 WHERE product_code IN ('PF-CHICKEN_GRILL_NEUTRAL','PF-CHICKEN_GRILL_TAWOOK','PF-CHICKEN_SV_GRILLED','PF-CHICKEN_SV_UNIVERSAL')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-CHK');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-MEA'), updated_at=now()
 WHERE product_code IN ('PF-KEBAB_LAMB','PF-MANAISH_BEEF_MEAT','PF-MANAISH_LAMB_MEAT')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-MEA');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-FSH'), updated_at=now()
 WHERE product_code IN ('PF-MANAISH_SALMON_FILLING')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-FSH');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-GRN'), updated_at=now()
 WHERE product_code IN ('PF-COOKED_BUCKWHEAT','PF-COOKED_QUINOA','PF-COOKED_RICE','PF-COOKED_RICE_BROWN')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-GRN');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-LEG'), updated_at=now()
 WHERE product_code IN ('PF-CHICKPEAS_COOKED','PF-KIDNEY_BEANS_COOKED','PF-RED_BEANS')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-LEG');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-VEG'), updated_at=now()
 WHERE product_code IN ('PF-BAKED_BEETROOT','PF-BAKED_POTATO_GRILLED','PF-BAKED_PUMPKIN','PF-BAKED_SWEET_POTATO','PF-CORN_GRILLED','PF-MIREPOIX_SAUTE')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-VEG');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-MSH'), updated_at=now()
 WHERE product_code IN ('PF-MASH_POTATO_CLASSIC','PF-MASH_POTATO_VEGAN')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-MSH');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-DAI'), updated_at=now()
 WHERE product_code IN ('PF-YOGURT_HOMEMADE','PF-WHEY-YOGURT')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-DAI');

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-CRN'), updated_at=now()
 WHERE product_code IN ('PF-CRUNCH_PUMPKIN')
   AND category_id IS DISTINCT FROM (SELECT id FROM product_categories WHERE code='KP-PRP-CRN');

-- 3a. PF orphans -> existing prep buckets.
UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-SAU'), updated_at=now()
 WHERE product_code IN ('PF-COCONUT_MAYO','PF-GARLIC_SAUCE','PF-GARLIC_SAUCE_BASE','PF-MANGO_SAUCE')
   AND category_id IS NULL;

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-BRD'), updated_at=now()
 WHERE product_code IN ('PF-MANAISH-DOUGH')
   AND category_id IS NULL;

UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='KP-PRP-MRN'), updated_at=now()
 WHERE product_code IN ('PF-MARINADE_GARLIC_HERB')
   AND category_id IS NULL;

-- 3b. Fruit raw orphans -> F-PRD-FRU.
UPDATE nomenclature SET category_id=(SELECT id FROM product_categories WHERE code='F-PRD-FRU'), updated_at=now()
 WHERE product_code IN ('RAW-COCONUT_YOUNG','RAW-GUAVA','RAW-PASSION_FRUIT_FRESH')
   AND category_id IS NULL;

-- 4. Soft-delete the dead merged stub (0 BOM references, verified).
UPDATE nomenclature SET is_deleted=true, updated_at=now()
 WHERE product_code='RAW-SHREDED_MOZZARELLA_CHEESE'
   AND coalesce(is_deleted,false)=false;

INSERT INTO migration_log (filename, status, notes)
VALUES (
  '341_prep_taxonomy_by_family.sql',
  'success',
  'Split KP-PRP-RCK catch-all into 9 cook-legible prep families (Chicken/Beef&Lamb/Fish/Grains/Legumes/RoastedVeg/Mash/CulturedDairy/Crunch); moved all 26 preps; RCK left active-but-empty. Homed 6 PF orphans (->SAU/BRD/MRN) + 3 fruit raw (->F-PRD-FRU); soft-deleted dead merged stub RAW-SHREDED_MOZZARELLA_CHEESE. Continues mig 340 shrimp precedent. Deferred (needs new buckets/section): water+soft-drinks raw, protein/performance raw, 2 Potato Pita dishes. CEO 2026-07-01 maximal split.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
