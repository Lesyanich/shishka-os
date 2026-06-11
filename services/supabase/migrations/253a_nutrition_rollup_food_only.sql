-- Migration 250: nutrition rollup ignores NF-PKG packaging + preserves intrinsic KBJU
--
-- Bug (side effect of packaging-as-BOM, PR #311): fn_rollup_bom_nutrition recomputes a
-- dish's nutrition as SUM(ALL BOM children x qty), including NF-PKG packaging. Dishes whose
-- food value is intrinsic (no food PF/RAW child, only packaging BOM lines — grills, dips,
-- retail sauces, fresh juices, custom smoothie base) get their KBJU overwritten to ~0.
--
-- Fix (mirrors cost side v_dish_cost_split = food-only):
--   1. Sum nutrition over FOOD children only (exclude product_categories.code LIKE 'NF-PKG%').
--   2. If a dish has ZERO food children (packaging-only) -> skip the update entirely, so the
--      stored intrinsic KBJU is preserved instead of being zeroed.
-- For the 63 dishes that DO have food children the result is unchanged (packaging carried
-- NULL->0 calories, so excluding it changes nothing) -> zero regression.
--
-- MC: 95273dd5 | cluster: smoothie-nutrition-counter

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_rollup_bom_nutrition(p_nomenclature_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item          RECORD;
  v_new_cal       NUMERIC;
  v_new_pro       NUMERIC;
  v_new_carb      NUMERIC;
  v_new_fat       NUMERIC;
  v_food_children INTEGER;
  v_new_allergens TEXT[];
  v_old_cal       NUMERIC;
  v_old_pro       NUMERIC;
  v_old_carb      NUMERIC;
  v_old_fat       NUMERIC;
  v_updated       INTEGER := 0;
  v_items         JSONB := '[]'::jsonb;
  v_in_trigger    BOOLEAN;
BEGIN
  -- Guard: prevent infinite recursion if already cascading
  v_in_trigger := COALESCE(current_setting('app.bom_nutrition_rollup_active', true), '') = 'true';
  IF v_in_trigger AND p_nomenclature_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'updated_count', 0, 'skipped', 'recursion_guard');
  END IF;

  -- Set recursion guard
  PERFORM set_config('app.bom_nutrition_rollup_active', 'true', true);

  -- Process items bottom-up: leaf PFs first, then their parents
  FOR v_item IN
    WITH RECURSIVE bom_depth AS (
      -- Base: all non-RAW items that have BOM children
      SELECT DISTINCT n.id, n.product_code,
             n.calories, n.protein, n.carbs, n.fat,
             0 AS depth
      FROM nomenclature n
      WHERE n.is_available = TRUE
        AND n.product_code NOT LIKE 'RAW-%'
        AND EXISTS (SELECT 1 FROM bom_structures bs WHERE bs.parent_id = n.id)
        AND (
          p_nomenclature_id IS NULL
          OR n.id = p_nomenclature_id
        )

      UNION ALL

      -- Recurse upward: find parents of current items
      SELECT DISTINCT n.id, n.product_code,
             n.calories, n.protein, n.carbs, n.fat,
             bd.depth + 1
      FROM bom_depth bd
      JOIN bom_structures bs ON bs.ingredient_id = bd.id
      JOIN nomenclature n ON n.id = bs.parent_id
      WHERE n.is_available = TRUE
        AND bd.depth < 10
    )
    SELECT sub.id, sub.product_code,
           sub.calories, sub.protein, sub.carbs, sub.fat
    FROM (
      SELECT id, product_code, calories, protein, carbs, fat,
             MAX(depth) AS max_depth
      FROM bom_depth
      GROUP BY id, product_code, calories, protein, carbs, fat
    ) sub
    ORDER BY sub.max_depth ASC, sub.product_code
  LOOP
    v_old_cal  := COALESCE(v_item.calories, 0);
    v_old_pro  := COALESCE(v_item.protein, 0);
    v_old_carb := COALESCE(v_item.carbs, 0);
    v_old_fat  := COALESCE(v_item.fat, 0);

    -- Sum nutrition from FOOD children only (exclude NF-PKG packaging subtree).
    -- NO yield_loss_pct adjustment (nutrients stay in food).
    -- v_food_children = number of non-packaging children contributing to the sum.
    SELECT
      COALESCE(SUM(COALESCE(child_n.calories, 0) * bs.quantity_per_unit), 0),
      COALESCE(SUM(COALESCE(child_n.protein, 0)  * bs.quantity_per_unit), 0),
      COALESCE(SUM(COALESCE(child_n.carbs, 0)    * bs.quantity_per_unit), 0),
      COALESCE(SUM(COALESCE(child_n.fat, 0)      * bs.quantity_per_unit), 0),
      COUNT(*)
    INTO v_new_cal, v_new_pro, v_new_carb, v_new_fat, v_food_children
    FROM bom_structures bs
    JOIN nomenclature child_n ON child_n.id = bs.ingredient_id
    LEFT JOIN product_categories pcat ON pcat.id = child_n.category_id
    WHERE bs.parent_id = v_item.id
      AND (pcat.code IS NULL OR pcat.code NOT LIKE 'NF-PKG%');

    -- Packaging-only dish (no food children): preserve intrinsic stored KBJU, do not overwrite.
    IF v_food_children = 0 THEN
      CONTINUE;
    END IF;

    -- Aggregate allergens from FOOD children (deduplicated; packaging carries none anyway)
    SELECT COALESCE(array_agg(DISTINCT a ORDER BY a), '{}')
    INTO v_new_allergens
    FROM bom_structures bs
    JOIN nomenclature child_n ON child_n.id = bs.ingredient_id
    LEFT JOIN product_categories pcat ON pcat.id = child_n.category_id
    CROSS JOIN LATERAL unnest(COALESCE(child_n.allergens, '{}')) AS a
    WHERE bs.parent_id = v_item.id
      AND (pcat.code IS NULL OR pcat.code NOT LIKE 'NF-PKG%');

    -- Round to 1 decimal (matches TypeScript bom-walker)
    v_new_cal  := ROUND(v_new_cal,  1);
    v_new_pro  := ROUND(v_new_pro,  1);
    v_new_carb := ROUND(v_new_carb, 1);
    v_new_fat  := ROUND(v_new_fat,  1);

    -- Only update if values actually changed
    IF v_new_cal  IS DISTINCT FROM v_old_cal
    OR v_new_pro  IS DISTINCT FROM v_old_pro
    OR v_new_carb IS DISTINCT FROM v_old_carb
    OR v_new_fat  IS DISTINCT FROM v_old_fat
    THEN
      UPDATE nomenclature
      SET calories   = v_new_cal,
          protein    = v_new_pro,
          carbs      = v_new_carb,
          fat        = v_new_fat,
          allergens  = v_new_allergens,
          updated_at = now()
      WHERE id = v_item.id;

      v_updated := v_updated + 1;
      v_items := v_items || jsonb_build_object(
        'id', v_item.id,
        'code', v_item.product_code,
        'old', jsonb_build_object('cal', v_old_cal, 'pro', v_old_pro, 'carb', v_old_carb, 'fat', v_old_fat),
        'new', jsonb_build_object('cal', v_new_cal, 'pro', v_new_pro, 'carb', v_new_carb, 'fat', v_new_fat)
      );
    END IF;
  END LOOP;

  -- Reset recursion guard
  PERFORM set_config('app.bom_nutrition_rollup_active', 'false', true);

  RETURN jsonb_build_object(
    'ok', true,
    'updated_count', v_updated,
    'items', v_items
  );
END;
$function$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '253a_nutrition_rollup_food_only.sql',
  'claude-code',
  'fn_rollup_bom_nutrition: sum food children only (exclude NF-PKG), skip packaging-only dishes to preserve intrinsic KBJU. MC 95273dd5.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
