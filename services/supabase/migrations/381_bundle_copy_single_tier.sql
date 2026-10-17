-- 381_bundle_copy_single_tier.sql
--
-- Follow-up to 380_bundles_four_only.sql. Retiring the 8/12 tiers left the
-- bundle section header copy promising sizes and a discount we no longer have:
--
--   badge: "up to −20%"   ← that was bundle12, now inactive. Real max is 10%.
--   title: "Buy more, save more"
--   sub:   "Build your own set — bigger sets, bigger savings, …"
--
-- NOT a customer-visible fix. As of shishka-health #35 the section header was
-- replaced by the per-card "save up to N%" badge in ManakishSets.jsx, and
-- App.jsx reads only content.hero / .rule / .cta / .sectionIntros — the
-- `bundles` key is currently unrendered on both the site and this row.
-- Nothing was showing "−20%" to customers.
--
-- Corrected anyway rather than left to rot: it is the copy that goes live the
-- moment anyone re-wires that header, and a stale discount resurfacing is
-- exactly the failure mode that sent a customer in quoting "8 pieces 400 baht"
-- off an old Google Maps poster.
--
-- "up to" is kept in the badge deliberately: the bundle_min_price margin floor
-- clamps per-item discounts, so the effective saving can land below 10%.
-- See shishka-health/src/lib/bundles.js.

BEGIN;

UPDATE site_content
   SET data = jsonb_build_object(
         'title', 'Build your own set',
         'badge', 'up to −10%',
         'sub',   'Pick any 4 potato tacos — cheaper than à la carte, with a free sauce on us.'
       )
 WHERE key = 'bundles';

INSERT INTO migration_log (filename, applied_by, status, notes)
VALUES (
  '381_bundle_copy_single_tier.sql',
  'claude-code',
  'success',
  'Rewrite site_content.bundles copy for the single set-of-4 tier. Badge was "up to -20%" (retired bundle12); title/sub promised tiered sizes that no longer exist. NOT customer-visible: the bundles header is unrendered since shishka-health #35 (App.jsx reads only hero/rule/cta/sectionIntros). Corrected so the stale discount cannot resurface if that header is re-wired.'
);

COMMIT;
