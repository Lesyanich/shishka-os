-- ═══════════════════════════════════════════════════════════════
-- Migration 067: DB Normalization & Seed Data
-- Phase 7.1 — Fill gaps in tags, product_categories, nomenclature
-- ═══════════════════════════════════════════════════════════════
-- IMPORTANT: Run 067a first (ENUM extension), then this file.
-- Part 0 (ENUM) is in 067a_extend_tag_group_enum.sql
-- ═══════════════════════════════════════════════════════════════
-- CHANGES:
--   Part 1: New tags (21), backfill name_th (37 existing), merge keto+low-carb
--   Part 2: Zero-Waste category, new fin_sub_categories, fill L3 default_fin_sub_code
--   Part 3: Move trimmings to Zero-Waste, merge garbage auto-created rows, nutrition data
--   Part 4: Seed nomenclature_tags (~200 rows)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- PART 1: Tags
-- ══════════════════════════════════════════════════════════════

-- ── 1a. New taste tags (5) ──
INSERT INTO tags (slug, name, name_th, tag_group, color, sort_order) VALUES
  ('sweety',  'Sweet',   'หวาน',     'taste', '#F6AD55', 1),
  ('bittery', 'Bitter',  'ขม',       'taste', '#9F7AEA', 2),
  ('solty',   'Salty',   'เค็ม',     'taste', '#4299E1', 3),
  ('umami',   'Umami',   'อูมามิ',    'taste', '#E53E3E', 4),
  ('soury',   'Sour',    'เปรี้ยว',   'taste', '#48BB78', 5)
ON CONFLICT (slug) DO NOTHING;

-- ── 1b. New boosters tags (7) ──
INSERT INTO tags (slug, name, name_th, tag_group, color, sort_order) VALUES
  ('acid',    'Acid',    'กรด',        'boosters', '#48BB78', 1),
  ('fat',     'Fat',     'ไขมัน',      'boosters', '#F6AD55', 2),
  ('solt',    'Salt',    'เกลือ',      'boosters', '#4299E1', 3),
  ('aroma',   'Aroma',   'กลิ่น',      'boosters', '#D69E2E', 4),
  ('texture', 'Texture', 'เนื้อสัมผัส', 'boosters', '#A0AEC0', 5),
  ('heat',    'Heat',    'ความร้อน',    'boosters', '#E53E3E', 6),
  ('sweet',   'Sweet',   'ความหวาน',    'boosters', '#F6AD55', 7)
ON CONFLICT (slug) DO NOTHING;

-- ── 1c. New science tags (5) ──
INSERT INTO tags (slug, name, name_th, tag_group, color, sort_order) VALUES
  ('molecular-interactions', 'Molecular Interactions', 'ปฏิกิริยาโมเลกุล',      'science', '#805AD5', 1),
  ('bio-processes',          'Bio-Processes',          'กระบวนการทางชีวภาพ',    'science', '#38A169', 2),
  ('food-paring',            'Food Pairing',           'การจับคู่อาหาร',        'science', '#3182CE', 3),
  ('thermal-precision',      'Thermal Precision',      'ความแม่นยำทางความร้อน',  'science', '#E53E3E', 4),
  ('structure-and-state',    'Structure & State',      'โครงสร้างและสถานะ',      'science', '#A0AEC0', 5)
ON CONFLICT (slug) DO NOTHING;

-- ── 1d. New serving tags (3) ──
INSERT INTO tags (slug, name, name_th, tag_group, color, sort_order) VALUES
  ('hot',     'Hot',     'ร้อน',  'serving', '#E53E3E', 1),
  ('fresh',   'Fresh',   'สด',    'serving', '#48BB78', 2),
  ('chilled', 'Chilled', 'เย็น',  'serving', '#3182CE', 3)
ON CONFLICT (slug) DO NOTHING;

-- ── 1e. New ops tag (1) ──
INSERT INTO tags (slug, name, name_th, tag_group, sort_order) VALUES
  ('zero-waste', 'Zero-Waste', 'ไม่ทิ้ง', 'ops', 1)
ON CONFLICT (slug) DO NOTHING;

