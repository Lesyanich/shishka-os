-- 259: clearer bundle names — "Manakish set of N"
-- Project: Menu Control — bundles
--
-- price_tiers.label drives the Loyverse POS category name (bundle-pos-setup).
-- "Bundle ×4" → "Manakish set of 4" so cashiers immediately understand it.

UPDATE public.price_tiers SET label = 'Manakish set of 4'  WHERE tier_code = 'bundle4';
UPDATE public.price_tiers SET label = 'Manakish set of 8'  WHERE tier_code = 'bundle8';
UPDATE public.price_tiers SET label = 'Manakish set of 12' WHERE tier_code = 'bundle12';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('258b_bundle_labels.sql','claude-code',NULL,
  'Rename bundle tier labels to "Manakish set of N" (drives Loyverse category name)')
ON CONFLICT DO NOTHING;
