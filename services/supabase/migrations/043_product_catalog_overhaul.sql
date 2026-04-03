-- ═══════════════════════════════════════════════════════════════
-- Migration 043: Product Catalog Overhaul
-- Phase 6.8: Category Expansion + Nomenclature Seeding
-- ═══════════════════════════════════════════════════════════════
-- PURPOSE: Expand food sub-categories from 3→11 (based on CEO taxonomy),
--          enrich supplier_products with structured package fields + FK refs,
--          seed nomenclature with ~38 RAW- products for healthy kitchen.
--
-- SOURCE: CEO's Books.xlsx → categories sheet (143 records, type 3001=product)
--         9 parent groups → mapped to fin_sub_categories under 4100.
-- ═══════════════════════════════════════════════════════════════

-- ═══ PART A: Expand fin_sub_categories (3 → 11 food categories) ═══

-- Rename existing to match CEO taxonomy
UPDATE fin_sub_categories SET name = 'Produce & Fungi' WHERE sub_code = 4101 AND name = 'Produce (Veg/Fruit)';

-- Add 8 new food sub-categories (based on CEO product taxonomy 3001)
INSERT INTO fin_sub_categories (sub_code, category_code, name) VALUES
  (4104, 4100, 'Dairy & Fats'),                -- DR&FAT: cheeses, dairy, oils, butter
  (4105, 4100, 'Nuts & Seeds'),                -- NTS&SDS: walnuts, almonds, pumpkin seeds
  (4106, 4100, 'Spices & Pantry'),             -- FNCTN: spices, dry herbs, sweeteners, vinegar
  (4107, 4100, 'Bakery & Flour'),              -- BKR&PSTR: flours, starches, baking powder, bread
  (4108, 4100, 'Fermented & Preserved'),       -- PRESERV: kimchi, sauerkraut, pickled, kombucha
  (4109, 4100, 'Snacks'),                      -- SNKS: healthy bars, energy bites
  (4110, 4100, 'Beverages'),                   -- drinks: coffee, tea, ovaltine
  (4111, 4100, 'Sauces & Condiments')          -- sauces: chili paste, soy sauce, fish sauce
ON CONFLICT (sub_code) DO NOTHING;


-- ═══ PART B: ALTER supplier_products — add structured columns ═══

-- Full title as displayed on Makro website (e.g. "KNORR Corn Flour 700 g")
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS full_title TEXT;

-- Split package_weight into structured fields
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS package_qty NUMERIC;     -- 700, 1, 4, 30
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS package_unit TEXT;        -- g, kg, ml, L, pcs, cc
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS package_type TEXT;        -- bag, pack, bottle, box, can, tray

-- Replace text category with proper FK to fin_categories/fin_sub_categories
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS category_code INTEGER REFERENCES fin_categories(code);
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS sub_category_code INTEGER REFERENCES fin_sub_categories(sub_code);

-- Optional link to our nomenclature (NULL until manually or auto-mapped)
ALTER TABLE supplier_products ADD COLUMN IF NOT EXISTS nomenclature_id UUID REFERENCES nomenclature(id) ON DELETE SET NULL;


-- ═══ PART C: Update existing 17 records with structured data ═══

