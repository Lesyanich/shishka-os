-- 469_allergen_tag_backfill.sql
-- MC f8820aea — CEO 2026-10-16: "только аллергены можно поправить".
--
-- THE REAL GAP, and it is narrower than first reported. There are two allergen
-- stores and nothing syncs them:
--   * nomenclature.allergens  — the curated text[] column, well maintained.
--   * nomenclature_tags + tags — what fn_dish_allergens() reads, and therefore
--     what fn_loyverse_sync_dish() prints as the "(contains: …)" suffix on every
--     POS item.
-- fn_dish_allergens walks the BOM, so a blank INGREDIENT silently strips the
-- warning from every dish above it, even when the dish's own column is correct.
--
-- WHAT IS ACTUALLY WRONG AT THE TILL: eggs, on 4 live dishes —
--   Chicken Avocado Wrap, Chicken Fajita Fold Wrap,
--   Lamb Truffle & Cheese Fold Wrap, Shrimp Fajita Fold Wrap
-- Each declares 'egg' in its own column while the POS description omits it.
--
-- ROOT CAUSE: six mayonnaise- and egg-based PF sauces declare egg in the column
-- and carry NO allergen tags at all, so nothing propagates up the BOM:
--   PF-DYNAMITE_SAUCE, PF-GARLIC_CREAM, PF-HONEY_MUSTARD, PF-TRUFFLE_MAYO,
--   PF-CAESAR_YOGURT_DRESSING (also fish + milk), PF-BROWNIE_BANANA (also peanuts)
--
-- A CORRECTION TO AN EARLIER CLAIM, recorded so it is not repeated: this session
-- first reported that 13 live dishes print no gluten warning at the POS. That was
-- WRONG, and it was a measurement bug, not a data bug — fn_dish_allergens returns
-- SLUG form ('allergen-gluten'), and the check compared it against the bare
-- column form ('gluten'). Verified since: all 27 gluten-bearing live dishes do
-- emit allergen-gluten to Loyverse. Gluten at the till was never broken. When
-- comparing the two stores, map column -> slug first; they do not share a
-- vocabulary.
--
-- WHAT THIS MIGRATION DOES. One INSERT-only backfill of nomenclature_tags from
-- nomenclature.allergens for every non-deleted item, through the slug map
--   milk -> dairy, egg -> eggs, crustacean -> shellfish,
--   tree nuts -> nuts, peanuts -> nuts, and identity for the rest.
-- 96 links across 9 allergens. ON CONFLICT DO NOTHING.
--
-- IT NEVER REMOVES A LINK. That is the whole safety property: the two stores
-- disagree in both directions, and the other direction (POS declares something
-- the column does not — mustard from a dressing, nuts in a smoothie) is the POS
-- being MORE cautious. Deleting those to "sync" would weaken a live warning, so
-- this migration only ever adds. An over-warning is safe; an under-warning is not.
--
-- 'legume' is deliberately unmapped — chickpea is not a declarable allergen;
-- lupin is the declarable legume and we do not use it.
--
-- NOT DONE HERE: the dishes still need re-pushing to Loyverse for the new text to
-- reach the till, and the two stores will drift apart again because nothing keeps
-- them in sync. Both belong to MC 572c53b1, the standing allergen gate.

-- CONTRACT-REVIEWED: touches nomenclature_tags, which shishka.health reads
-- (contracts/menu-contract.json declares it as a resource, select
-- "nomenclature_id,tags(slug,name,tag_group,color)", minRows 1). Safe:
--   * INSERT-only. No row is deleted, no column added, renamed or dropped, so
--     the shape the contract asserts cannot move and minRows can only rise.
--   * The site reads these tags to render dietary/allergen chips. This commit
--     only ever ADDS a chip that the dish already declared in its own
--     nomenclature.allergens column, so a guest sees more warnings, never fewer.
--   * No price is touched anywhere, so the "stale prices" failure mode the
--     canary warns about does not apply.
-- node scripts/contract-check.mjs green on BOTH endpoints before and after,
-- including https://shishka.health/sb: nomenclature_tags 848 -> 942 rows,
-- menu_public 85, 0 null prices, all assertions matched.

BEGIN;

CREATE TEMP TABLE _want ON COMMIT DROP AS
SELECT n.id AS nomenclature_id, t.id AS tag_id
FROM public.nomenclature n
CROSS JOIN LATERAL unnest(n.allergens) AS a
JOIN public.tags t
  ON t.tag_group = 'allergen'
 AND t.slug = 'allergen-' || (CASE a
       WHEN 'milk'       THEN 'dairy'
       WHEN 'egg'        THEN 'eggs'
       WHEN 'crustacean' THEN 'shellfish'
       WHEN 'tree nuts'  THEN 'nuts'
       WHEN 'peanuts'    THEN 'nuts'
       ELSE a END)
WHERE NOT n.is_deleted;

