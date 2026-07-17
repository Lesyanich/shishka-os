-- 367_staff_warnings.sql
-- Disciplinary warnings register (policy LEG-004 §5 / LEG-003 §3).
--
-- Thai LPA §119(4): dismissal without severance for violation of work rules
-- requires a prior WRITTEN warning, valid 1 year from the violation date.
-- Verbal warnings carry no §119(4) weight but are logged for the pattern
-- record. expires_on is a generated column (issued_on + 1 year) so "active
-- warning" checks can't drift from the statute.
--
-- RLS mirrors shift_clock_events: staff see their own warnings,
-- owner/task_manager see and manage all; DELETE is owner-only (a warning is
-- a legal record — removal is an owner-level correction, not routine edit).

CREATE TABLE IF NOT EXISTS staff_warnings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id),
  kind        text NOT NULL CHECK (kind IN ('verbal', 'written_1', 'written_2_final')),
  issued_on   date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Bangkok')::date),
  expires_on  date GENERATED ALWAYS AS ((issued_on + INTERVAL '1 year')::date) STORED,
  reason      text NOT NULL,
  doc_url     text,
  notes       text,
  issued_by   uuid REFERENCES staff(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_warnings_staff
  ON staff_warnings (staff_id, expires_on DESC);

ALTER TABLE staff_warnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_warnings_select ON staff_warnings;
CREATE POLICY staff_warnings_select ON staff_warnings
  FOR SELECT
  USING (
    staff_id = (SELECT r.staff_id FROM fn_get_my_role() r)
    OR (SELECT r.app_role FROM fn_get_my_role() r) IN ('owner', 'task_manager')
  );

DROP POLICY IF EXISTS staff_warnings_insert ON staff_warnings;
CREATE POLICY staff_warnings_insert ON staff_warnings
  FOR INSERT
  WITH CHECK (
    (SELECT r.app_role FROM fn_get_my_role() r) IN ('owner', 'task_manager')
  );

DROP POLICY IF EXISTS staff_warnings_update ON staff_warnings;
CREATE POLICY staff_warnings_update ON staff_warnings
  FOR UPDATE
  USING (
    (SELECT r.app_role FROM fn_get_my_role() r) IN ('owner', 'task_manager')
  );

DROP POLICY IF EXISTS staff_warnings_delete ON staff_warnings;
CREATE POLICY staff_warnings_delete ON staff_warnings
  FOR DELETE
  USING (
    (SELECT r.app_role FROM fn_get_my_role() r) = 'owner'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON staff_warnings TO authenticated;

-- Self-register in the migration ledger (NULL checksum by convention — see
-- check-migrations.ts). Idempotent.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '367_staff_warnings.sql',
  'claude-code',
  NULL,
  'staff_warnings register (verbal/written_1/written_2_final, 1yr expiry per LPA §119(4)) + RLS — LEG-004 discipline ladder (task 24ae6b0c)'
)
ON CONFLICT DO NOTHING;
