-- 466_retire_potato_tacos.sql
-- MC 2dceda60 — CEO 2026-10-16: "вижу что на сайте в продаже все еще Картофельные
-- тако - мы больше их не продаем! сделать неактивными". Scope confirmed the same
-- day: FULL retirement, site AND till.
--
-- WHY. This closes gap #6 recorded against the Build-Your-Own epic (MC 80da7563)
-- when migration 409 reorganised the menu into four categories: "~20 sellable
-- dishes have no home in the four-category scheme and were left where they are:
-- Protein Meals (3), Dips (4), Spring Rolls (4), Potato Tacos (7), Bread &
-- Crackers (2). Either the concept grows more categories or those dishes leave
-- the menu." The Protein Meals already left (migration 410). The tacos leave now.
--
-- WHAT GOES — 9 nomenclature rows and 2 price_tiers rows.
--
--   Live on the site and ringing at the till (7):
--     SALE-MANAISH_ZAATAR_GF             69   Vege
--     SALE-MANAISH_CHEESE_GF             69   Vege
--     SALE-MANAISH_FALAFEL_GF            69   Vege
--     SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF 69   Vege
--     SALE-MANAISH_LAMB_GF               89   Meat
--     SALE-MANAISH_BEEF_GF               89   Meat
--     SALE-MANAISH_SALAMI_GF             89   Meat
--
--   On the site but NOT sellable, and still in Loyverse (1):
--     SALE-MANAISH_CHEESE_MUSHROOM_GF    59   is_available=false but
--     is_web_visible=true, so the guest has been reading a 59 THB "Classic" row
--     that no cashier could ring. It goes with the rest rather than being left
--     as the one survivor of a retired section.
--
--   The bundle, live at the till and already hidden on the site (1):
--     SALE-BUNDLE_MANAKISH_4  "Potato Tacos Set ×4"  319, is_available=true,
--     pos_status=synced. Retiring the tacos without it would leave a 319 THB
--     set at the till whose contents are gone.
--
--   price_tiers: bundle4 and bundle8 -> is_active=false. These two rows are what
--   render the "set of 4 / set of 8 — build your set" cards on shishka.health
--   (lib/bundles.js reads them through useMenu). bundle12 is already inactive.
--
-- HOW THE SITE ACTUALLY CLEARS. menu_public gates on
-- `is_web_visible = true AND (name IS NULL OR name NOT ILIKE '[ARCHIVED]%')`,
-- so flipping the flag and prefixing the name each independently remove a dish;
-- doing both is belt and braces. The view does NOT consult
-- product_categories.is_active, so the KP-FIN-MAN* categories are deliberately
-- left alone — an empty section renders nothing, and keeping the taxonomy intact
-- is what makes this revertible. Nothing in the OS application code keys on the
-- KP-FIN-MAN prefix (checked: only migrations, docs and an mcp-chef default).
--
-- WHAT IS PRESERVED, so the line is revivable by reverting 4 columns per row:
-- every BOM, recipes_flow, photo, price, staff_code, category and the whole
-- potato-base PF tree. is_deleted stays false. This follows the archive
-- convention of migration 403 (the Shrimp taco).
--
-- MODIFIERS ARE LEFT ATTACHED. SALE-BUNDLE_MANAKISH_4 carries 5
-- dish_modifier_groups (the taco picker). They are left in place and dormant:
-- per the standing WEB-ONLY-sentinel rule, modifier wiring is load-bearing and
-- is never "cleaned up" as a side effect of retiring a dish.
--
-- LOYVERSE IS NOT TOUCHED HERE. loyverse_item_id is deliberately left populated
-- on all 9 rows. The till is cleared in a separate step by enqueueing
-- loyverse_push_queue action='delete', whose handler (handleDeleteDish ->
-- handleDeleteItem) resolves loyverse_item_id, soft-deletes the item in Loyverse
-- and only then nulls loyverse_item_id / loyverse_price / loyverse_synced_at.
-- Nulling the id in this migration would make that handler skip every row and
-- silently leave all 9 items ringing at the till.
--
-- NO BOM CASCADE. Verified before writing: zero bom_structures rows consume any
-- SALE-MANAISH% dish as an ingredient, so no other dish's COGS or nutrition
-- moves. The bundles are driven by price_tiers plus a category_code prefix in
-- lib/bundles.js, not by BOM.
--
-- CROSS-REPO. shishka-health's contracts/menu-contract.json asserts
-- taco-bundle-pool (menu_public, category_code=like.KP-FIN-MAN*, min 1) and a
-- price_tiers resource (minRows 1, bundle_dish_code=not.is.null&is_active=eq.true).
-- Both drop to 0 rows on this migration, so contract-check.mjs goes red until the
-- matching HEALTH change lands. That edit ships with this work, not after it.
--
-- NUMBERING. 466: prod's migration_log already records up to 465, while the repo
-- stops at 462 (460 and 461 are reserved by PR #597, and 463-465 are applied but
-- uncommitted). migration_log is keyed on filename, so reusing a number would
-- file two unrelated migrations under one name.

