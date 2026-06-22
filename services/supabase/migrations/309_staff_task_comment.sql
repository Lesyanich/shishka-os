-- Migration 309 — Task comment field
-- staff_tasks.description holds the instructions (the "Notes" — what to do).
-- `comment` is a separate free-text field for execution feedback / remarks left
-- by staff while doing the task. Additive + idempotent.

ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS comment TEXT;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('309_staff_task_comment.sql', 'claude-code',
  'staff_tasks.comment — free-text execution comment, distinct from description/Notes.')
ON CONFLICT (filename) DO NOTHING;