-- Helper: get Makro supplier_id
DO $$
DECLARE v_makro_id UUID;
BEGIN
  SELECT id INTO v_makro_id FROM suppliers WHERE LOWER(name) LIKE '%makro%' LIMIT 1;
  IF v_makro_id IS NULL THEN RAISE NOTICE 'No Makro supplier found, skipping updates'; RETURN; END IF;

  -- == PRODUCE & FUNGI (4101) ==
  UPDATE supplier_products SET full_title = 'Parsley 100 g',
    package_qty = 100, package_unit = 'g', package_type = 'pack',
    category_code = 4100, sub_category_code = 4101
  WHERE barcode = '917475' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'Basil Leaf 300 g',
    package_qty = 300, package_unit = 'g', package_type = 'pack',
    category_code = 4100, sub_category_code = 4101
  WHERE barcode = '826825' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'Mint Leaf 300 g',
    package_qty = 300, package_unit = 'g', package_type = 'pack',
    category_code = 4100, sub_category_code = 4101
  WHERE barcode = '826827' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'Lemon Pack 4 pcs',
    package_qty = 4, package_unit = 'pcs', package_type = 'pack',
    category_code = 4100, sub_category_code = 4101
  WHERE barcode = '923317' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'WATTIE''S Frozen Green Pea 1 kg',
    package_qty = 1, package_unit = 'kg', package_type = 'bag',
    category_code = 4100, sub_category_code = 4101
  WHERE barcode = '9300657790028' AND supplier_id = v_makro_id;

  -- == PROTEINS (4102) ==
  UPDATE supplier_products SET full_title = 'ARO Chicken Egg no.3-4 with Cover 30 pcs',
    package_qty = 30, package_unit = 'pcs', package_type = 'tray',
    category_code = 4100, sub_category_code = 4102
  WHERE barcode = '8851988008401' AND supplier_id = v_makro_id;

  -- == DAIRY & FATS (4104) ==
  UPDATE supplier_products SET full_title = 'ALLOWRIE Unsalted Compound Butter 2 kg',
    package_qty = 2, package_unit = 'kg', package_type = 'block',
    category_code = 4100, sub_category_code = 4104
  WHERE barcode = '8850332162240' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'Fresh Cream 450 g',
    package_qty = 450, package_unit = 'g', package_type = 'box',
    category_code = 4100, sub_category_code = 4104
  WHERE barcode = '8850880015004' AND supplier_id = v_makro_id;

  -- == NUTS & SEEDS (4105) ==
  UPDATE supplier_products SET full_title = 'Roasted Almonds 800 g',
    package_qty = 800, package_unit = 'g', package_type = 'bag',
    category_code = 4100, sub_category_code = 4105
  WHERE barcode = '890611155789' AND supplier_id = v_makro_id;

  -- == BAKERY & FLOUR (4107) ==
  UPDATE supplier_products SET full_title = 'KNORR Corn Flour 700 g',
    package_qty = 700, package_unit = 'g', package_type = 'bag',
    category_code = 4100, sub_category_code = 4107
  WHERE barcode = '8850144074038' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'IMPERIAL Whole Wheat Flour 1 kg',
    package_qty = 1, package_unit = 'kg', package_type = 'bag',
    category_code = 4100, sub_category_code = 4107
  WHERE barcode = '8850332193282' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'aro Glutinous Rice Flour 1 kg',
    package_qty = 1, package_unit = 'kg', package_type = 'bag',
    category_code = 4100, sub_category_code = 4107
  WHERE barcode = '8850340200323' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'aro Tapioca Starch 1 kg',
    package_qty = 1, package_unit = 'kg', package_type = 'bag',
    category_code = 4100, sub_category_code = 4107
  WHERE barcode = '8850340301181' AND supplier_id = v_makro_id;

  UPDATE supplier_products SET full_title = 'McGarrett Baking Powder 1 kg',
    package_qty = 1, package_unit = 'kg', package_type = 'can',
    category_code = 4100, sub_category_code = 4107
  WHERE barcode = '8850338372562' AND supplier_id = v_makro_id;

  -- == BEVERAGES (4110) ==
  UPDATE supplier_products SET full_title = 'Ovaltine Ovanmalt 105 g',
    package_qty = 105, package_unit = 'g', package_type = 'bag',
    category_code = 4100, sub_category_code = 4110
  WHERE barcode = '8850885374264' AND supplier_id = v_makro_id;

  -- == SAUCES & CONDIMENTS (4111) ==
  UPDATE supplier_products SET full_title = 'Wanthip Red Chili Paste 946 cc',
    package_qty = 946, package_unit = 'cc', package_type = 'bottle',
    category_code = 4100, sub_category_code = 4111
  WHERE barcode = '8850332913261' AND supplier_id = v_makro_id;

  -- == OPEX (not food — category 2000) ==
  UPDATE supplier_products SET full_title = 'Sunlight Lemon Turbo Dishwashing Liquid 3.2 L',
    package_qty = 3.2, package_unit = 'L', package_type = 'bottle',
    category_code = 2000, sub_category_code = NULL
  WHERE barcode = '8851032464800' AND supplier_id = v_makro_id;

END $$;


-- ═══ PART D: Seed nomenclature with ~38 RAW- products ═══
-- Type = 'good' (matching existing convention from migration 015, fn_approve_receipt)

