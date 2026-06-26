-- 315_staff_tasks_draft_status.sql
-- Add a 'draft' status to staff_tasks for the Telegram bot's AI task-intake
-- (bot v2 Phase C). A staff member describes work in free text -> the bot's AI
-- structures it and stores it as a draft row -> an owner/task_manager approves &
-- assigns it from Telegram, which flips status 'draft' -> 'todo' and reuses the
-- existing assignment DM.
--
-- WHY a row vs a new table: a draft has the exact shape of a task, so reusing
-- staff_tasks keeps a single write path and a trivial approve transition.
-- Draft rows stay out of staff-facing views: the bot's today/team queries
-- already filter `status NOT IN ('cancelled','draft')`, and morning/reminder
-- pushes only consider ('todo','in_progress').
--
-- Numbering: repo HEAD max is 313; 314 is taken in prod by the unmerged
-- auth-hardening branch (314_lock_staff_writes_and_set_pin_rpc.sql), so this is
-- numbered 315 to avoid that collision.

ALTER TABLE public.staff_tasks DROP CONSTRAINT IF EXISTS staff_tasks_status_check;
ALTER TABLE public.staff_tasks
  ADD CONSTRAINT staff_tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'done', 'skipped', 'cancelled', 'draft'));

-- Self-register in the migration ledger (NULL checksum by convention). Idempotent.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '315_staff_tasks_draft_status.sql',
  'claude-code',
  NULL,
  'Add draft status to staff_tasks for Telegram bot AI task-intake owner-approval flow (bot v2 Phase C)'
)
ON CONFLICT DO NOTHING;