-- CONTRACT-REVIEWED: touches menu_public (8 taco rows leave it) and price_tiers
-- (bundle4/bundle8 deactivated), both read by shishka.health. Safe, and the
-- matching contract edit ships with this migration rather than after it:
--   * contracts/menu-contract.json in shishka-health — the `taco-bundle-pool`
--     assertion (menu_public, category_code=like.KP-FIN-MAN*, min 1) is REMOVED,
--     because an empty taco pool is now the intended state rather than a break,
--     and the `price_tiers` resource drops to minRows 0 while keeping its column
--     list so a dropped or renamed column still fails the check.
--   * No stale prices reach the guest: this migration removes rows from
--     menu_public, it does not change the price of anything that stays. The 85
--     surviving dishes are untouched and still carry 0 NULL prices.
--   * The site renders the empty case without a hole — App.jsx computes
--     bundleCards as [] when the pool is empty and guards the block on
--     bundleCards.length > 0, ManakishSets returns null on an empty list, and
--     ManakishTiers is keyed on a section name that no longer appears.
-- node scripts/contract-check.mjs was green BEFORE (93 rows) and is green AFTER
-- (85 rows, price_tiers 0 rows) on BOTH endpoints, including https://shishka.health/sb.
-- Verified in a browser against the live DB: 85 dish cards, no taco code, no set
-- card, no empty section, no console errors.

BEGIN;

-- ---------------------------------------------------------------------------
-- PRE-STATE GUARD. Compare columns directly rather than against a formatted
-- string: migration 403's first attempt failed because format() emits 't'/'f'
-- where the expectation said 'true'/'false'.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_targets   int;
  v_sellable  int;
  v_on_site   int;
  v_in_lv     int;
  v_tiers     int;
