-- ═══════════════════════════════════════════════════════════
-- 249_barada_chocolate_catalog.sql
--
-- Seed the BARADA chocolate retail catalog (partner: Barada, see
-- vault Thai partner deal). Adds a new L3 retail category
-- "🍫 Chocolate" under Finished Dishes and 25 SALE-CHOC_* items.
--
-- Pricing: 3 active items @ ฿197 (owner-set resale price); the rest
-- are inactive drafts seeded at Barada retail price (100g) as
-- placeholders, ready to toggle live later. Cost left empty
-- (cost_source='none') — wholesale price from Barada TBD.
--
-- Photos: seeded here with Barada CDN URLs, then rehosted into our
-- own nomenclature-photos bucket by the import-product-photos edge
-- function (image_url + customer_photo_url repointed at our storage).
--
-- Idempotent: ON CONFLICT guards on both category code and product_code.
-- ═══════════════════════════════════════════════════════════

BEGIN;

WITH cat AS (
  INSERT INTO product_categories (code, name, name_th, parent_id, level, sort_order, is_active, default_fin_sub_code)
  VALUES ('KP-FIN-CHO', '🍫 Chocolate', 'ช็อกโกแลต',
          (SELECT id FROM product_categories WHERE code = 'KP-FIN'),
          3, 990, true, 4150)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, default_fin_sub_code = 4150
  RETURNING id
)
INSERT INTO nomenclature
  (product_code, name, type, category_id, base_unit, price, image_url, customer_photo_url,
   customer_description, is_available, is_featured, pos_status)
SELECT v.product_code, v.name, 'dish', cat.id, 'pcs', v.price,
       v.photo, v.photo, v.descr, v.is_available, v.is_featured, v.pos_status::pos_status_enum
FROM cat, (VALUES
  -- ACTIVE (3) @ ฿197
  ('SALE-CHOC_HIGH_COCOA_MILK','High Cocoa Milk Chocolate 100g',197,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-Chocolate.png',
    'Creamy high-cocoa milk chocolate, 100g. Crafted by BARADA.', true, true, 'approved'),
  ('SALE-CHOC_DARK_70','70% Dark Chocolate 100g',197,
    'https://baradachocolate.com/wp-content/uploads/2026/02/1-PlainDarkChocolateMain-scaled-1.jpg',
    'Single-origin 70% dark chocolate, 100g. Crafted by BARADA.', true, true, 'approved'),
  ('SALE-CHOC_DARK_70_ALMOND','70% Dark Chocolate with Roasted Almond 100g',197,
    'https://baradachocolate.com/wp-content/uploads/2026/02/2-DarkWithRoastedAlmondsMain-scaled-1.jpg',
    '70% dark chocolate with roasted almonds, 100g. BARADA best-seller.', true, true, 'approved'),
  -- INACTIVE catalog (22) @ Barada RRP (100g), draft/unavailable
  ('SALE-CHOC_DARK_MINT','Dark Chocolate with Mint',300,
    'https://baradachocolate.com/wp-content/uploads/2026/04/MintChocolate.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_VEGAN_MILK','Vegan Milk Chocolate',300,
    'https://baradachocolate.com/wp-content/uploads/2026/04/Vegan-Milk-Chocolate.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_CACAO_HUSK_TEA','Cacao Husk Tea',500,
    'https://baradachocolate.com/wp-content/uploads/2026/04/Barada-cacao-husk-tea-jar.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_UPCYCLED_POD','The Upcycled Cacao Pod Collection',550,
    'https://baradachocolate.com/wp-content/uploads/2026/03/Gift-Cacao-Shell2.jpg', NULL, false, false, 'draft'),
  ('SALE-CHOC_SIGNATURE_DUO','The BARADA Signature Duo',490,
    'https://baradachocolate.com/wp-content/uploads/2026/03/2x100gGiftBox.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_GIFT_20HEARTS','Assorted 20 Heart Shape Gift Box',1100,
    'https://baradachocolate.com/wp-content/uploads/2026/03/20heartsGiftBox.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_MILK','Milk Chocolate',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-Chocolate.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_MILK_ALMOND','Milk Chocolate with Roasted Almonds',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-Chocolate-with-roasted-almonds.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_MILK_RAISIN_ALMOND','Milk Chocolate with Raisins and Almonds',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-chocolate-with-raisins-and-almonds.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_MILK_RAISIN','Milk Chocolate with Raisins',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-chocolate-with-raisins.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_MILK_FRUIT_NUT','Milk Chocolate with Fruits and Nuts',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-Chocolate-with-Fruits-and-Nuts.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_MILK_ORANGE','Milk Chocolate with Bitter Orange',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-chocolate-with-bitter-orange.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_DARK_ORANGE','Dark Chocolate with Bitter Orange',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-chocolate-with-bitter-orange-2-1.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_DARK_FRUIT_NUT','Dark Chocolate with Fruits and Nuts',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-Chocolates-with-Fruits-and-Nuts.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_DARK_RAISIN','Dark Chocolate with Raisins',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-chocolate-with-raisins.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_DARK_RAISIN_ALMOND','Dark Chocolate with Raisins and Almonds',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Screenshot-2025-06-25-at-1.35.47-AM.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_DARK_PLAIN','Dark Chocolate Plain',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/BARADA-Dark-Chocolate.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_DARK_ALMOND_LG','Dark Chocolate with Roasted Almonds (Gift Sizes)',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-chocolate-with-roasted-almonds1.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_PRALINES','Bite-Size Chocolate Hearts 12g',50,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Pralines-and-bonbones-2.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_RECOVERY_SQ','Recovery Square',180,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Recovery-Square.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_PREACTIVE_SQ','Pre-Active Square',160,
    'https://baradachocolate.com/wp-content/uploads/2026/02/PreActive-Square.png', NULL, false, false, 'draft'),
  ('SALE-CHOC_COCONUT_SQ','Coconut Vitality Square',160,
    'https://baradachocolate.com/wp-content/uploads/2026/04/Bounty-chocolate-coconut.png', NULL, false, false, 'draft')
) AS v(product_code, name, price, photo, descr, is_available, is_featured, pos_status)
ON CONFLICT (product_code) DO NOTHING;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '249_barada_chocolate_catalog.sql',
  'claude-code',
  'Seed Barada chocolate retail catalog: KP-FIN-CHO category + 25 SALE-CHOC_* items (3 active @฿197).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
