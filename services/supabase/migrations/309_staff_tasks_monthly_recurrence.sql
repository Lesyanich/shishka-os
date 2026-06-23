-- Migration 309 — Add 'monthly' recurrence to the staff task tracker
-- Extends staff_tasks recurrence beyond daily/weekly so monthly maintenance
-- (e.g. coffee-machine descaling, water-filter changes, deep cleans) can be
-- scheduled and auto-materialised like the existing cadences.
--
-- Model: for monthly templates, recurrence_days holds the day(s)-of-month
-- (1–31). A task fires when today's day-of-month matches; days 29–31 fall back
-- to the last day of shorter months so a "day 31" task still fires in Feb/Apr.
-- daily + weekly behaviour is unchanged. The 07:25 ICT cron (job 4) and Telegram
-- pushes already call fn_materialize_recurring_tasks — no scheduling change needed.

BEGIN;

-- a. Allow 'monthly' in the recurrence check.
ALTER TABLE public.staff_tasks DROP CONSTRAINT IF EXISTS staff_tasks_recurrence_check;
ALTER TABLE public.staff_tasks ADD CONSTRAINT staff_tasks_recurrence_check
  CHECK (recurrence = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text, 'monthly'::text]));

-- b. Teach the materialiser the monthly cadence (day-of-month via recurrence_days,
--    default day 1; last-day clamp for 29–31). daily/weekly branches untouched.
CREATE OR REPLACE FUNCTION public.fn_materialize_recurring_tasks(p_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  inserted INTEGER := 0;
  dow      INTEGER := EXTRACT(DOW FROM p_date);
  dom      INTEGER := EXTRACT(DAY FROM p_date);
  last_dom INTEGER := EXTRACT(DAY FROM (date_trunc('month', p_date) + INTERVAL '1 month - 1 day'));
BEGIN
  INSERT INTO public.staff_tasks (
    title, title_th, description, description_th, assigned_to, created_by,
    category, priority, status, due_date, due_time, reminder_offset_min,
    recurrence, is_template, template_id,
    station, linked_route, linked_label, linked_label_th
  )
  SELECT
    t.title, t.title_th, t.description, t.description_th, t.assigned_to, t.created_by,
    t.category, t.priority, 'todo', p_date, t.due_time, t.reminder_offset_min,
    'none', false, t.id,
    t.station, t.linked_route, t.linked_label, t.linked_label_th
  FROM public.staff_tasks t
  WHERE t.is_template = true
    AND t.status <> 'cancelled'
    AND (
      t.recurrence = 'daily'
      OR (t.recurrence = 'weekly'
          AND dow = ANY(COALESCE(t.recurrence_days, ARRAY[]::INT[])))
      OR (t.recurrence = 'monthly'
          AND (
            dom = ANY(COALESCE(t.recurrence_days, ARRAY[1]))
            OR (dom = last_dom
                AND EXISTS (SELECT 1
                              FROM unnest(COALESCE(t.recurrence_days, ARRAY[1])) AS d
                             WHERE d > last_dom))
          ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_tasks i
      WHERE i.template_id = t.id AND i.due_date = p_date
    );
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted > 0 THEN
    RAISE LOG '[staff_tasks] Materialized % recurring task(s) for %', inserted, p_date;
  END IF;
  RETURN inserted;
END;
$function$;

-- Ledger (numbering guard).
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '309_staff_tasks_monthly_recurrence.sql',
  'claude-code',
  'Add monthly recurrence to staff_tasks: extend recurrence CHECK (+monthly) and fn_materialize_recurring_tasks (day-of-month via recurrence_days, default 1, last-day clamp for 29-31). Daily/weekly unchanged. Powers monthly equipment maintenance (coffee descale etc.).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