INSERT INTO nomenclature (product_code, name, type, base_unit) VALUES
  -- From verified Makro receipt (15 products)
  ('RAW-PARSLEY',        'Parsley',              'good', 'kg'),
  ('RAW-BASIL',          'Basil Leaf',           'good', 'kg'),
  ('RAW-MINT',           'Mint Leaf',            'good', 'kg'),
  ('RAW-LEMON',          'Lemon',                'good', 'pcs'),
  ('RAW-PEA-GREEN',      'Frozen Green Pea',     'good', 'kg'),
  ('RAW-EGG',            'Chicken Egg',          'good', 'pcs'),
  ('RAW-CREAM',          'Fresh Cream',          'good', 'L'),
  ('RAW-BUTTER',         'Unsalted Butter',      'good', 'kg'),
  ('RAW-ALMONDS',        'Almonds',              'good', 'kg'),
  ('RAW-FLOUR-CORN',     'Corn Flour',           'good', 'kg'),
  ('RAW-FLOUR-WW',       'Whole Wheat Flour',    'good', 'kg'),
  ('RAW-FLOUR-RICE-GL',  'Glutinous Rice Flour', 'good', 'kg'),
  ('RAW-STARCH-TAPIOCA', 'Tapioca Starch',       'good', 'kg'),
  ('RAW-BAKING-POWDER',  'Baking Powder',        'good', 'kg'),
  ('RAW-CHILI-PASTE',    'Red Chili Paste',      'good', 'L'),
  -- Typical healthy kitchen ingredients (23 products)
  ('RAW-OLIVE-OIL',      'Olive Oil (Extra Virgin)', 'good', 'L'),
  ('RAW-COCONUT-OIL',    'Coconut Oil',          'good', 'L'),
  ('RAW-COCONUT-MILK',   'Coconut Milk',         'good', 'L'),
  ('RAW-GARLIC',         'Garlic',               'good', 'kg'),
  ('RAW-GINGER',         'Ginger',               'good', 'kg'),
  ('RAW-TURMERIC',       'Turmeric Powder',      'good', 'kg'),
  ('RAW-SALT-SEA',       'Sea Salt',             'good', 'kg'),
  ('RAW-PEPPER-BLACK',   'Black Pepper',         'good', 'kg'),
  ('RAW-ONION',          'Onion',                'good', 'kg'),
  ('RAW-CARROT',         'Carrot',               'good', 'kg'),
  ('RAW-TOMATO',         'Tomato',               'good', 'kg'),
  ('RAW-CUCUMBER',       'Cucumber',             'good', 'kg'),
  ('RAW-BEETROOT',       'Beetroot',             'good', 'kg'),
  ('RAW-SPINACH',        'Spinach',              'good', 'kg'),
  ('RAW-CABBAGE',        'Cabbage',              'good', 'kg'),
  ('RAW-POTATO',         'Potato',               'good', 'kg'),
  ('RAW-CHICKEN-BREAST', 'Chicken Breast',       'good', 'kg'),
  ('RAW-SALMON',         'Salmon Fillet',        'good', 'kg'),
  ('RAW-RICE-BROWN',     'Brown Rice',           'good', 'kg'),
  ('RAW-QUINOA',         'Quinoa',               'good', 'kg'),
  ('RAW-OATS',           'Oats',                 'good', 'kg'),
  ('RAW-SOY-SAUCE',      'Soy Sauce',            'good', 'L'),
  ('RAW-FISH-SAUCE',     'Fish Sauce',           'good', 'L'),
  ('RAW-HONEY',          'Honey',                'good', 'kg'),
  ('RAW-COCONUT-SUGAR',  'Coconut Sugar',        'good', 'kg'),
  ('RAW-CHIA-SEEDS',     'Chia Seeds',           'good', 'kg')
ON CONFLICT (product_code) DO NOTHING;


-- ═══ PART E: Link supplier_products → nomenclature ═══

DO $$
DECLARE v_makro_id UUID;
BEGIN
  SELECT id INTO v_makro_id FROM suppliers WHERE LOWER(name) LIKE '%makro%' LIMIT 1;
  IF v_makro_id IS NULL THEN RETURN; END IF;

  -- Link each supplier_product to its RAW- nomenclature entry
  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-PARSLEY' AND sp.barcode = '917475' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-BASIL' AND sp.barcode = '826825' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-MINT' AND sp.barcode = '826827' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-LEMON' AND sp.barcode = '923317' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-PEA-GREEN' AND sp.barcode = '9300657790028' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-EGG' AND sp.barcode = '8851988008401' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-BUTTER' AND sp.barcode = '8850332162240' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-CREAM' AND sp.barcode = '8850880015004' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-ALMONDS' AND sp.barcode = '890611155789' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-FLOUR-CORN' AND sp.barcode = '8850144074038' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-FLOUR-WW' AND sp.barcode = '8850332193282' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-FLOUR-RICE-GL' AND sp.barcode = '8850340200323' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-STARCH-TAPIOCA' AND sp.barcode = '8850340301181' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-BAKING-POWDER' AND sp.barcode = '8850338372562' AND sp.supplier_id = v_makro_id;

  UPDATE supplier_products sp SET nomenclature_id = n.id
  FROM nomenclature n WHERE n.product_code = 'RAW-CHILI-PASTE' AND sp.barcode = '8850332913261' AND sp.supplier_id = v_makro_id;

  -- NOTE: Ovaltine (8850885374264) — no RAW- nomenclature match, skip
  -- NOTE: Dishwashing (8851032464800) — OpEx, no nomenclature needed

END $$;


-- ═══ PART F: Cleanup — drop old TEXT category column ═══

ALTER TABLE supplier_products DROP COLUMN IF EXISTS category;

COMMENT ON COLUMN supplier_products.package_weight IS 'DEPRECATED: Use package_qty + package_unit. Kept for backward compatibility with GAS.';
COMMENT ON COLUMN supplier_products.full_title IS 'Complete product name as on supplier website (e.g. "KNORR Corn Flour 700 g")';
COMMENT ON COLUMN supplier_products.package_qty IS 'Numeric package quantity (e.g. 700, 1, 30)';
COMMENT ON COLUMN supplier_products.package_unit IS 'Package unit (g, kg, ml, L, pcs, cc)';
COMMENT ON COLUMN supplier_products.package_type IS 'Package container type (bag, pack, bottle, box, can, tray, block)';
COMMENT ON COLUMN supplier_products.category_code IS 'FK to fin_categories (4100=Food, 2000=OpEx, etc.)';
COMMENT ON COLUMN supplier_products.sub_category_code IS 'FK to fin_sub_categories (4101=Produce, 4104=Dairy, 4107=Bakery, etc.)';
COMMENT ON COLUMN supplier_products.nomenclature_id IS 'Optional link to nomenclature entry. NULL until mapped.';
