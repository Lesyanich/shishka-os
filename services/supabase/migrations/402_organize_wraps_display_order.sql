-- 402_organize_wraps_display_order.sql
--
-- Organize wraps display order:
-- Line 1: Falafel, Chicken Avocado, Cheese, Za'atar, Za'atar & Cheese
-- Rest: Other wraps

BEGIN;

-- Wraps section (KP-FIN-WRP) - first 5
UPDATE nomenclature SET display_order = 1 WHERE product_code = 'SALE-WRAP_FOLD_FALAFEL';
UPDATE nomenclature SET display_order = 2 WHERE product_code = 'SALE-WRAP_FOLD_CHICKEN_AVOCADO';
UPDATE nomenclature SET display_order = 3 WHERE product_code = 'SALE-WRAP_OPEN_CHEESE';
UPDATE nomenclature SET display_order = 4 WHERE product_code = 'SALE-WRAP_OPEN_ZAATAR';
UPDATE nomenclature SET display_order = 5 WHERE product_code = 'SALE-WRAP_OPEN_ZAATAR_CHEESE';

-- Remaining wraps
UPDATE nomenclature SET display_order = 6 WHERE product_code = 'SALE-WRAP_FOLD_LAMB_TRUFFLE';
UPDATE nomenclature SET display_order = 7 WHERE product_code = 'SALE-WRAP_FOLD_CHICKEN_FAJITA';
UPDATE nomenclature SET display_order = 8 WHERE product_code = 'SALE-WRAP_FOLD_SHRIMP_FAJITA';
UPDATE nomenclature SET display_order = 9 WHERE product_code = 'SALE-WRAP_FOLD_EGGS_FAJITA';

-- Toasts section - Beef Kebab and Chicken ShishTawook Wrap
UPDATE nomenclature SET display_order = 1 WHERE product_code = 'SALE-TOAST_KEBAB';
UPDATE nomenclature SET display_order = 2 WHERE product_code = 'SALE-TOAST_CHICKEN_TAWOOK';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '402_organize_wraps_display_order.sql',
  'claude-code',
  NULL,
  'Organize wrap display order: Falafel, Chicken Avocado, Cheese, Za''atar, Za''atar & Cheese first, then Lamb, Chicken Fajita, Shrimp, Eggs'
)
ON CONFLICT DO NOTHING;

COMMIT;
