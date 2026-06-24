-- Migration 310 — Reflect the maintenance regimen on the equipment side
-- The cleaning/maintenance schedule lives in staff_tasks (recurring templates).
-- This links those tasks to the equipment they service so the equipment register
-- can show "what we service and how often", and so completing a task writes a
-- maintenance history row + bumps equipment.last_service_date.
--
-- Single source of truth stays staff_tasks (the live, recurring, Telegram-pushed
-- regimen). equipment_maintenance becomes the auto-generated service history.
--
--   1. staff_tasks.equipment_id  → nullable FK (grouped/area tasks stay NULL).
--   2. fn_materialize_recurring_tasks carries equipment_id onto instances.
--   3. backfill the per-unit maintenance templates (+ their instances) by title.
--   4. v_equipment_maintenance_schedule → per-equipment regimen (cadence) view.
--   5. trigger: completing a linked task → equipment_maintenance row (type mapped
--      to the CHECK enum) + next_due_at + equipment.last_service_date.

BEGIN;

-- 1) Link each task to a specific equipment unit.
ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_staff_tasks_equipment
  ON public.staff_tasks(equipment_id) WHERE equipment_id IS NOT NULL;

-- 2) Materialiser carries equipment_id onto generated instances.
CREATE OR REPLACE FUNCTION public.fn_materialize_recurring_tasks(p_date date DEFAULT CURRENT_DATE)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  inserted INTEGER := 0;
  dow INTEGER := EXTRACT(DOW FROM p_date);
  dom INTEGER := EXTRACT(DAY FROM p_date);
  last_dom INTEGER := EXTRACT(DAY FROM (date_trunc('month', p_date) + INTERVAL '1 month - 1 day'));