-- ── 1f. Backfill name_th for all existing 37 tags ──
-- Dietary
UPDATE tags SET name_th = 'มังสวิรัติเข้มงวด' WHERE slug = 'vegan'       AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'มังสวิรัติ'        WHERE slug = 'vegetarian'  AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'คีโต'             WHERE slug = 'keto'        AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'พาลีโอ'           WHERE slug = 'paleo'       AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'โฮล30'            WHERE slug = 'whole30'     AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ฮาลาล'            WHERE slug = 'halal'       AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ปราศจากกลูเตน'     WHERE slug = 'gluten-free' AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ปราศจากนม'         WHERE slug = 'dairy-free'  AND (name_th IS NULL OR name_th = '');
-- Allergens
UPDATE tags SET name_th = 'มีกลูเตน'     WHERE slug = 'allergen-gluten'    AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'มีนม'         WHERE slug = 'allergen-dairy'     AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'มีถั่ว'       WHERE slug = 'allergen-nuts'      AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'มีถั่วเหลือง'  WHERE slug = 'allergen-soy'       AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'มีไข่'        WHERE slug = 'allergen-eggs'      AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'มีปลา'        WHERE slug = 'allergen-fish'      AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'มีหอย'        WHERE slug = 'allergen-shellfish' AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'มีงา'         WHERE slug = 'allergen-sesame'    AND (name_th IS NULL OR name_th = '');
-- Storage
UPDATE tags SET name_th = 'แช่แข็ง'          WHERE slug = 'storage-frozen'  AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'แช่เย็น (0-4°C)'  WHERE slug = 'storage-chilled' AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'อุณหภูมิห้อง'      WHERE slug = 'storage-ambient' AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'เก็บแห้ง'          WHERE slug = 'storage-dry'     AND (name_th IS NULL OR name_th = '');
-- Quality
UPDATE tags SET name_th = 'ออร์แกนิก'          WHERE slug = 'organic'  AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ไม่ดัดแปลงพันธุกรรม' WHERE slug = 'non-gmo'  AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ผลิตในไทย'          WHERE slug = 'local-th' AND (name_th IS NULL OR name_th = '');
-- Functional
UPDATE tags SET name_th = 'โปรตีนสูง'       WHERE slug = 'high-protein'       AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'คาร์บต่ำ'        WHERE slug = 'low-carb'           AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'โปรไบโอติก'      WHERE slug = 'probiotic'          AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'แอนตี้ออกซิแดนท์' WHERE slug = 'antioxidant'        AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ต้านการอักเสบ'    WHERE slug = 'anti-inflammatory'  AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'อะแดปโตเจนิก'    WHERE slug = 'adaptogenic'        AND (name_th IS NULL OR name_th = '');
-- Technique
UPDATE tags SET name_th = 'หมัก'    WHERE slug = 'technique-fermented' AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ดิบ'     WHERE slug = 'technique-raw'       AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'คั่ว'    WHERE slug = 'technique-roasted'   AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'นึ่ง'    WHERE slug = 'technique-steamed'   AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'รมควัน'  WHERE slug = 'technique-smoked'    AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ซูวีด'   WHERE slug = 'technique-sousvide'  AND (name_th IS NULL OR name_th = '');
-- Cuisine
UPDATE tags SET name_th = 'ไทย'             WHERE slug = 'cuisine-thai'          AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'ญี่ปุ่น'          WHERE slug = 'cuisine-japanese'      AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'เมดิเตอร์เรเนียน' WHERE slug = 'cuisine-mediterranean' AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'อินเดีย'          WHERE slug = 'cuisine-indian'        AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'จอร์เจีย'         WHERE slug = 'cuisine-georgian'      AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'อาหรับ'           WHERE slug = 'cuisine-arabic'        AND (name_th IS NULL OR name_th = '');
UPDATE tags SET name_th = 'นอร์ดิก'          WHERE slug = 'cuisine-nordic'        AND (name_th IS NULL OR name_th = '');

-- ── 1g. Merge keto + low-carb duplicates ──
UPDATE tags SET name = 'Keto & Low Carbs', name_th = 'คีโตและคาร์บต่ำ', slug = 'keto-lowcarb'
WHERE slug = 'keto';
UPDATE tags SET color = '#718096', name = 'Low Carb (→ see keto-lowcarb)'
WHERE slug = 'low-carb';


-- ══════════════════════════════════════════════════════════════
-- PART 2: product_categories & fin_sub_categories
-- ══════════════════════════════════════════════════════════════

-- ── 2a. Fix typo F-GRN-LGM (idempotent) ──
UPDATE product_categories SET name = 'Legumes' WHERE code = 'F-GRN-LGM';

-- ── 2b. Add Zero-Waste By-products category ──
-- L2 parent under Food (F)
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order)
VALUES ('F-ZW', 'Zero-Waste', 'วัสดุเหลือใช้',
  (SELECT id FROM product_categories WHERE code = 'F'), 2, 99)
ON CONFLICT (code) DO NOTHING;

-- L3 leaf
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code)
VALUES ('F-ZW-BYP', 'Zero-Waste By-products', 'ผลพลอยได้',
  (SELECT id FROM product_categories WHERE code = 'F-ZW'), 3, 1, 4101)
ON CONFLICT (code) DO NOTHING;

-- ── 2c. New fin_sub_categories for NF + KP ──
INSERT INTO fin_sub_categories (sub_code, category_code, name) VALUES
  (2303, 2300, 'Cleaning Supplies'),
  (2304, 2300, 'Office Supplies'),
  (4150, 4100, 'Internal Production'),
  (4203, 4200, 'Disposables')
ON CONFLICT (sub_code) DO NOTHING;

