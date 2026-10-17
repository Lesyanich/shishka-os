-- 505_coffee_hot_cold_subcategories.sql
-- Make the Coffee hot/cold split real data. Data only, no DDL.
-- Spec: shishka-health docs/redesign/SPEC.md §2 ‡ (CEO chose option B, 2026-10-17).
--
-- CONTRACT-REVIEWED: additive and structural only. No column of menu_public is dropped,
-- renamed or re-typed, and no dish enters or leaves the view: it filters on product_code,
-- is_web_visible and is_deleted, none of which this migration touches. The view resolves a
-- dish's section as "c.is_menu_section ? c : c.parent", so a dish moved from ☕ Coffee (a
-- section) onto a non-section child of it stays in the SAME section — only category_id /
-- category_code / category_name / category_sort_order change, which is the point. The
-- `coffee-split` contract assertion keys on category_name ILIKE '%coffee%' and still matches
-- ("☕ Hot Coffee", "🧊 Cold Coffee"). The other contract assertions key on the row set and on
-- KP-FIN-SDR%, which this migration does not touch.
--
-- WHY. The site used to SYNTHESIZE two coffee groups in code (shishka-health
-- src/lib/coffeeSplit.js) by reading the dish name. Those groups existed nowhere in
-- product_categories, so the admin panel could neither show, rename nor reorder them — the
-- same shape of bug as the invented "Fresh Spring Roll" section. Which dishes appear was always
-- one admin switch; HOW they are grouped now is too. After this lands, coffeeSplit.js and its
-- single call site are deleted in shishka-health (a separate PR that MUST NOT land first).
--
-- THE RULE IS REPRODUCED, NOT REINTERPRETED. coffeeSplit.js, verbatim:
--     cold = name matches /🧊|\biced\b|\bcold\b|tonic/i
--            OR product_code IN ('SALE-COFFEE_ORANGE', 'SALE-COFFEE_PASSION_FRUIT')
--     hot  = everything else
-- (the two codes are cold drinks whose names say neither word). \b in JS is \y in Postgres.
-- A guard at the bottom re-derives the split from the rule and compares it to what was
-- written, so a typo in the regex aborts the migration instead of moving a drink.
--
-- CONVENTIONS COPIED from the existing leaves under 🍳 All-Day Breakfast (🍳 Eggs, 🥪 Toasts):
--   · level 3, default_fin_sub_code 4150 (chk_l3_fin_sub_code), is_menu_section = false
--   · code = '<parent code>-<3 letters>'  → KP-DRK-COF-HOT / KP-DRK-COF-CLD
--     (Eggs is KP-FIN-BRK-EGG; "CLD" keeps the three-letter shape)
--   · a leading emoji in the stored name (the site strips it at render time)
--   · loyverse_category_id is the PARENT's, exactly as Eggs and Toasts carry BRK's. This is
--     load-bearing: loyverse-sync creates a Loyverse category for any category in use that has
--     none, and would then recategorise the dishes on the till. Sharing the parent's id means
--     the POS sees no change at all.
--   · sort_order is relative to siblings inside the section: hot 1, cold 2 (Eggs 2, Toasts 3).
-- The names are exactly what the site rendered before ("☕ Hot Coffee" / "🧊 Cold Coffee"), and
-- the RU/TH/AR translations are exactly the strings in shishka-health's dictionary
-- (sub.hotCoffee / sub.coldCoffee), so no guest sees a different word on the day this lands.
--
-- SCOPE NOTE. The 12 LIVE coffee dishes are what the guest sees. The 7 hidden coffee dishes in
-- the same category (is_web_visible = false: Cold Brew, Dark Mocha, White Mocha, Bulletproof,
-- Lion's Mane Latte, Peach Americano, Passion Orange Americano) are split by the same rule, so
-- that unhiding one later puts it in a group instead of loose on the section. They are not in
-- menu_public, so they change nothing today.
--
-- ORDERING. Independent of migration 500 (Step 0 menu structure): it keys only on the Coffee
-- section by code, never on sort_order or on any section 500 creates, and its guards compare
-- menu_public against itself before/after rather than against fixed totals. Safe in either order.
--
-- Idempotent: the categories upsert on `code`; the re-parent only touches dishes still sitting
-- directly on ☕ Coffee, so a second run moves nothing — and never undoes a later manual move.

BEGIN;

-- ── Baseline for the guards (taken before anything changes) ────────────────────
CREATE TEMP TABLE _coffee_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.menu_public)                                   AS live_total,
       (SELECT count(*) FROM public.menu_public WHERE category_code = 'KP-DRK-COF') AS coffee_live,
       (SELECT count(*) FROM public.menu_public m
         JOIN public.product_categories c ON c.code = 'KP-DRK-COF'
        WHERE m.section_id = c.id)                                                  AS coffee_section_live;

