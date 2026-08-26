-- 410_menu_breakfast_subsections.sql
--
-- CEO corrections to mig 409, 2026-08-26: "You didnt add the new items and
-- salads and bowls!! / sauce should be before All-Day Breakfast / remove Protein
-- Meals / All-Day Breakfast is the 4th main category so everything under it
-- should be sub : Dips, Eggs, Toasts, Potato Tacos, coffee and drinks"
--
-- 409 rearranged categories and deliberately added no dishes, on the grounds
-- that hitting the CEO's counts was menu development. That was half right: the
-- dishes to hit the counts already existed, they were just flagged invisible to
-- the web. Nothing needed inventing, only unhiding. 409's restraint was correct
-- about not writing recipes and wrong about the shape of the gap.
--
-- WHERE THE "11 ITEMS" COMES FROM. The CEO asked for All-Day Breakfast at 11
-- items and it has 4. His fix is structural, not culinary: Dips (4) + Eggs (4)
-- + Toasts (3) = 11 exactly. Breakfast is not seven dishes short, it is three
-- subsections wide. That arithmetic is the reason this migration reads his
-- "everything under it should be sub" as a parent/child move rather than a
-- reordering, and it is the one inference here worth checking if the result
-- looks wrong.
--
-- WHY POTATO TACOS, COFFEE AND DRINKS ARE **NOT** NESTED. They appear in the
-- CEO's list, but nesting them under breakfast would take the section to 18+
-- items and destroy the 11 the same sentence asks for. Read as "these are the
-- non-main sections that follow", it is consistent: they already sort after the
-- four mains (Tacos 10, drinks 24+) and none is a main category. So they are
-- left exactly where they are. If he meant tacos literally inside breakfast,
-- that is one UPDATE — but see the level note below, because tacos are the one
-- group that cannot be nested without flattening their Vege/Meat split.
--
-- LEVEL IS CAPPED AT 3, SO NESTING IS BY parent_id ALONE.
-- `product_categories_level_check` is CHECK (level >= 1 AND level <= 3) and
-- KP-FIN-BRK is already level 3, so its children cannot be level 4 — a literal
-- reading of "sub" as one level deeper is not expressible in this schema.
-- Nothing enforces level = parent.level + 1, though, and the tree already
-- parents same-level categories: KP-FIN-DIP and KP-FIN-APT are both level 3
-- hanging off KP-FIN-APD, also level 3. That is the established pattern for
-- exactly this kind of display grouping, so this migration follows it and
-- leaves `level` alone. Do not "fix" those levels later; the check would reject
-- the correction and the view does not read the column.
--
-- WHY THAT WORKS AT ALL — THE ROLLUP IS ONE LEVEL, NOT RECURSIVE.
-- menu_public resolves a dish's section as:
--     s.id = CASE WHEN c.is_menu_section THEN c.id ELSE c.parent_id END
-- One hop. A dish is therefore filed under All-Day Breakfast only if its OWN
-- category is a non-section whose parent IS KP-FIN-BRK. This is why the four
-- egg dishes cannot simply stay put: they sit directly in KP-FIN-BRK, which IS
-- a section, so they would render with no subheading while Dips and Toasts got
-- one. They need a category of their own to be a sub of anything, hence
-- KP-FIN-BRK-EGG. The same one-hop rule is why Potato Tacos could not be nested
-- without first flattening MAN-VEG/MAN-MET into KP-FIN-MAN and losing the
-- Vege/Meat subheaders — a second reason to leave them alone.
--
-- STAFF CODES: KP-FIN-BRK-EGG is created with staff_code_prefix NULL on
-- purpose. The four breakfast dishes have staff_code NULL today because
-- KP-FIN-BRK has no prefix, and fn_nomenclature_staff_code returns NEW
-- unchanged when the prefix is NULL or empty. Giving the new category a prefix
-- would mint E-1..E-4 on four dishes that have never had a code and change what
-- the counter staff read. Not this migration's call. Every other dish touched
-- here already has a staff_code, and the function returns early on those.
--
-- CONTRACT-REVIEWED: no column moves and no product_code changes, so every
-- assertion in contracts/menu-contract.json still resolves. contract-check.mjs
-- is green on both the Supabase endpoint and the shishka.health proxy after
-- apply, 11/11 assertions, 92 rows — up from 87, which is the arithmetic this
-- migration intends: +8 unhidden (7 cups/bowls + Beetroot Walnut) and -3
-- Protein Meals. spring-rolls-section still matches 4: Dips left KP-FIN-APD but
-- the spring rolls live in KP-FIN-APT and were not touched.
--
-- The real front-end risk here is not the contract, which keys on product_code.
-- It is that All-Day Breakfast is now the first MAIN section whose dishes all
-- arrive via a subsection, so it depends on the site rendering category_name as
-- a subheader inside a section. That path is already exercised in production by
-- Potato Tacos (Vege / Meat), so it is proven rather than assumed — but any
-- future change to subheader rendering now affects a hero section, not just
-- tacos.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. "you didnt add the new items and salads and bowls"
-- ---------------------------------------------------------------------------
-- Every dish below already exists, is priced, is synced to the till and is
-- is_available = true. It was is_web_visible = false, so the shop sold it and
-- the website did not list it. Bowls 5 -> 11, Salads 7 -> 9.
--
-- THESE HAVE NO PHOTO AND NO customer_ingredients. On the guest site that
-- renders as a name, a price and an empty disc. That was the original reason
-- they were hidden and it has not changed — the CEO is choosing coverage over
-- polish, which is his call to make, but seven photo shoots and seven
-- descriptions is now the highest-value open item on this menu.