-- ── 2d. Fill NULL default_fin_sub_code for all L3 nodes ──
-- NF (Non-Food) L3 nodes
UPDATE product_categories SET default_fin_sub_code = 2303 WHERE code IN ('NF-CLN-DSH', 'NF-CLN-SRF', 'NF-CLN-SAN');
UPDATE product_categories SET default_fin_sub_code = 4201 WHERE code = 'NF-PKG-BAG';
UPDATE product_categories SET default_fin_sub_code = 4203 WHERE code IN ('NF-DSP-GLV', 'NF-DSP-PPR', 'NF-DSP-FLM');
UPDATE product_categories SET default_fin_sub_code = 2304 WHERE code = 'NF-OFC-GEN';

-- KP (Kitchen Production) L3 nodes — internal production cost via BOM
UPDATE product_categories SET default_fin_sub_code = 4150
WHERE code IN (
  'KP-BSE-BRT', 'KP-BSE-SAU', 'KP-BSE-PUR',
  'KP-PRP-CUT', 'KP-PRP-MRN', 'KP-PRP-RCK',
  'KP-FIN-BWL', 'KP-FIN-SLD', 'KP-FIN-SOU', 'KP-FIN-WRP',
  'KP-DRK-JCE', 'KP-DRK-SMT', 'KP-DRK-HOT',
  'KP-TOP-CRN', 'KP-TOP-SFT', 'KP-TOP-SAU', 'KP-TOP-BST'
);

-- ── 2e. Enforce NOT NULL on L3 default_fin_sub_code ──
ALTER TABLE product_categories
  ADD CONSTRAINT chk_l3_fin_sub_code
  CHECK (level < 3 OR default_fin_sub_code IS NOT NULL);


-- ══════════════════════════════════════════════════════════════
-- PART 3: nomenclature cleanup
-- ══════════════════════════════════════════════════════════════

-- ── 3a. Move trimmings / stems / cores to Zero-Waste ──
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-ZW-BYP')
WHERE id IN (
  'd8bfbc03-85e3-46a4-bf2f-4fbb600eeede',  -- RAW-ROOT-TRIMMINGS
  'd9d3ccb5-9cc1-429e-8ed2-24471c2c49fe',  -- RAW-ONION-TRIMMINGS
  '711435cf-3e44-4681-99e3-f0c069cbac05',  -- RAW-HERB-STEMS
  '444b2e0e-fa8d-4515-9540-ba1c331d1de6',  -- RAW-MUSHROOM-STEMS
  '96c780a8-b5b6-4e08-8b23-b7c0b4923a62'   -- RAW-CABBAGE-CORES
);

-- ── 3b. Merge RAW-AUTO-0012e408 (Butter duplicate) → RAW-BUTTER ──
UPDATE purchase_logs SET nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-BUTTER')
  WHERE nomenclature_id = 'f14b4ff4-95e7-489a-9af0-aeae4ef98dc8';
UPDATE sku SET nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-BUTTER')
  WHERE nomenclature_id = 'f14b4ff4-95e7-489a-9af0-aeae4ef98dc8';
UPDATE sku_balances SET nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-BUTTER')
  WHERE nomenclature_id = 'f14b4ff4-95e7-489a-9af0-aeae4ef98dc8';
UPDATE receiving_lines SET nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-BUTTER')
  WHERE nomenclature_id = 'f14b4ff4-95e7-489a-9af0-aeae4ef98dc8';
UPDATE supplier_catalog SET nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-BUTTER')
  WHERE nomenclature_id = 'f14b4ff4-95e7-489a-9af0-aeae4ef98dc8';
DELETE FROM nomenclature WHERE id = 'f14b4ff4-95e7-489a-9af0-aeae4ef98dc8';

-- ── 3c. Delete RAW-AUTO-41a0a5de (UNKNOWN_NOMENCLATURE) + orphans ──
DELETE FROM receiving_lines  WHERE nomenclature_id = '44873a57-5c4a-41a9-a5b6-c1a8619301cf';
DELETE FROM sku_balances     WHERE nomenclature_id = '44873a57-5c4a-41a9-a5b6-c1a8619301cf';
DELETE FROM purchase_logs    WHERE nomenclature_id = '44873a57-5c4a-41a9-a5b6-c1a8619301cf';
DELETE FROM sku              WHERE nomenclature_id = '44873a57-5c4a-41a9-a5b6-c1a8619301cf';
DELETE FROM supplier_catalog WHERE nomenclature_id = '44873a57-5c4a-41a9-a5b6-c1a8619301cf';
DELETE FROM nomenclature     WHERE id = '44873a57-5c4a-41a9-a5b6-c1a8619301cf';

