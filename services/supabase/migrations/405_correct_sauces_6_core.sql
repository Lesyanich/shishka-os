-- 405_correct_sauces_6_core.sql
--
-- Set up the correct 6 core sauces:
-- 1. Daynamite Sauce
-- 2. Honey-Mustard Sauce
-- 3. Mayo Sauce
-- 4. Pomegranate Molasses
-- 5. Tahini Vinaigrette
-- 6. Truffle Sauce

BEGIN;

-- Archive all current sauces in KP-FIN-SDR
UPDATE nomenclature SET is_available = false
WHERE category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-SDR')
AND product_code ILIKE 'SALE-%';

-- Restore/Create the 6 core sauces with correct names and order
UPDATE nomenclature SET name = 'Daynamite Sauce', display_order = 1, is_available = true
WHERE product_code = 'SALE-SAUCE_HUMMUS';

UPDATE nomenclature SET name = 'Honey-Mustard Sauce', display_order = 2, is_available = true
WHERE product_code = 'SALE-SAUCE_YOGURT_TAHINI';

UPDATE nomenclature SET name = 'Mayo Sauce', display_order = 3, is_available = true
WHERE product_code = 'SALE-SAUCE_LEMON_OLIVE';

UPDATE nomenclature SET name = 'Pomegranate Molasses', display_order = 4, is_available = true
WHERE product_code = 'SALE-SAUCE_POMEGRANATE';

UPDATE nomenclature SET name = 'Tahini Vinaigrette', display_order = 5, is_available = true
WHERE product_code = 'SALE-SAUCE_TAHINI_TAMARIND';

UPDATE nomenclature SET name = 'Truffle Sauce', display_order = 6, is_available = true
WHERE product_code = 'SALE-SAUCE_MUSHROOM_TRUFFLE';

-- Remove the incorrectly added items
DELETE FROM nomenclature WHERE product_code IN ('SALE-SAUCE_MAYONNAISE', 'SALE-SAUCE_SOY');

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '405_correct_sauces_6_core.sql',
  'claude-code',
  NULL,
  'Set KP-FIN-SDR to correct 6 core sauces: Daynamite, Honey-Mustard, Mayo, Pomegranate Molasses, Tahini Vinaigrette, Truffle'
)
ON CONFLICT DO NOTHING;

COMMIT;
