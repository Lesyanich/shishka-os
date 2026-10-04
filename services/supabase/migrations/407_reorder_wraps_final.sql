-- 407_reorder_wraps_final.sql
--
-- Set exact display order for Tortilla Wraps section

BEGIN;

UPDATE nomenclature SET display_order = 1 WHERE product_code = 'SALE-WRAP_FOLD_FALAFEL';
UPDATE nomenclature SET display_order = 2 WHERE product_code = 'SALE-WRAP_FOLD_CHICKEN_AVOCADO';
UPDATE nomenclature SET display_order = 3 WHERE product_code = 'SALE-TOAST_KEBAB';
UPDATE nomenclature SET display_order = 4 WHERE product_code = 'SALE-TOAST_CHICKEN_TAWOOK';
UPDATE nomenclature SET display_order = 5 WHERE product_code = 'SALE-WRAP_OPEN_CHEESE';
UPDATE nomenclature SET display_order = 6 WHERE product_code = 'SALE-WRAP_OPEN_ZAATAR';
UPDATE nomenclature SET display_order = 7 WHERE product_code = 'SALE-WRAP_OPEN_ZAATAR_CHEESE';
UPDATE nomenclature SET display_order = 8 WHERE product_code = 'SALE-WRAP_FOLD_EGGS_FAJITA';
UPDATE nomenclature SET display_order = 9 WHERE product_code = 'SALE-WRAP_FOLD_CHICKEN_FAJITA';
UPDATE nomenclature SET display_order = 10 WHERE product_code = 'SALE-WRAP_FOLD_LAMB_TRUFFLE';
UPDATE nomenclature SET display_order = 11 WHERE product_code = 'SALE-WRAP_FOLD_SHRIMP_FAJITA';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '407_reorder_wraps_final.sql',
  'claude-code',
  NULL,
  'Reorder Tortilla Wraps: Falafel, Chicken Avocado, Beef Kebab, Chicken ShishTawook, Cheese, Za''atar, Za''atar & Cheese, Eggs Fajita, Chicken Fajita, Lamb Truffle, Shrimp Fajita'
)
ON CONFLICT DO NOTHING;

COMMIT;