-- ── 3d. Nutrition data (USDA FoodData Central, per 100g) ──
-- Vegetables
UPDATE nomenclature SET calories=41,  protein=0.9,  carbs=9.6,  fat=0.2   WHERE product_code='RAW-CARROT';
UPDATE nomenclature SET calories=40,  protein=1.1,  carbs=9.3,  fat=0.1   WHERE product_code='RAW-ONION';
UPDATE nomenclature SET calories=18,  protein=0.9,  carbs=3.9,  fat=0.2   WHERE product_code='RAW-TOMATO';
UPDATE nomenclature SET calories=15,  protein=0.7,  carbs=3.6,  fat=0.1   WHERE product_code='RAW-CUCUMBER';
UPDATE nomenclature SET calories=23,  protein=2.9,  carbs=3.6,  fat=0.4   WHERE product_code='RAW-SPINACH';
UPDATE nomenclature SET calories=25,  protein=1.3,  carbs=5.8,  fat=0.1   WHERE product_code='RAW-CABBAGE';
UPDATE nomenclature SET calories=77,  protein=2.0,  carbs=17.5, fat=0.1   WHERE product_code='RAW-POTATO';
UPDATE nomenclature SET calories=26,  protein=1.0,  carbs=6.5,  fat=0.1   WHERE product_code='RAW-PUMPKIN';
UPDATE nomenclature SET calories=22,  protein=3.1,  carbs=3.3,  fat=0.3   WHERE product_code='RAW-MUSHROOM-STEMS';
UPDATE nomenclature SET calories=34,  protein=2.8,  carbs=6.6,  fat=0.4   WHERE product_code='RAW-BEETROOT';
-- Fruit
UPDATE nomenclature SET calories=29,  protein=1.1,  carbs=9.3,  fat=0.3   WHERE product_code='RAW-LEMON';
-- Herbs
UPDATE nomenclature SET calories=36,  protein=3.0,  carbs=6.3,  fat=0.8   WHERE product_code='RAW-PARSLEY';
UPDATE nomenclature SET calories=23,  protein=3.2,  carbs=2.6,  fat=0.6   WHERE product_code='RAW-BASIL';
UPDATE nomenclature SET calories=70,  protein=3.7,  carbs=14.9, fat=0.9   WHERE product_code='RAW-MINT';
-- Proteins
UPDATE nomenclature SET calories=165, protein=31.0, carbs=0,    fat=3.6   WHERE product_code='RAW-CHICKEN-BREAST';
UPDATE nomenclature SET calories=208, protein=20.4, carbs=0,    fat=13.4  WHERE product_code='RAW-SALMON';
UPDATE nomenclature SET calories=155, protein=12.6, carbs=1.1,  fat=10.6  WHERE product_code='RAW-EGG';
-- Grains
UPDATE nomenclature SET calories=112, protein=2.3,  carbs=23.5, fat=0.8   WHERE product_code='RAW-RICE-BROWN';
UPDATE nomenclature SET calories=120, protein=4.4,  carbs=21.3, fat=1.9   WHERE product_code='RAW-QUINOA';
UPDATE nomenclature SET calories=379, protein=13.1, carbs=67.7, fat=6.5   WHERE product_code='RAW-OATS';
-- Dairy & Fats
UPDATE nomenclature SET calories=340, protein=2.1,  carbs=2.8,  fat=36.1  WHERE product_code='RAW-CREAM';
UPDATE nomenclature SET calories=230, protein=2.3,  carbs=5.5,  fat=23.8  WHERE product_code='RAW-COCONUT-MILK';
UPDATE nomenclature SET calories=717, protein=0.9,  carbs=0.1,  fat=81.1  WHERE product_code='RAW-BUTTER';
UPDATE nomenclature SET calories=884, protein=0,    carbs=0,    fat=100.0 WHERE product_code='RAW-OLIVE-OIL';
UPDATE nomenclature SET calories=862, protein=0,    carbs=0,    fat=100.0 WHERE product_code='RAW-COCONUT-OIL';
-- Nuts & Seeds
UPDATE nomenclature SET calories=579, protein=21.2, carbs=21.7, fat=49.9  WHERE product_code='RAW-ALMONDS';
UPDATE nomenclature SET calories=486, protein=16.5, carbs=42.1, fat=30.7  WHERE product_code='RAW-CHIA-SEEDS';
UPDATE nomenclature SET calories=559, protein=30.2, carbs=10.7, fat=49.1  WHERE product_code='RAW-PUMPKIN-SEEDS';
-- Spices
UPDATE nomenclature SET calories=251, protein=10.4, carbs=63.9, fat=3.3   WHERE product_code='RAW-PEPPER-BLACK';
UPDATE nomenclature SET calories=312, protein=9.7,  carbs=67.1, fat=3.2   WHERE product_code='RAW-TURMERIC';
UPDATE nomenclature SET calories=298, protein=12.4, carbs=54.9, fat=17.8  WHERE product_code='RAW-CORIANDER-POWDER';
UPDATE nomenclature SET calories=80,  protein=1.8,  carbs=17.8, fat=0.8   WHERE product_code='RAW-GINGER';
UPDATE nomenclature SET calories=149, protein=6.4,  carbs=33.1, fat=0.5   WHERE product_code='RAW-GARLIC';
UPDATE nomenclature SET calories=0,   protein=0,    carbs=0,    fat=0     WHERE product_code='RAW-SALT-PLAIN';
UPDATE nomenclature SET calories=0,   protein=0,    carbs=0,    fat=0     WHERE product_code='RAW-SALT-IODIZED';
UPDATE nomenclature SET calories=0,   protein=0,    carbs=0,    fat=0     WHERE product_code='RAW-SALT-CURING';
-- Sweeteners
UPDATE nomenclature SET calories=304, protein=0.3,  carbs=82.4, fat=0     WHERE product_code='RAW-HONEY';
UPDATE nomenclature SET calories=375, protein=1.1,  carbs=93.4, fat=0.5   WHERE product_code='RAW-COCONUT-SUGAR';
-- Flours
UPDATE nomenclature SET calories=332, protein=13.2, carbs=72.6, fat=1.9   WHERE product_code='RAW-FLOUR-WW';
UPDATE nomenclature SET calories=361, protein=6.9,  carbs=76.8, fat=3.9   WHERE product_code='RAW-FLOUR-CORN';
UPDATE nomenclature SET calories=366, protein=5.9,  carbs=80.1, fat=1.4   WHERE product_code='RAW-FLOUR-RICE-GL';
-- Legumes
UPDATE nomenclature SET calories=81,  protein=5.4,  carbs=14.5, fat=0.4   WHERE product_code='RAW-PEA-GREEN';
-- Starch
UPDATE nomenclature SET calories=358, protein=0.2,  carbs=88.7, fat=0.0   WHERE product_code='RAW-STARCH-TAPIOCA';
-- Sauces & condiments
UPDATE nomenclature SET calories=232, protein=3.0,  carbs=44.0, fat=5.8   WHERE product_code='RAW-CHILI-PASTE';
UPDATE nomenclature SET calories=53,  protein=8.1,  carbs=4.9,  fat=0.1   WHERE product_code='RAW-SOY-SAUCE';
UPDATE nomenclature SET calories=35,  protein=5.1,  carbs=3.6,  fat=0.0   WHERE product_code='RAW-FISH-SAUCE';
-- Baking
UPDATE nomenclature SET calories=53,  protein=0,    carbs=27.7, fat=0     WHERE product_code='RAW-BAKING-POWDER';
-- Zero-waste items (cost ≈ 0, nutritional value varies)
UPDATE nomenclature SET calories=0,   protein=0,    carbs=0,    fat=0     WHERE product_code='RAW-ROOT-TRIMMINGS';
UPDATE nomenclature SET calories=0,   protein=0,    carbs=0,    fat=0     WHERE product_code='RAW-ONION-TRIMMINGS';
UPDATE nomenclature SET calories=0,   protein=0,    carbs=0,    fat=0     WHERE product_code='RAW-HERB-STEMS';
UPDATE nomenclature SET calories=0,   protein=0,    carbs=0,    fat=0     WHERE product_code='RAW-CABBAGE-CORES';
-- Lemon juice & RO water (by-products)
UPDATE nomenclature SET calories=22,  protein=0.4,  carbs=6.9,  fat=0.2   WHERE product_code='RAW-LEMON-JUICE';
UPDATE nomenclature SET calories=0,   protein=0,    carbs=0,    fat=0     WHERE product_code='RAW-RO-WATER';


