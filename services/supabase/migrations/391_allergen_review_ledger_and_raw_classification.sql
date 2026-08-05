-- 391 — Allergen review ledger + first pass classifying the RAW ingredients (MC 572c53b1)
-- CONTRACT-REVIEWED: additive only. Adds 2 nullable columns to nomenclature and a NEW
-- function; menu_public is only READ (to enumerate sellable dishes), never altered, so its
-- column list and row set are unchanged. The 16 new nomenclature_tags rows are allergen tags
-- on RAW ingredients — menu_public carries no tags column, and the site's tag reads are for
-- dish-level chips, which RAW rows never appear in. contract-check.mjs green before and
-- after apply across both endpoints (70 menu_public rows, all named checks matched).
--
-- WHY THIS IS NOT JUST "TAG THE MISSING INGREDIENTS"
--
-- The task was scoped as "the BOM walk is sparse — tag dairy and sesame and it covers
-- ~17 dishes". Measuring it properly first says something worse and more useful:
--
--   125 RAW leaves feed the 60 sellable dishes.
--   17 are packaging.
--   Of the 108 food leaves, exactly 5 carried any allergen tag.
--
-- So the walk is not sparse, it is unbuilt — and the dangerous part is not the missing
-- positives. It is that fn_dish_allergens returns an EMPTY ARRAY for both
--   "we checked every ingredient and this dish contains no allergen"  and
--   "nobody has ever looked at these ingredients".
-- Those are the same value today. Publishing the second one to schema.org as
-- "gluten-free" is the liability the parent epic is trying to avoid, and no amount of
-- tagging fixes it, because a tag can only ever record a POSITIVE.
--
-- WHAT THIS MIGRATION DOES
--   1. Adds a review ledger: nomenclature.allergen_reviewed_at / _by. "Reviewed" means
--      a human or agent has looked at this ingredient and asserted its allergen set —
--      including asserting that the set is empty. Absence of a tag now means "no
--      allergen" ONLY when the row is also reviewed; otherwise it means "unknown".
--   2. Adds fn_dish_allergen_status(dish_id) -> jsonb, the honest companion to
--      fn_dish_allergens: it returns the allergen list AND how many ingredients behind
--      it are still unreviewed, so a caller can tell a confident answer from a guess.
--      fn_dish_allergens is left untouched — existing callers keep working.
--   3. Classifies the RAW leaves: 16 positive allergen tags, 77 reviewed-and-clean,
--      and 10 deliberately left UNREVIEWED because they are real open questions rather
--      than things I can settle from an ingredient name (see the list at the bottom).
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   * It does not expose allergens through menu_public. The publish gate stays SHUT
--     until every sellable dish reports zero unreviewed ingredients. That is step 4 of
--     the task and it is not reachable until the 10 open questions are answered.
--   * It does not touch nomenclature.allergens (the manual array). That column is
--     currently DERIVED for PF/SALE rows by fn_rollup_bom_nutrition, so it is not an
--     independent second source the way the task assumed — it is a cache of the RAW-level
--     arrays. Retiring it is a separate change once the walk is authoritative.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. The review ledger
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS allergen_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS allergen_reviewed_by text;

COMMENT ON COLUMN public.nomenclature.allergen_reviewed_at IS
  'When this item''s allergen set was last asserted by a human/agent. NULL = never reviewed: an empty allergen tag list means UNKNOWN, not "free of allergens". Set it only after actually checking the product label or recipe.';
