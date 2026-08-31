-- 428_final_price_update_healthy_tacos.sql
-- CEO, 2026-08-31, "this is the final list update it now". Four instructions:
--   1. remove Maple Dressing
--   2. Fattoush Green Crunch  140 -> 149
--   3. Tabbouleh Herb Energy  160 -> 149
--   4. Grass-fed Beef & Eggplant Mutabal  429 -> 339
--   5. "Flatbread is Healthy Tacos, Vege 69 / Meat 89, put them in All Day
--      Breakfast after toast"
--
-- PRICES ARE ALREADY RIGHT ON THE TACOS. All 4 Vege are 69 and all 3 Meat are
-- 89 today, so instruction 5 is purely a rename + a move. No taco price is
-- touched here and no taco needs a till push.
--
-- HOW THE MOVE ACTUALLY WORKS. menu_public resolves a dish's section as
--   s.id = CASE WHEN c.is_menu_section THEN c.id ELSE c.parent_id END
-- -- exactly ONE level up, no recursion. So to land the tacos inside All-Day
-- Breakfast the two LEAF categories (KP-FIN-MAN-VEG, KP-FIN-MAN-MET) must be
-- reparented directly onto KP-FIN-BRK. Reparenting KP-FIN-MAN would do nothing.
-- sort_order 4 and 5 puts them straight after Toasts (3), which is what "after
-- toast" asks for. Dips is 1, Eggs is 2.
--
-- THE CATEGORY CODES ARE DELIBERATELY NOT CHANGED. Three things key off the
-- literal 'KP-FIN-MAN' prefix and all three break silently if it moves:
--   * menu_public.bundle_min_price  -- computed only WHEN c.code LIKE 'KP-FIN-MAN%'
--   * contracts/menu-contract.json  -- assertion "taco-bundle-pool", min 1
--   * shishka-health lib/bundles.js -- builds the bundle pool from the prefix
-- Only the human-facing NAMES change. The codes are plumbing and stay.
--
-- KP-FIN-MAN ITSELF STAYS ACTIVE. It is renamed for consistency but it still
-- parents Classic/Signature/Premium and 10 [ARCHIVED] rows, so deactivating it
-- would orphan them. It simply stops appearing on the site once no web-visible
-- dish rolls up to it.
--
-- MAPLE DRESSING NEEDS NO TILL ACTION. SALE-SAUCE_MAPLE is pos_status='draft'
-- with loyverse_item_id NULL -- it was never pushed to Loyverse. Retiring it
-- leaves 5 members in the free-sauce pool (Hummus, Mango, Strawberry, Tahini
-- Vinaigrette, Yogurt Tahini), and the contract asserts min 1 with no maximum.
--
-- THE THREE REPRICED DISHES DO NEED A TILL PUSH. Queued separately after this
-- migration as loyverse_push_queue action='dish' -- that is the only action
-- that moves a price on Loyverse.
--
-- CONTRACT-REVIEWED: values only. No column, view or category CODE is touched,
-- so every menu-contract assertion still resolves:
--   dishes-present    -- unchanged, 87 rows in menu_public before, 86 after
--                        (Maple is the single removal)
--   no-null-price     -- no price set to NULL; three are edited, all non-null
--   taco-bundle-pool  -- KP-FIN-MAN* codes untouched, still 7 matches
--   free-sauce-pool   -- KP-FIN-SDR* <= 50 drops 6 -> 5, min is 1
--   coffee-split      -- no coffee category renamed
-- scripts/contract-check.mjs run against both the Supabase and shishka.health
-- endpoints after apply.
--
-- KNOWN CONSEQUENCE, FLAGGED NOT FIXED: shishka.health gives "Potato Tacos" a
-- bespoke showcase section (ManakishTiers.jsx, SECTION_ART, section intro copy)
-- selected by section NAME. Once the tacos roll up to All-Day Breakfast that
-- section stops rendering and the bundle constructor moves to the bottom of the
-- Breakfast section. That is a shishka-health repo change, not a DB one.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The three price changes
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature SET price = 149, updated_at = now()
 WHERE product_code = 'SALE-FATTOUSH';

UPDATE public.nomenclature SET price = 149, updated_at = now()
 WHERE product_code = 'SALE-TABBOULEH';

UPDATE public.nomenclature SET price = 339, updated_at = now()
 WHERE product_code = 'SALE-PROTEIN_MEAL_BEEF';

