-- 369_staff_opening_critical.sql
-- Scope the no-clock-in alarm to the people whose absence keeps the shop shut.
--
-- Mig 368 wired the alert to fire for EVERY scheduled shift with no clock-in.
-- With punch-clock adoption still at zero that means one DM per rostered staff
-- per day — four false alarms daily, which trains the owner to ignore the
-- channel before the real signal ever arrives. LEG-004 §4 is narrower than the
-- code was: it is about "the employee responsible for opening the shop".
--
-- So: alert on opening-critical staff only (the administrator/cashier who
-- unlocks the door). Everyone else's lateness and missed punches still land on
-- /hr/punctuality — visible, just not a push. A boolean on staff (rather than
-- a hardcoded app_role in the edge function) keeps this as data: when the
-- opener changes, the CEO ticks a box instead of asking for a deploy.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS opening_critical boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN staff.opening_critical IS
  'True = this person opens the shop; a missing clock-in past the grace window DMs the owners (LEG-004 §4, telegram-push?action=attendance). Others surface on /hr/punctuality only.';

-- Seed: the administrator (task_manager tier = cashier who opens) is the
-- current opener. Cooks are not.
UPDATE staff SET opening_critical = true
WHERE is_active AND app_role = 'task_manager';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '369_staff_opening_critical.sql',
  'claude-code',
  NULL,
  'staff.opening_critical flag scopes the no-clock-in Telegram alarm to the shop opener (seeded for task_manager) — prevents 4 false alarms/day pre-adoption (task 24ae6b0c)'
)
ON CONFLICT DO NOTHING;
