-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 147: fn_dish_scorecard — 5-axis advisory quality score
-- MC e6ec9fa8. Depends on d005e136 (tags + composition slots).
--
-- Pattern follows fn_rollup_bom_costs / fn_explode_bom (137, BOM tree walk).
-- Read-only, STABLE, advisory (never blocking). Returns JSONB:
--   { dish_id, total, max, axes: {cbs, taste, nutrient, functional, cost},
--     details: {cbs_axes_present, has_*, taste_count,
--               protein_per_100kcal, science_count, food_cost_pct} }
--
-- Axes (each 0-2, total /10):
--   CBS Coverage         — are Foundation / Accent / Finish axes present?
--                         Uses bom_structures.slot first (base/accent/
--                         dressing/finish). Falls back to boosters tag
--                         groups from BOM descendants.
--   Taste Breadth        — count of distinct taste tags (sweety/bittery/
--                         solty/umami/soury) across all BOM descendants.
--   Nutrient Density     — protein (g) per 100 kcal on the dish row.
--   Functional Payload   — BOM descendant count carrying any 'science' tag.
--   Cost Discipline      — food cost % from dish.cost_per_unit / price.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_dish_scorecard(p_dish_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_dish                RECORD;
  v_has_base            BOOLEAN := FALSE;
  v_has_accent          BOOLEAN := FALSE;
  v_has_finish          BOOLEAN := FALSE;
  v_cbs_axes            INT     := 0;
  v_taste_count         INT     := 0;
  v_science_count       INT     := 0;
  v_protein_per_100kcal NUMERIC;
  v_food_cost_pct       NUMERIC;
  v_cbs_score           INT;
  v_taste_score         INT;
  v_nutrient_score      INT;
  v_functional_score    INT;
  v_cost_score          INT;
  v_total               INT;
BEGIN
  -- ── 1. Fetch dish row ──
  SELECT id, name, price, cost_per_unit, calories, protein
    INTO v_dish
  FROM public.nomenclature
  WHERE id = p_dish_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'dish_not_found', 'dish_id', p_dish_id);
  END IF;

  -- ── 2. Aggregate over the BOM tree (recursive walk, depth ≤ 10) ──
  WITH RECURSIVE tree AS (
    SELECT p_dish_id AS nomenclature_id, 0 AS depth
    UNION ALL
    SELECT bs.ingredient_id, t.depth + 1
    FROM tree t
    JOIN public.bom_structures bs ON bs.parent_id = t.nomenclature_id
    WHERE t.depth < 10
  ),
  tree_distinct AS (
    SELECT DISTINCT nomenclature_id FROM tree
  ),
  descendant_tags AS (
    SELECT DISTINCT td.nomenclature_id, tg.slug, tg.tag_group
    FROM tree_distinct td
    JOIN public.nomenclature_tags nt ON nt.nomenclature_id = td.nomenclature_id
    JOIN public.tags tg ON tg.id = nt.tag_id
  ),
  direct_slots AS (
    SELECT slot FROM public.bom_structures WHERE parent_id = p_dish_id
  )
  SELECT
    (
      EXISTS (SELECT 1 FROM direct_slots WHERE slot = 'base')
      OR EXISTS (SELECT 1 FROM descendant_tags WHERE slug IN ('acid', 'fat', 'solt'))
    ) AS has_base,
    (
      EXISTS (SELECT 1 FROM direct_slots WHERE slot IN ('accent', 'dressing'))
      OR EXISTS (SELECT 1 FROM descendant_tags WHERE slug IN ('aroma', 'umami'))
    ) AS has_accent,
    (
      EXISTS (SELECT 1 FROM direct_slots WHERE slot = 'finish')
      OR EXISTS (SELECT 1 FROM descendant_tags WHERE slug IN ('texture', 'heat', 'sweet'))
    ) AS has_finish,
    (SELECT COUNT(DISTINCT slug) FROM descendant_tags
      WHERE slug IN ('sweety', 'bittery', 'solty', 'umami', 'soury')) AS taste_count,
    (SELECT COUNT(DISTINCT nomenclature_id) FROM descendant_tags
      WHERE tag_group = 'science') AS science_count
  INTO v_has_base, v_has_accent, v_has_finish, v_taste_count, v_science_count;

  v_cbs_axes := v_has_base::INT + v_has_accent::INT + v_has_finish::INT;

  -- ── 3. Axis scoring (0 / 1 / 2 each) ──

  -- CBS Coverage
  v_cbs_score := CASE
    WHEN v_cbs_axes >= 3 THEN 2
    WHEN v_cbs_axes = 2  THEN 1
    ELSE 0
  END;

  -- Taste Breadth: 4-5 tastes=2, 2-3=1, 0-1=0
  v_taste_score := CASE
    WHEN v_taste_count >= 4 THEN 2
    WHEN v_taste_count >= 2 THEN 1
    ELSE 0
  END;

  -- Nutrient Density: protein g per 100 kcal
  IF v_dish.calories IS NOT NULL AND v_dish.calories > 0 AND v_dish.protein IS NOT NULL THEN
    v_protein_per_100kcal := (v_dish.protein / v_dish.calories) * 100;
  ELSE
    v_protein_per_100kcal := NULL;
  END IF;

  v_nutrient_score := CASE
    WHEN v_protein_per_100kcal IS NULL       THEN 0
    WHEN v_protein_per_100kcal >= 8          THEN 2
    WHEN v_protein_per_100kcal >= 5          THEN 1
    ELSE 0
  END;

  -- Functional Payload: 3+ science-tagged ingredients = 2, 1-2 = 1, 0 = 0
  v_functional_score := CASE
    WHEN v_science_count >= 3 THEN 2
    WHEN v_science_count >= 1 THEN 1
    ELSE 0
  END;

  -- Cost Discipline: FC % = cost/price
  IF v_dish.price IS NOT NULL AND v_dish.price > 0 AND v_dish.cost_per_unit IS NOT NULL THEN
    v_food_cost_pct := (v_dish.cost_per_unit / v_dish.price) * 100;
  ELSE
    v_food_cost_pct := NULL;
  END IF;

  v_cost_score := CASE
    WHEN v_food_cost_pct IS NULL   THEN 0
    WHEN v_food_cost_pct < 30      THEN 2
    WHEN v_food_cost_pct <= 45     THEN 1
    ELSE 0
  END;

  v_total := v_cbs_score + v_taste_score + v_nutrient_score + v_functional_score + v_cost_score;

  -- ── 4. Compose JSONB response ──
  RETURN jsonb_build_object(
    'dish_id', v_dish.id,
    'dish_name', v_dish.name,
    'total', v_total,
    'max', 10,
    'axes', jsonb_build_object(
      'cbs',        v_cbs_score,
      'taste',      v_taste_score,
      'nutrient',   v_nutrient_score,
      'functional', v_functional_score,
      'cost',       v_cost_score
    ),
    'details', jsonb_build_object(
      'cbs_axes_present',    v_cbs_axes,
      'has_foundation',      v_has_base,
      'has_accent',          v_has_accent,
      'has_finish',          v_has_finish,
      'taste_count',         v_taste_count,
      'science_count',       v_science_count,
      'protein_per_100kcal', v_protein_per_100kcal,
      'food_cost_pct',       v_food_cost_pct
    )
  );
END;
$$;

COMMENT ON FUNCTION public.fn_dish_scorecard(UUID) IS
  '5-axis advisory quality scorecard for a SALE dish. Walks BOM tree, '
  'reads tags + composition slots + nutrition + cost. Advisory only — '
  'never blocks writes. Axes: CBS Coverage / Taste Breadth / '
  'Nutrient Density / Functional Payload / Cost Discipline. Each 0-2, total /10.';

-- Grants: authenticated + anon clients can call.
GRANT EXECUTE ON FUNCTION public.fn_dish_scorecard(UUID) TO authenticated, anon;

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '147_dish_scorecard.sql',
  'claude-code',
  'fn_dish_scorecard RPC — 5-axis advisory quality score (CBS + Taste + Nutrient + Functional + Cost). Unblocks Detail Drawer scorecard section.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
