-- ============================================================
-- Migration 137: BOM Cost Rollup — propagate RAW costs to PF/SALE
--
-- PROBLEM: WAC trigger (fn_update_cost_on_purchase) updates cost_per_unit
-- only for RAW items on purchase. PF and SALE items never get their
-- BOM-calculated cost written back — cost_per_unit stays 0.
-- Menu page reads cost_per_unit directly → all dishes show zero cost.
--
-- SOLUTION:
--   1. fn_rollup_bom_costs(UUID) — recursive bottom-up BOM walk,
--      writes calculated cost to nomenclature.cost_per_unit
--   2. trg_cascade_bom_cost — trigger on nomenclature.cost_per_unit
--      change that propagates upward through bom_structures parents
--   3. One-time backfill for all existing PF/SALE items
--
-- MOD items (modifiers) calculate their OWN cost from RAW children,
-- but are excluded from parent SALE base cost (they are optional add-ons).
--
-- DEPENDS ON: bom_structures (parent_id, ingredient_id, quantity_per_unit,
--             yield_loss_pct), nomenclature (cost_per_unit, product_code, type)
-- ============================================================


-- ─── 1. fn_rollup_bom_costs ───

CREATE OR REPLACE FUNCTION public.fn_rollup_bom_costs(
  p_nomenclature_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item        RECORD;
  v_new_cost    NUMERIC;
  v_old_cost    NUMERIC;
  v_updated     INTEGER := 0;
  v_items       JSONB := '[]'::jsonb;
  v_in_trigger  BOOLEAN;
BEGIN
  -- Guard: check if we're already inside a cascade to prevent infinite recursion
  v_in_trigger := COALESCE(current_setting('app.bom_rollup_active', true), '') = 'true';
  IF v_in_trigger AND p_nomenclature_id IS NOT NULL THEN
    -- Already cascading — skip to prevent infinite loop
    RETURN jsonb_build_object('ok', true, 'updated_count', 0, 'skipped', 'recursion_guard');
  END IF;

  -- Set recursion guard
  PERFORM set_config('app.bom_rollup_active', 'true', true);  -- true = local to transaction

  -- Process items: either one specific item's parents, or all PF/SALE/MOD
  FOR v_item IN
    WITH RECURSIVE bom_depth AS (
      -- Base: all items that have children in bom_structures (they are parents)
      SELECT DISTINCT n.id, n.product_code, n.cost_per_unit, 0 AS depth
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
      SELECT DISTINCT n.id, n.product_code, n.cost_per_unit, bd.depth + 1
      FROM bom_depth bd
      JOIN bom_structures bs ON bs.ingredient_id = bd.id
      JOIN nomenclature n ON n.id = bs.parent_id
      WHERE n.is_available = TRUE
        AND bd.depth < 10
    )
    -- Deduplicate and sort by max depth ASC (leaves first = bottom-up)
    -- depth 0 = leaf PFs (only RAW children), depth 1 = their parents, etc.
    SELECT sub.id, sub.product_code, sub.cost_per_unit
    FROM (
      SELECT id, product_code, cost_per_unit, MAX(depth) AS max_depth
      FROM bom_depth
      GROUP BY id, product_code, cost_per_unit
    ) sub
    ORDER BY sub.max_depth ASC, sub.product_code
  LOOP
    v_old_cost := COALESCE(v_item.cost_per_unit, 0);

    -- Calculate cost from BOM children
    -- Skip MOD children when calculating SALE parent cost
    -- yield_loss_pct is LOSS: 15 = 15% lost → gross = net / (1 - loss/100)
    SELECT COALESCE(SUM(
      COALESCE(child_n.cost_per_unit, 0)
      * bs.quantity_per_unit
      / CASE WHEN COALESCE(bs.yield_loss_pct, 0) > 0
             THEN (1 - bs.yield_loss_pct / 100.0)
             ELSE 1 END
    ), 0)
    INTO v_new_cost
    FROM bom_structures bs
    JOIN nomenclature child_n ON child_n.id = bs.ingredient_id
    WHERE bs.parent_id = v_item.id
      -- Exclude MOD children from SALE parent cost calculation
      AND NOT (
        v_item.product_code LIKE 'SALE-%'
        AND child_n.product_code LIKE 'MOD-%'
      );

    v_new_cost := ROUND(v_new_cost, 4);

    -- Only update if cost actually changed (avoid unnecessary trigger cascades)
    IF v_new_cost IS DISTINCT FROM v_old_cost THEN
      UPDATE nomenclature
      SET cost_per_unit = v_new_cost,
          updated_at = now()
      WHERE id = v_item.id;

      v_updated := v_updated + 1;
      v_items := v_items || jsonb_build_object(
        'id', v_item.id,
        'code', v_item.product_code,
        'old_cost', v_old_cost,
        'new_cost', v_new_cost
      );
    END IF;
  END LOOP;

  -- Reset recursion guard
  PERFORM set_config('app.bom_rollup_active', 'false', true);

  RETURN jsonb_build_object(
    'ok', true,
    'updated_count', v_updated,
    'items', v_items
  );
END;
$$;

COMMENT ON FUNCTION public.fn_rollup_bom_costs(UUID)
  IS 'Recursive bottom-up BOM cost rollup. NULL = recalculate all PF/SALE/MOD. UUID = recalculate that item + upstream parents. MOD costs excluded from SALE base cost.';


-- ─── 2. trg_cascade_bom_cost ───

CREATE OR REPLACE FUNCTION public.fn_cascade_bom_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id UUID;
  v_in_rollup BOOLEAN;
BEGIN
  -- Skip if already inside fn_rollup_bom_costs (it handles its own cascade)
  v_in_rollup := COALESCE(current_setting('app.bom_rollup_active', true), '') = 'true';
  IF v_in_rollup THEN
    RETURN NEW;
  END IF;

  -- Find all direct parents and recalculate each
  FOR v_parent_id IN
    SELECT DISTINCT bs.parent_id
    FROM bom_structures bs
    WHERE bs.ingredient_id = NEW.id
  LOOP
    PERFORM fn_rollup_bom_costs(v_parent_id);
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_cascade_bom_cost()
  IS 'Trigger function: when cost_per_unit changes on any item, recalculate all BOM parents. Skips if already inside fn_rollup_bom_costs.';

-- Drop if exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS trg_cascade_bom_cost ON public.nomenclature;

CREATE TRIGGER trg_cascade_bom_cost
  AFTER UPDATE OF cost_per_unit ON public.nomenclature
  FOR EACH ROW
  WHEN (OLD.cost_per_unit IS DISTINCT FROM NEW.cost_per_unit)
  EXECUTE FUNCTION public.fn_cascade_bom_cost();


-- ─── 3. One-time backfill ───

DO $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT fn_rollup_bom_costs(NULL) INTO v_result;
  RAISE NOTICE 'BOM cost rollup backfill: %', v_result;
END;
$$;


-- ─── Migration log ───

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '137_bom_cost_rollup.sql',
  'claude-code',
  NULL,
  'Add fn_rollup_bom_costs + cascade trigger. Propagates RAW costs upward through BOM to PF/SALE items. MOD excluded from SALE base cost. Includes one-time backfill.'
) ON CONFLICT (filename) DO NOTHING;