BEGIN
  SELECT count(*) INTO v_targets
    FROM public.nomenclature
   WHERE product_code IN (
           'SALE-MANAISH_ZAATAR_GF','SALE-MANAISH_CHEESE_GF','SALE-MANAISH_FALAFEL_GF',
           'SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','SALE-MANAISH_LAMB_GF','SALE-MANAISH_BEEF_GF',
           'SALE-MANAISH_SALAMI_GF','SALE-MANAISH_CHEESE_MUSHROOM_GF','SALE-BUNDLE_MANAKISH_4');
  IF v_targets <> 9 THEN
    RAISE EXCEPTION 'ABORT: expected 9 target rows, found %. The product codes moved — re-read before retiring.', v_targets;
  END IF;

  -- 8 of the 9 are sellable today (Cheese & Mushroom is already is_available=false).
  SELECT count(*) INTO v_sellable
    FROM public.nomenclature
   WHERE product_code IN (
           'SALE-MANAISH_ZAATAR_GF','SALE-MANAISH_CHEESE_GF','SALE-MANAISH_FALAFEL_GF',
           'SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','SALE-MANAISH_LAMB_GF','SALE-MANAISH_BEEF_GF',
           'SALE-MANAISH_SALAMI_GF','SALE-BUNDLE_MANAKISH_4')
     AND is_available = true;
  IF v_sellable <> 8 THEN
    RAISE EXCEPTION 'ABORT: expected 8 sellable rows, found %. Someone changed availability since this was planned.', v_sellable;
  END IF;

  -- 8 reach the guest today (the bundle is is_web_visible=false).
  SELECT count(*) INTO v_on_site FROM public.menu_public WHERE category_code LIKE 'KP-FIN-MAN%';
  IF v_on_site <> 8 THEN
    RAISE EXCEPTION 'ABORT: expected 8 tacos in menu_public, found %.', v_on_site;
  END IF;

  -- All 9 must still be linked to Loyverse, or the delete step has nothing to act on.
  SELECT count(*) INTO v_in_lv
    FROM public.nomenclature
   WHERE product_code IN (
           'SALE-MANAISH_ZAATAR_GF','SALE-MANAISH_CHEESE_GF','SALE-MANAISH_FALAFEL_GF',
           'SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','SALE-MANAISH_LAMB_GF','SALE-MANAISH_BEEF_GF',
           'SALE-MANAISH_SALAMI_GF','SALE-MANAISH_CHEESE_MUSHROOM_GF','SALE-BUNDLE_MANAKISH_4')
     AND loyverse_item_id IS NOT NULL;
  IF v_in_lv <> 9 THEN
    RAISE EXCEPTION 'ABORT: expected 9 rows linked to Loyverse, found %. Delisting would miss the unlinked ones.', v_in_lv;
  END IF;

  SELECT count(*) INTO v_tiers
    FROM public.price_tiers WHERE tier_code IN ('bundle4','bundle8') AND is_active = true;
  IF v_tiers <> 2 THEN
    RAISE EXCEPTION 'ABORT: expected bundle4 + bundle8 both active, found % active.', v_tiers;
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- RETIRE. Off the site, off the menu, unsellable. loyverse_item_id untouched.
-- ---------------------------------------------------------------------------
UPDATE public.nomenclature
   SET name            = '[ARCHIVED] ' || name,
       is_available     = false,
       is_web_visible   = false,
       pos_status       = 'draft',
       web_published_at = NULL,
       updated_at       = now()
 WHERE product_code IN (
         'SALE-MANAISH_ZAATAR_GF','SALE-MANAISH_CHEESE_GF','SALE-MANAISH_FALAFEL_GF',
         'SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','SALE-MANAISH_LAMB_GF','SALE-MANAISH_BEEF_GF',
         'SALE-MANAISH_SALAMI_GF','SALE-MANAISH_CHEESE_MUSHROOM_GF','SALE-BUNDLE_MANAKISH_4')
   AND name NOT LIKE '[ARCHIVED]%';

-- The two set-builder cards on shishka.health.
UPDATE public.price_tiers
   SET is_active = false
 WHERE tier_code IN ('bundle4','bundle8');

-- ---------------------------------------------------------------------------
-- POST-STATE. The section must be gone from the guest view and nothing may be
-- sellable; every row must still be linked to Loyverse for the delete step.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_on_site  int;
  v_sellable int;
  v_archived int;
  v_in_lv    int;
  v_tiers    int;
  v_menu     int;
  v_nullprice int;
