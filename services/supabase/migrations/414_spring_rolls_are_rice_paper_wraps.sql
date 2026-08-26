-- 414_spring_rolls_are_rice_paper_wraps.sql
--
-- CEO, 2026-08-26: "Wraps is the 3rd main category and spring roll comes under
-- it as a rice paper warp and there will be more wrap options working on it now"
--
-- Wraps stops being a two-dish stub and becomes a real section with two
-- subheadings. Nothing is renamed, repriced or created as a dish - six existing
-- dishes change which heading they sit under.
--
--   🌯 WRAPS  (KP-FIN-WRP, section, sort 3)
--     🫓 Tortilla Wraps    (new)  Shish Tawook 160, Kebab Hummus 190
--     🍃 Rice Paper Wraps  (new)  Veggie 169, Chicken 199, Tuna & Corn 219,
--                                Shrimp 239
--
-- WHY A SECOND SUBSECTION AND NOT JUST ONE FOR THE ROLLS. menu_public rolls a
-- dish up to a section in ONE hop: section = (category is_menu_section ? itself
-- : its parent). The two existing wraps sit directly in KP-FIN-WRP, so their
-- category_name and section_name are the same string. Give the rolls a labelled
-- subheading and leave those two where they are, and the page reads as two
-- unlabelled wraps followed by a labelled group - they look like leftovers. A
-- subheading for each is the shape mig 410 already used for Breakfast
-- (KP-FIN-BRK-EGG), and it is the shape the CEO's "there will be more wrap
-- options" needs: a new tortilla wrap now has an obvious home.
--
-- THE WRAPPER SPLIT IS IN THE BOM, NOT INVENTED FOR THE MENU. The four rolls
-- are built on RAW-RICE_PAPER (Banh Trang 22 cm, 2 sheets a portion) plus rice
-- noodles; the two wraps are built on RAW-WRAP_WHOLEGRAIN (MISSION Wholegrain)
-- and RAW-WRAP_DELISUN_CHIA_FLAX (Deli Sun Chia & Flax tortilla). The CEO's
-- reading - a spring roll is a wrap, the wrapper is rice paper - is what the
-- recipes already say.
--
-- NO COPY CHANGES NEEDED. All four roll descriptions already open with
-- "Rice-paper rolls ...", written before this section existed. The new
-- subheading agrees with the copy on the same card, so nothing is rewritten.
-- Dish names keep "Fresh Spring Rolls": that is what a guest orders and what
-- the till prints, and "rice paper wrap" is the shelf they sit on, not a
-- rename the CEO asked for.
--
-- "🥟 APPETIZERS & SIDES" DISAPPEARS FROM THE GUEST MENU, ON PURPOSE. The four
-- spring rolls were the only web-visible rows in KP-FIN-APT; menu_public
-- filters on is_web_visible, so once they leave, the section has nothing to
-- render and stops existing on the site and on /board. That is the intended
-- outcome - the CEO's concept has four food categories and Appetizers is not
-- one of them. The CATEGORY stays active regardless: three till-only potato
-- sides (SALE-BAKED_POTATO_SIDE, SALE-MASH_POTATO_CLASSIC_SIDE,
-- SALE-MASH_POTATO_VEGAN_SIDE, all is_web_visible = false) still live in it and
-- are still sold. Deactivating it would take them off the till.
--
-- STAFF CODES: NOTHING IS MINTED, AND THE ORDER OF THE STATEMENTS BELOW IS WHY.
-- fn_nomenclature_staff_code fires BEFORE UPDATE OF category_id and mints the
-- next free code when staff_code IS NULL, is_available IS TRUE and the
-- destination category has a staff_code_prefix. The two tortilla wraps already
-- hold W-3 and W-4, so they are safe either way. The four spring rolls have had
-- NO staff code since they were created, and moving them into anything carrying
-- prefix 'W' would silently mint W-5..W-8 - a counter-facing change nobody
-- asked for, out of a migration about headings. So both subsections are created
-- with a NULL prefix, the dishes are moved, and the prefix is set to 'W'
-- afterwards. The trigger is on nomenclature, not on product_categories, so
-- setting the prefix later cannot reach back and code the existing rows, while
-- the wrap options the CEO is writing now will get W-5 onward automatically on
-- insert. If the counter does want codes on the rolls, it is one statement:
-- UPDATE nomenclature SET category_id = category_id WHERE product_code LIKE
-- 'SALE-SUMMER_ROLLS%';  (naming the column in SET is enough to fire it).
--
-- PRODUCT CODES UNCHANGED, INCLUDING THE TWO WRONG-LOOKING ONES. The wraps are
-- still SALE-TOAST_CHICKEN_TAWOOK and SALE-TOAST_KEBAB from when they were
-- toasties; the rolls are still SALE-SUMMER_ROLLS_*. Same argument as 413 -
-- product_code is the contract/POS join key and no guest sees it. Here it is
-- load-bearing twice over: menu-contract.json's "spring-rolls-section"
-- assertion queries product_code=like.SALE-SUMMER_ROLLS*, and boardPicks.js on
-- the TV names SALE-SUMMER_ROLLS_CHICKEN outright.
--
-- DISPLAY ORDER LEFT ALONE. Within their new subsections the existing numbers
-- already give a sensible page (rolls 1-4, wraps 1 and 3). Reordering is a
-- separate decision and the CEO is mid-way through adding items.
--
-- THE FRONT END HAS TO CHANGE TOO OR THIS IS INVISIBLE. shishka-health's
-- useMenu.js promotes these four dishes into a synthetic "Fresh Spring Roll"
-- section by product_code prefix, at their old parent's sort minus 0.5 - which
-- since mig 409 puts them at 18.5, near the bottom of the page. Left in place
-- it would pull them straight back out of Wraps. That change ships in the
-- health repo alongside this migration; the hand-rolled springRollModifiers()
-- stays, because menu_modifiers still does not cover these dishes.
--
-- CONTRACT-REVIEWED: creates 2 product_categories rows and changes category_id
-- on 6 SALE- rows. No product_code, price, is_available or is_web_visible is
-- touched, so no row enters or leaves menu_public: 92 before, 92 after. Of the
-- 6 assertions in menu-contract.json, "spring-rolls-section" keys on the
-- SALE-SUMMER_ROLLS product_code prefix (untouched), "taco-bundle-pool" and
-- "free-sauce-pool" on KP-FIN-MAN / KP-FIN-SDR category_code prefixes (not
-- these), and "coffee-split" on category_name ilike coffee (not these). The two
-- new category_codes are KP-FIN-WRP-* and match no assertion prefix.
-- contract-check.mjs run green before and after.

