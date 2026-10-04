-- 406_consolidate_wraps_to_tortilla.sql
--
-- Rename Wraps category to "Tortilla Wraps" and consolidate all wraps into one category
-- Move items from KP-FIN-WRP-TOR to KP-FIN-WRP

BEGIN;

-- Rename the main wraps category
UPDATE product_categories
SET name = '🌯 Tortilla Wraps'
WHERE code = 'KP-FIN-WRP';

-- Move all items from KP-FIN-WRP-TOR (Tortilla Wraps) to KP-FIN-WRP
UPDATE nomenclature
SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-WRP')
WHERE category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-WRP-TOR');

-- Adjust display order for moved items (Beef Kebab and Chicken ShishTawook Wrap)
-- They will be at the end after the other wraps
UPDATE nomenclature
SET display_order = 10
WHERE product_code = 'SALE-TOAST_KEBAB';

UPDATE nomenclature
SET display_order = 11
WHERE product_code = 'SALE-TOAST_CHICKEN_TAWOOK';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '406_consolidate_wraps_to_tortilla.sql',
  'claude-code',
  NULL,
  'Consolidate all wraps into KP-FIN-WRP category, rename to Tortilla Wraps'
)
ON CONFLICT DO NOTHING;

COMMIT;
