-- ═══════════════════════════════════════════════════════════
-- 248a_barada_chocolate_catalog.sql
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
-- Descriptions: sourced from baradachocolate.com product copy.
-- Photos: seeded here with Barada CDN URLs, then rehosted into our
-- own nomenclature-photos bucket by the import-product-photos edge
-- function (image_url + customer_photo_url repointed at our storage).
--
-- Idempotent: ON CONFLICT guards on both category code and product_code;
-- a follow-up UPDATE backfills descriptions on re-run.
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
    'Pure, unadorned, and deeply satisfying. This high cacao milk chocolate bar lets the richness of premium cacao shine. Smooth, balanced, and crafted for those who savour simplicity done well.', true, true, 'approved'),
  ('SALE-CHOC_DARK_70','70% Dark Chocolate 100g',197,
    'https://baradachocolate.com/wp-content/uploads/2026/02/1-PlainDarkChocolateMain-scaled-1.jpg',
    'A rich, intense flavor of our premium 70% dark chocolate, crafted for true connoisseurs of fine cocoa.', true, true, 'approved'),
  ('SALE-CHOC_DARK_70_ALMOND','70% Dark Chocolate with Roasted Almond 100g',197,
    'https://baradachocolate.com/wp-content/uploads/2026/02/2-DarkWithRoastedAlmondsMain-scaled-1.jpg',
    'The perfect harmony of velvety dark chocolate and crunchy roasted almonds, creating a delightful symphony of flavors and textures.', true, true, 'approved'),
  -- INACTIVE catalog (22) @ Barada RRP (100g), draft/unavailable
  ('SALE-CHOC_DARK_MINT','Dark Chocolate with Mint',300,
    'https://baradachocolate.com/wp-content/uploads/2026/04/MintChocolate.png',
    'Our signature 70% single-origin Thai cacao infused with mint essence, delivering a refreshing contrast to the deep, earthy undertones of the dark chocolate. Clean, intense, and perfectly balanced.', false, false, 'draft'),
  ('SALE-CHOC_VEGAN_MILK','Vegan Milk Chocolate',300,
    'https://baradachocolate.com/wp-content/uploads/2026/04/Vegan-Milk-Chocolate.png',
    'A creamy, plant-based evolution of luxury. This bar blends high-quality Thai cacao with the smooth, tropical richness of coconut milk, delivering the velvety texture of a traditional milk chocolate with a sophisticated, dairy-free finish.', false, false, 'draft'),
  ('SALE-CHOC_CACAO_HUSK_TEA','Cacao Husk Tea',500,
    'https://baradachocolate.com/wp-content/uploads/2026/04/Barada-cacao-husk-tea-jar.png',
    'An elegant infusion crafted from roasted cacao shells, offering soft notes of chocolate without the calories or caffeine. Naturally rich in magnesium and antioxidants, with a calming, lingering warmth. Presented in a 100g loose-leaf tub.', false, false, 'draft'),
  ('SALE-CHOC_UPCYCLED_POD','The Upcycled Cacao Pod Collection',550,
    'https://baradachocolate.com/wp-content/uploads/2026/03/Gift-Cacao-Shell2.jpg',
    'The ultimate expression of circular luxury: a natural, dried Thai cacao pod upcycled into a biodegradable gift vessel, filled with 10 signature heart-shaped chocolates (70% Dark, Milk, and speciality infusions). Zero-waste packaging, handcrafted in Phuket.', false, false, 'draft'),
  ('SALE-CHOC_SIGNATURE_DUO','The BARADA Signature Duo',490,
    'https://baradachocolate.com/wp-content/uploads/2026/03/2x100gGiftBox.png',
    'The definitive BARADA Chocolate experience: one 70% Dark Chocolate with Roasted Almonds (100g) and one 70% Plain Dark Chocolate (100g).', false, false, 'draft'),
  ('SALE-CHOC_GIFT_20HEARTS','Assorted 20 Heart Shape Gift Box',1100,
    'https://baradachocolate.com/wp-content/uploads/2026/03/20heartsGiftBox.png',
    'A premium 20-piece assortment of heart-shaped chocolates with a diverse range of flavour profiles and artisanal stuffings. Housed in our signature botanical gift box with a red and gold ribbon.', false, false, 'draft'),
  ('SALE-CHOC_MILK','Milk Chocolate',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-Chocolate.png',
    'Pure, unadorned, and deeply satisfying. This high cacao milk chocolate bar lets the richness of premium cacao shine. Smooth, balanced, and crafted for those who savour simplicity done well.', false, false, 'draft'),
  ('SALE-CHOC_MILK_ALMOND','Milk Chocolate with Roasted Almonds',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-Chocolate-with-roasted-almonds.png',
    'A rich milk chocolate with crunchy roasted almonds for a perfect blend of depth and texture.', false, false, 'draft'),
  ('SALE-CHOC_MILK_RAISIN_ALMOND','Milk Chocolate with Raisins and Almonds',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-chocolate-with-raisins-and-almonds.png',
    'Experience the delightful combination of plump raisins, crunchy roasted almonds, and rich milk chocolate—a harmonious symphony of flavor and texture in every bite.', false, false, 'draft'),
  ('SALE-CHOC_MILK_RAISIN','Milk Chocolate with Raisins',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-chocolate-with-raisins.png',
    'Smooth, rich milk chocolate paired with naturally sweet, plump raisins—an elegant combination that balances deep cocoa intensity with bursts of fruity warmth.', false, false, 'draft'),
  ('SALE-CHOC_MILK_FRUIT_NUT','Milk Chocolate with Fruits and Nuts',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Milk-Chocolate-with-Fruits-and-Nuts.png',
    'A medley of premium fruits and roasted nuts wrapped in smooth milk chocolate—a burst of flavour and texture in every bite.', false, false, 'draft'),
  ('SALE-CHOC_MILK_ORANGE','Milk Chocolate with Bitter Orange',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-chocolate-with-bitter-orange.png',
    'A bold pairing of rich milk chocolate and zesty bitter orange, offering a sophisticated balance of deep cocoa and citrus brightness with a lingering, aromatic finish.', false, false, 'draft'),
  ('SALE-CHOC_DARK_ORANGE','Dark Chocolate with Bitter Orange',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-chocolate-with-bitter-orange-2-1.png',
    'A bold pairing of rich dark chocolate and zesty bitter orange, offering a sophisticated balance of deep cocoa and citrus brightness with a lingering, aromatic finish.', false, false, 'draft'),
  ('SALE-CHOC_DARK_FRUIT_NUT','Dark Chocolate with Fruits and Nuts',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-Chocolates-with-Fruits-and-Nuts.png',
    'A structural assembly of premium fruits and roasted nuts suspended within a single-origin Thai cacao matrix. Calibrated for a precise balance of texture and depth.', false, false, 'draft'),
  ('SALE-CHOC_DARK_RAISIN','Dark Chocolate with Raisins',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-chocolate-with-raisins.png',
    'Smooth, rich dark chocolate paired with naturally sweet, plump raisins—an elegant combination that balances deep cocoa intensity with bursts of fruity warmth.', false, false, 'draft'),
  ('SALE-CHOC_DARK_RAISIN_ALMOND','Dark Chocolate with Raisins and Almonds',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Screenshot-2025-06-25-at-1.35.47-AM.png',
    'Experience the delightful combination of plump raisins, crunchy roasted almonds, and rich dark chocolate—a harmonious symphony of flavor and texture in every bite.', false, false, 'draft'),
  ('SALE-CHOC_DARK_PLAIN','Dark Chocolate Plain',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/BARADA-Dark-Chocolate.png',
    'Pure, unadorned, and deeply satisfying. This dark chocolate bar lets the richness of premium cacao shine. Smooth, balanced, and crafted for those who savour simplicity done well.', false, false, 'draft'),
  ('SALE-CHOC_DARK_ALMOND_LG','Dark Chocolate with Roasted Almonds (Gift Sizes)',220,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Dark-chocolate-with-roasted-almonds1.png',
    'A rich dark chocolate with crunchy roasted almonds for a perfect blend of depth and texture.', false, false, 'draft'),
  ('SALE-CHOC_PRALINES','Bite-Size Chocolate Hearts 12g',50,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Pralines-and-bonbones-2.png',
    'A perfect indulgent treat, offering a delightful burst of rich, creamy chocolate in every bite. Handcrafted with smooth 70% dark chocolate unless otherwise specified.', false, false, 'draft'),
  ('SALE-CHOC_RECOVERY_SQ','Recovery Square',180,
    'https://baradachocolate.com/wp-content/uploads/2026/02/Recovery-Square.png',
    '100g of squares with dates, crunchy almonds, creamy tahini, pumpkin seeds, and sunflower seeds, enveloped in rich 100% dark chocolate. A nourishing post-workout snack. Vegan.', false, false, 'draft'),
  ('SALE-CHOC_PREACTIVE_SQ','Pre-Active Square',160,
    'https://baradachocolate.com/wp-content/uploads/2026/02/PreActive-Square.png',
    'A balanced blend of oats, peanuts, honey, coconut, and almonds, enrobed in rich 70% dark chocolate. Sustained natural energy before any workout. Each 70g box contains 2 squares.', false, false, 'draft'),
  ('SALE-CHOC_COCONUT_SQ','Coconut Vitality Square',160,
    'https://baradachocolate.com/wp-content/uploads/2026/04/Bounty-chocolate-coconut.png',
    'Dark Chocolate Bounty Coconut Squares pair the deep notes of rich 70% dark chocolate with sweet, creamy coconut. Each box contains two squares. Made with Thai cacao and coconut.', false, false, 'draft')
) AS v(product_code, name, price, photo, descr, is_available, is_featured, pos_status)
ON CONFLICT (product_code) DO NOTHING;

-- Backfill descriptions on re-run (idempotent inserts skip rows that already exist)
UPDATE nomenclature n SET customer_description = v.descr
FROM (VALUES
  ('SALE-CHOC_HIGH_COCOA_MILK','Pure, unadorned, and deeply satisfying. This high cacao milk chocolate bar lets the richness of premium cacao shine. Smooth, balanced, and crafted for those who savour simplicity done well.'),
  ('SALE-CHOC_DARK_70','A rich, intense flavor of our premium 70% dark chocolate, crafted for true connoisseurs of fine cocoa.'),
  ('SALE-CHOC_DARK_70_ALMOND','The perfect harmony of velvety dark chocolate and crunchy roasted almonds, creating a delightful symphony of flavors and textures.')
) AS v(code, descr)
WHERE n.product_code = v.code AND (n.customer_description IS NULL OR n.customer_description = '');

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '248a_barada_chocolate_catalog.sql',
  'claude-code',
  'Seed Barada chocolate retail catalog: KP-FIN-CHO category + 25 SALE-CHOC_* items (3 active @฿197) with Barada descriptions.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
