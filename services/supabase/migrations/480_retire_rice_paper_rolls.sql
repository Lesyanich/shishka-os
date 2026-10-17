-- 480_retire_rice_paper_rolls.sql
-- CEO 2026-10-16: "убираем также спрингроллы из меню" — same full scope as the
-- Potato Tacos earlier the same day: off the site AND off the till.
--
-- WHAT GOES — 4 rows, the entire KP-FIN-WRP-RPW category:
--   SALE-SUMMER_ROLLS_VEGGIE      149
--   SALE-SUMMER_ROLLS_CHICKEN     199
--   SALE-SUMMER_ROLLS_TUNA_CORN   219
--   SALE-SUMMER_ROLLS_SHRIMP      239
-- name -> '[ARCHIVED] …', is_available=false, is_web_visible=false,
-- pos_status=draft, web_published_at=NULL.
--
-- SALES EVIDENCE, checked before touching anything: ZERO units in 365 days
-- (v_analytics_item_sales_daily, data current to today, top sellers present so
-- the view is live). No revenue is lost by this.
--
-- This closes another part of gap #6 from the Build-Your-Own epic (MC 80da7563,
-- migration 409): Spring Rolls were one of the groups left with no home in the
-- four-category menu. Potato Tacos went earlier today; Dips and Bread & Crackers
-- are still open.
--
-- VERIFIED BEFORE WRITING
--   * Nothing consumes them: zero bom_structures rows use a SALE-SUMMER_ROLLS%
--     dish as an ingredient, so no other dish's COGS or nutrition moves.
--   * They carry no dish_modifier_groups.
--   * Category KP-FIN-WRP-RPW "🍃 Rice Paper Wraps" holds nothing else, so it
--     simply empties. The category row is left in place — menu_public does not
--     consult product_categories.is_active, and keeping the taxonomy is what
--     makes this revertible.
--
-- PRESERVED, revertible by reverting 4 columns per row: the BOM (including the
-- anti-fog box, sauce cup and divider packaging), recipes, photos, prices,
-- staff codes. is_deleted stays false.
--
-- LOYVERSE IS NOT TOUCHED HERE. loyverse_item_id is deliberately left populated
-- so loyverse_push_queue action='delete' can resolve it and soft-delete each
-- item; the handler nulls the column only after the API call succeeds. Nulling
-- it here would make the handler skip all four and leave them at the till.
--
-- CROSS-REPO, required: contracts/menu-contract.json asserts spring-rolls-section
-- (menu_public, product_code=like.SALE-SUMMER_ROLLS*, min 1) because useMenu.js
-- promotes these into their own section by that prefix. It returns 0 now, so
-- contract-check fails until the matching shishka-health change lands.
--
-- NAMING NOTE, worth keeping. This one line carries four different names:
--   product_code  SALE-SUMMER_ROLLS_*        "summer rolls"
--   name          "… Rice Paper Rolls"       admin, POS, site cards
--   category      "🍃 Rice Paper Wraps"
--   site section  "Fresh Spring Roll"        hardcoded in useMenu.js
-- The last one exists NOWHERE in the database — the website invents it from the
-- product_code prefix. That is why searching the admin panel for "spring" finds
-- nothing while the site clearly shows "Fresh Spring Roll", which is exactly how
-- the CEO hit this. Searching "rice paper" finds them.

-- CONTRACT-REVIEWED: removes 4 rows from menu_public and empties the
-- spring-rolls-section assertion, which is the intended outcome; the matching
-- contract edit ships with this migration. No price of any surviving dish is
-- touched, so the "stale prices" failure mode does not apply. contract-check
-- green before, and green after together with the shishka-health change.

BEGIN;

DO $guard$
DECLARE v_live int; v_lv int;
BEGIN
  SELECT count(*) INTO v_live FROM public.nomenclature
   WHERE product_code LIKE 'SALE-SUMMER_ROLLS%' AND is_available AND is_web_visible AND NOT is_deleted;
  IF v_live <> 4 THEN RAISE EXCEPTION 'ABORT: expected 4 live rice-paper rolls, found %.', v_live; END IF;

  SELECT count(*) INTO v_lv FROM public.nomenclature
   WHERE product_code LIKE 'SALE-SUMMER_ROLLS%' AND loyverse_item_id IS NOT NULL;
  IF v_lv <> 4 THEN RAISE EXCEPTION 'ABORT: expected 4 rolls linked to Loyverse, found %.', v_lv; END IF;
END $guard$;

UPDATE public.nomenclature
   SET name = '[ARCHIVED] ' || name,
       is_available = false, is_web_visible = false,
       pos_status = 'draft', web_published_at = NULL, updated_at = now()
 WHERE product_code LIKE 'SALE-SUMMER_ROLLS%' AND name NOT LIKE '[ARCHIVED]%';

DO $verify$
DECLARE v_onsite int; v_sellable int; v_lv int; v_null int;
BEGIN
  SELECT count(*) INTO v_onsite FROM public.menu_public WHERE product_code LIKE 'SALE-SUMMER_ROLLS%';
  IF v_onsite <> 0 THEN RAISE EXCEPTION 'ABORT: % rolls still reach the guest.', v_onsite; END IF;

  SELECT count(*) INTO v_sellable FROM public.nomenclature
   WHERE product_code LIKE 'SALE-SUMMER_ROLLS%' AND (is_available OR is_web_visible);
  IF v_sellable <> 0 THEN RAISE EXCEPTION 'ABORT: % rolls still sellable/visible.', v_sellable; END IF;

  SELECT count(*) INTO v_lv FROM public.nomenclature
   WHERE product_code LIKE 'SALE-SUMMER_ROLLS%' AND loyverse_item_id IS NOT NULL;
  IF v_lv <> 4 THEN RAISE EXCEPTION 'ABORT: only % rolls still linked; the delist step would skip the rest.', v_lv; END IF;

  SELECT count(*) INTO v_null FROM public.menu_public WHERE price IS NULL;
  IF v_null > 0 THEN RAISE EXCEPTION 'ABORT: % menu_public rows have a NULL price.', v_null; END IF;
END $verify$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('480_retire_rice_paper_rolls.sql', 'claude-opus-session-5bddb375', 'success',
        'CEO 2026-10-16: remove the spring rolls from the menu, same full scope as the Potato Tacos (site AND till). '
     || 'Retired 4 rows: SALE-SUMMER_ROLLS_VEGGIE 149, _CHICKEN 199, _TUNA_CORN 219, _SHRIMP 239. Sales evidence: '
     || 'ZERO units in 365 days, so no revenue lost. Closes another part of gap #6 from MC 80da7563. Nothing '
     || 'consumes them in bom_structures, no modifier groups, category KP-FIN-WRP-RPW empties. Revertible in 4 '
     || 'columns. loyverse_item_id left populated on purpose for the delete queue. Needs the shishka-health '
     || 'contract edit (spring-rolls-section assertion).')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
