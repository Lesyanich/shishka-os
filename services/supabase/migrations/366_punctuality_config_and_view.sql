-- 366_punctuality_config_and_view.sql
-- Lateness reconciliation: planned shifts × clock punches → per-shift punctuality.
--
-- Foundation for the attendance-control system (policy LEG-004,
-- docs/domain/working-hours-punctuality-policy.md). Mig 355 made fn_clock link
-- punches to the day's shift; nothing ever read them back. This view computes,
-- per scheduled shift: on_time / late (with minutes) / pending / no_clock_in.
--
-- Design decisions:
-- * Grace period lives in payroll_config ('late_grace_minutes', default 10) —
--   CEO-tunable without a migration; the view COALESCEs to 10 if the row is
--   missing or unreadable.
-- * late_minutes counts from the SCHEDULED start_time (grace only decides
--   whether a punch is late at all — once late, the full delta counts; stated
--   in LEG-004 §3).
-- * 'pending' = shift start + grace not reached yet (Asia/Bangkok clock), so
--   today's not-yet-started shifts don't read as no_clock_in.
-- * Punch matching: by shift_id (mig 355 path) OR fallback by staff_id +
--   Bangkok-local date for shift_id-NULL punches (pre-355 or unscheduled).
--   With two shifts on one day the fallback could attach one punch to both —
--   accepted; mirrors mig 355's earliest-shift heuristic and is rare.
-- * security_invoker: RLS on shift_clock_events applies to the caller, so a
--   cook sees colleagues as no_clock_in (their punches are hidden). Harmless:
--   the view is consumed only by /hr/punctuality (owner/task_manager see all
--   punches) and the cron alert (service role bypasses RLS).
-- * Deliberately does NOT write shifts.status ('no_show' enum value) and does
--   NOT touch staff_attendance / fn_calculate_payroll — stateless read model.

INSERT INTO payroll_config (key, value, description) VALUES
  ('late_grace_minutes', 10, 'Grace period (min) after shift start before a clock-in counts as late (LEG-004 §3)')
ON CONFLICT (key) DO NOTHING;

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
  END AS late_minutes
FROM shifts sh
CROSS JOIN cfg
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

-- Self-register in the migration ledger (NULL checksum by convention — see
-- check-migrations.ts). Idempotent.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '366_punctuality_config_and_view.sql',
  'claude-code',
  NULL,
  'v_shift_punctuality (on_time/late/pending/no_clock_in + late_minutes, grace via payroll_config.late_grace_minutes) — LEG-004 attendance control (task 24ae6b0c)'
)
ON CONFLICT DO NOTHING;
