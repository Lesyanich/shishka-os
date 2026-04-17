-- ============================================================
-- Migration 139: Categorize SALE, PF, MOD items + add KP-FIN-APT
--
-- Problem: All SALE (5), PF (13), MOD (10) items have category_id IS NULL.
-- These are Kitchen Production items that need L3 categories under KP-*.
--
-- Also creates a new L3 category: KP-FIN-APT (Appetizers & Sides)
-- for items like Hummus, Kraut Side that don't fit BWL/SLD/SOU/WRP.
--
-- Safety: idempotent — only updates rows where category_id IS NULL.
-- ============================================================

BEGIN;

-- ── Step 1: Create new L3 category "Appetizers & Sides" ──
INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order)
VALUES (
  'KP-FIN-APT',
  'Appetizers & Sides',
  'อาหารเรียกน้ำย่อย',
  (SELECT id FROM product_categories WHERE code = 'KP-FIN'),
  3,
  5
) ON CONFLICT (code) DO NOTHING;

-- ── Step 2: Categorize SALE items (Finished Dishes) ──
WITH sale_mapping (product_code, cat_code) AS (VALUES
  ('SALE-BORSCH_BIOACTIVE',  'KP-FIN-SOU'),  -- Borsch Bio-Active → Soups
  ('SALE-HUMMUS_CLASSIC',    'KP-FIN-APT'),  -- Hummus Classic → Appetizers & Sides
  ('SALE-KRAUT_SIDE',        'KP-FIN-APT'),  -- Kraut Side → Appetizers & Sides
  ('SALE-MANIKISH_MEAT',     'KP-FIN-WRP'),  -- Manikish → Wraps & Sandwiches
  ('SALE-PUMPKIN_SOUP',      'KP-FIN-SOU')   -- Pumpkin Coconut Soup → Soups
)
UPDATE public.nomenclature n
   SET category_id = pc.id,
       updated_at  = now()
  FROM sale_mapping m
  JOIN public.product_categories pc ON pc.code = m.cat_code
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Step 3: Categorize PF items (Prep Components / Bases) ──
WITH pf_mapping (product_code, cat_code) AS (VALUES
  ('PF-BAKED_BEETROOT',         'KP-PRP-RCK'),  -- Baked Beetroot → Cooked Components
  ('PF-BAKED_PUMPKIN',          'KP-PRP-RCK'),  -- Baked Pumpkin → Cooked Components
  ('PF-BORSCH_BASE',            'KP-BSE-BRT'),  -- Borsch Base → Broths & Stocks
  ('PF-CHICKEN_GRILL_NEUTRAL',  'KP-PRP-RCK'),  -- Grilled Chicken Neutral → Cooked Components
  ('PF-CHICKEN_GRILL_TAWOOK',   'KP-PRP-RCK'),  -- Grilled Chicken Tawook → Cooked Components
  ('PF-CHICKPEAS_COOKED',       'KP-PRP-RCK'),  -- Chickpeas Cooked → Cooked Components
  ('PF-FERMENTED_CABBAGE',      'KP-PRP-RCK'),  -- Fermented Cabbage → Cooked Components
  ('PF-HUMMUS_BASE',            'KP-BSE-PUR'),  -- Hummus Base → Purees & Pastes
  ('PF-MIREPOIX_SAUTE',         'KP-PRP-CUT'),  -- Mirepoix Saute → Cut Vegetables
  ('PF-PUMPKIN_COCONUT_BASE',   'KP-BSE-BRT'),  -- Pumpkin Coconut Base → Broths & Stocks
  ('PF-SHISH_TAWOOK_SPICE_MIX', 'KP-PRP-MRN'),  -- Spice Mix → Marinades & Mixes
  ('PF-VEGETABLE_BROTH',        'KP-BSE-BRT'),  -- Vegetable Broth → Broths & Stocks
  ('PF-YOGURT_HOMEMADE',        'KP-PRP-RCK')   -- Homemade Yogurt → Cooked Components
)
UPDATE public.nomenclature n
   SET category_id = pc.id,
       updated_at  = now()
  FROM pf_mapping m
  JOIN public.product_categories pc ON pc.code = m.cat_code
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Step 4: Categorize MOD items (Toppings & Modifiers) ──
WITH mod_mapping (product_code, cat_code) AS (VALUES
  ('MOD-ANCIENT_CRUNCH',   'KP-TOP-CRN'),  -- Ancient Crunch → Crunchy Toppings
  ('MOD-COCONUT_YOGURT',   'KP-TOP-SFT'),  -- Coconut Yogurt → Soft Toppings
  ('MOD-GREENS',           'KP-TOP-SFT'),  -- Greens → Soft Toppings
  ('MOD-HUMMUS_GARNISH',   'KP-TOP-SAU'),  -- Hummus Garnish → Sauce Toppings
  ('MOD-RED_BEANS',        'KP-TOP-SFT'),  -- Red Beans → Soft Toppings
  ('MOD-SHRIMP_SOUSVIDE',  'KP-TOP-SFT'),  -- Sous-vide Shrimp → Soft Toppings
  ('MOD-SOUR_CREAM',       'KP-TOP-SAU'),  -- Sour Cream → Sauce Toppings
  ('MOD-SOUSVIDE_CHICKEN', 'KP-TOP-SFT'),  -- Sous-vide Chicken → Soft Toppings
  ('MOD-ADDONS_PROTEIN',   'KP-TOP-BST'),  -- Add-ons Protein (group) → Boosters
  ('MOD-TOPPINGS',         'KP-TOP-CRN')   -- Toppings (group) → Crunchy Toppings
)
UPDATE public.nomenclature n
   SET category_id = pc.id,
       updated_at  = now()
  FROM mod_mapping m
  JOIN public.product_categories pc ON pc.code = m.cat_code
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

COMMIT;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '139_categorize_sale_pf_mod.sql',
  'claude-code',
  NULL,
  'Create KP-FIN-APT (Appetizers & Sides). Assign L3 categories to 5 SALE, 13 PF, 10 MOD items. All Kitchen Production hierarchy.'
) ON CONFLICT (filename) DO NOTHING;
