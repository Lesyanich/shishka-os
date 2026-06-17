-- 304_revert_bom_repoint_uom_mismatch.sql
-- CORRECTIVE: mig 302 re-pointed 38 deleted RAW to live RAW-AUTO/named "twins", but the
-- RAW-AUTO twins are PURCHASE records (base_unit pcs/pack/bag/bottle/fruit/box/set with
-- pack prices), NOT recipe-grade per-kg ingredients. 29/38 twins had a different base_unit
-- than the original, so the recipes' quantity_per_unit (calibrated for the old kg/L unit)
-- now produced wrong line costs (e.g. PF-FROZEN_BANANA_SLICES jumped to 137฿/kg because the
-- twin is 89฿/"4 hands" pcs).
--
-- Fix: revert ALL 38 re-points — un-delete the original recipe-grade RAW and point the BOM
-- lines back to them (correct UoM basis restored). The RAW-AUTO twins return to being
-- unreferenced purchase records. Proper dedup/UoM normalization + linking WAC to the named
-- RAW (rather than swapping recipes to pack-items) is a separate task.
--
-- The 12 bucket-A/C un-deletes from mig 302 (matcha, cream cheese, etc.) were correct and
-- are left as-is. Lion's Mane stays deferred. After this, dangling lines = 2 (lion's mane).
-- Guard from mig 303 only fires on is_deleted false->true, so the un-deletes here are fine.

BEGIN;

CREATE TEMP TABLE _rev(deleted_code text, twin_code text) ON COMMIT DROP;
INSERT INTO _rev(deleted_code, twin_code) VALUES
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

-- 1. Un-delete the original recipe-grade RAW
UPDATE nomenclature
   SET is_deleted = false, updated_at = now()
 WHERE is_deleted = true
   AND product_code IN (SELECT deleted_code FROM _rev);

-- 2. Point BOM lines back from twin -> original (collision-safe)
UPDATE bom_structures b
   SET ingredient_id = dd.id
FROM _rev r
  JOIN nomenclature tt ON tt.product_code = r.twin_code
  JOIN nomenclature dd ON dd.product_code = r.deleted_code
WHERE b.ingredient_id = tt.id
  AND NOT EXISTS (SELECT 1 FROM bom_structures b2 WHERE b2.parent_id = b.parent_id AND b2.ingredient_id = dd.id);

INSERT INTO migration_log (filename, status)
VALUES ('304_revert_bom_repoint_uom_mismatch.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
