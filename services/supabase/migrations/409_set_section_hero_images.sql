-- 409_set_section_hero_images.sql
--
-- Set hero images for menu sections using product images

BEGIN;

-- WRAPS section - Chicken ShishTawook Wrap
UPDATE product_categories
SET hero_image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/d3a7fe21-e6d1-42b4-a59b-9ba6d5781464/customer.png?v=20260809c',
    hero_image_alt = 'Chicken ShishTawook Wrap with hummus, pickles and sauces'
WHERE code = 'KP-FIN-WRP';

-- BOWLS section - Real Mexican Bowl
UPDATE product_categories
SET hero_image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/56c313bf-e54f-4aad-93df-03452860d491/menu-1r2ub9S-MxgWbl9MD1dP5vpAQd_7U2XzV.webp?v=1787820032301',
    hero_image_alt = 'Real Mexican Bowl with fresh greens and toppings'
WHERE code = 'KP-FIN-BWL';

-- ALL-DAY BREAKFAST section - Breakfast Double Protein
UPDATE product_categories
SET hero_image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/93c2d26e-d80f-4a49-901c-c9eb42b5e9c1/customer.png?v=20260810brk',
    hero_image_alt = 'Breakfast Double Protein with hummus, eggs and sesame seeds'
WHERE code = 'KP-FIN-BRK';

-- PROTEINS section - Chicken ShishTawook Meal
UPDATE product_categories
SET hero_image_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/nomenclature-photos/ae0e06cf-1520-4a3a-a742-f09e1f3ff074/menu-1jYdmpPWR2AL3rj6GApNJAYrOzSMw94KD.webp?v=1787844635780',
    hero_image_alt = 'Chicken ShishTawook Meal with grilled marinated chicken'
WHERE code = 'KP-FIN-PRM';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '409_set_section_hero_images.sql',
  'claude-code',
  NULL,
  'Set hero images for Wraps, Bowls, All-Day Breakfast, and Proteins sections'
)
ON CONFLICT DO NOTHING;

COMMIT;