BEGIN;

-- Prefix deliberately NULL at creation; set to 'W' at the end of this
-- transaction, after the dishes have moved, so the staff-code trigger cannot
-- mint codes for the four rolls. See the header.
INSERT INTO public.product_categories (code, name, parent_id, level, sort_order, is_active, is_menu_section, staff_code_prefix, default_fin_sub_code)
SELECT 'KP-FIN-WRP-TOR', '🫓 Tortilla Wraps', p.id, 3, 1, true, false, NULL, 4150
  FROM public.product_categories p
 WHERE p.code = 'KP-FIN-WRP'
   AND NOT EXISTS (SELECT 1 FROM public.product_categories WHERE code = 'KP-FIN-WRP-TOR');

INSERT INTO public.product_categories (code, name, parent_id, level, sort_order, is_active, is_menu_section, staff_code_prefix, default_fin_sub_code)
SELECT 'KP-FIN-WRP-RPW', '🍃 Rice Paper Wraps', p.id, 3, 2, true, false, NULL, 4150
  FROM public.product_categories p
 WHERE p.code = 'KP-FIN-WRP'
   AND NOT EXISTS (SELECT 1 FROM public.product_categories WHERE code = 'KP-FIN-WRP-RPW');

-- The two tortilla wraps drop one level so they sit under a heading of their
-- own rather than loose in the section.
UPDATE public.nomenclature
   SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-WRP-TOR')
 WHERE product_code IN ('SALE-TOAST_CHICKEN_TAWOOK', 'SALE-TOAST_KEBAB');

-- The rolls leave Appetizers & Sides for Wraps.
UPDATE public.nomenclature
   SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-WRP-RPW')
 WHERE product_code IN (
   'SALE-SUMMER_ROLLS_VEGGIE',
   'SALE-SUMMER_ROLLS_CHICKEN',
   'SALE-SUMMER_ROLLS_TUNA_CORN',
   'SALE-SUMMER_ROLLS_SHRIMP'
 );

