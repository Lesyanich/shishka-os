-- 380_bundles_four_only.sql
--
-- CEO decision 2026-07-27: the Potato Tacos bundle offer is a SINGLE tier —
-- set of 4. The 8- and 12-piece tiers are retired.
--
-- Trigger: a customer walked in from Google Maps quoting "8 pieces 400 baht"
-- (an old GBP menu poster). The administrator had to explain 400฿ is only a
-- starting price. The 8/12 tiers are also the thinnest-margin baskets — a
-- meat-heavy set of 12 at -20% lands near 49% margin (MC 06abd77e analysis).
--
-- The customer site (shishka.health) reads price_tiers WHERE is_active = true,
-- so deactivating here removes the 8/12 cards from the bundle constructor with
-- no deploy. Rows are kept (not deleted) so the tier history and the archived
-- SALE-BUNDLE_MANAKISH_8 / _12 dish links stay intact and reversible.
--
-- NOT covered here (manual, CEO-only): the Google Business Profile menu photo
-- "8 manakish — from 400 thb" still lives on the Maps listing and must be
-- removed through business.google.com. See MC task for follow-up.

BEGIN;

UPDATE price_tiers
   SET is_active  = false,
       updated_at = now()
 WHERE tier_code IN ('bundle8', 'bundle12');

-- Guard: exactly one active bundle tier must remain (bundle4).
DO $$
DECLARE
  active_count int;
BEGIN
  SELECT count(*) INTO active_count
    FROM price_tiers
   WHERE is_active = true
     AND bundle_manakish_count IS NOT NULL;

  IF active_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 active bundle tier, found %', active_count;
  END IF;
END $$;

INSERT INTO migration_log (filename, applied_by, status, notes)
VALUES (
  '380_bundles_four_only.sql',
  'claude-code',
  'success',
  'Retire bundle8 + bundle12 price tiers (is_active=false). CEO 2026-07-27: bundles are set-of-4 only. Removes the 8/12 cards from the shishka.health bundle constructor without a deploy. GBP menu poster "8 manakish from 400 thb" still needs manual removal.'
);

COMMIT;