DO $guard$
DECLARE
  v_missing int;
  v_egggap  int;
BEGIN
  SELECT count(*) INTO v_missing
    FROM _want w
   WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature_tags nt
                      WHERE nt.nomenclature_id = w.nomenclature_id AND nt.tag_id = w.tag_id);
  IF v_missing NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'ABORT: % links to add is outside the expected range (measured 96).', v_missing;
  END IF;

  SELECT count(*) INTO v_egggap
    FROM public.nomenclature n
   WHERE n.is_web_visible AND NOT n.is_deleted AND n.product_code LIKE 'SALE-%'
     AND (n.name IS NULL OR n.name NOT ILIKE '[ARCHIVED]%')
     AND 'egg' = ANY(n.allergens)
     AND NOT ('allergen-eggs' = ANY(public.fn_dish_allergens(n.id)));
  IF v_egggap <> 4 THEN
    RAISE EXCEPTION 'ABORT: expected 4 live dishes under-declaring eggs at the POS, found %.', v_egggap;
  END IF;
END
$guard$;

INSERT INTO public.nomenclature_tags (nomenclature_id, tag_id)
SELECT w.nomenclature_id, w.tag_id FROM _want w
ON CONFLICT DO NOTHING;

DO $verify$
DECLARE
  v_left   int;
  v_egggap int;
BEGIN
  SELECT count(*) INTO v_left
    FROM _want w
   WHERE NOT EXISTS (SELECT 1 FROM public.nomenclature_tags nt
                      WHERE nt.nomenclature_id = w.nomenclature_id AND nt.tag_id = w.tag_id);
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ABORT: % declared allergens still have no tag.', v_left;
  END IF;

  -- The gap this migration exists to close.
  SELECT count(*) INTO v_egggap
    FROM public.nomenclature n
   WHERE n.is_web_visible AND NOT n.is_deleted AND n.product_code LIKE 'SALE-%'
     AND (n.name IS NULL OR n.name NOT ILIKE '[ARCHIVED]%')
     AND 'egg' = ANY(n.allergens)
     AND NOT ('allergen-eggs' = ANY(public.fn_dish_allergens(n.id)));
  IF v_egggap <> 0 THEN
    RAISE EXCEPTION 'ABORT: % live dishes still under-declare eggs at the POS.', v_egggap;
  END IF;

  -- Nothing anywhere may now declare an allergen in the column that the POS path
  -- does not also report.
  PERFORM 1 FROM public.nomenclature n
    WHERE n.is_web_visible AND NOT n.is_deleted AND n.product_code LIKE 'SALE-%'
      AND (n.name IS NULL OR n.name NOT ILIKE '[ARCHIVED]%')
      AND EXISTS (
        SELECT 1 FROM unnest(n.allergens) a
         WHERE NOT ('allergen-' || (CASE a
                 WHEN 'milk' THEN 'dairy' WHEN 'egg' THEN 'eggs'
                 WHEN 'crustacean' THEN 'shellfish' WHEN 'tree nuts' THEN 'nuts'
                 WHEN 'peanuts' THEN 'nuts' ELSE a END)) = ANY(public.fn_dish_allergens(n.id)));
  IF FOUND THEN
    RAISE EXCEPTION 'ABORT: a live dish still declares an allergen the POS path does not report.';
  END IF;
END
$verify$;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('469_allergen_tag_backfill.sql', 'claude-opus-session-5bddb375', 'success',
        'MC f8820aea - CEO "only the allergens can be fixed". INSERT-only backfill of nomenclature_tags from '
     || 'nomenclature.allergens via the slug map (milk->dairy, egg->eggs, crustacean->shellfish, '
     || 'tree nuts/peanuts->nuts), 96 links across 9 allergens, ON CONFLICT DO NOTHING. Closes a real POS '
     || 'under-declaration: 4 live dishes (Chicken Avocado, Chicken Fajita, Lamb Truffle, Shrimp Fajita wraps) '
     || 'declared egg in the column while the till description omitted it, because 6 mayo/egg PF sauces '
     || '(DYNAMITE_SAUCE, GARLIC_CREAM, HONEY_MUSTARD, TRUFFLE_MAYO, CAESAR_YOGURT_DRESSING, BROWNIE_BANANA) '
     || 'carried no allergen tags and fn_dish_allergens walks the BOM. NEVER removes a link: the reverse '
     || 'direction is the POS being more cautious than the column, and deleting those would weaken a live '
     || 'warning. CORRECTION to an earlier claim in this session: the reported "13 dishes print no gluten at '
     || 'POS" was a measurement bug - fn_dish_allergens returns slug form (allergen-gluten) and the check '
     || 'compared bare (gluten). Gluten at the till was never broken. Dishes still need re-pushing to Loyverse '
     || 'for the new text to reach the till; the stores will drift again - MC 572c53b1.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
