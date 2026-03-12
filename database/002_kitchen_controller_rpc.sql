-- =============================================================================
-- Migration: 002_kitchen_controller_rpc.sql
-- Project:   Shishka Healthy Kitchen — Kitchen Controller
-- Date:      2026-03-07
-- =============================================================================

-- ---------------------------------------------------------------------------
-- fn_start_kitchen_task(p_task_id UUID)
--
-- Logic:
-- 1. Fetch the task → validate it exists and is currently 'pending'
-- 2. Fetch linked equipment → check status is 'available' (not 'maintenance'|'offline')
-- 3. Calculate current load = SUM(capacity_used) of IN_PROGRESS tasks on that equipment
-- 4. If (current_load + task.capacity_used) > equipment.capacity_value → OVERLOAD error
-- 5. Otherwise → UPDATE task to in_progress, set actual_start = NOW()
-- 6. Return structured JSONB: {success, task_id, message}
--
-- Returns: JSONB
--   success case: {"success": true,  "task_id": "...", "actual_start": "..."}
--   error cases:  {"success": false, "error_code": "...", "message": "..."}
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_start_kitchen_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER   -- runs with owner privileges; RLS is bypassed intentionally for an RPC
AS $$
DECLARE
  v_task            RECORD;
  v_equipment       RECORD;
  v_current_load    NUMERIC := 0;
  v_new_load        NUMERIC;
  v_actual_start    TIMESTAMPTZ;
BEGIN

  -- -------------------------------------------------------------------------
  -- Step 1: Fetch and validate the task
  -- -------------------------------------------------------------------------
  SELECT
    pt.id,
    pt.status,
    pt.capacity_used,
    pt.equipment_id,
    pt.plan_id,
    pt.task_category
  INTO v_task
  FROM production_tasks pt
  WHERE pt.id = p_task_id;

  -- Guard: task must exist
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'TASK_NOT_FOUND',
      'message',    'No task found with id: ' || p_task_id::text
    );
  END IF;

  -- Guard: task must be in 'pending' state (not already started or completed)
  IF v_task.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'INVALID_TASK_STATUS',
      'message',    'Task is not in pending state. Current status: ' || v_task.status
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 2: Fetch and validate equipment status
  -- -------------------------------------------------------------------------
  SELECT
    e.id,
    e.name,
    e.capacity_value,
    e.capacity_unit,
    e.status,
    e.is_bottleneck
  INTO v_equipment
  FROM equipment e
  WHERE e.id = v_task.equipment_id;

  -- Guard: equipment must exist
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'EQUIPMENT_NOT_FOUND',
      'message',    'Equipment not found: ' || v_task.equipment_id
    );
  END IF;

  -- Guard: equipment must be 'available' (not maintenance or offline)
  IF v_equipment.status <> 'available' THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'EQUIPMENT_UNAVAILABLE',
      'message',    'Equipment "' || v_equipment.name || '" is currently ' || v_equipment.status || '. Cannot start task.',
      'equipment_id',   v_equipment.id,
      'equipment_status', v_equipment.status
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 3: Calculate current load on this equipment
  -- -------------------------------------------------------------------------
  SELECT COALESCE(SUM(pt.capacity_used), 0)
    INTO v_current_load
  FROM production_tasks pt
  WHERE pt.equipment_id = v_task.equipment_id
    AND pt.status = 'in_progress';

  v_new_load := v_current_load + v_task.capacity_used;

  -- -------------------------------------------------------------------------
  -- Step 4: Check capacity — OVERLOAD guard
  -- -------------------------------------------------------------------------
  IF v_new_load > v_equipment.capacity_value THEN

    -- Log the capacity conflict as a warning
    INSERT INTO warnings (task_id, warning_type, message, threshold_value, actual_value)
    VALUES (
      p_task_id,
      'capacity_conflict',
      'Cannot start task: equipment "' || v_equipment.name || '" would be overloaded. '
        || 'Load: ' || v_current_load || ' + ' || v_task.capacity_used
        || ' = ' || v_new_load || ' > max ' || v_equipment.capacity_value,
      v_equipment.capacity_value,
      v_new_load
    );

    RETURN jsonb_build_object(
      'success',          false,
      'error_code',       'EQUIPMENT_OVERLOADED',
      'message',          'Cannot start task: equipment "' || v_equipment.name || '" is at capacity.',
      'equipment_id',     v_equipment.id,
      'current_load',     v_current_load,
      'task_capacity',    v_task.capacity_used,
      'would_be_load',    v_new_load,
      'max_capacity',     v_equipment.capacity_value,
      'capacity_unit',    v_equipment.capacity_unit
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 5: All checks passed — start the task
  -- -------------------------------------------------------------------------
  v_actual_start := NOW();

  UPDATE production_tasks
  SET
    status       = 'in_progress',
    actual_start = v_actual_start,
    updated_at   = v_actual_start
  WHERE id = p_task_id;

  -- -------------------------------------------------------------------------
  -- Step 6: Return success payload
  -- -------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success',         true,
    'task_id',         p_task_id,
    'actual_start',    v_actual_start,
    'equipment_id',    v_equipment.id,
    'equipment_name',  v_equipment.name,
    'load_after',      v_new_load,
    'max_capacity',    v_equipment.capacity_value,
    'capacity_unit',   v_equipment.capacity_unit,
    'message',         'Task started successfully.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'INTERNAL_ERROR',
      'message',    SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION fn_start_kitchen_task(UUID) IS
  'Kitchen Controller RPC. Validates equipment availability and capacity before '
  'transitioning a production_task from pending → in_progress. '
  'Returns JSONB with success/error detail. Error codes: '
  'TASK_NOT_FOUND | INVALID_TASK_STATUS | EQUIPMENT_NOT_FOUND | EQUIPMENT_UNAVAILABLE | EQUIPMENT_OVERLOADED.';

-- Grant execute to authenticated users (via TWA/Telegram bot)
GRANT EXECUTE ON FUNCTION fn_start_kitchen_task(UUID) TO anon;
GRANT EXECUTE ON FUNCTION fn_start_kitchen_task(UUID) TO authenticated;