BEGIN
  INSERT INTO public.staff_tasks (
    title, title_th, description, description_th, assigned_to, created_by,
    category, priority, status, due_date, due_time, reminder_offset_min,
    recurrence, is_template, template_id,
    station, linked_route, linked_label, linked_label_th, equipment_id
  )
  SELECT
    t.title, t.title_th, t.description, t.description_th, t.assigned_to, t.created_by,
    t.category, t.priority, 'todo', p_date, t.due_time, t.reminder_offset_min,
    'none', false, t.id,
    t.station, t.linked_route, t.linked_label, t.linked_label_th, t.equipment_id
  FROM public.staff_tasks t
  WHERE t.is_template = true
    AND t.status <> 'cancelled'
    AND (
      t.recurrence = 'daily'
      OR (t.recurrence = 'weekly' AND dow = ANY(COALESCE(t.recurrence_days, ARRAY[]::INT[])))
      OR (t.recurrence = 'monthly' AND (
            dom = ANY(COALESCE(t.recurrence_days, ARRAY[1]))
            OR (dom = last_dom AND EXISTS (SELECT 1 FROM unnest(COALESCE(t.recurrence_days, ARRAY[1])) AS d WHERE d > last_dom))
          ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_tasks i WHERE i.template_id = t.id AND i.due_date = p_date
    );
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted > 0 THEN
    RAISE LOG '[staff_tasks] Materialized % recurring task(s) for %', inserted, p_date;
  END IF;
  RETURN inserted;
END;
$function$;

-- 3) Backfill per-unit maintenance templates (and today's instances, same title) → equipment.
WITH map(pat, code) AS (VALUES
  ('Coffee machine — %','L-2-S-COF-ESP-CHINA-16'),
  ('Merrychef — %','L-2-S-HS-OVN-MCs1s-39'),
  ('Open fridge — %','L-2-S-OPEN-FRG-120-11'),
  ('Display fridge (bakery) — %','L-2-S-DISP-FRG-120-8'),
  ('Salad Bar 1 — %','L-2-S-SB-150-9'),
  ('Salad Bar 2 — %','L-2-S-SB-150-10'),
  ('Contact grill — %','L-2-S-GRIILL-CNT-48'),
  ('Smoothie blender — %','L-2-S-SMOO-BLDR-CHINA-14'),
  ('L2 hood — %','L-2-S-KTC-HOOD-200-61')
)
UPDATE public.staff_tasks t
SET equipment_id = e.id
FROM map m JOIN public.equipment e ON e.equipment_code = m.code
WHERE t.title LIKE m.pat AND t.equipment_id IS NULL;

-- 4) Per-equipment maintenance schedule view (single source = staff_tasks templates).
CREATE OR REPLACE VIEW public.v_equipment_maintenance_schedule AS
SELECT
  e.id AS equipment_id, e.equipment_code, e.name AS equipment_name, e.last_service_date,
  t.id AS task_id, t.title, t.title_th, t.category, t.priority,
  t.recurrence, t.recurrence_days, t.due_time,
  CASE t.recurrence WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly'
       WHEN 'monthly' THEN 'Monthly' ELSE 'One-off' END AS cadence
FROM public.equipment e
JOIN public.staff_tasks t
  ON t.equipment_id = e.id AND t.is_template = true AND t.status <> 'cancelled'
ORDER BY e.name,
  CASE t.recurrence WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2 WHEN 'monthly' THEN 3 ELSE 4 END, t.due_time;

GRANT SELECT ON public.v_equipment_maintenance_schedule TO authenticated;

-- 5) Auto-log a maintenance event + bump last_service_date when a linked task is completed.
--    type is mapped onto the equipment_maintenance_type_check enum; cadence + source
--    are recorded in result_notes. performed_by left NULL (avoids cross-table FK risk).
CREATE OR REPLACE FUNCTION public.fn_log_equipment_maintenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_rec text; v_type text; v_base date; v_next timestamptz;
BEGIN
  IF NEW.equipment_id IS NOT NULL
     AND NEW.is_template = false
     AND NEW.status = 'done'
     AND (OLD.status IS DISTINCT FROM 'done') THEN

    SELECT recurrence INTO v_rec FROM public.staff_tasks WHERE id = NEW.template_id;
    v_rec  := COALESCE(v_rec, 'one-off');
    v_type := CASE
                WHEN NEW.title ILIKE '%descale%' THEN 'preventive'
                WHEN NEW.title ILIKE '%inspection%' OR NEW.title ILIKE '%check%' OR NEW.title ILIKE '%pest%' THEN 'inspection'
                WHEN NEW.title ILIKE '%filter%' OR NEW.title ILIKE '%replace%' THEN 'replacement'
                ELSE 'cleaning' END;
    v_base := COALESCE(NEW.due_date, (COALESCE(NEW.completed_at, now()))::date);
    v_next := CASE v_rec
                WHEN 'daily'   THEN (v_base + 1)::timestamptz
                WHEN 'weekly'  THEN (v_base + 7)::timestamptz
                WHEN 'monthly' THEN (v_base + INTERVAL '1 month')
                ELSE NULL END;

    INSERT INTO public.equipment_maintenance
      (equipment_id, type, scheduled_at, completed_at, next_due_at, description, performed_by, status, result_notes)
    VALUES
      (NEW.equipment_id, v_type,
       CASE WHEN NEW.due_date IS NOT NULL THEN (NEW.due_date + COALESCE(NEW.due_time, '00:00'::time))::timestamptz END,
       COALESCE(NEW.completed_at, now()), v_next, NEW.title, NULL, 'completed',
       v_rec||' · auto from staff_tasks '||NEW.id::text||COALESCE(' · by '||NEW.assigned_to::text,''));

    UPDATE public.equipment
       SET last_service_date = (COALESCE(NEW.completed_at, now()))::date, updated_at = now()
     WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_log_equipment_maintenance ON public.staff_tasks;
CREATE TRIGGER trg_log_equipment_maintenance
AFTER UPDATE OF status ON public.staff_tasks
FOR EACH ROW EXECUTE FUNCTION public.fn_log_equipment_maintenance();

-- Ledger (numbering guard).
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('310_equipment_maintenance_link.sql','claude-code',
        'Link staff_tasks.equipment_id FK + carry through materializer; backfill per-unit maintenance templates; v_equipment_maintenance_schedule view; trigger auto-logs completed maintenance into equipment_maintenance (+ bumps equipment.last_service_date).')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