-- ══════════════════════════════════════════════════════════════
-- PART 4: Seed nomenclature_tags
-- ══════════════════════════════════════════════════════════════
-- Pattern: INSERT INTO nomenclature_tags SELECT n.id, t.id
--          FROM nomenclature n, tags t WHERE ... ON CONFLICT DO NOTHING

-- ── 4a. All vegetables → vegan, vegetarian, gluten-free, dairy-free ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN (
  'RAW-CARROT', 'RAW-ONION', 'RAW-TOMATO', 'RAW-CUCUMBER',
  'RAW-SPINACH', 'RAW-CABBAGE', 'RAW-POTATO', 'RAW-PUMPKIN',
  'RAW-BEETROOT', 'RAW-LEMON'
) AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4b. Herbs → vegan, vegetarian, gluten-free, dairy-free ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-PARSLEY', 'RAW-BASIL', 'RAW-MINT')
AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4c. Mushrooms → vegan, vegetarian, gluten-free, dairy-free ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-MUSHROOM-STEMS'
AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4d. Proteins — chicken, salmon ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-CHICKEN-BREAST', 'RAW-SALMON')
AND t.slug IN ('high-protein', 'paleo', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Chicken → keto
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-CHICKEN-BREAST'
AND t.slug = 'keto-lowcarb'
ON CONFLICT DO NOTHING;

-- Salmon → anti-inflammatory, cuisine-nordic, cuisine-japanese
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-SALMON'
AND t.slug IN ('anti-inflammatory', 'cuisine-nordic', 'cuisine-japanese')
ON CONFLICT DO NOTHING;

-- ── 4e. Egg → allergen-eggs, high-protein, keto, vegetarian ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-EGG'
AND t.slug IN ('allergen-eggs', 'high-protein', 'keto-lowcarb', 'vegetarian', 'gluten-free')
ON CONFLICT DO NOTHING;

-- ── 4f. Grains → vegan, vegetarian, dairy-free ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-RICE-BROWN', 'RAW-QUINOA', 'RAW-OATS')
AND t.slug IN ('vegan', 'vegetarian', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Quinoa → gluten-free, high-protein
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-QUINOA'
AND t.slug IN ('gluten-free', 'high-protein')
ON CONFLICT DO NOTHING;

-- Oats → allergen-gluten (cross-contamination risk)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-OATS'
AND t.slug = 'allergen-gluten'
ON CONFLICT DO NOTHING;

-- Rice → gluten-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-RICE-BROWN'
AND t.slug = 'gluten-free'
ON CONFLICT DO NOTHING;

-- ── 4g. Dairy & fats ──
-- Cream, Butter → allergen-dairy, vegetarian, gluten-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-CREAM', 'RAW-BUTTER')
AND t.slug IN ('allergen-dairy', 'vegetarian', 'gluten-free', 'keto-lowcarb')
ON CONFLICT DO NOTHING;

-- Coconut milk, Coconut oil → vegan, dairy-free, gluten-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-COCONUT-MILK', 'RAW-COCONUT-OIL')
AND t.slug IN ('vegan', 'vegetarian', 'dairy-free', 'gluten-free')
ON CONFLICT DO NOTHING;

-- Olive oil → vegan, dairy-free, gluten-free, cuisine-mediterranean
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-OLIVE-OIL'
AND t.slug IN ('vegan', 'vegetarian', 'dairy-free', 'gluten-free', 'cuisine-mediterranean', 'keto-lowcarb')
ON CONFLICT DO NOTHING;

-- ── 4h. Nuts & Seeds → vegan, vegetarian, dairy-free, gluten-free ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-ALMONDS', 'RAW-CHIA-SEEDS', 'RAW-PUMPKIN-SEEDS')
AND t.slug IN ('vegan', 'vegetarian', 'dairy-free', 'gluten-free', 'high-protein')
ON CONFLICT DO NOTHING;

-- Almonds → allergen-nuts
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-ALMONDS'
AND t.slug = 'allergen-nuts'
ON CONFLICT DO NOTHING;

-- Chia → anti-inflammatory
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-CHIA-SEEDS'
AND t.slug = 'anti-inflammatory'
ON CONFLICT DO NOTHING;

-- ── 4i. Spices → vegan, vegetarian, gluten-free, dairy-free, storage-dry ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN (
  'RAW-PEPPER-BLACK', 'RAW-TURMERIC', 'RAW-CORIANDER-POWDER',
  'RAW-GINGER', 'RAW-GARLIC', 'RAW-SHISHKA-MIX'
) AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'storage-dry')
ON CONFLICT DO NOTHING;

-- Turmeric → anti-inflammatory, antioxidant, cuisine-indian
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-TURMERIC'
AND t.slug IN ('anti-inflammatory', 'antioxidant', 'cuisine-indian')
ON CONFLICT DO NOTHING;

-- Ginger → anti-inflammatory, cuisine-thai, cuisine-japanese
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-GINGER'
AND t.slug IN ('anti-inflammatory', 'cuisine-thai', 'cuisine-japanese')
ON CONFLICT DO NOTHING;

-- Coriander → cuisine-indian, cuisine-thai
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-CORIANDER-POWDER'
AND t.slug IN ('cuisine-indian', 'cuisine-thai')
ON CONFLICT DO NOTHING;

-- ── 4j. Salt → storage-dry, vegan, gluten-free ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-SALT-PLAIN', 'RAW-SALT-IODIZED', 'RAW-SALT-CURING')
AND t.slug IN ('storage-dry', 'vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4k. Sweeteners → vegan, gluten-free, dairy-free, storage-dry ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-HONEY', 'RAW-COCONUT-SUGAR')
AND t.slug IN ('gluten-free', 'dairy-free', 'storage-dry')
ON CONFLICT DO NOTHING;

-- Honey → vegetarian (not vegan), antioxidant
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-HONEY'
AND t.slug IN ('vegetarian', 'antioxidant')
ON CONFLICT DO NOTHING;

-- Coconut sugar → vegan
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-COCONUT-SUGAR'
AND t.slug IN ('vegan', 'vegetarian')
ON CONFLICT DO NOTHING;

-- ── 4l. Flours → vegan, vegetarian, dairy-free, storage-dry ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-FLOUR-WW', 'RAW-FLOUR-CORN', 'RAW-FLOUR-RICE-GL')
AND t.slug IN ('vegan', 'vegetarian', 'dairy-free', 'storage-dry')
ON CONFLICT DO NOTHING;

-- WW flour → allergen-gluten
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-FLOUR-WW'
AND t.slug = 'allergen-gluten'
ON CONFLICT DO NOTHING;

-- Corn & rice flour → gluten-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-FLOUR-CORN', 'RAW-FLOUR-RICE-GL')
AND t.slug = 'gluten-free'
ON CONFLICT DO NOTHING;

-- ── 4m. Starch → vegan, vegetarian, gluten-free, dairy-free, storage-dry ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-STARCH-TAPIOCA'
AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'storage-dry')
ON CONFLICT DO NOTHING;

