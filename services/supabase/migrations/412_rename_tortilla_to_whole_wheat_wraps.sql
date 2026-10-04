-- 412_rename_tortilla_to_whole_wheat_wraps.sql
--
-- Rename Tortilla Wraps to Whole Wheat Wraps

BEGIN;

UPDATE product_categories
SET name = '🌯 Whole Wheat Wraps'
WHERE code = 'KP-FIN-WRP';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '412_rename_tortilla_to_whole_wheat_wraps.sql',
  'claude-code',
  NULL,
  'Rename KP-FIN-WRP from "Tortilla Wraps" to "Whole Wheat Wraps"'
)
ON CONFLICT DO NOTHING;

COMMIT;
