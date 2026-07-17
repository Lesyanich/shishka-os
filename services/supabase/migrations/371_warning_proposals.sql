-- 371_warning_proposals.sql
-- The system proposes; only an owner issues.
--
-- CEO decision (2026-07-17): a warning must never appear by itself. The
-- system counts unexcused lates and raises a PROPOSAL; the owner approves it
-- (→ a real warning that starts the §119(4) clock) or dismisses it (→ recorded
-- as considered-and-rejected, so it stops resurfacing every time the page
-- loads). Both outcomes are rows: "we looked at it and decided" is itself part
-- of the employment record.
--
-- Threshold lives in payroll_config (LEG-004 §5 says 3+ per rolling month) so
-- the CEO can retune the policy without a migration.

INSERT INTO payroll_config (key, value, description) VALUES
  ('late_warning_threshold', 3, 'Unexcused lates in a calendar month before the system proposes a warning (LEG-004 §5)')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE staff_warnings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'dismissed')),
  -- Month the proposal was raised for (NULL = warning logged by hand, not
  -- from a punctuality proposal).
  ADD COLUMN IF NOT EXISTS for_period date,
  -- Set when the employee (or a witness) has actually signed the paper. Until
  -- then the warning is decided but not yet served.
  ADD COLUMN IF NOT EXISTS signed_on date;

COMMENT ON COLUMN staff_warnings.status IS
  'approved = live warning, counts for the LPA §119(4) ladder. dismissed = owner reviewed the proposal and rejected it (excused / not warranted); kept so the same month is not re-proposed.';
COMMENT ON COLUMN staff_warnings.signed_on IS
  'Date the employee signed (or a witness attested refusal). An unsigned warning is weak evidence — LEG-004 Appendix A.';

-- Live warnings only: dismissed rows must not gate anything.
CREATE INDEX IF NOT EXISTS idx_staff_warnings_active
  ON staff_warnings (staff_id, expires_on DESC) WHERE status = 'approved';

-- Candidate months that crossed the threshold and have no decision yet.
-- Excused shifts are excluded at the source (v_shift_punctuality.is_excused).
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
  WHERE NOT p.is_excused
    AND p.punch_status IN ('late', 'no_clock_in')
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

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '371_warning_proposals.sql',
  'claude-code',
  NULL,
  'staff_warnings.status/for_period/signed_on + v_warning_proposals (threshold via payroll_config.late_warning_threshold) — system proposes, owner issues (task 24ae6b0c)'
)
ON CONFLICT DO NOTHING;
