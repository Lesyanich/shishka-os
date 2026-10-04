-- 453_hide_fresh_spring_roll_from_web.sql
--
-- CEO: pull the "Fresh Spring Roll" section (Shrimp/Tuna & Corn/Chicken/Veggie
-- Rice Paper Rolls) off shishka.health. Same pattern as the Potato Tacos
-- retirement — web-only, POS/till stays untouched (is_available unchanged).
--
-- CONTRACT-REVIEWED: safe. Updates nomenclature.is_web_visible only — no
-- schema change, no row count change. menu_public already filters on
-- is_web_visible; shishka.health will stop rendering these on next page load
-- (client fetches live).

BEGIN;

UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SUMMER_ROLLS_SHRIMP';     -- Shrimp Rice Paper Rolls
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SUMMER_ROLLS_TUNA_CORN';   -- Tuna & Corn Rice Paper Rolls
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SUMMER_ROLLS_CHICKEN';     -- Chicken Rice Paper Rolls
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SUMMER_ROLLS_VEGGIE';      -- Veggie Rice Paper Rolls

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '453_hide_fresh_spring_roll_from_web.sql',
  'claude-code',
  NULL,
  'Hide the 4 Rice Paper Rolls (Fresh Spring Roll section) from shishka.health per CEO request — web only, POS/till unaffected'
)
ON CONFLICT DO NOTHING;

COMMIT;
