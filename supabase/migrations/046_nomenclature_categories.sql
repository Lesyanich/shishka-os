-- ═══════════════════════════════════════════════════════════════
-- Migration 046: Link nomenclature + supplier_products to categories & brands
-- Phase 7.0: FMCG + Restaurant Hybrid Categorization System
-- ═══════════════════════════════════════════════════════════════
-- DEPENDS ON: Migration 045 (product_categories, brands, tags tables)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- Part A: ALTER nomenclature — add category_id, brand_id
-- ──────────────────────────────────────────────────────────────

ALTER TABLE nomenclature
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL;

ALTER TABLE nomenclature
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nom_category ON nomenclature(category_id);
CREATE INDEX IF NOT EXISTS idx_nom_brand ON nomenclature(brand_id);

COMMENT ON COLUMN nomenclature.category_id IS 'Product category (L3 node, e.g. F-PRD-VEG). NULL = unclassified.';
COMMENT ON COLUMN nomenclature.brand_id IS 'Optional brand reference (primarily for branded raw goods).';

-- ──────────────────────────────────────────────────────────────
-- Part B: ALTER supplier_products — add brand_id FK
-- ──────────────────────────────────────────────────────────────

ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;

COMMENT ON COLUMN supplier_products.brand_id IS 'FK to brands table. Replaces TEXT brand column.';

-- ──────────────────────────────────────────────────────────────
-- Part C: Backfill nomenclature.category_id (RAW- items)
-- ──────────────────────────────────────────────────────────────

-- F-PRD-VEG: Vegetables
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-VEG')
WHERE product_code IN ('RAW-CARROT', 'RAW-ONION', 'RAW-TOMATO', 'RAW-CUCUMBER',
  'RAW-SPINACH', 'RAW-CABBAGE', 'RAW-POTATO', 'RAW-PUMPKIN');

-- F-PRD-FRU: Fruit
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-FRU')
WHERE product_code IN ('RAW-LEMON');

-- F-PRD-HRB: Fresh Herbs
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-HRB')
WHERE product_code IN ('RAW-PARSLEY', 'RAW-BASIL', 'RAW-MINT', 'RAW-HERB-STEMS');

-- F-PRD-MSH: Mushrooms
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-MSH')
WHERE product_code IN ('RAW-MUSHROOM-STEMS');

-- F-PRD-FRZ: Frozen Produce
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-FRZ')
WHERE product_code IN ('RAW-PEA-GREEN');

-- F-PRO-PLT: Poultry
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRO-PLT')
WHERE product_code IN ('RAW-CHICKEN-BREAST');

-- F-PRO-SEA: Seafood
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRO-SEA')
WHERE product_code IN ('RAW-SALMON');

-- F-PRO-EGG: Eggs
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRO-EGG')
WHERE product_code IN ('RAW-EGG');

-- F-GRN-RIC: Rice & Pseudocereals
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-GRN-RIC')
WHERE product_code IN ('RAW-RICE-BROWN', 'RAW-QUINOA');

-- F-GRN-OAT: Oats
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-GRN-OAT')
WHERE product_code IN ('RAW-OATS');

-- F-DAI-MLK: Milk & Cream
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-DAI-MLK')
WHERE product_code IN ('RAW-CREAM', 'RAW-COCONUT-MILK');

-- F-DAI-BTR: Butter
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-DAI-BTR')
WHERE product_code IN ('RAW-BUTTER');

-- F-DAI-OIL: Cooking Oils
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-DAI-OIL')
WHERE product_code IN ('RAW-OLIVE-OIL', 'RAW-COCONUT-OIL');

-- F-NTS-NUT: Tree Nuts
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-NTS-NUT')
WHERE product_code IN ('RAW-ALMONDS');

-- F-NTS-SDS: Seeds
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-NTS-SDS')
WHERE product_code IN ('RAW-CHIA-SEEDS', 'RAW-PUMPKIN-SEEDS');

-- F-SPC-DRY: Dry Spices
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-DRY')
WHERE product_code IN ('RAW-PEPPER-BLACK', 'RAW-TURMERIC', 'RAW-CORIANDER-POWDER',
  'RAW-GINGER', 'RAW-GARLIC', 'RAW-SHISHKA-MIX');

-- F-SPC-SLT: Salt
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-SLT')
WHERE product_code IN ('RAW-SALT-PLAIN', 'RAW-SALT-IODIZED', 'RAW-SALT-CURING');

