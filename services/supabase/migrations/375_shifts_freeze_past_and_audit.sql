-- 375_shifts_freeze_past_and_audit.sql
-- The yardstick may not be moved by the person being measured with it.
--
-- `shifts.start_time` is what lateness is measured against, and RLS on shifts
-- is `auth.role() = 'authenticated'` — i.e. ANY logged-in user can UPDATE or
-- DELETE any shift. Mint is a task_manager with an admin login AND the main
-- subject of LEG-004: she could move yesterday's 09:00 start to 11:00, or
-- simply delete the shift row, and the incident disappears — with no trace,
-- because shifts carries no audit trail (updated_at only, no actor, no history).
--
-- The obvious fix (owner-only writes) would revert a CEO decision: on
-- 2026-07-03 ("пусть Минт рулит без обязательного одобрения владельца",
-- PR os#480) the schedule editor was deliberately moved to task_manager so the
-- administrator plans the roster without an owner in the loop. That decision
-- stands; planning the roster IS her job.
--
-- CEO decision (2026-07-17), audit round 2: freeze the past instead. Planning
-- looks forward; rewriting a shift whose start time has already passed is not
-- planning, it is editing history. So a non-owner may create and rearrange
-- shifts freely UNTIL the moment a shift starts — after that only an owner can
-- touch it. Every change is written to shifts_audit regardless of who made it.
--
-- Deliberately NOT guarded:
-- * INSERT — a new past shift erases nothing (shifts has no unique on
--   staff_id+date, fn_clock binds the earliest shift, and a shift that never
--   existed carries no incident). Guarding it would break
--   BulkScheduleGenerator whenever the generated range includes today.
-- * Moving a FUTURE shift (e.g. tomorrow 09:00 → 11:00). That is a real
--   rescheduling power the administrator legitimately has, and per LEG-004 §1
--   schedule changes are announced ahead. It is now on the record in
--   shifts_audit — an open, attributable act rather than a silent erasure.
-- * auth.uid() IS NULL → service role, pg_cron, psql or a migration. Those
--   already passed RLS (anon cannot write shifts), so they are trusted server
--   paths; blocking them would break data-ops backfills.

BEGIN;

-- ─── Audit trail ────────────────────────────────────────────────────────────
-- No FK to shifts(id): ON DELETE would cascade away exactly the evidence we
-- are keeping. The shift may be gone; the record that someone deleted it stays.
CREATE TABLE IF NOT EXISTS shifts_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id       uuid NOT NULL,
  action         text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  actor_uid      uuid,
  actor_staff_id uuid REFERENCES staff(id),
  changed_at     timestamptz NOT NULL DEFAULT now(),
  old_row        jsonb,
  new_row        jsonb
);

COMMENT ON TABLE shifts_audit IS
  'Append-only history of every shifts INSERT/UPDATE/DELETE with its actor (LEG-004). No FK to shifts: a deleted shift must not take its own audit trail with it. Written only by trg_shifts_audit; owners read.';
COMMENT ON COLUMN shifts_audit.actor_uid IS
  'auth.uid() of whoever made the change. NULL = a server path (service role / pg_cron / migration), not a person.';

CREATE INDEX IF NOT EXISTS idx_shifts_audit_shift ON shifts_audit (shift_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_audit_when  ON shifts_audit (changed_at DESC);

ALTER TABLE shifts_audit ENABLE ROW LEVEL SECURITY;

-- Owners read the history. Nobody writes it from a client: the trigger is
-- SECURITY DEFINER and bypasses RLS, so no INSERT policy exists on purpose —
-- an audit trail a user can forge is not an audit trail.
DROP POLICY IF EXISTS shifts_audit_select ON shifts_audit;
CREATE POLICY shifts_audit_select ON shifts_audit
  FOR SELECT
  USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

GRANT SELECT ON shifts_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_shifts_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff uuid;
BEGIN
  SELECT r.staff_id INTO v_staff FROM fn_get_my_role() r;

  INSERT INTO shifts_audit (shift_id, action, actor_uid, actor_staff_id, old_row, new_row)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    lower(TG_OP),
    auth.uid(),
    v_staff,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$function$;

DROP TRIGGER IF EXISTS trg_shifts_audit ON shifts;
CREATE TRIGGER trg_shifts_audit
  AFTER INSERT OR UPDATE OR DELETE ON shifts
  FOR EACH ROW EXECUTE FUNCTION public.fn_shifts_audit();

-- ─── Freeze the past ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_shifts_guard_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now    timestamp := (now() AT TIME ZONE 'Asia/Bangkok');
  v_start  timestamp := OLD.shift_date + OLD.start_time;
BEGIN
  -- Owners may correct history (that is what an owner is for). Server paths
  -- (auth.uid() IS NULL) are trusted: they already cleared RLS.
  IF auth.uid() IS NULL OR fn_is_owner() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_start <= v_now THEN
    RAISE EXCEPTION
      'Shift % (% ICT) has already started — only an owner can change or delete a shift after its start time (LEG-004 §1).',
      OLD.id, to_char(v_start, 'YYYY-MM-DD HH24:MI')
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

COMMENT ON FUNCTION public.fn_shifts_guard_started() IS
  'Blocks non-owners from UPDATE/DELETE of a shift whose scheduled start has passed (Asia/Bangkok). Keeps the administrator''s roster-planning rights (PR os#480) while stopping retroactive edits to the yardstick lateness is measured against (LEG-004).';

DROP TRIGGER IF EXISTS trg_shifts_guard_started ON shifts;
CREATE TRIGGER trg_shifts_guard_started
  BEFORE UPDATE OR DELETE ON shifts
  FOR EACH ROW EXECUTE FUNCTION public.fn_shifts_guard_started();

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '375_shifts_freeze_past_and_audit.sql',
  'claude-code',
  NULL,
  'shifts_audit (who/what/when, no FK so deletions keep their trace) + trg_shifts_guard_started: non-owners cannot UPDATE/DELETE a shift once its start has passed. Closes the "subject of LEG-004 can move her own yardstick" hole without reverting Mint''s direct schedule editing (PR os#480). Audit task 1209dafa'
)
ON CONFLICT DO NOTHING;

COMMIT;
