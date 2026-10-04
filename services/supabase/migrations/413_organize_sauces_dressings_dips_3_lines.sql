-- 413_organize_sauces_dressings_dips_3_lines.sql
--
-- Organize Sauce, Dressing and Dips into 3 separate lines
-- Line 1 (1-10): SAUCES
-- Line 2 (20-30): DRESSINGS
-- Line 3 (40-50): DIPS

BEGIN;

-- ========== SAUCES (display_order 1-10) ==========
UPDATE nomenclature SET display_order = 1 WHERE product_code = 'SALE-SAUCE_HUMMUS'; -- Daynamite
UPDATE nomenclature SET display_order = 2 WHERE product_code = 'SALE-SAUCE_YOGURT_TAHINI'; -- Honey-Mustard
UPDATE nomenclature SET display_order = 3 WHERE product_code = 'SALE-SAUCE_LEMON_OLIVE'; -- Mayo
UPDATE nomenclature SET display_order = 4 WHERE product_code = 'SALE-SAUCE_POMEGRANATE'; -- Pomegranate Molasses
UPDATE nomenclature SET display_order = 5 WHERE product_code = 'SALE-SAUCE_TAHINI'; -- Tahini
UPDATE nomenclature SET display_order = 6 WHERE product_code = 'SALE-SAUCE_MUSHROOM_TRUFFLE'; -- Truffle
UPDATE nomenclature SET display_order = 7 WHERE product_code = 'SALE-SAUCE_GARLIC';
UPDATE nomenclature SET display_order = 8 WHERE product_code = 'SALE-SAUCE_CASHEW';
UPDATE nomenclature SET display_order = 9 WHERE product_code = 'SALE-SAUCE_MANGO';

-- ========== DRESSINGS (display_order 20-30) ==========
UPDATE nomenclature SET display_order = 20 WHERE product_code = 'SALE-SAUCE_BALSAMIC';
UPDATE nomenclature SET display_order = 21 WHERE product_code = 'SALE-SAUCE_CAESAR';
UPDATE nomenclature SET display_order = 22 WHERE product_code = 'SALE-SAUCE_FRESH_HERB';
UPDATE nomenclature SET display_order = 23 WHERE product_code = 'SALE-SAUCE_GINGER_LIME';
UPDATE nomenclature SET display_order = 24 WHERE product_code = 'SALE-SAUCE_MAPLE';
UPDATE nomenclature SET display_order = 25 WHERE product_code = 'SALE-SAUCE_MUSHROOM_TRUFFLE_VIN';
UPDATE nomenclature SET display_order = 26 WHERE product_code = 'SALE-SAUCE_TAHINI_TAMARIND';
UPDATE nomenclature SET display_order = 27 WHERE product_code = 'SALE-SAUCE_STRAWBERRY';

-- ========== DIPS (display_order 40-50) ==========
UPDATE nomenclature SET display_order = 40 WHERE product_code = 'SALE-HUMMUS_PLAIN';
UPDATE nomenclature SET display_order = 41 WHERE product_code = 'SALE-HUMMUS_BEETROOT';
UPDATE nomenclature SET display_order = 42 WHERE product_code = 'SALE-HUMMUS_CRACKERS';
UPDATE nomenclature SET display_order = 43 WHERE product_code = 'SALE-HUMMUS_BUNS';
UPDATE nomenclature SET display_order = 44 WHERE product_code = 'SALE-HUMMUS_PESTO';
UPDATE nomenclature SET display_order = 45 WHERE product_code = 'SALE-GUACAMOLE';
UPDATE nomenclature SET display_order = 46 WHERE product_code = 'SALE-PICO_DE_GALLO';
UPDATE nomenclature SET display_order = 47 WHERE product_code = 'SALE-SAUCE_MANGO_SALSA';
UPDATE nomenclature SET display_order = 48 WHERE product_code = 'SALE-MUHAMMARA';
UPDATE nomenclature SET display_order = 49 WHERE product_code = 'SALE-MUTABAL';
UPDATE nomenclature SET display_order = 50 WHERE product_code = 'SALE-PESTO';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '413_organize_sauces_dressings_dips_3_lines.sql',
  'claude-code',
  NULL,
  'Organize Sauce/Dressing/Dips into 3 lines: Sauces (1-10), Dressings (20-30), Dips (40-50)'
)
ON CONFLICT DO NOTHING;

COMMIT;
