-- 374_punctuality_ack_gate.sql
-- Nothing counts against an employee before they signed.
--
-- Caught while smoke-testing mig 371: v_warning_proposals happily suggested
-- warnings for 25 "no clock-in" days in June — for people who were AT WORK
-- every one of those days (staff_attendance says 'worked'). They simply never
-- pressed a button that was not yet part of anyone's job. Issuing a warning on
-- that record would be indefensible, and one such warning is enough to make a
-- labour inspector distrust every other one we ever issue.
--
-- The policy already says this (LEG-004 §3): enforcement starts per employee
-- on the date they sign the acknowledgment (Appendix B). This makes the code
-- say it too. NULL = not signed = no proposals, no unpaid minutes — the
-- dashboard still shows the facts, but they carry no consequence.
--
-- Stored per employee, not as one global date, because signatures arrive one
-- by one and a migrant cook who signs in August must not inherit July.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS punctuality_ack_on date;

COMMENT ON COLUMN staff.punctuality_ack_on IS
  'Date this employee signed the LEG-004 acknowledgment (Appendix B). Lateness before it is recorded but never counted: no warning proposals, no unpaid-minute deductions. NULL = not signed = policy not enforceable against them.';

-- Proposals: only unexcused incidents from the signature date onward.
CREATE OR REPLACE VIEW v_warning_proposals
WITH (security_invoker = true) AS
WITH cfg AS (
  SELECT COALESCE(
    (SELECT value FROM payroll_config WHERE key = 'late_warning_threshold'), 3
  )::int AS threshold
),
monthly AS (
  SELECT
    p.staff_id,
    date_trunc('month', p.shift_date)::date AS period,
    count(*) FILTER (WHERE p.punch_status = 'late')        AS late_count,
    count(*) FILTER (WHERE p.punch_status = 'no_clock_in') AS no_punch_count,
    COALESCE(sum(p.late_minutes), 0)::int                  AS late_minutes_total
  FROM v_shift_punctuality p
  JOIN staff s ON s.id = p.staff_id
  WHERE NOT p.is_excused
    AND p.punch_status IN ('late', 'no_clock_in')
    AND s.punctuality_ack_on IS NOT NULL
    AND p.shift_date >= s.punctuality_ack_on
  GROUP BY p.staff_id, date_trunc('month', p.shift_date)::date
)
SELECT
  m.staff_id,
  m.period,
  m.late_count,
  m.no_punch_count,
  m.late_minutes_total,
  cfg.threshold
FROM monthly m
CROSS JOIN cfg
WHERE (m.late_count + m.no_punch_count) >= cfg.threshold
  AND NOT EXISTS (
    SELECT 1 FROM staff_warnings w
    WHERE w.staff_id = m.staff_id
      AND w.for_period = m.period
  );

GRANT SELECT ON v_warning_proposals TO authenticated;

-- Expose the gate on the per-shift view so the dashboard can show a fact
-- without implying a consequence.
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
) fi ON true;

GRANT SELECT ON v_shift_punctuality TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '374_punctuality_ack_gate.sql',
  'claude-code',
  NULL,
  'staff.punctuality_ack_on gates proposals + unpaid minutes (LEG-004 §3); v_shift_punctuality.is_enforced. Stops pre-policy no-punch history (people who worked but never pressed the button) from generating warnings (task 24ae6b0c)'
)
ON CONFLICT DO NOTHING;
