-- 412_tabbouleh_is_a_salad.sql
--
-- CEO, 2026-08-26: "Tabbouleh is a salad not bowl"
--
-- Moves SALE-TABBOULEH from KP-FIN-BWL to KP-FIN-SLD. One column on two rows.
-- Every other number in this migration is a consequence, not a change.
--
-- THIS FIXES THE COUNTS THE ORIGINAL BRIEF ASKED FOR. The brief said SALADS
-- 10 items and BOWLS 10 items. We were at Salads 9, Bowls 11 and I had this
-- filed as an open item for the CEO on the grounds that there was nothing
-- real left to unhide into Salads. There wasn't. The tenth salad was not
-- missing, it was misfiled one section down. Salads 9 -> 10, Bowls 11 -> 10.
-- Both targets are now hit exactly, and no dish was invented to hit them.
--
-- THREE INDEPENDENT CONFIRMATIONS, NONE OF WHICH I FOUND FIRST:
--
-- 1. THE STAFF CODE ALREADY SAID SALAD. SALE-TABBOULEH's staff_code is L-2.
--    "L" is the staff_code_prefix of KP-FIN-SLD; KP-FIN-BWL's prefix is "B".
--    The counter staff have been calling it a salad code this whole time
--    while the menu filed it under Bowls.
--
-- 2. THE HALF PORTION WAS ALREADY A SALAD. SALE-TABBOULEH_SMALL sits in
--    KP-FIN-SLD-SM, "Mini Salads". The database was contradicting itself:
--    120 THB of tabbouleh was a salad, 269 THB of the same recipe was a bowl.
--
-- 3. THE RECIPE AGREES. Ignoring packaging lines, the dish is 382 g of food:
--    parsley 80, quinoa 70, tomato 60, lemon 42, sumac dressing 40, red onion
--    30, spring onion 25, pomegranate 20, mint 15. Parsley is the single
--    largest ingredient and leaf/veg is 82% of the weight. Quinoa is 18% - a
--    component, not a base. Compare the actual Bowls, where quinoa is 90 g
--    AND the largest line (Tuna & Quinoa, Tofu & Chickpea). "What is the
--    biggest thing in it" separates the two cleanly.
--
-- WHERE THE CEO'S RULE IS LOOSER THAN HIS WORDING. The brief defines Salads as
-- "leaf base, no grain". Read literally, "no grain" excludes tabbouleh, which
-- has 70 g of quinoa, and it would also have to exclude the croutons in
-- Fattoush and both Caesars. Read as "leaf base", tabbouleh is obviously in.
-- The CEO is applying the second reading and he is right - traditional
-- tabbouleh is a parsley salad with a little grain in it, not a grain dish.
-- Worth amending the concept doc to "leaf base" and dropping "no grain",
-- because the literal version misfiles four of the ten salads.
--
-- WHAT IS DELIBERATELY NOT MOVED: SALE-SALAD_THAI_NOODLE. It is named "Salad",
-- it sits in Bowls, and the CEO did not mention it. That is consistent, not an
-- oversight on his part: its base is 90 g of konjac noodles, and the brief puts
-- "noodle base" in Bowls explicitly. Moving it as well would also break the
-- arithmetic above, giving Salads 11 and Bowls 9. Named like a salad, built
-- like a bowl, stays in Bowls.
--
-- NO TILL DISRUPTION. fn_nomenclature_staff_code fires on UPDATE OF
-- category_id, but returns NEW unchanged when staff_code IS NOT NULL. Both
-- rows already have one (L-2, L-10), so nothing is re-minted and no printed
-- code changes. This is the trap that made mig 410 create KP-FIN-BRK-EGG with
-- a NULL prefix; here the codes are already correct for their destination.
--
-- DISPLAY ORDER UNTOUCHED ON PURPOSE. Tabbouleh's display_order is 1. In
-- Salads, 1 is free and Fattoush is 2, so it lands directly beside the other
-- Levantine salad, with which it shares PF-SUMAC_DRESSING. The move needs no
-- reordering to produce a sensible page.
--
-- SALE-TABBOULEH_BERRY moves too. It is unpriced, is_available = false and not
-- web visible, so this changes nothing a guest or a cashier sees. It is moved
-- so that whoever eventually prices it does not have to be told this same
-- correction a second time.
--
-- CONTRACT-REVIEWED: changes category_id on 2 SALE- rows. No product_code is
-- created, renamed, deleted or repriced, and no row enters or leaves
-- menu_public - SALE-TABBOULEH was already web-visible and stays so, and
-- SALE-TABBOULEH_BERRY was already invisible and stays so. Total row count is
-- unchanged at 92; only section_name/section_id on one row differ.
-- menu-contract.json keys its assertions on product_code and row counts, and
-- none of its 6 assertions references Salads, Bowls or section membership.
-- contract-check.mjs run green before and after.

BEGIN;

UPDATE public.nomenclature
   SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-SLD')
 WHERE product_code IN ('SALE-TABBOULEH', 'SALE-TABBOULEH_BERRY');

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('412_tabbouleh_is_a_salad.sql', 'claude-opus-session-b18424ec', 'success',
        'CEO: "Tabbouleh is a salad not bowl". Moved SALE-TABBOULEH (269) and the dormant '
     || 'SALE-TABBOULEH_BERRY from KP-FIN-BWL to KP-FIN-SLD. Lands the original brief exactly: '
     || 'Salads 9->10, Bowls 11->10, with no dish invented. Three things already agreed with the '
     || 'CEO before this ran: staff_code L-2 is the Salads prefix (Bowls is B), SALE-TABBOULEH_SMALL '
     || 'was already in Mini Salads, and parsley (80 g) outweighs quinoa (70 g) in a dish that is '
     || '82% leaf and veg by weight. No staff code re-minted (trigger no-ops when staff_code is not '
     || 'null). display_order 1 left as-is, which seats it beside Fattoush. Thai Noodle Salad '
     || 'deliberately NOT moved: 90 g konjac noodle base, and the brief puts noodle base in Bowls. '
     || 'menu_public row count unchanged 92->92.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- BEGIN;
-- UPDATE public.nomenclature
--    SET category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-BWL')
--  WHERE product_code IN ('SALE-TABBOULEH', 'SALE-TABBOULEH_BERRY');
-- DELETE FROM public.migration_log WHERE filename='412_tabbouleh_is_a_salad.sql';
-- COMMIT;
--
-- ---------------------------------------------------------------------------
-- STILL OPEN FOR THE CEO
--
-- 1. The concept wording. "SALADS - leaf base, no grain" should probably lose
--    "no grain", which as written also misfiles Fattoush (croutons) and both
--    Caesars (croutons). "Leaf base" alone gives the right answer every time.
-- 2. Salads and Bowls are both at 10 and Wraps is still at 2 against a
--    160/190/210 ladder. Wraps is now the only main category off target.
-- 3. Photos: still the top open item. 9 of the 20 dishes in these two sections
--    have no image.
