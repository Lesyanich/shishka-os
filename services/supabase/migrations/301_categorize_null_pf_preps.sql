-- 301_categorize_null_pf_preps.sql
-- Categorize the ~45 active PF (semi-finished prep) nomenclature rows that have
-- category_id = NULL. These were invisible to the L1 prep station's data-driven
-- category chips on /menu?view=l1-cook and /kitchen/recipes — they only showed
-- under the "All" bucket (grouped as "uncategorized" in L1CookView), because the
-- chips are built from the section_id/category_id that type-filtered items roll
-- up to. A NULL-category PF has no chip.
--
-- Mig 298 already handled the manakish-specific preps (fillings -> KP-PRP-RCK,
-- cheese mix -> KP-PRP-MRN, tortilla+starter -> KP-PRP-BRD). This migration
-- handles the remaining 45: cold-pressed juices, vinaigrettes/dressings,
-- sauces/pastes/dips, frozen fruit, syrups, cooked components, salad bases,
-- spice mix / marinated onion.
--
-- Mapping confirmed with CEO/chef 2026-06-17:
--   • Dressings (KP-PRP-DRS) kept separate from Sauces/Pastes/Dips (KP-PRP-SAU).
--   • Cooked proteins (sous-vide chicken, lamb kebab, grilled shrimp) stay inside
--     Cooked Components (KP-PRP-RCK) — not split into a separate proteins bucket.
--
-- Creates 5 new L3 prep categories under KP-PRP (Prep Components):
--   KP-PRP-JUI Cold-Pressed Juices, KP-PRP-DRS Dressings & Vinaigrettes,
--   KP-PRP-SAU Sauces, Pastes & Dips, KP-PRP-FRZ Frozen Fruit,
--   KP-PRP-SYR Syrups & Sweeteners.
-- L3 categories require default_fin_sub_code (chk_l3_fin_sub_code); siblings use 4150.
--
-- Idempotent: new categories inserted only WHERE NOT EXISTS; nomenclature UPDATEs
-- guarded by `category_id IS NULL` so a re-run never clobbers later re-categorization.
--
-- Reversible: re-NULL the 45 product_codes' category_id and deactivate/delete the
-- 5 new KP-PRP-* categories.

BEGIN;

-- 1. Create the 5 new L3 prep categories under KP-PRP (Prep Components).
INSERT INTO product_categories (id, code, name, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), 'KP-PRP-JUI', 'Cold-Pressed Juices',
       (SELECT id FROM product_categories WHERE code = 'KP-PRP'),
       3, 4, 4150, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'KP-PRP-JUI');

INSERT INTO product_categories (id, code, name, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), 'KP-PRP-DRS', 'Dressings & Vinaigrettes',
       (SELECT id FROM product_categories WHERE code = 'KP-PRP'),
       3, 5, 4150, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'KP-PRP-DRS');

INSERT INTO product_categories (id, code, name, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), 'KP-PRP-SAU', 'Sauces, Pastes & Dips',
       (SELECT id FROM product_categories WHERE code = 'KP-PRP'),
       3, 6, 4150, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'KP-PRP-SAU');

INSERT INTO product_categories (id, code, name, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), 'KP-PRP-FRZ', 'Frozen Fruit',
       (SELECT id FROM product_categories WHERE code = 'KP-PRP'),
       3, 7, 4150, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'KP-PRP-FRZ');

INSERT INTO product_categories (id, code, name, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section, created_at, updated_at)
SELECT gen_random_uuid(), 'KP-PRP-SYR', 'Syrups & Sweeteners',
       (SELECT id FROM product_categories WHERE code = 'KP-PRP'),
       3, 8, 4150, true, false, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE code = 'KP-PRP-SYR');

-- 2. Assign category_id to the 45 NULL-category PF preps.
--    Each UPDATE guarded by `category_id IS NULL` for idempotency.

