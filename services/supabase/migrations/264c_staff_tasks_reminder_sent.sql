-- Migration 266 — reminder dedupe for the staff task tracker (Phase 2/3).
-- reminder_sent_at lets the reminder sweep (telegram-push?action=reminders, run
-- by pg_cron in Phase 3) fire at most once per task. Cleared whenever the task
-- is rescheduled so a moved task can remind again.

BEGIN;

ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '264c_staff_tasks_reminder_sent.sql',
  'claude-code',
  'Add staff_tasks.reminder_sent_at for idempotent reminder pushes.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
