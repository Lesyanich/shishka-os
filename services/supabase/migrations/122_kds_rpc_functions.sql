-- Migration 122: KDS RPC functions (SECURITY DEFINER)
-- Cook station uses anon key — these RPCs bypass RLS for writes

BEGIN;

-- Log a HACCP checkpoint result (immutable insert)
CREATE OR REPLACE FUNCTION public.fn_log_haccp_checkpoint(
  p_task_id UUID,
  p_flow_id UUID,
  p_step_order INTEGER,
  p_type TEXT,
  p_expected NUMERIC DEFAULT NULL,
  p_tolerance NUMERIC DEFAULT NULL,
  p_actual NUMERIC DEFAULT NULL,
  p_passed BOOLEAN DEFAULT false,
  p_staff_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  IF p_task_id IS NULL OR p_flow_id IS NULL OR p_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_id, flow_id, and staff_id are required');
  END IF;

  IF p_type NOT IN ('temperature', 'sanitation', 'visual', 'weight') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid checkpoint_type');
  END IF;

  INSERT INTO public.haccp_logs (
    production_task_id, recipe_flow_id, step_order,
    checkpoint_type, expected_value, tolerance, actual_value,
    passed, recorded_by, notes
  ) VALUES (
    p_task_id, p_flow_id, p_step_order,
    p_type, p_expected, p_tolerance, p_actual,
    p_passed, p_staff_id, p_notes
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id);
END;
$$;

-- Log a waste entry at task completion
CREATE OR REPLACE FUNCTION public.fn_log_waste_entry(
  p_task_id UUID,
  p_waste_type TEXT,
  p_gross NUMERIC,
  p_net NUMERIC,
  p_norm_pct NUMERIC DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id UUID;
BEGIN
  IF p_task_id IS NULL OR p_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_id and staff_id are required');
  END IF;

  IF p_waste_type NOT IN ('prep_waste', 'spoilage', 'human_error', 'rework') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid waste_type');
  END IF;

  IF p_gross <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gross_weight must be positive');
  END IF;

  INSERT INTO public.waste_entries (
    production_task_id, waste_type, gross_weight, net_weight,
    norm_waste_pct, recorded_by, notes
  ) VALUES (
    p_task_id, p_waste_type, p_gross, p_net,
    p_norm_pct, p_staff_id, p_notes
  )
  RETURNING id INTO v_entry_id;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry_id);
END;
$$;

-- Complete a KDS task: set status, weight, actual_end
CREATE OR REPLACE FUNCTION public.fn_complete_kds_task(
  p_task_id UUID,
  p_net_weight NUMERIC DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_task_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_id is required');
  END IF;

  UPDATE public.production_tasks
  SET
    status = 'completed',
    actual_weight = p_net_weight,
    actual_end = now()
  WHERE id = p_task_id
    AND status = 'in_progress';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task not found or not in_progress');
  END IF;

  RETURN jsonb_build_object('ok', true, 'task_id', p_task_id);
END;
$$;

-- Self-register
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '122_kds_rpc_functions.sql',
  'KDS RPC functions: fn_log_haccp_checkpoint, fn_log_waste_entry, fn_complete_kds_task (SECURITY DEFINER)',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