-- ---------------------------------------------------------------------------
-- 2. Retire Maple Dressing
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature
   SET is_available = FALSE, is_web_visible = FALSE, updated_at = now()
 WHERE product_code = 'SALE-SAUCE_MAPLE';

-- ---------------------------------------------------------------------------
-- 3. Flatbread line becomes "Healthy Tacos"
-- ---------------------------------------------------------------------------
UPDATE public.product_categories
   SET name = '🌮 Healthy Tacos', updated_at = now()
 WHERE code = 'KP-FIN-MAN';

UPDATE public.product_categories
   SET name = '🌮 Healthy Tacos · Vege', updated_at = now()
 WHERE code = 'KP-FIN-MAN-VEG';

UPDATE public.product_categories
   SET name = '🌮 Healthy Tacos · Meat', updated_at = now()
 WHERE code = 'KP-FIN-MAN-MET';

-- The bundle labels are guest-facing strings and carry the old line name.
UPDATE public.price_tiers
   SET label = replace(label, 'Potato Tacos', 'Healthy Tacos')
 WHERE bundle_dish_code IS NOT NULL
   AND label LIKE '%Potato Tacos%';

-- ---------------------------------------------------------------------------
-- 4. Move both leaves into All-Day Breakfast, immediately after Toasts
-- ---------------------------------------------------------------------------
UPDATE public.product_categories
   SET parent_id  = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-BRK'),
       sort_order = 4,
       updated_at = now()
 WHERE code = 'KP-FIN-MAN-VEG';

UPDATE public.product_categories
   SET parent_id  = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-BRK'),
       sort_order = 5,
       updated_at = now()
 WHERE code = 'KP-FIN-MAN-MET';

-- ---------------------------------------------------------------------------
-- 5. Register
-- ---------------------------------------------------------------------------
INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES (
  '428_final_price_update_healthy_tacos.sql',
  'claude-opus-session-a1378b2f',
  'success',
  'CEO 2026-08-31 final menu update. Prices: SALE-FATTOUSH 140->149, SALE-TABBOULEH 160->149, SALE-PROTEIN_MEAL_BEEF 429->339 (all three queued to Loyverse as action=dish). Retired SALE-SAUCE_MAPLE (is_available+is_web_visible false; never on the till, pos_status=draft, no loyverse_item_id) - free-sauce pool drops 6->5, contract min is 1. Renamed the flatbread line to "Healthy Tacos": KP-FIN-MAN and its Vege/Meat leaves, plus the price_tiers bundle labels. Reparented KP-FIN-MAN-VEG and KP-FIN-MAN-MET onto KP-FIN-BRK at sort_order 4 and 5 so the 7 live tacos render inside All-Day Breakfast after Toasts - menu_public resolves a section only one level up, so the LEAVES had to move. Category codes deliberately unchanged: bundle_min_price, the taco-bundle-pool contract assertion and shishka-health lib/bundles.js all key off the literal KP-FIN-MAN prefix. Taco prices already correct (Vege 69, Meat 89) - no taco touched. Follow-up in shishka-health: the bespoke "Potato Tacos" showcase section is selected by section name and stops rendering.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, if ever needed)
-- ---------------------------------------------------------------------------
-- BEGIN;
--   UPDATE public.nomenclature SET price = 140 WHERE product_code = 'SALE-FATTOUSH';
--   UPDATE public.nomenclature SET price = 160 WHERE product_code = 'SALE-TABBOULEH';
--   UPDATE public.nomenclature SET price = 429 WHERE product_code = 'SALE-PROTEIN_MEAL_BEEF';
--   UPDATE public.nomenclature SET is_available = TRUE, is_web_visible = TRUE
--    WHERE product_code = 'SALE-SAUCE_MAPLE';
--   UPDATE public.product_categories SET name = '🌮 Potato Tacos' WHERE code = 'KP-FIN-MAN';
--   UPDATE public.product_categories
--      SET name = 'Vege', sort_order = 0,
--          parent_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN')
--    WHERE code = 'KP-FIN-MAN-VEG';
--   UPDATE public.product_categories
--      SET name = 'Meat', sort_order = 1,
--          parent_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-MAN')
--    WHERE code = 'KP-FIN-MAN-MET';
--   UPDATE public.price_tiers SET label = replace(label, 'Healthy Tacos', 'Potato Tacos')
--    WHERE bundle_dish_code IS NOT NULL;
--   -- then re-push the three repriced dishes with queue action='dish'
-- COMMIT;