COMMENT ON COLUMN public.nomenclature.allergen_reviewed_by IS
  'Who asserted the allergen set (session id, agent name, or person).';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. The honest companion to fn_dish_allergens
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_dish_allergen_status(p_dish_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  WITH RECURSIVE tree AS (
    SELECT p_dish_id AS nomenclature_id, 0 AS depth
    UNION ALL
    SELECT bs.ingredient_id, t.depth + 1
    FROM tree t
    JOIN public.bom_structures bs ON bs.parent_id = t.nomenclature_id
    WHERE t.depth < 10
  ),
  tree_distinct AS (SELECT DISTINCT nomenclature_id FROM tree),
  -- food leaves only: packaging carries no allergen and must not block confidence
  food AS (
    SELECT td.nomenclature_id, n.product_code, n.name, n.allergen_reviewed_at
    FROM tree_distinct td
    JOIN public.nomenclature n ON n.id = td.nomenclature_id
    LEFT JOIN public.product_categories pc ON pc.id = n.category_id
    WHERE td.nomenclature_id <> p_dish_id
      AND COALESCE(pc.code, '') NOT LIKE 'NF-%'
      AND NOT EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = td.nomenclature_id)
  ),
  allergens AS (
    SELECT DISTINCT tg.slug
    FROM tree_distinct td
    JOIN public.nomenclature_tags nt ON nt.nomenclature_id = td.nomenclature_id
    JOIN public.tags tg ON tg.id = nt.tag_id
    WHERE tg.tag_group = 'allergen'
  )
  SELECT jsonb_build_object(
    'allergens',   COALESCE((SELECT jsonb_agg(slug ORDER BY slug) FROM allergens), '[]'::jsonb),
    'ingredients', (SELECT count(*) FROM food),
    'unreviewed',  (SELECT count(*) FROM food WHERE allergen_reviewed_at IS NULL),
    -- confident = every food ingredient behind this dish has been looked at
    'confident',   (SELECT count(*) FROM food WHERE allergen_reviewed_at IS NULL) = 0,
    'unreviewed_items', COALESCE(
      (SELECT jsonb_agg(product_code ORDER BY product_code)
       FROM food WHERE allergen_reviewed_at IS NULL), '[]'::jsonb)
  );
$function$;

COMMENT ON FUNCTION public.fn_dish_allergen_status(uuid) IS
  'Allergen answer for a dish PLUS its confidence. fn_dish_allergens returns [] both for "no allergens" and "never checked"; this distinguishes them. Never publish a dietary claim (gluten-free, dairy-free, vegan) for a dish whose ->>''confident'' is false. MC 572c53b1.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Positive allergen tags — 16 RAW ingredients
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_allergen_map (product_code text, tag_slug text) ON COMMIT DROP;
INSERT INTO tmp_allergen_map (product_code, tag_slug) VALUES
  -- dairy
  ('RAW-MILK-COW','allergen-dairy'),
  ('RAW-YOGURT-GREEK','allergen-dairy'),
  ('RAW-CHEESE-GOUDA-SHREDDED','allergen-dairy'),
  ('RAW-EMMENTAL_CHEESE_SHREDDED','allergen-dairy'),
  ('RAW-MOZZARELLA_MIXED_CHEDDAR_CHEESE','allergen-dairy'),
  ('RAW-CHEESE-CREAM','allergen-dairy'),
  ('RAW-WHEY_PROTEIN','allergen-dairy'),          -- whey is a milk protein
  ('RAW-YOGURT_STARTER','allergen-dairy'),        -- live cultures are grown on a milk medium
  -- tree nuts
  ('RAW-ALMOND_SLICED','allergen-nuts'),
  ('RAW-CASHEWS','allergen-nuts'),
  ('RAW-MILK-ALMOND','allergen-nuts'),
  -- sesame
  ('RAW-TAHINI','allergen-sesame'),
  ('RAW-SESAME-SEEDS-WHITE','allergen-sesame'),
  ('RAW-SESAME-SEEDS-BLACK','allergen-sesame'),
  ('RAW-ZAATAR','allergen-sesame'),               -- za'atar is a sesame-bearing blend by definition
  -- gluten
  ('RAW-FLOUR-VENUS','allergen-gluten');          -- wheat bread flour