-- ── 4n. Frozen items → storage-frozen ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-PEA-GREEN'
AND t.slug IN ('storage-frozen', 'vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4o. Sauces → cuisine tags ──
-- Chili paste → cuisine-thai
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-CHILI-PASTE'
AND t.slug IN ('cuisine-thai', 'vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Soy sauce → cuisine-japanese, allergen-soy, allergen-gluten
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-SOY-SAUCE'
AND t.slug IN ('cuisine-japanese', 'allergen-soy', 'allergen-gluten', 'vegan', 'vegetarian', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Fish sauce → cuisine-thai, allergen-fish
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-FISH-SAUCE'
AND t.slug IN ('cuisine-thai', 'allergen-fish', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4p. Storage tags for chilled items ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN (
  'RAW-CHICKEN-BREAST', 'RAW-SALMON', 'RAW-EGG',
  'RAW-CREAM', 'RAW-BUTTER', 'RAW-COCONUT-MILK'
) AND t.slug = 'storage-chilled'
ON CONFLICT DO NOTHING;

-- Ambient/dry storage for shelf-stable items
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN (
  'RAW-RICE-BROWN', 'RAW-QUINOA', 'RAW-OATS',
  'RAW-OLIVE-OIL', 'RAW-COCONUT-OIL',
  'RAW-ALMONDS', 'RAW-CHIA-SEEDS', 'RAW-PUMPKIN-SEEDS',
  'RAW-BAKING-POWDER', 'RAW-STARCH-TAPIOCA'
) AND t.slug = 'storage-dry'
ON CONFLICT DO NOTHING;

-- Fresh vegetables & herbs → storage-chilled
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN (
  'RAW-CARROT', 'RAW-ONION', 'RAW-TOMATO', 'RAW-CUCUMBER',
  'RAW-SPINACH', 'RAW-CABBAGE', 'RAW-POTATO', 'RAW-PUMPKIN',
  'RAW-BEETROOT', 'RAW-LEMON',
  'RAW-PARSLEY', 'RAW-BASIL', 'RAW-MINT',
  'RAW-GINGER', 'RAW-GARLIC'
) AND t.slug = 'storage-chilled'
ON CONFLICT DO NOTHING;

-- ── 4q. Zero-waste tag for trimmings/stems/cores ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN (
  'RAW-ROOT-TRIMMINGS', 'RAW-ONION-TRIMMINGS',
  'RAW-HERB-STEMS', 'RAW-MUSHROOM-STEMS', 'RAW-CABBAGE-CORES'
) AND t.slug = 'zero-waste'
ON CONFLICT DO NOTHING;

-- Trimmings are also vegan, vegetarian, gluten-free, dairy-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN (
  'RAW-ROOT-TRIMMINGS', 'RAW-ONION-TRIMMINGS',
  'RAW-HERB-STEMS', 'RAW-MUSHROOM-STEMS', 'RAW-CABBAGE-CORES'
) AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4r. Fermented items → technique-fermented, probiotic ──
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'PF-FERMENTED_CABBAGE'
AND t.slug IN ('technique-fermented', 'probiotic', 'vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4s. Kitchen production items (PF-*) ──
-- Vegetable broth → vegan, vegetarian, gluten-free, dairy-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'PF-VEGETABLE_BROTH'
AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Borsch base → vegan, vegetarian, gluten-free, dairy-free, cuisine-georgian
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'PF-BORSCH_BASE'
AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'cuisine-georgian')
ON CONFLICT DO NOTHING;

-- Pumpkin coconut base → vegan, dairy-free, gluten-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'PF-PUMPKIN_COCONUT_BASE'
AND t.slug IN ('vegan', 'vegetarian', 'dairy-free', 'gluten-free', 'cuisine-thai')
ON CONFLICT DO NOTHING;

-- Baked beet/pumpkin → technique-roasted, vegan
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('PF-BAKED_BEETROOT', 'PF-BAKED_PUMPKIN')
AND t.slug IN ('technique-roasted', 'vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Mirepoix sauté
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'PF-MIREPOIX_SAUTE'
AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4t. Finished products (SALE-*) ──
-- Borsch → hot, cuisine-georgian, antioxidant
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'SALE-BORSCH_BIOACTIVE'
AND t.slug IN ('hot', 'cuisine-georgian', 'antioxidant', 'vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Pumpkin soup → hot, vegan, dairy-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'SALE-PUMPKIN_SOUP'
AND t.slug IN ('hot', 'vegan', 'vegetarian', 'dairy-free', 'gluten-free', 'cuisine-thai')
ON CONFLICT DO NOTHING;

-- Kraut side → chilled, probiotic, technique-fermented
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'SALE-KRAUT_SIDE'
AND t.slug IN ('chilled', 'probiotic', 'technique-fermented', 'vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- ── 4u. Modifiers (MOD-*) ──
-- Coconut yogurt → vegan, dairy-free, probiotic
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'MOD-COCONUT_YOGURT'
AND t.slug IN ('vegan', 'vegetarian', 'dairy-free', 'gluten-free', 'probiotic')
ON CONFLICT DO NOTHING;

-- Sour cream → vegetarian, allergen-dairy
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'MOD-SOUR_CREAM'
AND t.slug IN ('vegetarian', 'allergen-dairy', 'gluten-free', 'keto-lowcarb')
ON CONFLICT DO NOTHING;

-- Greens → vegan, vegetarian, gluten-free, dairy-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('MOD-GREENS', 'MOD-RED_BEANS')
AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Ancient crunch → vegan, vegetarian, gluten-free, dairy-free
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'MOD-ANCIENT_CRUNCH'
AND t.slug IN ('vegan', 'vegetarian', 'gluten-free', 'dairy-free')
ON CONFLICT DO NOTHING;

-- Sous-vide chicken → high-protein, technique-sousvide, paleo
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'MOD-SOUSVIDE_CHICKEN'
AND t.slug IN ('high-protein', 'technique-sousvide', 'paleo', 'gluten-free', 'dairy-free', 'keto-lowcarb')
ON CONFLICT DO NOTHING;

-- ── 4v. Taste profile tags for key items ──
-- Spinach → bittery
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-SPINACH' AND t.slug = 'bittery'
ON CONFLICT DO NOTHING;

-- Tomato → umami, soury
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-TOMATO' AND t.slug IN ('umami', 'soury')
ON CONFLICT DO NOTHING;

-- Lemon → soury, acid (booster)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-LEMON', 'RAW-LEMON-JUICE') AND t.slug IN ('soury', 'acid')
ON CONFLICT DO NOTHING;

-- Honey → sweety
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-HONEY', 'RAW-COCONUT-SUGAR') AND t.slug = 'sweety'
ON CONFLICT DO NOTHING;

-- Salt → solty, solt (booster)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-SALT-PLAIN', 'RAW-SALT-IODIZED') AND t.slug IN ('solty', 'solt')
ON CONFLICT DO NOTHING;

-- Fish sauce, soy sauce → umami
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-FISH-SAUCE', 'RAW-SOY-SAUCE') AND t.slug = 'umami'
ON CONFLICT DO NOTHING;

-- Chili paste → heat (booster)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-CHILI-PASTE' AND t.slug = 'heat'
ON CONFLICT DO NOTHING;

-- Pepper → heat (booster)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-PEPPER-BLACK' AND t.slug = 'heat'
ON CONFLICT DO NOTHING;

-- Oils/butter/cream → fat (booster)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-OLIVE-OIL', 'RAW-COCONUT-OIL', 'RAW-BUTTER', 'RAW-CREAM')
AND t.slug = 'fat'
ON CONFLICT DO NOTHING;

-- Herbs → aroma (booster)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-PARSLEY', 'RAW-BASIL', 'RAW-MINT', 'RAW-GINGER', 'RAW-GARLIC')
AND t.slug = 'aroma'
ON CONFLICT DO NOTHING;

-- Nuts/seeds → texture (booster)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-ALMONDS', 'RAW-CHIA-SEEDS', 'RAW-PUMPKIN-SEEDS')
AND t.slug = 'texture'
ON CONFLICT DO NOTHING;

-- Ancient crunch → texture (booster)
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'MOD-ANCIENT_CRUNCH' AND t.slug = 'texture'
ON CONFLICT DO NOTHING;

COMMIT;

-- ══════════════════════════════════════════════════════════════
-- Migration 067 complete.
-- Verification queries (run manually):
--
-- 1. All L3 have default_fin_sub_code:
--    SELECT code, name FROM product_categories WHERE level = 3 AND default_fin_sub_code IS NULL;
--    → 0 rows
--
-- 2. nomenclature_tags not empty:
--    SELECT count(*) FROM nomenclature_tags;
--    → > 100
--
-- 3. Zero-Waste items:
--    SELECT n.product_code, pc.code FROM nomenclature n
--    JOIN product_categories pc ON pc.id = n.category_id
--    WHERE n.product_code LIKE 'RAW-%-TRIMMINGS'
--       OR n.product_code LIKE 'RAW-%-STEMS'
--       OR n.product_code LIKE 'RAW-%-CORES';
--    → all F-ZW-BYP
--
-- 4. name_th filled:
--    SELECT slug FROM tags WHERE name_th IS NULL OR name_th = '';
--    → 0 rows
--
-- 5. Nutrition data:
--    SELECT count(*) FROM nomenclature WHERE product_code LIKE 'RAW-%' AND calories > 0;
--    → > 30
--
-- 6. Garbage cleaned:
--    SELECT id FROM nomenclature WHERE product_code LIKE 'RAW-AUTO-%';
--    → should NOT contain f14b4ff4... or 44873a57...
-- ══════════════════════════════════════════════════════════════
