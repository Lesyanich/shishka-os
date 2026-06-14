-- Migration 276a — staff task tracker Phase 3: scheduled pushes via pg_cron.
-- Renumbered from 274_ (applied to prod as 268_staff_tasks_cron.sql)
-- to resolve a duplicate-274 collision — see 282_renumber_273_275_collision_log_sync.sql.
--
-- pg_cron runs in UTC. Asia/Bangkok is UTC+7, so 07:30 ICT = 00:30 UTC.
-- Jobs:
--   00:25 UTC daily  → materialize today's recurring task instances
--   00:30 UTC daily  → morning digest DM + post today's shift schedule to group
--   every 15 min     → reminder sweep (due/overdue, not-done, once per task)
--
-- fn_staff_tasks_push wraps the pg_net call to the telegram-push edge function.
-- It authenticates with the project's public anon JWT (same key shipped in the
-- frontend); telegram-push only sends staff their own tasks, so this is low-risk.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fn_staff_tasks_push(p_action TEXT)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT net.http_post(
    url := 'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/telegram-push?action=' || p_action,
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjcWd0Y3Nqb2FjdWt0Y2V3cHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTYwMjUsImV4cCI6MjA4ODE5MjAyNX0.XI08SHEUG6_DQHyrZIUOtgCtEPW8E7tRTtH2Sc0dqzA',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
$$;

COMMENT ON FUNCTION public.fn_staff_tasks_push(TEXT) IS
  'Fire-and-forget pg_net call to the telegram-push edge function (action = morning|schedule|reminders|assign). Used by pg_cron.';

-- Schedule (named jobs — re-running replaces the existing job of the same name).
SELECT cron.schedule('staff-tasks-materialize', '25 0 * * *',
  $$ SELECT public.fn_materialize_recurring_tasks(current_date) $$);

SELECT cron.schedule('staff-tasks-morning', '30 0 * * *',
  $$ SELECT public.fn_staff_tasks_push('morning') $$);

SELECT cron.schedule('staff-tasks-schedule', '30 0 * * *',
  $$ SELECT public.fn_staff_tasks_push('schedule') $$);

SELECT cron.schedule('staff-tasks-reminders', '*/15 * * * *',
  $$ SELECT public.fn_staff_tasks_push('reminders') $$);

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '276a_staff_tasks_cron.sql',
  'claude-code',
  'Phase 3: pg_cron + pg_net scheduled pushes (materialize 00:25 UTC, morning+schedule 00:30 UTC, reminders */15). fn_staff_tasks_push wrapper.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
