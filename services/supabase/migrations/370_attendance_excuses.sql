-- 370_attendance_excuses.sql
-- "Уважительная причина": take an incident out of the discipline counter.
--
-- Without this the counter treats "warned us at 07:00 that the bus broke down"
-- exactly like a silent no-show. That is not just unfair — it is legally
-- fatal: a warning issued over an excused absence collapses in a labour
-- inspection and takes the whole §119(4) ladder down with it. The excuse
-- button exists so the warnings we DO issue are unassailable.
--
-- CEO decision (2026-07-17): owners only (Lesia / Bas). Not the task_manager —
-- the administrator is herself the main subject of this policy, and nobody
-- excuses their own lateness.

CREATE TABLE IF NOT EXISTS attendance_excuses (
  shift_id    uuid PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  excused_by  uuid REFERENCES staff(id),
  excused_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE attendance_excuses IS
  'Owner-approved excuse for one shift (late or no clock-in). Excused shifts leave the warning counter and the unpaid-minutes total (LEG-004 §3/§5).';

ALTER TABLE attendance_excuses ENABLE ROW LEVEL SECURITY;

-- Read: the employee sees their own excuses; owner/task_manager see all.
DROP POLICY IF EXISTS attendance_excuses_select ON attendance_excuses;
CREATE POLICY attendance_excuses_select ON attendance_excuses
  FOR SELECT
  USING (
    (SELECT r.app_role FROM fn_get_my_role() r) IN ('owner', 'task_manager')
    OR EXISTS (
      SELECT 1 FROM shifts sh
      WHERE sh.id = attendance_excuses.shift_id
        AND sh.staff_id = (SELECT r.staff_id FROM fn_get_my_role() r)
    )
  );

-- Write: owners only.
DROP POLICY IF EXISTS attendance_excuses_insert ON attendance_excuses;
CREATE POLICY attendance_excuses_insert ON attendance_excuses
  FOR INSERT WITH CHECK ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

DROP POLICY IF EXISTS attendance_excuses_update ON attendance_excuses;
CREATE POLICY attendance_excuses_update ON attendance_excuses
  FOR UPDATE USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

DROP POLICY IF EXISTS attendance_excuses_delete ON attendance_excuses;
CREATE POLICY attendance_excuses_delete ON attendance_excuses
  FOR DELETE USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_excuses TO authenticated;

-- Rebuild the view with is_excused appended (CREATE OR REPLACE keeps the
-- existing column order; new columns may only be added at the end).
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
  ex.reason AS excuse_reason
FROM shifts sh
CROSS JOIN cfg
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
  '370_attendance_excuses.sql',
  'claude-code',
  NULL,
  'attendance_excuses (owner-only) + v_shift_punctuality.is_excused/excuse_reason — excused incidents leave the counter and unpaid minutes (LEG-004, task 24ae6b0c)'
)
ON CONFLICT DO NOTHING;
