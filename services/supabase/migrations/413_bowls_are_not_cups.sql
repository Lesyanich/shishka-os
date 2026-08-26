-- 413_bowls_are_not_cups.sql
--
-- CEO, 2026-08-26: "remove the word cup from the items in bowls. remove the
-- word cup they are bowls not cups"
--
-- Renames 5 dishes. Nothing else changes: no price, no product_code, no
-- category, no availability, no staff code.
--
-- PRODUCT CODES KEEP THE WORD CUP AND THAT IS DELIBERATE. All five are still
-- SALE-CUP_*. product_code is the join key the whole system runs on - it is
-- what menu-contract.json asserts against, what loyverse_item_id is paired
-- with, and what /board and useMenu.js match on. Renaming a code to match a
-- display name would be a breaking change to buy cosmetic tidiness in a field
-- no guest ever sees. The CEO asked about "the items", meaning what is printed;
-- the internal codes stay ugly on purpose.
--
-- THE FIFTH DISH IS IN SALADS, NOT BOWLS, AND I RENAMED IT ANYWAY.
-- SALE-CUP_CHICKEN_NUT "Chicken & Nut Cup" moved to Salads in mig 409, so a
-- literal reading of "the items in bowls" leaves it alone - and leaves exactly
-- one "Cup" on a 92-item menu, which would read as an oversight rather than a
-- decision and would cost the CEO a third round-trip on the same word. It
-- becomes "Chicken & Nut Salad", not "... Bowl", because it is a salad. If the
-- intent really was Bowls-only, this is one word to put back.
--
-- WHY "BOWL" IS ADDED RATHER THAN "CUP" JUST DELETED. Deleting the word leaves
-- "Tuna & Quinoa Power" and "Crispy Tofu & Chickpea Buddha", which are not
-- names. Each dish name has to stand on its own on a receipt and on the TV
-- slideshow, where the section header is not next to it. "Buddha Bowl" and
-- "Power Bowl" are also the standard terms for these dishes.
--
--   Crispy Tofu & Chickpea Buddha Cup   -> Crispy Tofu & Chickpea Buddha Bowl
--   Shrimp, Crabstick & Seaweed Cup     -> Shrimp, Crabstick & Seaweed Bowl
--   Teriyaki Chicken Grain & Veggie Cup -> Teriyaki Chicken Grain & Veggie Bowl
--   Tuna & Quinoa Power Cup             -> Tuna & Quinoa Power Bowl
--   Chicken & Nut Cup                   -> Chicken & Nut Salad   (in Salads)
--
-- TWO DESCRIPTIONS SAID "CUP" TOO. Mig 411 wrote this copy four migrations ago
-- and it would now contradict the names on the same card: "the lightest cup on
-- the list" and "the best-value cup on the menu". Both become "bowl". The
-- lightest claim was re-checked against the whole section, not just the former
-- cups - 119 kcal is the lowest of all 10 Bowls, so it still holds. The other
-- three descriptions never used the word.
--
-- THE TILL WILL STILL SAY "CUP" AFTER THIS RUNS. All five are pos_status
-- 'synced' with a loyverse_item_id; Loyverse holds its own copy of the name and
-- this migration does not push to it. pos_status has only two values in this
-- database, 'synced' and 'draft', so there is no "dirty, needs re-push" state I
-- can set honestly - and flipping them to 'draft' would likely read as "not on
-- the till at all", which is worse than a stale name. A Loyverse rename is a
-- separate job; it is listed below. Staff codes (L-*, B-*) are untouched, so
-- what the counter reads out is unaffected either way.
--
-- CONTRACT-REVIEWED: changes `name` on 5 SALE- rows and `customer_description`
-- on 2. No product_code, price, category_id, is_available or is_web_visible is
-- touched, so no row enters or leaves menu_public: 92 before, 92 after. All 6
-- assertions in menu-contract.json key on product_code and row counts, and none
-- matches on a dish name. contract-check.mjs run green before and after.

BEGIN;

UPDATE public.nomenclature SET name = 'Crispy Tofu & Chickpea Buddha Bowl'
 WHERE product_code = 'SALE-CUP_TOFU_CHICKPEA';

UPDATE public.nomenclature SET name = 'Shrimp, Crabstick & Seaweed Bowl'
 WHERE product_code = 'SALE-CUP_SHRIMP_CRAB_SEAWEED';

