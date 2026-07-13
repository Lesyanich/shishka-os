-- 355_fn_clock_link_shift.sql
-- Make the shift clock-in/out meaningful: link each punch to that day's shift.
--
-- v1 (migration 310) inserted punches with shift_id = NULL and never resolved
-- the shift, so shift_clock_events was a dead-end log — no way to reconcile a
-- punch against the planned shift (late / no-show / actual hours). This wires
-- the foundation for factual time-tracking: fn_clock now resolves the caller's
-- shift for TODAY (shop-local date, Asia/Bangkok — CURRENT_DATE would use the
-- UTC session tz and pick the wrong day for early-morning punches) and stores
-- its id. Still spoof-proof: staff_id comes from fn_get_my_role(), never the
-- client. Behaviour is unchanged when there is no shift (shift_id stays NULL).

CREATE OR REPLACE FUNCTION fn_clock(p_event_type text, p_note text DEFAULT NULL)
RETURNS shift_clock_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_shift_id uuid;
  v_row      shift_clock_events;
BEGIN
  IF p_event_type NOT IN ('clock_in', 'clock_out') THEN
    RAISE EXCEPTION 'invalid event_type: %', p_event_type;
  END IF;

  SELECT r.staff_id INTO v_staff_id FROM fn_get_my_role() r;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'no linked staff for current user — ask the owner to link your login';
  END IF;

  -- Link the punch to today's shift (shop-local date), if one is scheduled.
  SELECT sh.id INTO v_shift_id
  FROM shifts sh
  WHERE sh.staff_id = v_staff_id
    AND sh.shift_date = (now() AT TIME ZONE 'Asia/Bangkok')::date
  ORDER BY sh.start_time
  LIMIT 1;

  INSERT INTO shift_clock_events (staff_id, shift_id, event_type, note)
  VALUES (v_staff_id, v_shift_id, p_event_type, p_note)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Self-register in the migration ledger (NULL checksum by convention — see
-- check-migrations.ts). Idempotent.
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '355_fn_clock_link_shift.sql',
  'claude-code',
  NULL,
  'fn_clock resolves + stores shift_id for the caller''s Asia/Bangkok-local shift (foundation for factual time-tracking); spoof-proof staff_id unchanged (task 7e355fe5 P2)'
)
ON CONFLICT DO NOTHING;