INSERT INTO public.nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id
FROM tmp_allergen_map m
JOIN public.nomenclature n ON n.product_code = m.product_code
JOIN public.tags t ON t.slug = m.tag_slug
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. The 10 open questions — explicitly NOT reviewed.
--    Each needs a product label or a chef answer, not a guess from the name.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE tmp_unresolved (product_code text PRIMARY KEY, question text) ON COMMIT DROP;
INSERT INTO tmp_unresolved (product_code, question) VALUES
  ('RAW-COCONUT-MILK',        'Coconut is a tree nut under US FDA but NOT under EU/UK rules. Which list does shishka.health publish against?'),
  ('SALE-NO_SHELL_COCONUT',   'Same coconut question.'),
  ('SALE-CHOC_DARK_70',       'Bought-in confectionery: needs the wrapper. Dark chocolate is usually "may contain milk/nuts".'),
  ('SALE-CHOC_DARK_70_ALMOND','Contains almond for certain (nuts); still needs the wrapper for milk.'),
  ('SALE-CHOC_HIGH_COCOA_MILK','Milk chocolate = dairy for certain; needs the wrapper for nut cross-contamination.'),
  ('RAW-RICE_NOODLE',         'Makro ready-cooked noodle: rice-only, or cut with wheat flour? Decides gluten-free on 4 dishes.'),
  ('RAW-BEEF_SALAMI',         'Phuket sausage: does it use a wheat/soy filler? Decides gluten + soy on the salami manakish.'),
  ('RAW-MUSTARD-DIJON',       'Mustard is one of the EU-14 allergens but the tag taxonomy has no slug for it. Add the tag, or out of scope?'),
  ('RAW-PICKLED_GHERKIN',     'Gherkin brine commonly carries mustard seed — same taxonomy gap as above.'),
  ('RAW-SYRUP_CARAMEL',       'MONIN caramel: most caramel syrups are dairy-free but some carry milk. Needs the bottle.');

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Mark as REVIEWED: every food leaf feeding the sellable menu, except the 10 above.
--    This is the assertion "an empty tag list on this row means genuinely no allergen".
-- ──────────────────────────────────────────────────────────────────────────
WITH RECURSIVE sellable AS (
  SELECT n.id FROM public.menu_public m JOIN public.nomenclature n ON n.id = m.id
  WHERE COALESCE(m.stock_state,'') <> 'coming_soon'
), tree AS (
  SELECT s.id AS node, 0 AS depth FROM sellable s
  UNION ALL
  SELECT bs.ingredient_id, t.depth + 1 FROM tree t
  JOIN public.bom_structures bs ON bs.parent_id = t.node WHERE t.depth < 10
), food_leaves AS (
  SELECT DISTINCT t.node AS id FROM tree t
  JOIN public.nomenclature n ON n.id = t.node
  LEFT JOIN public.product_categories pc ON pc.id = n.category_id
  WHERE NOT EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = t.node)
    AND COALESCE(pc.code,'') NOT LIKE 'NF-%'
)
UPDATE public.nomenclature n
SET allergen_reviewed_at = now(),
    allergen_reviewed_by = 'claude-opus-session-f06ed0c2 (mig 391)',
    updated_at = now()
FROM food_leaves f
WHERE n.id = f.id
  AND n.product_code NOT IN (SELECT product_code FROM tmp_unresolved);

