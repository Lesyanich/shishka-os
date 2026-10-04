-- 400_menu_section_order_wraps_bowls_salads.sql
--
-- Reorder menu sections on shishka.health: Wraps first, then Bowls, then Salads.
-- Updates sort_order for KP-FIN-WRP, KP-FIN-BWL, KP-FIN-SLD to control section display order.

BEGIN;

UPDATE product_categories
SET sort_order = 1
WHERE code = 'KP-FIN-WRP';

UPDATE product_categories
SET sort_order = 2
WHERE code = 'KP-FIN-BWL';

UPDATE product_categories
SET sort_order = 3
WHERE code = 'KP-FIN-SLD';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '400_menu_section_order_wraps_bowls_salads.sql',
  'claude-code',
  NULL,
  'Reorder menu sections on shishka.health: Wraps (1) → Bowls (2) → Salads (3)'
)
ON CONFLICT DO NOTHING;

COMMIT;
