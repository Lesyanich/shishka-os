-- 410_consolidate_sauces_dressings_dips.sql
--
-- Rename Sauces & Dressings to "Sauce, Dressing and Dips"
-- Move all dips from KP-FIN-DIP to KP-FIN-SDR
-- Deactivate the Dips category

BEGIN;

-- Rename Sauces & Dressings category
UPDATE product_categories
SET name = '🥫 Sauce, Dressing and Dips'
WHERE code = 'KP-FIN-SDR';

-- Move all dips to the consolidated sauces/dressings/dips category
UPDATE nomenclature
SET category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-SDR')
WHERE category_id = (SELECT id FROM product_categories WHERE code = 'KP-FIN-DIP');

-- Deactivate the old Dips category
UPDATE product_categories
SET is_active = false
WHERE code = 'KP-FIN-DIP';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '410_consolidate_sauces_dressings_dips.sql',
  'claude-code',
  NULL,
  'Consolidate Sauces & Dressings + Dips into "Sauce, Dressing and Dips" category. Move all dips from KP-FIN-DIP to KP-FIN-SDR.'
)
ON CONFLICT DO NOTHING;

COMMIT;