-- ── A) The two subcategories of ☕ Coffee ───────────────────────────────────────
INSERT INTO public.product_categories
  (code, name, name_th, parent_id, level, sort_order, default_fin_sub_code,
   is_active, is_menu_section, loyverse_category_id)
SELECT v.code, v.name, v.name_th, p.id, 3, v.sort_order, 4150,
       true, false, p.loyverse_category_id
  FROM (VALUES
          ('KP-DRK-COF-HOT', '☕ Hot Coffee',  'กาแฟร้อน', 1),
          ('KP-DRK-COF-CLD', '🧊 Cold Coffee', 'กาแฟเย็น', 2)
       ) AS v(code, name, name_th, sort_order)
  JOIN public.product_categories p ON p.code = 'KP-DRK-COF'
ON CONFLICT (code) DO UPDATE
   SET name            = EXCLUDED.name,
       name_th         = EXCLUDED.name_th,
       parent_id       = EXCLUDED.parent_id,
       sort_order      = EXCLUDED.sort_order,
       is_active       = true,
       is_menu_section = false,
       updated_at      = now();

-- ── B) Re-parent the dishes: today's rule, exactly ─────────────────────────────
UPDATE public.nomenclature n
   SET category_id = (SELECT id FROM public.product_categories
                       WHERE code = CASE
                         WHEN n.name ~* '🧊|\yiced\y|\ycold\y|tonic'
                           OR n.product_code IN ('SALE-COFFEE_ORANGE', 'SALE-COFFEE_PASSION_FRUIT')
                         THEN 'KP-DRK-COF-CLD'
                         ELSE 'KP-DRK-COF-HOT'
                       END),
       updated_at  = now()
 WHERE n.category_id = (SELECT id FROM public.product_categories WHERE code = 'KP-DRK-COF')
   AND COALESCE(n.is_deleted, false) = false;

-- ── C) Translations: the strings the site's dictionary already carries ─────────
-- Keyed by the new category ids, resolved from `code`. source_hash = md5 of the English name,
-- so a later rename in the admin turns these stale and the site falls back to English
-- (same mechanism as every other category; see mig 446).
INSERT INTO public.content_translations (entity, entity_key, field, lang, value, source_hash)
SELECT 'category', pc.id::text, 'name', t.lang, to_jsonb(t.txt),
       md5(public.fn_translation_source('category', pc.id::text, 'name'))
  FROM (VALUES
          ('KP-DRK-COF-HOT', 'ru', '☕ Горячий кофе'),
          ('KP-DRK-COF-CLD', 'ru', '🧊 Холодный кофе'),
          ('KP-DRK-COF-HOT', 'th', '☕ กาแฟร้อน'),
          ('KP-DRK-COF-CLD', 'th', '🧊 กาแฟเย็น'),
          ('KP-DRK-COF-HOT', 'ar', '☕ قهوة ساخنة'),
          ('KP-DRK-COF-CLD', 'ar', '🧊 قهوة مثلجة')
       ) AS t(code, lang, txt)
  JOIN public.product_categories pc ON pc.code = t.code
 WHERE public.fn_translation_source('category', pc.id::text, 'name') IS NOT NULL
ON CONFLICT (entity, entity_key, field, lang) DO UPDATE
   SET value = EXCLUDED.value, source_hash = EXCLUDED.source_hash,
       reviewed_at = NULL, reviewed_by = NULL;

-- ── Guards. Any of these failing aborts the whole migration. ───────────────────
DO $$
DECLARE
  b            record;
  v_live       integer;
  v_left       integer;
  v_moved      integer;
  v_wrong      integer;
  v_outside    integer;
  v_cats       integer;
  v_tr         integer;
