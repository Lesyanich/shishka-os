-- Migration 016: KDS Scheduling & Variance Tracking
-- Adds scheduling columns, BOM snapshot, and RPC for task execution.
-- Enables Supabase Realtime on production_tasks.

-- ─── 1. Schema: Add scheduling & variance columns ───

ALTER TABLE public.production_tasks
  ADD COLUMN IF NOT EXISTS scheduled_start      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_min          INTEGER,
  ADD COLUMN IF NOT EXISTS equipment_id          UUID REFERENCES public.equipment(id),
  ADD COLUMN IF NOT EXISTS theoretical_yield     NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_weight         NUMERIC,
  ADD COLUMN IF NOT EXISTS theoretical_bom_snapshot JSONB;

COMMENT ON COLUMN public.production_tasks.scheduled_start IS 'CEO-assigned start time for Gantt scheduling';
COMMENT ON COLUMN public.production_tasks.duration_min IS 'Expected duration in minutes (from recipes_flow or manual)';
COMMENT ON COLUMN public.production_tasks.equipment_id IS 'FK to equipment — which station/oven runs this task';
COMMENT ON COLUMN public.production_tasks.theoretical_yield IS 'Expected output weight from BOM (kg)';
COMMENT ON COLUMN public.production_tasks.actual_weight IS 'Cook-entered actual output weight (kg)';
COMMENT ON COLUMN public.production_tasks.theoretical_bom_snapshot IS 'Frozen BOM at task start for variance comparison';

-- ─── 2. Indexes ───

CREATE INDEX IF NOT EXISTS idx_pt_equipment_scheduled
  ON public.production_tasks (equipment_id, scheduled_start)
  WHERE scheduled_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pt_status
  ON public.production_tasks (status);

-- ─── 3. RPC: fn_start_production_task ───
-- Called when cook presses "Start". Sets status, actual_start, and freezes BOM snapshot.

CREATE OR REPLACE FUNCTION public.fn_start_production_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flow_step_id UUID;
  v_product_code TEXT;
  v_nomenclature_id UUID;
  v_snapshot JSONB;
  v_result JSONB;
BEGIN
  -- 1. Get flow_step_id from the task
  SELECT flow_step_id INTO v_flow_step_id
  FROM public.production_tasks
  WHERE id = p_task_id;

  IF v_flow_step_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task not found or missing flow_step_id');
  END IF;

  -- 2. Get product_code from recipes_flow
  SELECT product_code INTO v_product_code
  FROM public.recipes_flow
  WHERE id = v_flow_step_id;

  IF v_product_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Flow step not found');
  END IF;

  -- 3. Get nomenclature id by product_code
  SELECT id INTO v_nomenclature_id
  FROM public.nomenclature
  WHERE product_code = v_product_code;

  -- 4. Build BOM snapshot (array of ingredients with quantities)
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

  -- 5. Update the task: status, actual_start, and snapshot
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

  -- 6. Build result
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
  'Starts a production task: sets status to in_progress, records actual_start, freezes BOM snapshot';

-- ─── 4. Enable Realtime ───

ALTER PUBLICATION supabase_realtime ADD TABLE public.production_tasks;