UPDATE public.nomenclature
   SET is_web_visible = true, web_published_at = COALESCE(web_published_at, now())
 WHERE product_code IN (
   'SALE-SALAD_THAI_NOODLE',          -- 199, konjac noodle
   'SALE-CUP_TOFU_CHICKPEA',          -- 199
   'SALE-CUP_TERIYAKI_CHICKEN',       -- 219
   'SALE-CUP_TUNA_QUINOA',            -- 249
   'SALE-CUP_SHRIMP_CRAB_SEAWEED',    -- 289
   'SALE-BOWL_MANGO_SALMON_TUNA',     -- 449
   'SALE-CUP_CHICKEN_NUT'             -- 219, the one leaf-based cup -> Salads
 );

-- Beetroot Walnut is priced (149) and keeps staff_code L-5, but had been set
-- unavailable. It is brought back for two reasons: it makes Salads 9, and at
-- 149 it is the only thing on the salad ladder under 199 — 409's gap 1 noted
-- there was nothing below that rung. staff_code is already set, so the trigger
-- returns early and L-5 is preserved.
UPDATE public.nomenclature
   SET is_available = true, is_web_visible = true,
       web_published_at = COALESCE(web_published_at, now())
 WHERE product_code = 'SALE-BEETROOT_WALNUT';

-- ---------------------------------------------------------------------------
-- 2. "sauce should be before All-Day Breakfast"
-- ---------------------------------------------------------------------------
-- Sauces & Dressings moves from 18 to 4, pushing All-Day Breakfast to 5. It is
-- still the fourth MAIN category — sauces are an add-on section, not a fifth
-- main — so the CEO's "4th main category" and this sort order agree.

UPDATE public.product_categories SET sort_order = 1 WHERE code = 'KP-FIN-SLD';
UPDATE public.product_categories SET sort_order = 2 WHERE code = 'KP-FIN-BWL';
UPDATE public.product_categories SET sort_order = 3 WHERE code = 'KP-FIN-WRP';
UPDATE public.product_categories SET sort_order = 4 WHERE code = 'KP-FIN-SDR';
UPDATE public.product_categories SET sort_order = 5 WHERE code = 'KP-FIN-BRK';

-- ---------------------------------------------------------------------------
-- 3. "remove Protein Meals"
-- ---------------------------------------------------------------------------
-- Three live sellers at 299 / 349 / 429. Removed from the MENU, not from the
-- business: is_available is left true so the till still rings them for anyone
-- who asks, and the rows, BOMs and staff codes are untouched. Reversing this is
-- two UPDATEs.
--
-- Hiding the dishes is not optional cosmetics. is_menu_section = false alone
-- would re-file them one hop up to KP-FIN, whose name is "Finished Dishes" —
-- the guest would get a menu section called Finished Dishes. Both flags or
-- neither.

UPDATE public.product_categories
   SET is_menu_section = false
 WHERE code = 'KP-FIN-PRM';

UPDATE public.nomenclature
   SET is_web_visible = false
 WHERE product_code IN (
   'SALE-PROTEIN_MEAL_CHICKEN',
   'SALE-PROTEIN_MEAL_SHRIMP',
   'SALE-PROTEIN_MEAL_BEEF'
 );

-- ---------------------------------------------------------------------------
-- 4. All-Day Breakfast gets its three subsections
-- ---------------------------------------------------------------------------

-- Eggs: the four dishes currently sitting bare in KP-FIN-BRK need their own
-- category to be a subsection at all (see the one-hop note in the header).
-- Level 3 with a level-3 parent, matching KP-FIN-DIP under KP-FIN-APD.
INSERT INTO public.product_categories (code, name, parent_id, level, sort_order, is_active, is_menu_section, staff_code_prefix, default_fin_sub_code)
SELECT 'KP-FIN-BRK-EGG', '🍳 Eggs', p.id, 3, 2, true, false, NULL, 4150
  FROM public.product_categories p
 WHERE p.code = 'KP-FIN-BRK'
   AND NOT EXISTS (SELECT 1 FROM public.product_categories WHERE code = 'KP-FIN-BRK-EGG');

