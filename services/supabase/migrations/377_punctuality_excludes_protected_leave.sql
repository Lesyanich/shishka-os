-- 377_punctuality_excludes_protected_leave.sql
-- A sick day is not a punctuality incident. Say it in code, not just in prose.
--
-- LEG-004 §6 promises "no reclassification of protected leave — LEG-003 §2
-- stands", but v_shift_punctuality never looked at staff_attendance at all. A
-- day of approved sick leave that still carries a shifts row reads as
-- 'no_clock_in': it fires the Telegram alarm and, once the employee has signed,
-- feeds the §5 ladder. The only thing standing in the way today is an owner
-- remembering to also press "excuse" on a day already recorded as sick — a
-- second manual step for a fact the database already knows.
--
-- Today this is saved by luck: no sick day in the last 120 days happens to
-- have a shift row. But 2 'absent' days DO have shift rows, so shift rows
-- plainly survive non-worked days. The first sick day with a roster entry
-- would put a protected absence into a disciplinary counter — the single
-- fastest way to make a labour inspector distrust every warning we ever issue.
--
-- 'absent' is excluded too (CEO decision 2026-07-17): unexcused full-day
-- absence has its own ladder in LEG-003 §3-4, and LEG-004 §5 already states
-- the two tracks are separate. Counting one absence in both means punishing a
-- single fact twice under two policies — which reads as vindictive rather than
-- procedural, and weakens both ladders.
--
-- Effect: those shifts leave the view entirely. No row, no incident, no alert,
-- no counter, no proposal, no unpaid minutes. What remains is exactly what the
-- policy is about: days the person was expected at work.
--
-- Note the asymmetry with the alarm, and it is intended: staff_attendance for
-- TODAY is usually recorded after the fact, so a person who falls ill this
-- morning still triggers the 09:15 alarm. That is correct — at 09:15 nobody
-- yet knows why the shop is shut. The record catches up later and the incident
-- drops out of the counter by itself.

BEGIN;

CREATE OR REPLACE VIEW v_shift_punctuality
WITH (security_invoker = true) AS
WITH cfg AS (
  SELECT COALESCE(
    (SELECT value FROM payroll_config WHERE key = 'late_grace_minutes'), 10
  )::int AS grace_min
)
SELECT
  sh.id AS shift_id,
  sh.staff_id,
  sh.shift_date,
  sh.start_time,
  sh.end_time,
  fi.first_in_at,
  (fi.first_in_at AT TIME ZONE 'Asia/Bangkok')::time AS first_in_local,
  cfg.grace_min,
  CASE
    WHEN fi.first_in_at IS NOT NULL
         AND (fi.first_in_at AT TIME ZONE 'Asia/Bangkok')
             <= sh.shift_date + sh.start_time + make_interval(mins => cfg.grace_min)
      THEN 'on_time'
    WHEN fi.first_in_at IS NOT NULL
      THEN 'late'
    WHEN (now() AT TIME ZONE 'Asia/Bangkok')
         < sh.shift_date + sh.start_time + make_interval(mins => cfg.grace_min)
      THEN 'pending'
    ELSE 'no_clock_in'
  END AS punch_status,
  CASE
    WHEN fi.first_in_at IS NOT NULL
         AND (fi.first_in_at AT TIME ZONE 'Asia/Bangkok')
             > sh.shift_date + sh.start_time + make_interval(mins => cfg.grace_min)
      THEN CEIL(EXTRACT(EPOCH FROM
             (fi.first_in_at AT TIME ZONE 'Asia/Bangkok')
             - (sh.shift_date + sh.start_time)) / 60)::int
    ELSE 0
  END AS late_minutes,
  (ex.shift_id IS NOT NULL) AS is_excused,
  ex.reason AS excuse_reason,
  -- Enforceable = employee had signed by this shift's date (LEG-004 §3).
  (st.punctuality_ack_on IS NOT NULL AND sh.shift_date >= st.punctuality_ack_on) AS is_enforced
FROM shifts sh
CROSS JOIN cfg
JOIN staff st ON st.id = sh.staff_id
LEFT JOIN attendance_excuses ex ON ex.shift_id = sh.id
LEFT JOIN LATERAL (
  SELECT min(e.event_at) AS first_in_at
  FROM shift_clock_events e
  WHERE e.event_type = 'clock_in'
    AND (
      e.shift_id = sh.id
      OR (e.shift_id IS NULL
          AND e.staff_id = sh.staff_id
          AND (e.event_at AT TIME ZONE 'Asia/Bangkok')::date = sh.shift_date)
    )
) fi ON true
-- The day was not a working day for this person: protected leave (LEG-003 §2),
-- a day off / public holiday, or a full-day absence that belongs to the
-- LEG-003 ladder instead. None of these are punctuality events.
WHERE NOT EXISTS (
  SELECT 1 FROM staff_attendance sa
  WHERE sa.staff_id = sh.staff_id
    AND sa.attendance_date = sh.shift_date
    AND sa.status IN (
      'sick_leave', 'annual_leave', 'personal_leave',
      'maternity_leave', 'paternity_leave',
      'holiday', 'day_off',
      'absent'
    )
);

GRANT SELECT ON v_shift_punctuality TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '377_punctuality_excludes_protected_leave.sql',
  'claude-code',
  NULL,
  'v_shift_punctuality now drops shifts whose staff_attendance says sick/annual/personal/maternity/paternity leave, holiday, day_off or absent. Enforces LEG-004 §6 / LEG-003 §2 in code instead of relying on an owner also pressing "excuse"; absent keeps its own LEG-003 ladder (no double jeopardy). Audit task 1209dafa'
)
ON CONFLICT DO NOTHING;

COMMIT;
