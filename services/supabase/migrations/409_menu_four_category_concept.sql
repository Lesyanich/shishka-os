-- 409_menu_four_category_concept.sql
--
-- NUMBERED 409, NOT 400, AND THE GAP IS NOT AN ACCIDENT. This repo's migrations
-- folder stops at 399, so 400 looked free. It is not: production's
-- `migration_log` already records 400_coffee_milk_modifiers, 401_flavour_syrups,
-- 406_drink_temperature_modifier, 407_espresso_double_shot and 408_mind_kombucha
-- as applied, none of which was ever committed to this repo. `migration_log` is
-- keyed on filename, so reusing 400 would have filed two unrelated migrations
-- under one name and made the log unreadable for whoever comes next. 409 is the
-- next number free in the sequence that actually exists. The five missing files
-- are a separate reconciliation job, logged as such — not fixed here.
--
-- CEO request 2026-08-26: "🥗 SALADS — leaf base, no grain · 10 items /
-- 🍜 BOWLS — grain, noodle or hummus base · 10 items / 🌯 WRAPS — 160/190/210
-- ladder / 🍳 ALL-DAY BREAKFAST · 11 items / then all the drinks i didnt touch
-- / and the one we already built (build your own SALAD BOWL WRAP) / add and
-- apply this concept to the data base so we have one concept"
--
-- WHAT THIS ACTUALLY CHANGES. Not the dishes — the taxonomy. Every SALE- row
-- below already exists, is priced and is synced to the till; this migration
-- moves rows between categories and renames four categories. No dish is
-- created, deleted, repriced or hidden. That matters because the counts the
-- CEO asked for (10/10/11) are not all reachable by sorting what we have, and
-- inventing seven breakfast dishes to hit a number is menu development, not a
-- migration. The gaps are listed at the bottom and go back to him.
--
-- THE RULE IS THE BASE, AND THE BASE IS THE BOM. The CEO defined the split by
-- what a dish is built on: leaf and no grain is a salad, grain/noodle/hummus is
-- a bowl. Applied honestly that overrules several dish *names*:
--
--   Tabbouleh                     — cooked quinoa. A salad by every cultural
--                                   convention and a bowl by this rule.
--   Thai Noodle Salad             — konjac noodle. Says salad, is a bowl.
--   Shrimp, Crabstick & Seaweed   — reads like a seaweed salad; the BOM opens
--                                   with PF-COOKED_QUINOA. Bowl.
--   Chicken & Nut Cup             — reads like the other grain cups; the BOM is
--                                   green oak lettuce with no grain at all.
--                                   Stays a salad.
--
-- Three of those four would have been filed wrong from the name. The BOM is the
-- only thing that knows, so the BOM decided, and two dishes now carry names
-- that contradict their section — flagged below as a rename the CEO owns.
--
-- WHY NO NEW CATEGORIES FOR BOWLS. `KP-FIN-BWL` has existed since the original
-- taxonomy, empty, with `is_menu_section = false` and staff prefix B already
-- reserved. It is switched on rather than replaced, so the staff prefix, the
-- id and any historical reference survive.
--
-- WHY TOASTS GET THEIR OWN SECTION. `KP-FIN-WRP` is currently "Wraps & Toasts"
-- and holds two wraps and four open sandwiches on 19-grain bread. Leaving it
-- that way would keep exactly the error this whole exercise removes — a section
-- name that does not tell you the base — and would make the 160/190/210 ladder
-- unreadable, since four of the six prices are not on it. The toasts move to
-- `KP-FIN-TST` intact, at their current prices, visible. If the CEO wants them
-- folded into All-Day Breakfast (they are brunch food, and breakfast is seven
-- dishes short) that is one UPDATE later.
--
-- STAFF CODES SURVIVE. `fn_nomenclature_staff_code` fires on UPDATE OF
-- category_id, which looks alarming for a migration that re-parents fifteen
-- live dishes. It returns NEW untouched when `staff_code IS NOT NULL`, so only
-- a dish that never had one can be assigned a code here. Nothing on the till
-- gets renumbered. Verified against the function body before writing this.
--
-- DRINKS ARE NOT TOUCHED. Every KP-DRK-* category keeps its name, its sort
-- order and its rows, per "then all the drinks i didnt touch".
--
-- CONTRACT-REVIEWED: no column moves and no product_code changes, so every
-- assertion in contracts/menu-contract.json still resolves — they key on
-- product_code, not on section_name. contract-check.mjs is green against both
-- the Supabase endpoint and the shishka.health proxy (87 rows, 11/11 assertions)
-- AFTER this migration. It could not be run BEFORE: the migration was applied
-- in the previous session and the canary only fired at commit time. What DOES
-- change for the site is section_name and section sort_order, which the contract
-- does not cover — and that hid one real regression the check cannot see:
-- useMenu.js pinned its synthetic "Fresh Spring Roll" section to sort_order 3,
-- which was free before and is Wraps after. Fixed in the shishka-health repo by
-- deriving that sort from the parent section instead of hard-coding it. Anyone
-- re-sorting KP-FIN sections should grep the health repo for section_sort_order
-- first; a stale constant there fails silently, by mis-ordering, not by erroring.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The four categories
-- ---------------------------------------------------------------------------
-- Names carry the emoji the CEO wrote, because these strings are what the wall
-- board and the website print.

