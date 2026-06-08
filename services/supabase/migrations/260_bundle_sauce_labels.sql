-- 260: bundle names spell out the free sauces
-- Project: Menu Control — bundles
--
-- price_tiers.label drives the Loyverse POS category name AND the website bundle
-- card/constructor title. Spell out the included free sauces so it's obvious:
--   "Manakish set of 4 + 1 sauce free", "… of 8 + 2 sauces free", etc.
-- (POS categories are renamed in place by the bundle-pos-setup edge fn re-run.)

UPDATE public.price_tiers
SET label = 'Manakish set of ' || bundle_manakish_count || ' + ' || bundle_sauce_count
            || ' sauce' || CASE WHEN bundle_sauce_count > 1 THEN 's' ELSE '' END || ' free',
    updated_at = now()
WHERE bundle_dish_code IS NOT NULL;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('260_bundle_sauce_labels.sql','claude-code',NULL,
  'Append "+ N sauce(s) free" to bundle tier labels (drives Loyverse category + site card names)')
ON CONFLICT DO NOTHING;
