-- Migration 197: Link unlinked supplier_catalog rows for sugar items
-- Mitr Phol Sugar Base (barcode 8852256100311) exists in purchase_logs
-- linked to RAW-SUGAR but supplier_catalog row was never linked.

BEGIN;

UPDATE supplier_catalog
SET nomenclature_id = (
  SELECT id FROM nomenclature WHERE product_code = 'RAW-SUGAR' LIMIT 1
)
WHERE barcode = '8852256100311'
  AND nomenclature_id IS NULL;

INSERT INTO migration_log (filename, applied_by, description)
VALUES (
  '197_fix_supplier_catalog_sugar_linkage.sql',
  'claude-code',
  'Link Mitr Phol Sugar Base (barcode 8852256100311) in supplier_catalog to RAW-SUGAR nomenclature entry.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
