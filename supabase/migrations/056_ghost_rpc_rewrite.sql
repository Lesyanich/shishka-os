-- ============================================================
-- Migration 056: Ghost RPC Rewrite + Drop recipes_flow & daily_plan
-- Phase 9 — Replace recipes_flow/daily_plan dependencies with
--           target_nomenclature_id (048) and plan_targets (023)
-- ============================================================

-- ─── 1. Rewrite fn_start_production_task ───
-- Was: flow_step_id → recipes_flow → product_code → nomenclature → BOM
-- Now: target_nomenclature_id → nomenclature → BOM (direct)

CREATE OR REPLACE FUNCTION public.fn_start_production_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nomenclature_id UUID;
  v_snapshot JSONB;
  v_result JSONB;
BEGIN
  -- 1. Get target_nomenclature_id directly from the task
  SELECT target_nomenclature_id INTO v_nomenclature_id
  FROM public.production_tasks
  WHERE id = p_task_id;

  IF v_nomenclature_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task not found or missing target_nomenclature_id');
  END IF;

  -- 2. Build BOM snapshot (array of ingredients with quantities)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ingredient_id', bs.ingredient_id,
    'ingredient_code', n.product_code,
    'ingredient_name', n.name,
    'quantity_per_unit', bs.quantity_per_unit,
    'yield_loss_pct', bs.yield_loss_pct
  )), '[]'::jsonb)
  INTO v_snapshot
  FROM public.bom_structures bs
  JOIN public.nomenclature n ON n.id = bs.ingredient_id
  WHERE bs.parent_id = v_nomenclature_id;

  -- 3. Update the task: status, actual_start, and snapshot
  UPDATE public.production_tasks
  SET
    status = 'in_progress',
    actual_start = NOW(),
    theoretical_bom_snapshot = v_snapshot,
    updated_at = NOW()
  WHERE id = p_task_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task is not in pending status');
  END IF;

  -- 4. Build result
  v_result := jsonb_build_object(
    'ok', true,
    'task_id', p_task_id,
    'actual_start', NOW(),
    'bom_snapshot_count', jsonb_array_length(v_snapshot)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_start_production_task(UUID) IS
  'Starts a production task: sets status to in_progress, records actual_start, freezes BOM snapshot. Phase 9: uses target_nomenclature_id (was recipes_flow).';

-- ─── 2. Rewrite fn_create_batches_from_task ───
-- Was: flow_step_id → recipes_flow → product_code → nomenclature
-- Now: target_nomenclature_id → nomenclature (direct)

CREATE OR REPLACE FUNCTION public.fn_create_batches_from_task(
  p_task_id        UUID,
  p_containers     JSONB    -- array of { weight: number }
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task           RECORD;
  v_nom            RECORD;
  v_kitchen_loc    UUID;
  v_container      JSONB;
  v_barcode        TEXT;
  v_batch_id       UUID;
  v_total_weight   NUMERIC := 0;
  v_barcodes       JSONB := '[]'::jsonb;
  v_shelf_life_h   INT := 72;  -- default shelf life: 72 hours for PF
BEGIN
  -- 1. Validate task exists and is in_progress
  SELECT pt.id, pt.target_nomenclature_id, pt.status
    INTO v_task
    FROM public.production_tasks pt
   WHERE pt.id = p_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task not found');
  END IF;

  IF v_task.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task must be in_progress');
  END IF;

  -- 2. Resolve nomenclature directly from target_nomenclature_id
  SELECT n.id, n.type
    INTO v_nom
    FROM public.nomenclature n
   WHERE n.id = v_task.target_nomenclature_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot resolve nomenclature from task');
  END IF;

  -- 3. Get Kitchen location
  SELECT id INTO v_kitchen_loc
    FROM public.locations
   WHERE type = 'kitchen'
   LIMIT 1;

  IF v_kitchen_loc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Kitchen location not configured');
  END IF;

  -- 4. Iterate containers and create batches
  FOR v_container IN SELECT * FROM jsonb_array_elements(p_containers)
  LOOP
    v_barcode  := public.fn_generate_barcode();
    v_batch_id := gen_random_uuid();
    v_total_weight := v_total_weight + (v_container->>'weight')::NUMERIC;

    INSERT INTO public.inventory_batches (
      id, nomenclature_id, barcode, weight, location_id,
      produced_at, expires_at, status, production_task_id
    ) VALUES (
      v_batch_id,
      v_nom.id,
      v_barcode,
      (v_container->>'weight')::NUMERIC,
      v_kitchen_loc,
      now(),
      now() + (v_shelf_life_h || ' hours')::INTERVAL,
      'sealed',
      p_task_id
    );

    v_barcodes := v_barcodes || jsonb_build_object(
      'batch_id', v_batch_id,
      'barcode', v_barcode,
      'weight', (v_container->>'weight')::NUMERIC
    );
  END LOOP;

  -- 5. Complete the production task with total weight
  UPDATE public.production_tasks
     SET status = 'completed',
         actual_end = now(),
         actual_weight = v_total_weight,
         updated_at = now()
   WHERE id = p_task_id;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', p_task_id,
    'total_weight', v_total_weight,
    'batch_count', jsonb_array_length(v_barcodes),
    'batches', v_barcodes
  );
END;
$$;

COMMENT ON FUNCTION public.fn_create_batches_from_task(UUID, JSONB) IS
  'Creates inventory batches from completed task containers. Phase 9: uses target_nomenclature_id (was recipes_flow).';

-- ─── 3. Rewrite fn_predictive_procurement ───
-- Was: daily_plan.id → product_code + target_quantity → single BOM walk
-- Now: production_plans.id → plan_targets (loop) → multi-target BOM walk

CREATE OR REPLACE FUNCTION public.fn_predictive_procurement(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_name    TEXT;
  v_target       RECORD;
  v_all_items    JSONB := '[]'::jsonb;
  v_target_items JSONB;
BEGIN
  -- 1. Validate plan exists
  SELECT name INTO v_plan_name
  FROM public.production_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Plan not found');
  END IF;

  -- 2. Loop over plan targets
  FOR v_target IN
    SELECT pt.nomenclature_id, pt.target_qty, n.product_code, n.name
    FROM public.plan_targets pt
    JOIN public.nomenclature n ON n.id = pt.nomenclature_id
    WHERE pt.plan_id = p_plan_id
  LOOP
    -- 3. Recursive BOM walk for each target
    WITH RECURSIVE bom_tree AS (
      SELECT
        bs.ingredient_id,
        bs.quantity_per_unit * v_target.target_qty AS needed_qty,
        1 AS depth
      FROM public.bom_structures bs
      WHERE bs.parent_id = v_target.nomenclature_id

      UNION ALL

      SELECT
        bs2.ingredient_id,
        bt.needed_qty * bs2.quantity_per_unit AS needed_qty,
        bt.depth + 1
      FROM bom_tree bt
      JOIN public.bom_structures bs2 ON bs2.parent_id = bt.ingredient_id
      WHERE bt.depth < 10
    ),
    leaf_ingredients AS (
      SELECT
        bt.ingredient_id,
        SUM(bt.needed_qty) AS total_needed
      FROM bom_tree bt
      WHERE NOT EXISTS (
        SELECT 1 FROM public.bom_structures bs3
        WHERE bs3.parent_id = bt.ingredient_id
      )
      GROUP BY bt.ingredient_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'nomenclature_id', li.ingredient_id,
      'product_code', n.product_code,
      'name', n.name,
      'unit', COALESCE(n.base_unit, 'kg'),
      'needed', ROUND(li.total_needed, 4),
      'on_hand', ROUND(COALESCE(ib.quantity, 0), 4),
      'shortage', ROUND(GREATEST(li.total_needed - COALESCE(ib.quantity, 0), 0), 4),
      'source_product', v_target.name,
      'source_qty', v_target.target_qty
    )), '[]'::jsonb)
    INTO v_target_items
    FROM leaf_ingredients li
    JOIN public.nomenclature n ON n.id = li.ingredient_id
    LEFT JOIN public.inventory_balances ib ON ib.nomenclature_id = li.ingredient_id;

    -- Merge into all_items (aggregate across targets)
    v_all_items := v_all_items || v_target_items;
  END LOOP;

  -- 4. Deduplicate: group by ingredient, sum needed/shortage, keep max on_hand
  RETURN jsonb_build_object(
    'ok', true,
    'plan_id', p_plan_id,
    'plan_name', v_plan_name,
    'items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nomenclature_id', sub.ingredient_id,
        'product_code', sub.product_code,
        'name', sub.ingredient_name,
        'unit', sub.unit,
        'needed', ROUND(sub.total_needed, 4),
        'on_hand', ROUND(sub.on_hand, 4),
        'shortage', ROUND(GREATEST(sub.total_needed - sub.on_hand, 0), 4)
      ) ORDER BY GREATEST(sub.total_needed - sub.on_hand, 0) DESC), '[]'::jsonb)
      FROM (
        SELECT
          (elem->>'nomenclature_id')::UUID AS ingredient_id,
          elem->>'product_code' AS product_code,
          elem->>'name' AS ingredient_name,
          elem->>'unit' AS unit,
          SUM((elem->>'needed')::NUMERIC) AS total_needed,
          MAX((elem->>'on_hand')::NUMERIC) AS on_hand
        FROM jsonb_array_elements(v_all_items) AS elem
        GROUP BY (elem->>'nomenclature_id')::UUID, elem->>'product_code', elem->>'name', elem->>'unit'
      ) sub
    )
  );
END;
$$;

COMMENT ON FUNCTION public.fn_predictive_procurement(UUID) IS
  'Predictive procurement: loops over plan_targets, recursively walks BOM tree for each, deduplicates ingredients, compares vs inventory. Phase 9: uses production_plans/plan_targets (was daily_plan).';

-- ─── 4. Drop FK constraint and flow_step_id column ───

ALTER TABLE public.production_tasks
  DROP CONSTRAINT IF EXISTS production_tasks_flow_step_id_fkey;

ALTER TABLE public.production_tasks
  DROP COLUMN IF EXISTS flow_step_id;

-- ─── 5. Drop ghost tables ───
-- Both were DEPRECATED in migration 052 and now have zero dependencies.

DROP TABLE IF EXISTS public.recipes_flow CASCADE;
DROP TABLE IF EXISTS public.daily_plan CASCADE;

-- ─── 6. Drop deprecated views (supplier backward-compat) ───
-- useSupplierMapping.ts migrated to supplier_catalog in this phase.

DROP VIEW IF EXISTS public.supplier_item_mapping;
DROP VIEW IF EXISTS public.supplier_products;