-- F-SPC-SWT: Sweeteners
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-SWT')
WHERE product_code IN ('RAW-HONEY', 'RAW-COCONUT-SUGAR');

-- F-SPC-STR: Starches & Thickeners
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SPC-STR')
WHERE product_code IN ('RAW-STARCH-TAPIOCA');

-- F-BKR-FLR: Flours
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-BKR-FLR')
WHERE product_code IN ('RAW-FLOUR-WW', 'RAW-FLOUR-CORN', 'RAW-FLOUR-RICE-GL');

-- F-BKR-BKP: Baking Agents
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-BKR-BKP')
WHERE product_code IN ('RAW-BAKING-POWDER');

-- F-SAU-CHI: Chili Sauces
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SAU-CHI')
WHERE product_code IN ('RAW-CHILI-PASTE');

-- F-SAU-SOY: Soy-based
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SAU-SOY')
WHERE product_code IN ('RAW-SOY-SAUCE');

-- F-SAU-FSH: Fish Sauce
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-SAU-FSH')
WHERE product_code IN ('RAW-FISH-SAUCE');

-- F-BEV-POW: Powders & Mixes (Ovaltine — but it's in supplier_products, not nomenclature directly)

-- PRD-VEG byproduct items (waste items still get classified)
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-PRD-VEG')
WHERE product_code IN ('RAW-BEETROOT', 'RAW-CABBAGE-CORES', 'RAW-ROOT-TRIMMINGS',
  'RAW-ONION-TRIMMINGS', 'RAW-LEMON-JUICE', 'RAW-RO-WATER');

-- ──────────────────────────────────────────────────────────────
-- Part D: Backfill nomenclature.category_id (PF-* items)
-- ──────────────────────────────────────────────────────────────

-- KP-BSE-BRT: Broths
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-BSE-BRT')
WHERE product_code IN ('PF-VEGETABLE_BROTH');

-- KP-BSE-PUR: Purees
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-BSE-PUR')
WHERE product_code IN ('PF-BORSCH_BASE', 'PF-PUMPKIN_COCONUT_BASE');

-- KP-PRP-RCK: Cooked Components
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-PRP-RCK')
WHERE product_code IN ('PF-BAKED_BEETROOT', 'PF-BAKED_PUMPKIN', 'PF-MIREPOIX_SAUTE');

-- KP-FIN-SOU: Soups (finished)
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-SOU')
WHERE product_code IN ('SALE-BORSCH_BIOACTIVE', 'SALE-PUMPKIN_SOUP');

-- F-FRM-FRM: Fermented
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'F-FRM-FRM')
WHERE product_code IN ('PF-FERMENTED_CABBAGE');

-- SALE-KRAUT_SIDE → side dish
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-SLD')
WHERE product_code IN ('SALE-KRAUT_SIDE');

-- ──────────────────────────────────────────────────────────────
-- Part E: Backfill nomenclature.category_id (MOD-* items)
-- ──────────────────────────────────────────────────────────────

-- KP-TOP-SFT: Soft Toppings
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-TOP-SFT')
WHERE product_code IN ('MOD-COCONUT_YOGURT', 'MOD-GREENS', 'MOD-RED_BEANS', 'MOD-SOUR_CREAM');

-- KP-TOP-CRN: Crunchy Toppings
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-TOP-CRN')
WHERE product_code IN ('MOD-ANCIENT_CRUNCH');

-- KP-TOP-BST: Protein Boosters
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-TOP-BST')
WHERE product_code IN ('MOD-SOUSVIDE_CHICKEN');

-- Modifier groups — classify at L2
UPDATE nomenclature SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-TOP-SFT')
WHERE product_code IN ('MOD-ADDONS_PROTEIN', 'MOD-TOPPINGS');

-- ──────────────────────────────────────────────────────────────
-- Part F: Backfill supplier_products.brand_id
-- ──────────────────────────────────────────────────────────────

UPDATE supplier_products sp
SET brand_id = b.id
FROM brands b
WHERE UPPER(sp.brand) = UPPER(b.name)
  AND sp.brand IS NOT NULL
  AND sp.brand_id IS NULL;

-- Handle aro/ARO case sensitivity
UPDATE supplier_products sp
SET brand_id = (SELECT id FROM brands WHERE name = 'ARO')
WHERE LOWER(sp.brand) = 'aro' AND sp.brand_id IS NULL;

COMMIT;
