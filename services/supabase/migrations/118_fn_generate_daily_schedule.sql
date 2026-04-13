-- Migration 118: Main scheduling orchestrator
-- Calls merge/split → reverse schedule → equipment fit → creates production_tasks

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_generate_daily_schedule(
  p_date DATE,
  p_generated_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id UUID;
  v_batch RECORD;
  v_step RECORD;
  v_slot RECORD;
  v_task_id UUID;
  v_task_count INT := 0;
  v_conflict_count INT := 0;
  v_conflicts JSONB := '[]'::JSONB;
BEGIN
  -- 1. Create schedule run record
  INSERT INTO public.schedule_runs (date, generated_by, status)
  VALUES (p_date, p_generated_by, 'draft')
  RETURNING id INTO v_run_id;

  -- 2. Clear previous draft tasks for this date
  DELETE FROM public.equipment_bookings
  WHERE production_task_id IN (
    SELECT id FROM public.production_tasks
    WHERE schedule_run_id IN (
      SELECT id FROM public.schedule_runs WHERE date = p_date AND status = 'draft' AND id != v_run_id
    )
  );
  DELETE FROM public.production_tasks
  WHERE schedule_run_id IN (
    SELECT id FROM public.schedule_runs WHERE date = p_date AND status = 'draft' AND id != v_run_id
  );

  -- 3. Process each merged+split batch
  FOR v_batch IN
    SELECT * FROM fn_merge_and_split_batches(p_date)
  LOOP
    -- 4. Reverse schedule each batch
    FOR v_step IN
      SELECT * FROM fn_reverse_schedule_task(
        v_batch.nomenclature_id,
        v_batch.earliest_deadline,
        v_batch.batch_qty,
        0 -- logistics_min (can be parameterized per location)
      )
      ORDER BY v_step.start_at
    LOOP
      -- 5. Find equipment slot (if equipment assigned)
      IF v_step.equipment_id IS NOT NULL THEN
        SELECT * INTO v_slot
        FROM fn_find_equipment_slot(
          v_step.equipment_id,
          v_step.start_at,
          v_step.duration_min,
          1,
          v_step.product_category
        );

        -- Track conflicts (shifted tasks)
        IF v_slot.shifted THEN
          v_conflict_count := v_conflict_count + 1;
          v_conflicts := v_conflicts || jsonb_build_object(
            'step', v_step.operation_name,
            'equipment_id', v_step.equipment_id,
            'desired_start', v_step.start_at,
            'actual_start', v_slot.slot_start,
            'buffer_reason', v_slot.buffer_reason
          );
        END IF;
      ELSE
        v_slot := ROW(v_step.start_at, v_step.end_at, 10, 'no_equipment', false);
      END IF;

      -- 6. Create production task
      INSERT INTO public.production_tasks (
        target_nomenclature_id,
        description,
        status,
        scheduled_start,
        duration_min,
        equipment_id,
        target_quantity,
        schedule_run_id,
        batch_group_key,
        is_preheat,
        is_defrost,
        parent_target_id
      )
      VALUES (
        v_batch.nomenclature_id,
        v_step.operation_name,
        'pending',
        v_slot.slot_start,
        v_step.duration_min,
        v_step.equipment_id,
        v_batch.batch_qty,
        v_run_id,
        v_batch.batch_group_key,
        v_step.is_preheat,
        v_step.is_defrost,
        v_batch.source_target_ids[1]
      )
      RETURNING id INTO v_task_id;

      -- 7. Create equipment booking
      IF v_step.equipment_id IS NOT NULL THEN
        INSERT INTO public.equipment_bookings (
          equipment_id,
          production_task_id,
          slot_start,
          slot_end,
          capacity_used,
          product_category
        )
        VALUES (
          v_step.equipment_id,
          v_task_id,
          v_slot.slot_start,
          v_slot.slot_end,
          1,
          v_step.product_category
        );
      END IF;

      v_task_count := v_task_count + 1;
    END LOOP;
  END LOOP;

  -- 8. Update run stats
  UPDATE public.schedule_runs
  SET task_count = v_task_count,
      conflict_count = v_conflict_count,
      config_snapshot = jsonb_build_object(
        'date', p_date,
        'conflicts', v_conflicts,
        'generated_at', now()
      )
  WHERE id = v_run_id;

  -- 9. Update target statuses
  UPDATE public.production_targets
  SET status = 'scheduled', updated_at = now()
  WHERE date = p_date AND status = 'confirmed';

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'task_count', v_task_count,
    'conflict_count', v_conflict_count,
    'conflicts', v_conflicts
  );
END;
$$;

COMMENT ON FUNCTION public.fn_generate_daily_schedule(DATE, UUID) IS
  'Main scheduler: merges targets → reverse schedules → fits equipment → creates tasks';

INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('118_fn_generate_daily_schedule.sql', 'Main scheduling orchestrator function', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
