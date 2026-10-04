-- 417_fix_web_visibility_sauces_muhammara_name.sql
--
-- Root-cause fix: menu_public filters on nomenclature.is_web_visible, NOT
-- is_available (is_available only gates POS/ordering). Migrations 405, 413
-- and 416 toggled is_available and never touched is_web_visible, so none of
-- those changes actually rendered on shishka.health. Also 415 only updated
-- `name`; the site renders `customer_short_name` preferentially when set.
--
-- CONTRACT-REVIEWED: safe. Updates nomenclature.is_web_visible, display_order
-- and customer_short_name only — no schema change, no row count change.
-- menu_public already selects these columns; shishka.health will render the
-- corrected visibility/order/name on next page load (client fetches live).

BEGIN;

-- ========== Sauces (display_order 1-9): show exactly the 6 core sauces ==========
UPDATE nomenclature SET is_web_visible = true  WHERE product_code = 'SALE-SAUCE_HUMMUS';          -- Daynamite Sauce
UPDATE nomenclature SET is_web_visible = true  WHERE product_code = 'SALE-SAUCE_YOGURT_TAHINI';    -- Honey-Mustard Sauce
UPDATE nomenclature SET is_web_visible = true  WHERE product_code = 'SALE-SAUCE_LEMON_OLIVE';      -- Mayo Sauce
UPDATE nomenclature SET is_web_visible = true  WHERE product_code = 'SALE-SAUCE_POMEGRANATE';      -- Pomegranate Molasses
UPDATE nomenclature SET is_web_visible = true  WHERE product_code = 'SALE-SAUCE_MUSHROOM_TRUFFLE'; -- Truffle Sauce
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_MANGO';            -- was wrongly visible
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_GARLIC';
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_CASHEW';

-- Tahini Vinaigrette is one of the 6 core sauces; mig 413 mis-slotted it into
-- the Dressings range (26) and gave its old Sauces slot (5) to the disabled
-- plain Tahini Sauce. Put it back in the Sauces line, park the disabled one.
UPDATE nomenclature SET display_order = 5,  is_web_visible = true  WHERE product_code = 'SALE-SAUCE_TAHINI_TAMARIND'; -- Tahini Vinaigrette
UPDATE nomenclature SET display_order = 99, is_web_visible = false WHERE product_code = 'SALE-SAUCE_TAHINI';          -- unused plain Tahini

-- ========== Dressings (display_order 20-27): none enabled yet ==========
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_BALSAMIC';
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_CAESAR';
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_FRESH_HERB';
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_GINGER_LIME';
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_MAPLE';
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_MUSHROOM_TRUFFLE_VIN';
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-SAUCE_STRAWBERRY'; -- was wrongly visible

-- ========== Muhammara removal / Hummus already in place ==========
UPDATE nomenclature SET is_web_visible = false WHERE product_code = 'SALE-MUHAMMARA'; -- was wrongly visible
-- SALE-HUMMUS_PLAIN already is_web_visible=true, display_order=48 from mig 416 — no change needed.

-- ========== Chicken ShishTawook Wrap: site renders customer_short_name over name ==========
UPDATE nomenclature SET customer_short_name = 'Chicken ShishTawook Wrap'
WHERE product_code = 'SALE-PROTEIN_MEAL_CHICKEN';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '417_fix_web_visibility_sauces_muhammara_name.sql',
  'claude-code',
  NULL,
  'Fix is_web_visible (not is_available) for 6 core sauces, hide Mango/Strawberry/Muhammara, restore Tahini Vinaigrette to Sauces line, sync customer_short_name for Chicken ShishTawook Wrap'
)
ON CONFLICT DO NOTHING;

COMMIT;
