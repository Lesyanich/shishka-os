-- Migration 128: Writeback fn_generate_daily_schedule to match prod (patches applied 2026-04-13)
-- MC task: 3b26278f
--
-- Codifies in-place prod edits from the KDS 3.2 session on 2026-04-13.
-- From the tech-lead handoff packet (5 listed fixes):
--   (1) ORDER BY v_step.start_at -> start_at
--   (2) v_slot anonymous record -> v_actual_start/v_actual_end locals (+ NULL guard)
--   (5) added expected_duration_min column in production_tasks INSERT
-- Fixes #3 (batch_key -> batch_group_key) and #4 (target_ids -> source_target_ids)
-- from the handoff were NOT visible in diff vs. migration 118 — both names already
-- present in 118, so nothing to rename. Documenting here for commit-message fidelity.
--
-- Additional behavioral drift discovered in prod (not listed in handoff, CEO-approved
-- 2026-04-14 to codify as-is, prod-is-truth posture):
--   (A) production_tasks.description = operation_name || ' — ' || COALESCE(v_batch.name, 'Unknown')
--   (B) removed UPDATE production_targets SET status='scheduled' WHERE status='confirmed'
--   (C) removed config_snapshot jsonb from UPDATE schedule_runs
--   + COALESCE defaults on is_preheat/is_defrost
--   + guard "v_actual_start IS NOT NULL" on equipment_bookings INSERT
--
-- Brings services/supabase/migrations/ in sync with production.
-- Idempotent via CREATE OR REPLACE FUNCTION — safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_generate_daily_schedule(p_date date, p_generated_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_run_id UUID; v_batch RECORD; v_step RECORD; v_slot RECORD; v_task_id UUID;
  v_task_count INT := 0; v_conflict_count INT := 0; v_conflicts JSONB := '[]'::JSONB;
  v_actual_start TIMESTAMPTZ; v_actual_end TIMESTAMPTZ;
BEGIN
  INSERT INTO schedule_runs (date, generated_by, status) VALUES (p_date, p_generated_by, 'draft') RETURNING id INTO v_run_id;

  DELETE FROM equipment_bookings WHERE production_task_id IN (
    SELECT id FROM production_tasks WHERE schedule_run_id IN (
      SELECT id FROM schedule_runs WHERE date = p_date AND status = 'draft' AND id != v_run_id));
  DELETE FROM production_tasks WHERE schedule_run_id IN (
    SELECT id FROM schedule_runs WHERE date = p_date AND status = 'draft' AND id != v_run_id);

  FOR v_batch IN SELECT * FROM fn_merge_and_split_batches(p_date) LOOP
    FOR v_step IN
      SELECT * FROM fn_reverse_schedule_task(v_batch.nomenclature_id, v_batch.earliest_deadline, v_batch.batch_qty, 0)
      ORDER BY start_at
    LOOP
      v_actual_start := v_step.start_at;
      v_actual_end := v_step.end_at;

      IF v_step.equipment_id IS NOT NULL THEN
        SELECT * INTO v_slot FROM fn_find_equipment_slot(v_step.equipment_id, v_step.start_at, v_step.duration_min, 1, v_step.product_category);
        IF v_slot IS NOT NULL AND v_slot.slot_start IS NOT NULL THEN
          v_actual_start := v_slot.slot_start; v_actual_end := v_slot.slot_end;
          IF v_slot.shifted THEN
            v_conflict_count := v_conflict_count + 1;
            v_conflicts := v_conflicts || jsonb_build_object('step', v_step.operation_name, 'equipment_id', v_step.equipment_id, 'desired_start', v_step.start_at, 'actual_start', v_slot.slot_start, 'buffer_reason', v_slot.buffer_reason);
          END IF;
        END IF;
      END IF;

      INSERT INTO production_tasks (
        target_nomenclature_id, description, status, scheduled_start,
        duration_min, expected_duration_min, equipment_id, target_quantity,
        schedule_run_id, batch_group_key, is_preheat, is_defrost, parent_target_id
      ) VALUES (
        v_batch.nomenclature_id,
        v_step.operation_name || ' — ' || COALESCE(v_batch.name, 'Unknown'),
        'pending', v_actual_start,
        v_step.duration_min, v_step.duration_min, v_step.equipment_id, v_batch.batch_qty,
        v_run_id, v_batch.batch_group_key,
        COALESCE(v_step.is_preheat, false), COALESCE(v_step.is_defrost, false),
        v_batch.source_target_ids[1]
      ) RETURNING id INTO v_task_id;

      IF v_step.equipment_id IS NOT NULL AND v_actual_start IS NOT NULL THEN
        INSERT INTO equipment_bookings (equipment_id, production_task_id, slot_start, slot_end, capacity_used, product_category)
        VALUES (v_step.equipment_id, v_task_id, v_actual_start, v_actual_end, 1, v_step.product_category);
      END IF;

      v_task_count := v_task_count + 1;
    END LOOP;
  END LOOP;

  UPDATE schedule_runs SET task_count = v_task_count, conflict_count = v_conflict_count WHERE id = v_run_id;

  RETURN jsonb_build_object('ok', true, 'run_id', v_run_id, 'task_count', v_task_count, 'conflict_count', v_conflict_count, 'conflicts', v_conflicts);
END;
$function$;

COMMENT ON FUNCTION public.fn_generate_daily_schedule(DATE, UUID) IS
  'Main scheduler: merges targets -> reverse schedules -> fits equipment -> creates tasks. Writeback of KDS 3.2 prod patches 2026-04-13 (MC 3b26278f).';

INSERT INTO public.migration_log (filename, applied_by, checksum, notes)
VALUES (
  '128_writeback_fn_generate_daily_schedule.sql',
  'claude-code',
  NULL,
  'Writeback fn_generate_daily_schedule to match prod post KDS 3.2 patches (MC 3b26278f)'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
