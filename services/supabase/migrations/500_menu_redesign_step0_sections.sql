-- 500_menu_redesign_step0_sections.sql
-- Menu redesign, Step 0 — the structure half. Data only, no DDL.
-- Spec: shishka-health docs/redesign/SPEC.md §2 (menu structure), §7 (data), §9 (work plan).
--
-- CONTRACT-REVIEWED: additive and structural only. No column of menu_public is dropped,
-- renamed or re-typed, and no dish changes category. The view already resolves a dish's
-- section as "c.is_menu_section ? c : c.parent", so re-parenting a category one level down
-- moves dishes between SECTIONS without touching a single nomenclature row. The 81 live
-- dishes stay 81; only section_id / section_name / section_sort_order regroup, which is the
-- point of the change. site_content gains one new key (`menu_groups`) and no existing key is
-- read, rewritten or removed — lib/content.js keeps falling back for everything it knows.
-- All four contract assertions are unaffected: `free-sauce-pool` keys on category_code
-- LIKE 'KP-FIN-SDR%' (the 6 dip dishes keep that category), `coffee-split` on category_name
-- ILIKE '%coffee%' (untouched), `dishes-present` and `no-null-price` on the row set (81, 0).
-- contract-check.mjs was green against both endpoints with the anon key before this migration
-- and is re-run after it.
--
-- WHY. The public menu at shishka.health is being rebuilt as one scrolling page with a sticky
-- category rail. §2 of the spec collapses today's 12 live sections into 10 categories in three
-- groups, EAT → DRINK → SWEET. Two of those collapses are tree work that the admin panel
-- cannot do (it edits dishes, not the category tree), so they happen here:
--
--   A) "Salads & Bowls". 🥗 Salads (7 dishes) and 🍜 Bowls (6) are two separate sections today
--      that the guest reads as one decision — a cold composed bowl of vegetables and protein.
--      They become subcategories of one new section of 13, with tabs All · Salads · Bowls.
--      This is the shape 🍳 All-Day Breakfast → 🍳 Eggs / 🥪 Toasts already has; it is copied.
--
--   B) "Sides". 🍽️ Extras is a 2-dish section (Multigrain Toast, Wholewheat Wrap) — the bread
--      you add to a dip. A section of two is a weak tile in a 10-tile rail, and those two
--      items only make sense next to the dips. It becomes a subcategory of 🥫 Sauce, Dressing
--      and Dips, renamed "Sides", giving one section of 8.
--
--   C) `site_content.menu_groups` — which section belongs to which group and in what order.
--      The site reads it with the anon key; the shape is defined here because this is the
--      first writer. PR 1 in shishka-health consumes it with a code fallback.
--
-- Three deliberate judgement calls, called out so review can overrule them cheaply:
--
--   1. SORT ORDER IS REALIGNED TO §2, not just extended. `menu_groups` is authoritative for
--      the site, but section_sort_order is the fallback AND the order the owner sees in
--      admin /menu — leaving the two disagreeing would be a trap. The live EAT sections are
--      renumbered 1–5 and the live DRINK sections 24–27 (reusing the existing drinks range,
--      no new numbers), so both surfaces read in the designed order. The dead categories in
--      the tree (Soups, Bundles, Mini Salads, Hummus Meals, Bars, Proteins & Grills, Light
--      Sweets, Build Your Own) are left exactly as they are; they carry zero web-visible
--      dishes and never reach menu_public. One tie survives — 🍜 Soups also sits at 3 — but
--      Soups is not a menu section and has no dishes, so nothing orders against it.
--
--   2. "🍽️ Sides" KEEPS ITS EMOJI. The spec writes the tab as "Sides". The site strips emojis
--      from every name it renders (shishka-health src/lib/text.js), so 🍽️ Sides reaches the
--      guest as exactly "Sides" while the admin tree keeps the convention every one of its
--      siblings follows. Same guest-facing result, no odd row in admin.
--
--   3. THE NEW SECTION'S ID IS NOT HARDCODED. It is created with the table's own
--      gen_random_uuid() default and every later reference resolves it by `code`, so the
--      migration is reproducible on a fresh database and menu_groups can never drift from
--      the row it points at.
--
-- KNOWN CONSEQUENCE, NOT A BUG. Two translation effects, both of which fail safe to English:
--   · 🍽️ Extras has ru/th/ar names in content_translations meaning "Extras". menu_translations
--     gates every row on `source_hash = md5(source text)`, so renaming the category instantly
--     drops all three from the view rather than showing a stale, now-wrong word. Good.
--   · The new 🥗 Salads & Bowls has no translations at all, so /ru, /th and /ar will render its
--     heading in English until someone writes them. Flagged to the owner; not invented here.
--
-- Idempotent: every statement keys on `code` and re-running changes nothing.

