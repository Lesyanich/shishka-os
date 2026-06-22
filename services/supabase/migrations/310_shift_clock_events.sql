-- 310_shift_clock_events.sql
-- Shift clock-in/out punch log for the cook-facing Staff schedule page.
--
-- Append-only audit trail. The ONLY sanctioned write path is fn_clock()
-- (SECURITY DEFINER), which attributes every punch to the authenticated
-- user's staff_id via fn_get_my_role() — never a client-supplied id, so a
-- cook cannot punch as someone else. Reuses staff + shifts; deliberately
-- does NOT touch staff_attendance/payroll in v1 (status is derived from
-- events; payroll reconciliation is a later enhancement).

CREATE TABLE IF NOT EXISTS shift_clock_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id),
  shift_id    uuid REFERENCES shifts(id),
  event_type  text NOT NULL CHECK (event_type IN ('clock_in', 'clock_out')),
  event_at    timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL DEFAULT 'admin-web',
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_clock_events_staff_at
  ON shift_clock_events (staff_id, event_at DESC);

ALTER TABLE shift_clock_events ENABLE ROW LEVEL SECURITY;

-- Read: a staff member sees only their own punches; owner/task_manager see all.
DROP POLICY IF EXISTS clock_events_select ON shift_clock_events;
CREATE POLICY clock_events_select ON shift_clock_events
  FOR SELECT
  USING (
    staff_id = (SELECT r.staff_id FROM fn_get_my_role() r)
    OR (SELECT r.app_role FROM fn_get_my_role() r) IN ('owner', 'task_manager')
  );

-- The sanctioned, spoof-proof write path. Resolves staff from auth.uid().
CREATE OR REPLACE FUNCTION fn_clock(p_event_type text, p_note text DEFAULT NULL)
RETURNS shift_clock_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_row      shift_clock_events;
BEGIN
  IF p_event_type NOT IN ('clock_in', 'clock_out') THEN
    RAISE EXCEPTION 'invalid event_type: %', p_event_type;
  END IF;

  SELECT r.staff_id INTO v_staff_id FROM fn_get_my_role() r;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'no linked staff for current user — ask the owner to link your login';
  END IF;

  INSERT INTO shift_clock_events (staff_id, event_type, note)
  VALUES (v_staff_id, p_event_type, p_note)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT SELECT ON shift_clock_events TO authenticated;
GRANT EXECUTE ON FUNCTION fn_clock(text, text) TO authenticated;

-- Self-register in the migration ledger (NULL checksum by convention — see
-- check-migrations.ts; md5-of-own-contents is chicken-and-egg). Idempotent.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '310_shift_clock_events.sql',
  'claude-code',
  NULL,
  'shift_clock_events + fn_clock() SECURITY DEFINER + RLS for cook-facing Staff schedule clock-in/out (task 5c0b7433)'
)
ON CONFLICT DO NOTHING;
