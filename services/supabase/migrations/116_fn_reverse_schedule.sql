-- Migration 116: Reverse scheduling — calculate start times from deadlines
-- Walks recipe steps backward from deadline, inserting preheat micro-tasks
-- and D-1 defrost tasks for frozen ingredients.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_reverse_schedule_task(
  p_nomenclature_id UUID,
  p_deadline TIMESTAMPTZ,
  p_quantity NUMERIC,
  p_logistics_min INT DEFAULT 0
)
RETURNS TABLE (
  step_order INT,
  operation_name TEXT,
  equipment_id UUID,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  duration_min INT,
  is_passive BOOLEAN,
  is_preheat BOOLEAN,
  is_defrost BOOLEAN,
  target_equipment_category_id UUID,
  transition_time_max INTERVAL,
  product_category TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cursor TIMESTAMPTZ := p_deadline;
  v_step RECORD;
  v_preheat INT;
  v_buffer_min INT := 10; -- standard buffer between tasks
BEGIN
  -- Subtract logistics time first
  v_cursor := v_cursor - (p_logistics_min || ' minutes')::INTERVAL;

  -- Walk recipe steps in REVERSE order
  FOR v_step IN
    SELECT
      rf.step_order,
      rf.operation_name,
      rf.equipment_id,
      rf.duration_min,
      rf.is_passive,
      rf.target_equipment_category_id,
      rf.transition_time_max,
      COALESCE(eq.preheat_min, 0) AS preheat_min,
      n.product_category
    FROM public.recipes_flow rf
    LEFT JOIN public.equipment eq ON eq.id = rf.equipment_id
    LEFT JOIN public.nomenclature n ON n.id = p_nomenclature_id
    WHERE rf.nomenclature_id = p_nomenclature_id
    ORDER BY rf.step_order DESC
  LOOP
    -- Calculate this step's time window
    step_order := v_step.step_order;
    operation_name := v_step.operation_name;
    equipment_id := v_step.equipment_id;
    duration_min := v_step.duration_min;
    is_passive := v_step.is_passive;
    is_preheat := false;
    is_defrost := false;
    target_equipment_category_id := v_step.target_equipment_category_id;
    transition_time_max := v_step.transition_time_max;
    product_category := v_step.product_category;

    end_at := v_cursor;
    start_at := v_cursor - (v_step.duration_min || ' minutes')::INTERVAL;
    v_cursor := start_at - (v_buffer_min || ' minutes')::INTERVAL;

    RETURN NEXT;

    -- If this step needs preheat, insert a preheat micro-task before it
    IF v_step.preheat_min > 0 THEN
      step_order := v_step.step_order * 10 - 1; -- e.g., step 4 → preheat at 39
      operation_name := 'Preheat: ' || v_step.operation_name;
      equipment_id := v_step.equipment_id;
      duration_min := v_step.preheat_min;
      is_passive := false;
      is_preheat := true;
      end_at := start_at; -- preheat ends when main step starts
      start_at := end_at - (v_step.preheat_min || ' minutes')::INTERVAL;

      RETURN NEXT;

      v_cursor := start_at - (v_buffer_min || ' minutes')::INTERVAL;
    END IF;
  END LOOP;

  -- Check for frozen RAW ingredients needing D-1 defrost
  FOR v_step IN
    SELECT
      n.id AS nomenclature_id,
      n.product_code,
      n.name,
      n.defrost_hours
    FROM fn_explode_bom(p_nomenclature_id, p_quantity) eb
    JOIN public.nomenclature n ON n.id = eb.nomenclature_id
    WHERE n.storage_type = 'frozen'
      AND n.defrost_hours IS NOT NULL
      AND n.defrost_hours > 0
  LOOP
    step_order := -1; -- D-1 task
    operation_name := 'Defrost: ' || v_step.name;
    equipment_id := NULL;
    duration_min := 0; -- it's a move action, not timed
    is_passive := false;
    is_preheat := false;
    is_defrost := true;
    target_equipment_category_id := NULL;
    transition_time_max := NULL;
    product_category := NULL;

    -- Defrost must start N hours before first step
    end_at := v_cursor;
    start_at := v_cursor - (v_step.defrost_hours || ' hours')::INTERVAL;

    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_reverse_schedule_task(UUID, TIMESTAMPTZ, NUMERIC, INT) IS
  'Calculates step-by-step schedule working backward from deadline, with preheat and defrost';

INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('116_fn_reverse_schedule.sql', 'Reverse scheduling function with preheat and defrost generation', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
