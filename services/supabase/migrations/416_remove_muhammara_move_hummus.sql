-- 416_remove_muhammara_move_hummus.sql
--
-- Remove Muhammara and move Hummus to its display position

BEGIN;

-- Disable Muhammara
UPDATE nomenclature
SET is_available = false
WHERE product_code = 'SALE-MUHAMMARA';

-- Move Hummus to Muhammara's position (display_order 48)
UPDATE nomenclature
SET display_order = 48
WHERE product_code = 'SALE-HUMMUS_PLAIN';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '416_remove_muhammara_move_hummus.sql',
  'claude-code',
  NULL,
  'Disable SALE-MUHAMMARA. Move SALE-HUMMUS_PLAIN from display_order 40 to 48.'
)
ON CONFLICT DO NOTHING;

COMMIT;
