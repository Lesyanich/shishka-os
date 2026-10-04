-- 411_rename_bread_crackers_to_extras.sql
--
-- Rename "Bread & Crackers" category to "Extras"
-- Prepare for small food options: rice, baked potato, salsa, bread

BEGIN;

UPDATE product_categories
SET name = '🍽️ Extras'
WHERE code = 'KP-FIN-BRC';

COMMENT ON TABLE product_categories IS 'Product categories hierarchy. KP-FIN-BRC (Extras) includes sides: rice, baked potato, salsa, bread';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '411_rename_bread_crackers_to_extras.sql',
  'claude-code',
  NULL,
  'Rename KP-FIN-BRC from "Bread & Crackers" to "Extras". Prepare for rice, baked potato, salsa, bread items.'
)
ON CONFLICT DO NOTHING;

COMMIT;
