-- 296_categorize_mod_modifiers_kind_families.sql
-- Categorize the 39 LIVE MOD-* modifiers into kind-family L3 categories under the
-- KP-TOP "Toppings & Modifiers" umbrella, so the data-driven /menu MOD filter chips
-- (PR shishka-os#374) populate. Today 40/50 MOD have NULL category_id; the 10 that
-- are set are legacy toppings with 0 dish links, so the chips show only dead items
-- while the real Loyverse-wired modifiers are invisible.
--
-- Model A (one category per KIND family), approved by CEO 2026-06-17. Chosen over
-- exact-per-Loyverse-list mirroring because many MODs belong to 2+ lists
-- (every fruit is in both "Extra Fruit" and "Pick Fruits"; milks span "Milk" +
-- 3 "Base Upgrade" lists) and a single category_id cannot represent that.
--
-- Scope guards:
--   • Touches ONLY product_categories (+6 rows) and nomenclature.category_id (39 rows).
--   • Does NOT touch pos_loyverse_modifier_* / nomenclature_modifier_options.
--   • Does NOT push anything to Loyverse — nothing can disappear there.
--   • MOD-SESAME_COATING intentionally excluded (CEO: sesame is part of the dough
--     recipe by default, not a standalone modifier — separate cleanup task).
--   • Loyverse drift ("Syrups" / "Served with bread" not in pull) handled separately,
--     coordinated with the coffee-modifier session (MC b1615f3a).
--
-- chk_l3_fin_sub_code: new L3 rows must have default_fin_sub_code NOT NULL → 4150
-- (matches existing KP-TOP-* children).
--
-- Reversible: DELETE the 6 new KP-TOP-{MLK,SYR,FRT,NSB,BRD,TMP} categories and
-- reset category_id = NULL for the 39 MODs (Boosters reuse KP-TOP-BST, leave it).
--
-- MC task 943d779e.

BEGIN;

-- 1. New L3 kind-family categories under KP-TOP (id 0ddb356b). Reuse-safe via NOT EXISTS.
INSERT INTO product_categories (code, name, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section)
SELECT v.code, v.name, '0ddb356b-ec6d-49ba-9350-fd135a2f6a26'::uuid, 3, v.sort_order, 4150, true, false
FROM (VALUES
  ('KP-TOP-MLK', 'Milk & Base',            5),
  ('KP-TOP-SYR', 'Syrups',                 6),
  ('KP-TOP-FRT', 'Fruit',                  7),
  ('KP-TOP-NSB', 'Nuts, Seeds & Butters',  8),
  ('KP-TOP-BRD', 'Bread Side',             9),
  ('KP-TOP-TMP', 'Temperature',           10)
) AS v(code, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM product_categories pc WHERE pc.code = v.code
);

-- 2. Assign category_id to the 39 live MODs by kind family.

-- 2a. Milk & Base (7)
UPDATE nomenclature n SET category_id = pc.id, updated_at = now()
  FROM product_categories pc
 WHERE pc.code = 'KP-TOP-MLK'
   AND n.product_code IN ('MOD-MILK_ALMOND','MOD-MILK_COCONUT','MOD-MILK_COW','MOD-MILK_OAT','MOD-MILK_SOY','MOD-BASE_WATER','MOD-GREEK_YOGURT');

-- 2b. Syrups (5)
UPDATE nomenclature n SET category_id = pc.id, updated_at = now()
  FROM product_categories pc
 WHERE pc.code = 'KP-TOP-SYR'
   AND n.product_code IN ('MOD-SYRUP_CARAMEL','MOD-SYRUP_GREEN_MINT','MOD-SYRUP_HAZELNUT','MOD-SYRUP_MAPLE','MOD-SYRUP_VANILLA');

-- 2c. Boosters → reuse existing KP-TOP-BST (6)
UPDATE nomenclature n SET category_id = pc.id, updated_at = now()
  FROM product_categories pc
 WHERE pc.code = 'KP-TOP-BST'
   AND n.product_code IN ('MOD-COFFEE_MCT','MOD-CREATINE','MOD-ESPRESSO_EXTRA','MOD-WHEY_PROTEIN_ADD','MOD-VANILLA_WHEY_PROTEIN_ADD','MOD-LIONS_MANE');

-- 2d. Fruit (12) — SPINACH grouped here per Loyverse fruit lists
UPDATE nomenclature n SET category_id = pc.id, updated_at = now()
  FROM product_categories pc
 WHERE pc.code = 'KP-TOP-FRT'
   AND n.product_code IN ('MOD-AVOCADO','MOD-BANANA','MOD-BLUEBERRY','MOD-KIWI','MOD-MANGO','MOD-PASSION_FRUIT','MOD-PEACH','MOD-PINEAPPLE','MOD-SPINACH','MOD-STRAWBERRY','MOD-APRICOT','MOD-ORANGE');

-- 2e. Nuts, Seeds & Butters (4)
UPDATE nomenclature n SET category_id = pc.id, updated_at = now()
  FROM product_categories pc
 WHERE pc.code = 'KP-TOP-NSB'
   AND n.product_code IN ('MOD-ALMOND_SLICES','MOD-CASHEW_BUTTER_ADD','MOD-CHIA_SEEDS','MOD-PEANUT_BUTTER_ADD');

-- 2f. Bread Side (3)
UPDATE nomenclature n SET category_id = pc.id, updated_at = now()
  FROM product_categories pc
 WHERE pc.code = 'KP-TOP-BRD'
   AND n.product_code IN ('MOD-MINI_BUNS','MOD-NO_BREAD','MOD-SEED_CRACKERS');

-- 2g. Temperature (2)
UPDATE nomenclature n SET category_id = pc.id, updated_at = now()
  FROM product_categories pc
 WHERE pc.code = 'KP-TOP-TMP'
   AND n.product_code IN ('MOD-TEMP_HOT','MOD-TEMP_ICED');

INSERT INTO migration_log (filename, status)
VALUES ('296_categorize_mod_modifiers_kind_families.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