UPDATE public.nomenclature SET name = 'Teriyaki Chicken Grain & Veggie Bowl'
 WHERE product_code = 'SALE-CUP_TERIYAKI_CHICKEN';

UPDATE public.nomenclature SET name = 'Tuna & Quinoa Power Bowl'
 WHERE product_code = 'SALE-CUP_TUNA_QUINOA';

-- This one lives in Salads, so it becomes a Salad and not a Bowl.
UPDATE public.nomenclature SET name = 'Chicken & Nut Salad'
 WHERE product_code = 'SALE-CUP_CHICKEN_NUT';

-- Copy written in 411 that would now contradict the name on the same card.
UPDATE public.nomenclature
   SET customer_description = replace(customer_description,
         'the lightest cup on the list', 'the lightest bowl on the list')
 WHERE product_code = 'SALE-CUP_SHRIMP_CRAB_SEAWEED';

UPDATE public.nomenclature
   SET customer_description = replace(customer_description,
         'the best-value cup on the menu', 'the best-value bowl on the menu')
 WHERE product_code = 'SALE-CUP_TOFU_CHICKPEA';

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('413_bowls_are_not_cups.sql', 'claude-opus-session-b18424ec', 'success',
        'CEO: "remove the word cup from the items in bowls ... they are bowls not cups". '
     || 'Renamed 4 Bowls dishes Cup->Bowl and SALE-CUP_CHICKEN_NUT (which mig 409 moved to '
     || 'Salads) Cup->Salad, so no "Cup" is left on the menu. product_codes stay SALE-CUP_* '
     || 'on purpose - that is the contract/POS join key and no guest sees it. Also fixed 2 '
     || 'customer_descriptions from 411 that still said "cup" and would have contradicted the '
     || 'name on the same card; re-verified "lightest at 119 kcal" against all 10 Bowls, still '
     || 'true. NOT DONE: Loyverse still holds the old names (all 5 are pos_status=synced with a '
     || 'loyverse_item_id) - the till will read "Cup" until someone pushes a POS rename. '
     || 'Staff codes untouched. menu_public row count unchanged 92->92.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- BEGIN;
-- UPDATE public.nomenclature SET name='Crispy Tofu & Chickpea Buddha Cup'   WHERE product_code='SALE-CUP_TOFU_CHICKPEA';
-- UPDATE public.nomenclature SET name='Shrimp, Crabstick & Seaweed Cup'     WHERE product_code='SALE-CUP_SHRIMP_CRAB_SEAWEED';
-- UPDATE public.nomenclature SET name='Teriyaki Chicken Grain & Veggie Cup' WHERE product_code='SALE-CUP_TERIYAKI_CHICKEN';
-- UPDATE public.nomenclature SET name='Tuna & Quinoa Power Cup'            WHERE product_code='SALE-CUP_TUNA_QUINOA';
-- UPDATE public.nomenclature SET name='Chicken & Nut Cup'                  WHERE product_code='SALE-CUP_CHICKEN_NUT';
-- UPDATE public.nomenclature SET customer_description=replace(customer_description,'the lightest bowl on the list','the lightest cup on the list') WHERE product_code='SALE-CUP_SHRIMP_CRAB_SEAWEED';
-- UPDATE public.nomenclature SET customer_description=replace(customer_description,'the best-value bowl on the menu','the best-value cup on the menu') WHERE product_code='SALE-CUP_TOFU_CHICKPEA';
-- DELETE FROM public.migration_log WHERE filename='413_bowls_are_not_cups.sql';
-- COMMIT;
--
-- ---------------------------------------------------------------------------
-- STILL OPEN FOR THE CEO
--
-- 1. LOYVERSE RENAME. The five items are live on the till under their old
--    names. Until a POS push runs, the receipt and the cashier screen say
--    "Cup" while the website and the TV say "Bowl". This is the one visible
--    inconsistency this migration creates and it should be closed quickly.
-- 2. The five SALE-CUP_* dishes have NO packaging lines in bom_structures at
--    all, while Tabbouleh has four. So (a) nobody can say from the data which
--    vessel they actually ship in, and (b) their food cost is understated by
--    the cost of the container and lid. /chef should add the packaging.
-- 3. Photos: unchanged and still the top item. 9 dishes across Salads and
--    Bowls have no image.
