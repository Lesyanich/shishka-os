-- ============================================================
-- Migration 163: Categorize 40 new SALE items created via MCP chef tools
-- MC task 9048ce87
--
-- Problem: 40 SALE items have category_id IS NULL.
-- Creates 4 new L3 categories under KP-FIN, then assigns all items.
--
-- Safety: idempotent — categories use ON CONFLICT, updates only WHERE category_id IS NULL.
-- ============================================================

BEGIN;

-- ── Step 1: Create new L3 categories under KP-FIN ──

INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code)
VALUES
  ('KP-FIN-DIP', 'Dips', 'ดิปส์',
   (SELECT id FROM product_categories WHERE code = 'KP-FIN'), 3, 6, 4150),
  ('KP-FIN-GRL', 'Proteins & Grills', 'โปรตีน/ย่าง',
   (SELECT id FROM product_categories WHERE code = 'KP-FIN'), 3, 7, 4150),
  ('KP-FIN-JCE', 'Juices', 'น้ำผลไม้',
   (SELECT id FROM product_categories WHERE code = 'KP-FIN'), 3, 8, 4150),
  ('KP-FIN-SCS', 'Sauces (Retail)', 'ซอส (ขายปลีก)',
   (SELECT id FROM product_categories WHERE code = 'KP-FIN'), 3, 9, 4150)
ON CONFLICT (code) DO NOTHING;

-- ── Step 2: Assign Manakish (WW + GF variants) → KP-FIN-MAN ──
WITH manaish_mapping (product_code) AS (VALUES
  ('SALE-MANAISH_BEEF_GF'),
  ('SALE-MANAISH_CHEESE_GF'),
  ('SALE-MANAISH_CHEESE_MUSHROOM_GF'),
  ('SALE-MANAISH_CHEESE_MUSHROOM_WW'),
  ('SALE-MANAISH_LAMB_GF'),
  ('SALE-MANAISH_LAMB_WW'),
  ('SALE-MANAISH_PUMPKIN_GOAT_GF'),
  ('SALE-MANAISH_PUMPKIN_GOAT_WW'),
  ('SALE-MANAISH_SALAMI_GF'),
  ('SALE-MANAISH_SALAMI_WW'),
  ('SALE-MANAISH_ZAATAR_GF')
)
UPDATE public.nomenclature n
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-MAN'),
       updated_at  = now()
  FROM manaish_mapping m
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Step 3: Assign Dips → KP-FIN-DIP ��─
WITH dip_mapping (product_code) AS (VALUES
  ('SALE-BABAGANOUSH'),
  ('SALE-GUACAMOLE'),
  ('SALE-HUMMUS_BEETROOT'),
  ('SALE-MUHAMMARA')
)
UPDATE public.nomenclature n
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-DIP'),
       updated_at  = now()
  FROM dip_mapping m
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Step 4: Assign Salads → KP-FIN-SLD ──
WITH salad_mapping (product_code) AS (VALUES
  ('SALE-FATTOUSH'),
  ('SALE-TABBOULEH'),
  ('SALE-TABBOULEH_BERRY')
)
UPDATE public.nomenclature n
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-SLD'),
       updated_at  = now()
  FROM salad_mapping m
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Step 5: Assign Proteins & Grills → KP-FIN-GRL ──
WITH grl_mapping (product_code) AS (VALUES
  ('SALE-GRILLED_CHICKEN_BREAST'),
  ('SALE-GRILLED_SALMON'),
  ('SALE-GRILLED_SHRIMP'),
  ('SALE-LAMB_KEBAB'),
  ('SALE-BEEF_LAMB_SAUSAGE'),
  ('SALE-CURED_SALMON')
)
UPDATE public.nomenclature n
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-GRL'),
       updated_at  = now()
  FROM grl_mapping m
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Step 6: Assign Juices → KP-FIN-JCE ──
WITH juice_mapping (product_code) AS (VALUES
  ('SALE-JUICE_COCONUT'),
  ('SALE-JUICE_GUAVA'),
  ('SALE-JUICE_ORANGE'),
  ('SALE-JUICE_PINEAPPLE'),
  ('SALE-JUICE_POMEGRANATE')
)
UPDATE public.nomenclature n
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-JCE'),
       updated_at  = now()
  FROM juice_mapping m
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Step 7: Assign Sauces (Retail) → KP-FIN-SCS ──
WITH sauce_mapping (product_code) AS (VALUES
  ('SALE-SAUCE_CASHEW'),
  ('SALE-SAUCE_GARLIC'),
  ('SALE-SAUCE_LEMON_OLIVE'),
  ('SALE-SAUCE_MANGO'),
  ('SALE-SAUCE_POMEGRANATE'),
  ('SALE-SAUCE_TAHINI'),
  ('SALE-PESTO')
)
UPDATE public.nomenclature n
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-SCS'),
       updated_at  = now()
  FROM sauce_mapping m
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Step 8: Assign Sides → KP-FIN-APT (Appetizers & Sides) ──
WITH side_mapping (product_code) AS (VALUES
  ('SALE-BAKED_POTATO_SIDE'),
  ('SALE-MASH_POTATO_CLASSIC_SIDE'),
  ('SALE-MASH_POTATO_VEGAN_SIDE'),
  ('SALE-SEED_CRACKERS')
)
UPDATE public.nomenclature n
   SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-APT'),
       updated_at  = now()
  FROM side_mapping m
 WHERE n.product_code = m.product_code
   AND n.category_id IS NULL;

-- ── Safety check: no SALE items should remain uncategorized ──
DO $$
DECLARE
  uncategorized integer;
BEGIN
  SELECT COUNT(*)
  INTO uncategorized
  FROM public.nomenclature
  WHERE product_code LIKE 'SALE-%'
    AND category_id IS NULL;

  IF uncategorized > 0 THEN
    RAISE WARNING 'Still % SALE items without category after migration 163', uncategorized;
  END IF;
END $$;

COMMIT;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '165a_categorize_40_new_sale_items.sql',
  'claude-code',
  NULL,
  'Create KP-FIN-DIP/GRL/JCE/SCS. Assign categories to 40 SALE items: 11 manakish, 4 dips, 3 salads, 6 proteins, 5 juices, 7 sauces, 4 sides. MC 9048ce87.'
) ON CONFLICT (filename) DO NOTHING;