-- Now that every row has landed, both subsections inherit the section's staff
-- code prefix, so the CEO's incoming wrap options get W-5 onward on insert.
UPDATE public.product_categories
   SET staff_code_prefix = 'W'
 WHERE code IN ('KP-FIN-WRP-TOR', 'KP-FIN-WRP-RPW');

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('414_spring_rolls_are_rice_paper_wraps.sql', 'claude-opus-session-b18424ec', 'success',
        'CEO: "Wraps is the 3rd main category and spring roll comes under it as a rice paper warp". '
     || 'Created 2 subsections under KP-FIN-WRP: KP-FIN-WRP-TOR "Tortilla Wraps" (the 2 existing '
     || 'wraps, 160/190) and KP-FIN-WRP-RPW "Rice Paper Wraps" (the 4 SALE-SUMMER_ROLLS, 169-239). '
     || 'Wraps 2 -> 6 dishes. The wrapper split is in the BOMs (rice paper vs tortilla) and the roll '
     || 'descriptions already said "Rice-paper rolls", so no copy changed. Side effect, intended: '
     || '"Appetizers & Sides" now has zero web-visible rows and vanishes from the site and /board - '
     || 'the category stays active because 3 till-only potato sides live in it. No staff code minted: '
     || 'subsections created with NULL prefix, dishes moved, prefix set to W afterwards (the trigger '
     || 'is on nomenclature, not product_categories), so the 4 rolls keep having none and new wraps '
     || 'get W-5+. product_codes unchanged - SALE-SUMMER_ROLLS is a menu-contract assertion and a '
     || 'boardPicks entry. NEEDS THE HEALTH REPO: useMenu.js still promotes the rolls into a synthetic '
     || '"Fresh Spring Roll" section by product_code and must stop. menu_public row count 92->92.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- Order matters here too: clear the prefixes BEFORE moving the rolls back, or
-- the trigger mints W-5..W-8 on the way out.
--
-- BEGIN;
-- UPDATE public.product_categories SET staff_code_prefix = NULL WHERE code IN ('KP-FIN-WRP-TOR','KP-FIN-WRP-RPW');
-- UPDATE public.nomenclature SET category_id = (SELECT id FROM public.product_categories WHERE code='KP-FIN-WRP')
--  WHERE product_code IN ('SALE-TOAST_CHICKEN_TAWOOK','SALE-TOAST_KEBAB');
-- UPDATE public.nomenclature SET category_id = (SELECT id FROM public.product_categories WHERE code='KP-FIN-APT')
--  WHERE product_code LIKE 'SALE-SUMMER_ROLLS%';
-- DELETE FROM public.product_categories WHERE code IN ('KP-FIN-WRP-TOR','KP-FIN-WRP-RPW');
-- DELETE FROM public.migration_log WHERE filename='414_spring_rolls_are_rice_paper_wraps.sql';
-- COMMIT;
--
-- (and revert the useMenu.js change in shishka-health, or the rolls land in a
--  section that no longer holds them.)
--
-- ---------------------------------------------------------------------------
-- STILL OPEN FOR THE CEO
--
-- 1. THE LADDER, AND THE ORDER INSIDE IT. The brief priced Wraps at
--    160/190/210. Tortilla Wraps are 160 and 190 with the 210 slot empty; the
--    rice paper half holds 169 / 199 / 219 / 239, so the section as a whole no
--    longer reads as a three-rung ladder. Worth deciding whether the ladder
--    applies to tortilla wraps only. Related: on the page the rolls currently
--    run 199, 239, 169, 219 — display_order inherited from the Appetizers page,
--    where nobody chose it. Ascending price (169, 199, 219, 239) would read as a
--    ladder like the tortilla half does. Deliberately not changed here because
--    leading with the chicken roll may be a merchandising call, not an accident.
-- 2. The four rolls have no staff_code while their new neighbours have W-3 and
--    W-4. One statement to mint them if the counter wants them (in the header).
-- 3. "Kebab Hummus" is the only dish in the section whose name does not say
--    wrap, and it is the only one of the six with customer_ingredients NULL.
-- 4. /board: the four spring-roll slides will now caption "Wraps" instead of
--    "Appetizers & Sides". MenuBoard.jsx is another session's task (743b166f,
--    in CEO review) - no file of theirs was touched, but the caption changes.
-- 5. Photos: unchanged and still the top item. All six wraps have an image;
--    9 dishes across Salads and Bowls still do not.