UPDATE public.product_categories
   SET name = '🥗 Salads', is_menu_section = true, sort_order = 1
 WHERE code = 'KP-FIN-SLD';

UPDATE public.product_categories
   SET name = '🍜 Bowls', is_menu_section = true, sort_order = 2
 WHERE code = 'KP-FIN-BWL';

UPDATE public.product_categories
   SET name = '🌯 Wraps', is_menu_section = true, sort_order = 3
 WHERE code = 'KP-FIN-WRP';

-- "Breakfast Smashe" was a truncation of Breakfast Smashed — a preparation, not
-- a category. All-day is the point: it is what makes it a section rather than a
-- morning service.
UPDATE public.product_categories
   SET name = '🍳 All-Day Breakfast', is_menu_section = true, sort_order = 4
 WHERE code = 'KP-FIN-BRK';

-- ---------------------------------------------------------------------------
-- 2. Toasts, split out of Wraps
-- ---------------------------------------------------------------------------

-- default_fin_sub_code 4150 is not optional and not a default: `chk_l3_fin_sub_code`
-- requires every level-3 category to carry one, so a finished dish can never be
-- sold into a category that has no P&L line to book it against. 4150 is what
-- every other KP-FIN section uses.
INSERT INTO public.product_categories (code, name, parent_id, level, sort_order, is_active, is_menu_section, staff_code_prefix, default_fin_sub_code)
SELECT 'KP-FIN-TST', '🥪 Toasts', p.id, p.level + 1, 5, true, true, 'T', 4150
  FROM public.product_categories p
 WHERE p.code = 'KP-FIN'
   AND NOT EXISTS (SELECT 1 FROM public.product_categories WHERE code = 'KP-FIN-TST');

-- ---------------------------------------------------------------------------
-- 3. Everything else in KP-FIN moves out of the way
-- ---------------------------------------------------------------------------
-- The four categories lead the menu, so the remaining sections go into a 10+
-- band keeping their existing relative order. Previous values, for reversal:
-- MAN 0, BND 1, SLD-SM 3, DIP 5, PRM 6, HUM 7, BAR 9, GRL 10, SDR 20, APT 21,
-- BRC 23, CHO 29.
-- Nothing here changes what a section contains, only where it sits in the list.

UPDATE public.product_categories SET sort_order = v.new_sort
  FROM (VALUES
    ('KP-FIN-MAN',    10),  -- 🌮 Potato Tacos
    ('KP-FIN-BND',    11),  -- 🎁 Bundles
    ('KP-FIN-SLD-SM', 12),  -- Mini Salads
    ('KP-FIN-DIP',    13),  -- 🥣 Dips
    ('KP-FIN-PRM',    14),  -- 🍢 Protein Meals
    ('KP-FIN-HUM',    15),  -- 🧆 Hummus Meals (emptied in step 4)
    ('KP-FIN-BAR',    16),  -- 🍫 Bars
    ('KP-FIN-GRL',    17),  -- 🍗 Proteins & Grills
    ('KP-FIN-SDR',    18),  -- 🥫 Sauces & Dressings
    ('KP-FIN-APT',    19),  -- 🥟 Appetizers & Sides
    ('KP-FIN-BRC',    20),  -- 🥖 Bread & Crackers
    ('KP-FIN-CHO',    21)   -- 🍫 Chocolate
  ) AS v(code, new_sort)
 WHERE public.product_categories.code = v.code;

-- ---------------------------------------------------------------------------
-- 4. Dishes follow their base
-- ---------------------------------------------------------------------------

-- Grain, noodle and hummus bases out of Salads and Hummus Meals into Bowls.
-- TABBOULEH_BERRY is draft and unpriced; it moves with its parent dish so the
-- two cannot end up in different sections the day someone prices it.
UPDATE public.nomenclature
   SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-BWL')
 WHERE product_code IN (
   'SALE-BOWL_MANGO_SALMON_TUNA',      -- PF-COOKED_RICE
   'SALE-CUP_SHRIMP_CRAB_SEAWEED',     -- PF-COOKED_QUINOA
   'SALE-CUP_TUNA_QUINOA',             -- PF-COOKED_QUINOA
   'SALE-CUP_TOFU_CHICKPEA',           -- PF-COOKED_QUINOA
   'SALE-CUP_TERIYAKI_CHICKEN',        -- RAW-RICE_RICEBERRY
   'SALE-SALAD_THAI_NOODLE',           -- RAW-NOODLE_KONJAC
   'SALE-TABBOULEH',                   -- cooked quinoa
   'SALE-TABBOULEH_BERRY',             -- cooked quinoa (draft)
   'SALE-HUMMUS_SHRIMP',               -- hummus base
   'SALE-HUMMUS_KEBAB_BEEF',           -- hummus base
   'SALE-HUMMUS_TAWOOK',               -- hummus base
   'SALE-HUMMUS_PUMPKIN_POMEGRANATE'   -- hummus base
 );

