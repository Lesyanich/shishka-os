-- 368_attendance_alerts_cron.sql
-- "The shop didn't open" alarm: Telegram the owners when a scheduled shift has
-- no clock-in past its grace window (policy LEG-004 §4).
--
-- v_shift_punctuality (mig 366) already encodes the trigger — a shift only
-- flips to 'no_clock_in' once start_time + grace has passed in Asia/Bangkok —
-- so the cron just sweeps and pushes. attendance_alerts is the dedupe ledger
-- (PK on shift_id → at most one alert per shift, ever); the edge function
-- inserts a row only after a successful send, so a failed push retries on the
-- next sweep instead of being silently swallowed.
--
-- Reuses fn_staff_tasks_push (mig 276a) — the pg_net + auth plumbing already
-- exists; this adds no new secrets or URLs.

BEGIN;

CREATE TABLE IF NOT EXISTS attendance_alerts (
  shift_id  uuid PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  sent_at   timestamptz NOT NULL DEFAULT now()
);

-- Written exclusively by the edge function (service role, bypasses RLS).
-- RLS on with no policies = no client can read or write it; owners see the
-- underlying facts on /hr/punctuality instead.
ALTER TABLE attendance_alerts ENABLE ROW LEVEL SECURITY;

-- Sweep every 15 min from 02:00–11:45 UTC = 09:00–18:45 ICT, covering every
-- shift start in the roster (earliest 09:00 ICT) without waking at night.
SELECT cron.schedule('attendance-no-show', '*/15 2-11 * * *',
  $$ SELECT public.fn_staff_tasks_push('attendance') $$);

INSERT INTO public.migration_log (filename, applied_by, checksum, notes)
VALUES (
  '368_attendance_alerts_cron.sql',
  'claude-code',
  NULL,
  'attendance_alerts dedupe ledger + cron attendance-no-show (*/15 2-11 UTC = 09:00-18:45 ICT) → telegram-push?action=attendance — LEG-004 §4 shop-not-opened alarm (task 24ae6b0c)'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