BEGIN
  SELECT count(*) INTO v_on_site FROM public.menu_public WHERE category_code LIKE 'KP-FIN-MAN%';
  IF v_on_site <> 0 THEN
    RAISE EXCEPTION 'ABORT: % taco rows still reach the guest via menu_public.', v_on_site;
  END IF;

  SELECT count(*) INTO v_sellable
    FROM public.nomenclature
   WHERE product_code IN (
           'SALE-MANAISH_ZAATAR_GF','SALE-MANAISH_CHEESE_GF','SALE-MANAISH_FALAFEL_GF',
           'SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','SALE-MANAISH_LAMB_GF','SALE-MANAISH_BEEF_GF',
           'SALE-MANAISH_SALAMI_GF','SALE-MANAISH_CHEESE_MUSHROOM_GF','SALE-BUNDLE_MANAKISH_4')
     AND (is_available = true OR is_web_visible = true);
  IF v_sellable <> 0 THEN
    RAISE EXCEPTION 'ABORT: % of the 9 rows are still available or web-visible.', v_sellable;
  END IF;

  SELECT count(*) INTO v_archived
    FROM public.nomenclature
   WHERE product_code IN (
           'SALE-MANAISH_ZAATAR_GF','SALE-MANAISH_CHEESE_GF','SALE-MANAISH_FALAFEL_GF',
           'SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','SALE-MANAISH_LAMB_GF','SALE-MANAISH_BEEF_GF',
           'SALE-MANAISH_SALAMI_GF','SALE-MANAISH_CHEESE_MUSHROOM_GF','SALE-BUNDLE_MANAKISH_4')
     AND name LIKE '[ARCHIVED]%'
     AND is_deleted = false;
  IF v_archived <> 9 THEN
    RAISE EXCEPTION 'ABORT: expected 9 archived-but-not-deleted rows, found %.', v_archived;
  END IF;

  SELECT count(*) INTO v_in_lv
    FROM public.nomenclature
   WHERE product_code IN (
           'SALE-MANAISH_ZAATAR_GF','SALE-MANAISH_CHEESE_GF','SALE-MANAISH_FALAFEL_GF',
           'SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF','SALE-MANAISH_LAMB_GF','SALE-MANAISH_BEEF_GF',
           'SALE-MANAISH_SALAMI_GF','SALE-MANAISH_CHEESE_MUSHROOM_GF','SALE-BUNDLE_MANAKISH_4')
     AND loyverse_item_id IS NOT NULL;
  IF v_in_lv <> 9 THEN
    RAISE EXCEPTION 'ABORT: only % of 9 rows still carry loyverse_item_id; the delete step would skip the rest.', v_in_lv;
  END IF;

  SELECT count(*) INTO v_tiers FROM public.price_tiers WHERE is_active = true AND bundle_dish_code IS NOT NULL;
  IF v_tiers <> 0 THEN
    RAISE EXCEPTION 'ABORT: % bundle tier(s) still active.', v_tiers;
  END IF;

  -- Collateral check: the rest of the menu must be untouched and still priced.
  SELECT count(*) INTO v_menu FROM public.menu_public;
  SELECT count(*) INTO v_nullprice FROM public.menu_public WHERE price IS NULL;
  IF v_nullprice > 0 THEN
    RAISE EXCEPTION 'ABORT: % menu_public rows have a NULL price.', v_nullprice;
  END IF;
  RAISE NOTICE 'Potato Tacos retired. menu_public now % dishes, 0 null prices.', v_menu;
END
$verify$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('466_retire_potato_tacos.sql', 'claude-opus-session-5bddb375', 'success',
        'MC 2dceda60 — CEO 2026-10-16 "we no longer sell Potato Tacos, make them inactive", scope confirmed '
     || 'site AND till. Retired 9 rows (7 live tacos 69/69/69/69 + 89/89/89, the 59 Cheese & Mushroom that was '
     || 'web-visible but already unsellable, and SALE-BUNDLE_MANAKISH_4 Set x4 319 which was still ringing at '
     || 'the till): name prefixed [ARCHIVED], is_available=false, is_web_visible=false, pos_status=draft, '
     || 'web_published_at=NULL. price_tiers bundle4 + bundle8 is_active=false (the set-builder cards on '
     || 'shishka.health). Closes gap #6 from the Build-Your-Own epic MC 80da7563 / migration 409 — the tacos '
     || 'had no home in the four-category scheme. PRESERVED and revertible in 4 columns per row: BOMs, '
     || 'recipes_flow, photos, prices, staff codes, categories, the potato-base PF tree; is_deleted stays '
     || 'false. loyverse_item_id DELIBERATELY left populated so loyverse_push_queue action=delete can resolve '
     || 'and soft-delete each item; nulling it here would make the handler skip all 9 and leave them at the '
     || 'till. dish_modifier_groups on the bundle (5 groups, the taco picker) left attached and dormant. '
     || 'Zero bom_structures rows consume a SALE-MANAISH% dish, so no COGS cascade. Needs the matching '
     || 'shishka-health edit (menu-contract taco-bundle-pool + price_tiers assertions) or contract-check goes red.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