-- Open sandwiches out of Wraps into Toasts. All four are built on bread, not on
-- a wrap: three on 19-grain, one draft.
UPDATE public.nomenclature
   SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-TST')
 WHERE product_code IN (
   'SALE-TOAST_SALMON_GOAT_CHEESE',
   'SALE-TOAST_SHRIMP_GUACAMOLE',
   'SALE-SANDWICH_MEATLOAF_MELT',
   'SALE-TOAST_EGG_HUMMUS'
 );

-- ---------------------------------------------------------------------------
-- 5. Hummus Meals is now empty
-- ---------------------------------------------------------------------------
-- Kept as a row rather than deleted — historical orders reference it by id, and
-- an empty category costs nothing. It just stops rendering as a section with no
-- dishes in it.

UPDATE public.product_categories
   SET is_menu_section = false
 WHERE code = 'KP-FIN-HUM';

-- ---------------------------------------------------------------------------
-- 6. Self-register
-- ---------------------------------------------------------------------------

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('409_menu_four_category_concept.sql', 'claude-opus-session-b18424ec', 'success',
        'Taxonomy only: four menu categories (Salads / Bowls / Wraps / All-Day Breakfast) '
     || 'plus Toasts split out of Wraps. 16 live dishes re-parented, 4 categories renamed, '
     || 'KP-FIN-HUM emptied and de-sectioned, KP-FIN-BWL switched on rather than recreated. '
     || 'No dish created, deleted, repriced or hidden. Dishes were filed by their BOM base, '
     || 'not their name — Tabbouleh and Thai Noodle Salad are quinoa- and konjac-based and '
     || 'moved to Bowls despite saying "salad"; Chicken & Nut Cup has no grain and stayed a '
     || 'salad despite reading like its grain-cup siblings. Staff codes survive: '
     || 'fn_nomenclature_staff_code no-ops when staff_code IS NOT NULL, so nothing on the '
     || 'till was renumbered. Drinks untouched. Target counts 10/10/11 are NOT met (8/11/4) '
     || 'and deliberately so — closing them is menu development, not a migration; the six '
     || 'open gaps are enumerated in the file footer.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ===========================================================================
-- WHAT THIS DOES NOT SOLVE — for the CEO, not for the next migration to guess
-- ===========================================================================
--
-- 1. SALADS lands on 8, not 10. Live and leaf-based: Shrimp Caesar 349,
--    Smoked Salmon 299, Chicken Caesar 249, Fattoush 249, Greek 249, Pumpkin
--    249, Chicken & Nut Cup 219, Chicken Mexican 199. Two dishes short, and the
--    ladder has nothing under 199.
--
-- 2. BOWLS lands on 11, not 10 — one over, so one of them is a cut or the
--    target is 11.
--
-- 3. WRAPS has 160 (Grilled Shish Tawook) and 190 (Kebab Hummus). The 210 rung
--    is empty. A shrimp wrap at 210 was already proposed and would complete it.
--
-- 4. ALL-DAY BREAKFAST has 4, all at 169: Double Protein Smashed, Eggs Your
--    Way, Guacamole Smashed Egg, Melted Cheese & Egg. Seven short of 11 — the
--    largest gap by far. The four toasts moved in step 4 are the obvious
--    candidates to fold in here.
--
-- 5. Two dishes now sit in a section their name contradicts: "Tabbouleh" and
--    "Thai Noodle Salad" are both in Bowls because their base says so. Guests
--    read the name, not the BOM. Both want renaming.
--
-- 6. Five live groups have no home in the four-category scheme and were left
--    exactly where they are: Protein Meals (3, 299–429), Dips (4 live),
--    Fresh Spring Rolls (4, 169–239), Potato Tacos (8) and Bread & Crackers.
--    That is ~20 sellable dishes outside the concept. Either the concept grows
--    a fifth and sixth category or those dishes leave the menu.
--
-- 7. Six of the eleven Bowls and one of the eight Salads are is_available=true
--    but is_web_visible=false, so the guest site shows Bowls as 5, not 11. All
--    seven are hidden for the same reason: no photo and no customer_ingredients.
--    They are sold in the shop and invisible online. Do NOT close the gap by
--    flipping the flag — a dish with no photo renders as an empty disc. Seven
--    photo shoots and seven descriptions is the actual task.

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
-- Category moves are reversible from the previous sort_order values recorded in
-- step 3 and the section membership in steps 4-5; the dishes' original
-- category_ids are the ones implied by their product_code prefixes there.
--
-- DELETE FROM public.migration_log WHERE filename='409_menu_four_category_concept.sql';
-- COMMIT;