BEGIN;

-- ── A) The "Salads & Bowls" section ───────────────────────────────────────────
-- level 3 and default_fin_sub_code 4150 match every sibling under KP-FIN
-- (chk_l3_fin_sub_code requires the sub-code at level 3).
INSERT INTO public.product_categories
  (code, name, parent_id, level, sort_order, default_fin_sub_code, is_active, is_menu_section)
SELECT 'KP-FIN-SLB',
       '🥗 Salads & Bowls',
       (SELECT id FROM public.product_categories WHERE code = 'KP-FIN'),
       3, 1, 4150, true, true
ON CONFLICT (code) DO UPDATE
   SET name            = EXCLUDED.name,
       parent_id       = EXCLUDED.parent_id,
       sort_order      = EXCLUDED.sort_order,
       is_active       = true,
       is_menu_section = true,
       updated_at      = now();

-- 🥗 Salads and 🍜 Bowls stop being sections and become its tabs, in that order.
UPDATE public.product_categories
   SET parent_id       = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-SLB'),
       is_menu_section = false,
       sort_order      = 1,
       updated_at      = now()
 WHERE code = 'KP-FIN-SLD';

UPDATE public.product_categories
   SET parent_id       = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-SLB'),
       is_menu_section = false,
       sort_order      = 2,
       updated_at      = now()
 WHERE code = 'KP-FIN-BWL';

-- ── B) 🍽️ Extras → "Sides", a tab of the dips section ─────────────────────────
-- sort_order 6 puts it after the dips section's own dishes, which carry the
-- section's own sort_order (5) as their category_sort_order.
UPDATE public.product_categories
   SET parent_id       = (SELECT id FROM public.product_categories WHERE code = 'KP-FIN-SDR'),
       name            = '🍽️ Sides',
       is_menu_section = false,
       sort_order      = 6,
       updated_at      = now()
 WHERE code = 'KP-FIN-BRC';

-- ── C) Section order, §2 row order ────────────────────────────────────────────
-- EAT: Salads & Bowls (1, set above) → Wraps → Protein meals → All-day breakfast → dips
UPDATE public.product_categories SET sort_order = 2, updated_at = now() WHERE code = 'KP-FIN-WRP'; -- 🌯 Whole Wheat Wraps
UPDATE public.product_categories SET sort_order = 3, updated_at = now() WHERE code = 'KP-FIN-PRM'; -- 🍢 Protein Meals
UPDATE public.product_categories SET sort_order = 4, updated_at = now() WHERE code = 'KP-FIN-BRK'; -- 🍳 All-Day Breakfast
UPDATE public.product_categories SET sort_order = 5, updated_at = now() WHERE code = 'KP-FIN-SDR'; -- 🥫 Sauce, Dressing and Dips
-- SWEET: 🍫 Chocolate keeps 21 — nothing else is in the group.
-- DRINK: Coffee → Matcha → Smoothies → Fresh juices, inside the existing 24–27 range.
UPDATE public.product_categories SET sort_order = 24, updated_at = now() WHERE code = 'KP-DRK-COF'; -- ☕ Coffee
UPDATE public.product_categories SET sort_order = 25, updated_at = now() WHERE code = 'KP-DRK-MAT'; -- 🍵 Matcha
UPDATE public.product_categories SET sort_order = 26, updated_at = now() WHERE code = 'KP-DRK-SMT'; -- 🥤 Smoothies
UPDATE public.product_categories SET sort_order = 27, updated_at = now() WHERE code = 'KP-FIN-JCE'; -- 🧃 Juices