UPDATE public.nomenclature
   SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-BRK-EGG')
 WHERE product_code IN (
   'SALE-BRK_EGGS_YOUR_WAY',
   'SALE-BRK_DOUBLE_PROTEIN',
   'SALE-BRK_GUACAMOLE_EGG',
   'SALE-BRK_CHEESE_EGG'
 );

-- Dips: was a section in its own right under KP-FIN-APD. Now a subsection of
-- breakfast, in the CEO's stated order (Dips, Eggs, Toasts).
UPDATE public.product_categories
   SET parent_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-BRK'),
       is_menu_section = false,
       sort_order = 1
 WHERE code = 'KP-FIN-DIP';

-- Toasts: created as its own section by 409 five hours ago, on the reasoning
-- that they are brunch food and breakfast was short. That is exactly where the
-- CEO has now put them, one level down.
UPDATE public.product_categories
   SET parent_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-BRK'),
       is_menu_section = false,
       sort_order = 3
 WHERE code = 'KP-FIN-TST';

-- ---------------------------------------------------------------------------
-- 5. Self-register
-- ---------------------------------------------------------------------------

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('410_menu_breakfast_subsections.sql', 'claude-opus-session-b18424ec', 'success',
        'CEO corrections to 409. (a) Unhid 7 already-priced, already-available dishes: '
     || 'Bowls 5->11, Salads 7->9 on the web; revived SALE-BEETROOT_WALNUT (149) which also '
     || 'fills the sub-199 salad rung. No dish invented. All 7 still lack photo and '
     || 'customer_ingredients. (b) Sauces & Dressings 18->4, ahead of All-Day Breakfast. '
     || '(c) Protein Meals removed from the menu (section off + 3 dishes web-hidden) but '
     || 'left is_available so the till still sells them. (d) All-Day Breakfast becomes a '
     || 'container: new KP-FIN-BRK-EGG holds the 4 egg dishes, KP-FIN-DIP and KP-FIN-TST '
     || 're-parented under it as non-sections. Dips 4 + Eggs 4 + Toasts 3 = the 11 items '
     || 'the CEO asked for. Nesting is by parent_id at equal level because '
     || 'product_categories_level_check caps level at 3; matches the existing '
     || 'KP-FIN-DIP-under-KP-FIN-APD pattern. Potato Tacos, coffee and drinks NOT nested — '
     || 'it would break the 11 and tacos cannot nest without flattening Vege/Meat.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ===========================================================================
-- STILL OPEN FOR THE CEO
-- ===========================================================================
--
-- 1. SALADS is 9, not 10 — one short, and there is nothing real left to unhide.
--    The only remaining row in the category is SALE-KRAUT_SIDE, which has no
--    price and is a side, not a salad. The 10th has to be a dish he names.
--
-- 2. BOWLS is 11, not 10 — one over. SALE-TABBOULEH_BERRY is still draft and
--    unpriced, so it is not the culprit; one of the eleven is a cut, or the
--    target is 11.
--
-- 3. WRAPS still has 160 and 190 with the 210 rung empty. The shrimp wrap at
--    210 already proposed would complete the ladder.
--
-- 4. SEVEN DISHES ARE NOW PUBLIC WITH NO PHOTO AND NO DESCRIPTION. This is the
--    single biggest quality regression on the guest site and it was a deliberate
--    trade. Listed worst-first by price, because an empty disc next to 449 reads
--    worse than one next to 199: SALE-BOWL_MANGO_SALMON_TUNA (449),
--    SALE-CUP_SHRIMP_CRAB_SEAWEED (289), SALE-CUP_TUNA_QUINOA (249),
--    SALE-CUP_TERIYAKI_CHICKEN (219), SALE-CUP_CHICKEN_NUT (219),
--    SALE-SALAD_THAI_NOODLE (199), SALE-CUP_TOFU_CHICKPEA (199).
--
-- 5. Tabbouleh and Thai Noodle Salad still sit in Bowls with names that say
--    "salad", and Thai Noodle Salad is now visible to guests, so the
--    contradiction is public rather than internal. Both want renaming.
--
-- 6. Protein Meals is off the menu but still sells on the till. If the intent
--    was to stop selling it, is_available also needs to go false.

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
-- Previous values: KP-FIN-SDR sort 18, KP-FIN-BRK sort 4, KP-FIN-DIP parent
-- KP-FIN-APD / is_menu_section true / sort 13, KP-FIN-TST parent KP-FIN /
-- is_menu_section true / sort 5. The four egg dishes were directly in
-- KP-FIN-BRK. The seven unhidden dishes were is_web_visible false;
-- SALE-BEETROOT_WALNUT was additionally is_available false. The three Protein
-- Meals dishes were is_web_visible true and KP-FIN-PRM is_menu_section true.
--
-- DELETE FROM public.migration_log WHERE filename='410_menu_breakfast_subsections.sql';
-- COMMIT;