-- ──────────────────────────────────────────────────────────────────────────
-- 6. ASSERTIONS
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_n int; v_conf int; v_tot int;
BEGIN
  -- every mapped ingredient actually exists and got its tag
  SELECT count(*) INTO v_n FROM tmp_allergen_map m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.nomenclature n
    JOIN public.nomenclature_tags nt ON nt.nomenclature_id = n.id
    JOIN public.tags t ON t.id = nt.tag_id
    WHERE n.product_code = m.product_code AND t.slug = m.tag_slug);
  IF v_n > 0 THEN RAISE EXCEPTION '391 ABORT: % allergen tag(s) failed to apply', v_n; END IF;

  -- the 10 open questions must remain unreviewed — they are the whole point
  SELECT count(*) INTO v_n FROM tmp_unresolved u
  JOIN public.nomenclature n ON n.product_code = u.product_code
  WHERE n.allergen_reviewed_at IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION '391 ABORT: % unresolved item(s) were marked reviewed', v_n; END IF;

  -- RECONCILIATION: every sellable dish whose manual array claims milk must now also
  -- reach dairy through the BOM walk. This is the drift the two-source split was hiding:
  -- 9 coffee/matcha drinks read "milk" manually while the walk returned nothing at all.
  -- Bought-in goods with no BOM cannot be walked; they are in the unresolved list.
  SELECT count(*) INTO v_n
  FROM public.menu_public m
  JOIN public.nomenclature n ON n.id = m.id
  WHERE COALESCE(m.stock_state,'') <> 'coming_soon'
    AND COALESCE(n.allergens,'{}') && ARRAY['milk','dairy']
    AND EXISTS (SELECT 1 FROM public.bom_structures b WHERE b.parent_id = n.id)
    AND NOT (public.fn_dish_allergens(n.id) @> ARRAY['allergen-dairy']);
  IF v_n > 0 THEN RAISE EXCEPTION '391 ABORT: % dish(es) claim milk manually but the walk still misses dairy', v_n; END IF;

  -- and the reverse direction: nothing may newly walk to dairy that the manual source
  -- never claimed, without a human having looked. Catches an over-broad tag.
  SELECT count(*) INTO v_n
  FROM public.menu_public m
  JOIN public.nomenclature n ON n.id = m.id
  WHERE COALESCE(m.stock_state,'') <> 'coming_soon'
    AND public.fn_dish_allergens(n.id) @> ARRAY['allergen-dairy']
    AND NOT (COALESCE(n.allergens,'{}') && ARRAY['milk','dairy']);
  IF v_n > 0 THEN
    RAISE NOTICE '391: % dish(es) now walk to dairy that the manual array never claimed — review these, the walk is probably right', v_n;
  END IF;

  -- report where the gate now stands
  SELECT count(*), count(*) FILTER (WHERE (public.fn_dish_allergen_status(n.id)->>'confident')::boolean)
  INTO v_tot, v_conf
  FROM public.menu_public m JOIN public.nomenclature n ON n.id = m.id
  WHERE COALESCE(m.stock_state,'') <> 'coming_soon';

  RAISE NOTICE '391 OK: % of % sellable dishes now answer allergens with full confidence', v_conf, v_tot;
END $$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '391_allergen_review_ledger_and_raw_classification.sql',
  'claude-code',
  NULL,
  'MC 572c53b1. Adds nomenclature.allergen_reviewed_at/_by so an empty allergen list can mean "checked, clean" instead of "never looked", plus fn_dish_allergen_status(dish) returning the allergen set WITH its confidence. Classifies the RAW leaves feeding the sellable menu: 16 positive tags (8 dairy, 3 nuts, 4 sesame, 1 gluten), the rest reviewed-clean, 10 left unreviewed as genuine open questions (coconut jurisdiction, bought-in chocolate labels, rice noodle wheat, salami filler, mustard taxonomy gap, caramel syrup). menu_public exposure NOT done — publish gate stays shut until every sellable dish is confident.'
)
ON CONFLICT DO NOTHING;

-- DOWN:
--   DROP FUNCTION IF EXISTS public.fn_dish_allergen_status(uuid);
--   DELETE FROM nomenclature_tags nt USING nomenclature n, tags t
--     WHERE nt.nomenclature_id=n.id AND nt.tag_id=t.id AND t.tag_group='allergen'
--       AND n.product_code IN (<the 16 codes above>);
--   ALTER TABLE nomenclature DROP COLUMN allergen_reviewed_at, DROP COLUMN allergen_reviewed_by;