-- 2a. Cold-Pressed Juices -> KP-PRP-JUI (9)
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-JUI'),
       updated_at = now()
 WHERE category_id IS NULL
   AND product_code IN (
     'PF-APPLE_JUICE', 'PF-BEET_JUICE', 'PF-CARROT_JUICE', 'PF-CUCUMBER_JUICE',
     'PF-FRESH_OJ', 'PF-GINGER_JUICE', 'PF-GUAVA_JUICE', 'PF-ORANGE_JUICE',
     'PF-PINEAPPLE_JUICE'
   );

-- 2b. Dressings & Vinaigrettes -> KP-PRP-DRS (5)
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-DRS'),
       updated_at = now()
 WHERE category_id IS NULL
   AND product_code IN (
     'PF-BALSAMIC_VINAIGRETTE', 'PF-FRESH_HERB_VINAIGRETTE', 'PF-GINGER_LIME_VINAIGRETTE',
     'PF-MUSHROOM_TRUFFLE_VINAIGRETTE', 'PF-TAHINI_DRESSING'
   );

-- 2c. Sauces, Pastes & Dips -> KP-PRP-SAU (7)
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-SAU'),
       updated_at = now()
 WHERE category_id IS NULL
   AND product_code IN (
     'PF-CASHEW_SAUCE', 'PF-CHILI_PASTE', 'PF-MUSHROOM_TRUFFLE_SAUCE', 'PF-PESTO',
     'PF-MUHAMMARA_BASE', 'PF-TAHINI', 'PF-CASHEW_BUTTER'
   );

-- 2d. Frozen Fruit -> KP-PRP-FRZ (2)
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-FRZ'),
       updated_at = now()
 WHERE category_id IS NULL
   AND product_code IN (
     'PF-FROZEN_BANANA_SLICES', 'PF-FROZEN_PINEAPPLE_CHUNKS'
   );

-- 2e. Syrups & Sweeteners -> KP-PRP-SYR (1)
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-SYR'),
       updated_at = now()
 WHERE category_id IS NULL
   AND product_code IN ('PF-SYRUP_HONEY');

-- 2f. Cooked Components -> KP-PRP-RCK (17, incl. proteins, mashes, grilled veg,
--     pumpkin-seed crunch, yogurt whey byproduct)
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-RCK'),
       updated_at = now()
 WHERE category_id IS NULL
   AND product_code IN (
     'PF-BAKED_POTATO_GRILLED', 'PF-BAKED_SWEET_POTATO', 'PF-COOKED_BUCKWHEAT',
     'PF-COOKED_QUINOA', 'PF-COOKED_RICE', 'PF-COOKED_RICE_BROWN', 'PF-CORN_GRILLED',
     'PF-KIDNEY_BEANS_COOKED', 'PF-MASH_POTATO_CLASSIC', 'PF-MASH_POTATO_VEGAN',
     'PF-CHICKEN_SV_HERB', 'PF-CHICKEN_SV_MEXICAN', 'PF-CHICKEN_SV_UNIVERSAL',
     'PF-KEBAB_LAMB', 'PF-SHRIMP_GRILLED', 'PF-CRUNCH_PUMPKIN', 'PF-WHEY-YOGURT'
   );

-- 2g. Cut Vegetables -> KP-PRP-CUT (2 salad bases)
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-CUT'),
       updated_at = now()
 WHERE category_id IS NULL
   AND product_code IN ('PF-SALAD_BASE_CRISPY', 'PF-SALAD_BASE_SUPERFOOD');

-- 2h. Marinades & Mixes -> KP-PRP-MRN (2)
UPDATE nomenclature
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-MRN'),
       updated_at = now()
 WHERE category_id IS NULL
   AND product_code IN ('PF-SPICE_MIX_MEAT', 'PF-MARINATED_RED_ONION');

INSERT INTO migration_log (filename, status)
VALUES ('301_categorize_null_pf_preps.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