-- ── D) site_content.menu_groups ───────────────────────────────────────────────
-- Shape (defined here, consumed by shishka-health PR 1):
--   { "groups": [ { "key": "EAT", "sections": [ "<uuid>", … ] }, … ] }
-- An ordered ARRAY of groups, not an object keyed by group name: the group order
-- EAT → DRINK → SWEET is part of the design and an array cannot lose it.
-- Section ids are resolved from `code`, never pasted in.
WITH grp(ord, key, codes) AS (
  VALUES
    (1, 'EAT',   ARRAY['KP-FIN-SLB','KP-FIN-WRP','KP-FIN-PRM','KP-FIN-BRK','KP-FIN-SDR']::text[]),
    (2, 'DRINK', ARRAY['KP-DRK-COF','KP-DRK-MAT','KP-DRK-SMT','KP-FIN-JCE']::text[]),
    (3, 'SWEET', ARRAY['KP-FIN-CHO']::text[])
), resolved AS (
  SELECT grp.ord,
         grp.key,
         (SELECT jsonb_agg(pc.id ORDER BY c.ord)
            FROM unnest(grp.codes) WITH ORDINALITY AS c(code, ord)
            JOIN public.product_categories pc ON pc.code = c.code) AS sections,
         cardinality(grp.codes) AS expected
    FROM grp
)
INSERT INTO public.site_content (key, data, updated_at)
SELECT 'menu_groups',
       jsonb_build_object(
         'groups',
         jsonb_agg(jsonb_build_object('key', r.key, 'sections', r.sections) ORDER BY r.ord)
       ),
       now()
  FROM resolved r
-- HAVING, not WHERE: if any code failed to resolve, `sections` is NULL, the
-- condition is NULL, and the statement writes NOTHING rather than a half-built
-- row. The guard below then aborts the migration on the missing key.
HAVING bool_and(jsonb_array_length(r.sections) = r.expected)
ON CONFLICT (key) DO UPDATE
   SET data = EXCLUDED.data, updated_at = now();

-- ── Guards. Any of these failing aborts the whole migration. ──────────────────
DO $$
DECLARE
  v_dishes      integer;
  v_no_section  integer;
  v_sections    integer;
  v_salbowl     integer;
  v_dips        integer;
  v_groups      jsonb;
  v_listed      integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE section_id IS NULL), count(DISTINCT section_id)
    INTO v_dishes, v_no_section, v_sections
    FROM menu_public;

  IF v_dishes <> 81 THEN
    RAISE EXCEPTION 'menu_public lost or gained dishes: % (expected 81)', v_dishes;
  END IF;
  IF v_no_section > 0 THEN
    RAISE EXCEPTION '% dish(es) fell out of every section', v_no_section;
  END IF;
  IF v_sections <> 10 THEN
    RAISE EXCEPTION 'menu_public has % sections (SPEC §2 expects 10)', v_sections;
  END IF;

  SELECT count(*) INTO v_salbowl
    FROM menu_public WHERE section_name = '🥗 Salads & Bowls';
  IF v_salbowl <> 13 THEN
    RAISE EXCEPTION 'Salads & Bowls holds % dishes (expected 7 + 6 = 13)', v_salbowl;
  END IF;

  SELECT count(*) INTO v_dips
    FROM menu_public WHERE section_name = '🥫 Sauce, Dressing and Dips';
  IF v_dips <> 8 THEN
    RAISE EXCEPTION 'The dips section holds % dishes (expected 6 + 2 = 8)', v_dips;
  END IF;

  SELECT data INTO v_groups FROM site_content WHERE key = 'menu_groups';
  IF v_groups IS NULL THEN
    RAISE EXCEPTION 'menu_groups was not written — a section code failed to resolve';
  END IF;

  -- Every id in menu_groups is a real, live menu section, and the three groups
  -- together list every section menu_public actually serves.
  SELECT count(*) INTO v_listed
    FROM jsonb_array_elements(v_groups -> 'groups') g,
         jsonb_array_elements_text(g -> 'sections') s
   WHERE EXISTS (SELECT 1 FROM menu_public m WHERE m.section_id::text = s);
  IF v_listed <> 10 THEN
    RAISE EXCEPTION 'menu_groups lists % live sections, menu_public serves 10', v_listed;
  END IF;
END $$;

-- Ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '500_menu_redesign_step0_sections.sql',
  'claude-opus-session-400ba8b4',
  NULL,
  'Menu redesign Step 0: new section "Salads & Bowls" with Salads/Bowls as tabs; Extras re-parented under the dips section and renamed "Sides"; live section sort_order realigned to SPEC §2; new site_content key menu_groups (EAT/DRINK/SWEET). 12 live sections -> 10 categories, 81 dishes unchanged.'
);

COMMIT;
