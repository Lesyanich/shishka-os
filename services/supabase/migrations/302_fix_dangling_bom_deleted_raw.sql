-- 302_fix_dangling_bom_deleted_raw.sql
-- Fix the chronic BOM-integrity defect (task 336c3679): 135 bom_structures lines in 82
-- active recipes referenced soft-deleted RAW. Root cause: each named RAW was superseded
-- by a live RAW-AUTO-* twin (receipt/WAC import) and the old one soft-deleted WITHOUT
-- re-pointing recipes. Chef-triaged + CEO-approved 2026-06-17.
--
-- Strategy:
--   BUCKET B/B' (38 pairs) — RE-POINT bom_structures.ingredient_id old -> live twin.
--     Collision-safe: where a recipe already has BOTH the dead line and the twin line
--     (unique constraint parent_id+ingredient_id), DELETE the dead dupe instead of update.
--   BUCKET A+C (12 items) — UN-DELETE the original RAW (no live twin exists, still used):
--     cream cheese (merge survivor), matcha (4 live drinks, no twin), peanut butter,
--     ricotta, iceberg/romaine lettuce, soy sauce, sesame oil, vanilla, radish,
--     sunflower seeds, soy milk.
--   DEFERRED — RAW-LIONS-MANE: both its dishes are draft + memory says it was intentionally
--     pulled; left untouched (2 harmless dangling lines on draft dishes) for chef.
--
-- fn_rollup_bom_costs cascades automatically on the bom_structures changes, so the 29 live
-- SALE dishes recompute to the twins' live WAC. Reversible.

BEGIN;

CREATE TEMP TABLE _map(deleted_code text, twin_code text) ON COMMIT DROP;
INSERT INTO _map(deleted_code, twin_code) VALUES
 ('RAW-SESAME-SEEDS-WHITE','RAW-AUTO-61aa7c04'),('RAW-SESAME-SEEDS-BLACK','RAW-AUTO-22c35a39'),
 ('RAW-HONEY','RAW-AUTO-a129db7c'),('RAW-MINT','RAW-AUTO-8a1ff39e'),('RAW-CUCUMBER','RAW-AUTO-db59b327'),
 ('RAW-BELL-PEPPER-RED','RAW-AUTO-d7252d9b'),('RAW-WALNUTS','RAW-AUTO-ad4b881f'),('RAW-ORANGE','RAW-AUTO-ea684bc2'),
 ('RAW-CHERRY-TOMATO','RAW-AUTO-720527fc'),('RAW-TOMATO','RAW-TOMATO-FRESH'),('RAW-CHIA-SEEDS','RAW-AUTO-76501587'),
 ('RAW-FROZEN-STRAWBERRIES','RAW-AUTO-68bc7ac8'),('RAW-COCONUT-OIL','RAW-AUTO-0d047248'),('RAW-FLOUR-WW','RAW-AUTO-37edb1af'),
 ('RAW-PINEAPPLE','RAW-AUTO-e7927785'),('RAW-SPRING-ONION','RAW-AUTO-92918bed'),('RAW-OREGANO-DRIED','RAW-AUTO-ec431c2c'),
 ('RAW-COCOA-POWDER','RAW-AUTO-9b2e01ad'),('RAW-MUSHROOM-SHIITAKE','RAW-AUTO-287b78aa'),('RAW-FROZEN-BLUEBERRIES','RAW-AUTO-d050d240'),
 ('RAW-CHEESE-PARMESAN','RAW-AUTO-0d07da08'),('RAW-MILK-ALMOND','RAW-ALMOND_MILK'),('RAW-MILK-OAT','RAW-OAT_MILK'),
 ('RAW-QUINOA','RAW-AUTO-b6a6056d'),('RAW-CASHEWS','RAW-AUTO-f7055e57'),('RAW-DILL','RAW-AUTO-1d73b40a'),
 ('RAW-BANANA','RAW-AUTO-7435ddb7'),('RAW-EGG','RAW-AUTO-def56793'),('RAW-BEEF-MINCE','RAW-AUTO-3fac605a'),
 ('RAW-SALMON','RAW-AUTO-1569a5e7'),('RAW-SHRIMP-PEELED','RAW-SHRIMP'),('RAW-TOFU-FIRM','RAW-TOFU'),
 ('RAW-EGGPLANT','RAW-AUTO-ceab8890'),('RAW-PASSION-FRUIT','RAW-PASSION_FRUIT_FRESH'),
 ('RAW-MUSTARD-DIJON','RAW-MUSTARD-WHOLEGRAIN'),('RAW-KALE','RAW-ITALIAN_KALE'),('RAW-AVOCADO','RAW-FROZEN_AVOCADO_HALVES'),
 ('RAW-APPLE-GRANNY','RAW-APPLE-GREEN');

-- 1. Drop dead dupes where the recipe already carries the twin (would violate unique key)
DELETE FROM bom_structures b
USING _map m
  JOIN nomenclature dd ON dd.product_code = m.deleted_code
  JOIN nomenclature tt ON tt.product_code = m.twin_code
WHERE b.ingredient_id = dd.id
  AND EXISTS (SELECT 1 FROM bom_structures b2 WHERE b2.parent_id = b.parent_id AND b2.ingredient_id = tt.id);

-- 2. Re-point remaining dead lines to their live twin
UPDATE bom_structures b
   SET ingredient_id = tt.id
FROM _map m
  JOIN nomenclature dd ON dd.product_code = m.deleted_code
  JOIN nomenclature tt ON tt.product_code = m.twin_code
WHERE b.ingredient_id = dd.id;

-- 3. Un-delete the originals that have no live twin but are still used in live recipes
UPDATE nomenclature
   SET is_deleted = false, updated_at = now()
 WHERE is_deleted = true
   AND product_code IN (
     'RAW-CHEESE-CREAM','RAW-MATCHA-POWDER','RAW-PEANUT-BUTTER','RAW-CHEESE-RICOTTA',
     'RAW-LETTUCE-ICEBERG','RAW-LETTUCE-ROMAINE','RAW-SOY-SAUCE','RAW-OIL-SESAME',
     'RAW-VANILLA-EXTRACT','RAW-RADISH','RAW-SUNFLOWER-SEEDS','RAW-MILK-SOY'
   );

INSERT INTO migration_log (filename, status)
VALUES ('302_fix_dangling_bom_deleted_raw.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
