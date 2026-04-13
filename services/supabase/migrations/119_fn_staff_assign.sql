-- Migration 119: Staff assignment with zone/skill filtering
-- Assigns pending tasks to available cooks based on zone, skill level, and workload.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_assign_staff_to_schedule(
  p_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_task RECORD;
  v_best_cook UUID;
  v_assigned INT := 0;
  v_unassigned INT := 0;
BEGIN
  FOR v_task IN
    SELECT
      pt.id AS task_id,
      pt.scheduled_start,
      pt.duration_min,
      pt.equipment_id,
      rf.min_skill_level,
      eq.category AS equipment_zone
    FROM public.production_tasks pt
    LEFT JOIN public.recipes_flow rf ON rf.nomenclature_id = pt.target_nomenclature_id
      AND rf.step_order = 1
    LEFT JOIN public.equipment eq ON eq.id = pt.equipment_id
    WHERE pt.schedule_run_id = p_run_id
      AND pt.assigned_to IS NULL
      AND pt.is_preheat = false  -- preheat tasks auto-assigned to same cook as main
      AND pt.is_defrost = false  -- defrost assigned to any available
    ORDER BY pt.scheduled_start
  LOOP
    -- Find best cook: same zone, sufficient skill, least loaded
    SELECT s.id INTO v_best_cook
    FROM public.staff s
    WHERE s.skill_level >= COALESCE(v_task.min_skill_level, 1)
      AND (
        s.assigned_zone_id IS NULL  -- unassigned = flexible
        OR s.assigned_zone_id = (
          SELECT l.id FROM public.locations l
          JOIN public.equipment e ON e.id = v_task.equipment_id
          WHERE l.type = 'kitchen'
          LIMIT 1
        )
      )
    ORDER BY (
      -- Prefer cooks with fewer overlapping tasks
      SELECT COUNT(*) FROM public.production_tasks pt2
      WHERE pt2.assigned_to = s.id
        AND pt2.schedule_run_id = p_run_id
        AND pt2.scheduled_start < v_task.scheduled_start + (v_task.duration_min || ' minutes')::INTERVAL
        AND pt2.scheduled_start + (pt2.duration_min || ' minutes')::INTERVAL > v_task.scheduled_start
    ) ASC
    LIMIT 1;

    IF v_best_cook IS NOT NULL THEN
      UPDATE public.production_tasks
      SET assigned_to = v_best_cook
      WHERE id = v_task.task_id;
      v_assigned := v_assigned + 1;
    ELSE
      v_unassigned := v_unassigned + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'assigned', v_assigned,
    'unassigned', v_unassigned
  );
END;
$$;

COMMENT ON FUNCTION public.fn_assign_staff_to_schedule(UUID) IS
  'Assigns cooks to scheduled tasks based on zone, skill level, and workload balancing';

INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('119_fn_staff_assign.sql', 'Staff assignment function with zone/skill-aware workload balancing', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