BEGIN
  SELECT * INTO b FROM _coffee_before;

  -- 1. The guest-facing row set is untouched.
  SELECT count(*) INTO v_live FROM public.menu_public;
  IF v_live <> b.live_total THEN
    RAISE EXCEPTION 'menu_public changed size: % -> %', b.live_total, v_live;
  END IF;

  -- 2. Every live coffee dish moved onto exactly one of the two leaves; none left on the parent.
  SELECT count(*) INTO v_left FROM public.menu_public WHERE category_code = 'KP-DRK-COF';
  IF v_left <> 0 THEN
    RAISE EXCEPTION '% live coffee dish(es) still sit directly on KP-DRK-COF', v_left;
  END IF;
  SELECT count(*) INTO v_moved FROM public.menu_public
   WHERE category_code IN ('KP-DRK-COF-HOT', 'KP-DRK-COF-CLD');
  IF v_moved <> b.coffee_live THEN
    RAISE EXCEPTION 'coffee leaves hold % live dishes, expected % (what Coffee held before)',
                    v_moved, b.coffee_live;
  END IF;

  -- 3. They are all still in the SAME section (Coffee), so no section regrouped.
  SELECT count(*) INTO v_outside FROM public.menu_public m
   WHERE m.category_code IN ('KP-DRK-COF-HOT', 'KP-DRK-COF-CLD')
     AND m.section_id IS DISTINCT FROM (SELECT id FROM public.product_categories WHERE code = 'KP-DRK-COF');
  IF v_outside <> 0 THEN
    RAISE EXCEPTION '% coffee dish(es) fell out of the Coffee section', v_outside;
  END IF;

  -- 4. The split equals the rule, re-derived independently from the written data (live + hidden).
  SELECT count(*) INTO v_wrong
    FROM public.nomenclature n
    JOIN public.product_categories c ON c.id = n.category_id
   WHERE c.code IN ('KP-DRK-COF-HOT', 'KP-DRK-COF-CLD')
     AND (c.code = 'KP-DRK-COF-CLD') IS DISTINCT FROM
         (n.name ~* '🧊|\yiced\y|\ycold\y|tonic'
          OR n.product_code IN ('SALE-COFFEE_ORANGE', 'SALE-COFFEE_PASSION_FRUIT'));
  IF v_wrong <> 0 THEN
    RAISE EXCEPTION '% dish(es) landed on the wrong coffee leaf', v_wrong;
  END IF;

  -- 5. The leaves exist as designed, hot sorts before cold, both are tabs not sections.
  SELECT count(*) INTO v_cats
    FROM public.product_categories h, public.product_categories k, public.product_categories p
   WHERE h.code = 'KP-DRK-COF-HOT' AND k.code = 'KP-DRK-COF-CLD' AND p.code = 'KP-DRK-COF'
     AND h.parent_id = p.id AND k.parent_id = p.id
     AND h.sort_order < k.sort_order
     AND h.is_active AND k.is_active
     AND NOT h.is_menu_section AND NOT k.is_menu_section
     AND h.loyverse_category_id IS NOT DISTINCT FROM p.loyverse_category_id
     AND k.loyverse_category_id IS NOT DISTINCT FROM p.loyverse_category_id;
  IF v_cats <> 1 THEN
    RAISE EXCEPTION 'coffee leaf categories are not shaped as designed';
  END IF;

  -- 6. Translations: 2 leaves x ru/th/ar, all fresh (source_hash matches the English name).
  SELECT count(*) INTO v_tr
    FROM public.menu_translations
   WHERE entity = 'category'
     AND entity_key IN (SELECT id::text FROM public.product_categories
                         WHERE code IN ('KP-DRK-COF-HOT', 'KP-DRK-COF-CLD'));
  IF v_tr <> 6 THEN
    RAISE EXCEPTION 'expected 6 fresh category translations for the coffee leaves, menu_translations shows %', v_tr;
  END IF;
END $$;

-- Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '505_coffee_hot_cold_subcategories.sql',
  'claude-opus-session-4ed7cab4',
  NULL,
  'Coffee hot/cold split becomes data: KP-DRK-COF-HOT / KP-DRK-COF-CLD under KP-DRK-COF; coffee dishes re-parented by the exact coffeeSplit.js rule; RU/TH/AR names from the site dictionary. Frees shishka-health to delete src/lib/coffeeSplit.js.'
);

COMMIT;
