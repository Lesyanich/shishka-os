-- ============================================================
-- Migration 175: access_audit_log table
--
-- Spec:   MC 6e4b56bf comment #2 (D1/D2/D3 + spec deliverable #2)
-- MC:     6e4b56bf-3a9a-4125-b03a-0b7b1a7107a4
--
-- Append-only audit trail for owner-gated user-management actions
-- (invite, password reset, PIN set/rotate, revoke). Read access is
-- restricted to owners via fn_is_owner(); INSERT happens from the
-- Edge Functions using the service-role key (RLS-bypass by design).
-- ============================================================

BEGIN;

-- ── 1. Table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.access_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id    UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  target_staff_id   UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.access_audit_log'::regclass
      AND conname  = 'access_audit_log_action_check'
  ) THEN
    ALTER TABLE public.access_audit_log
      ADD CONSTRAINT access_audit_log_action_check CHECK (
        action IN ('invite', 'reset_password', 'pin_set', 'pin_rotate', 'revoke')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS access_audit_log_target_idx
  ON public.access_audit_log (target_staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS access_audit_log_actor_idx
  ON public.access_audit_log (actor_staff_id, created_at DESC);

-- ── 2. RLS — owners only can read; nobody can write through PostgREST ─

ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_audit_log_owner_read ON public.access_audit_log;
CREATE POLICY access_audit_log_owner_read
  ON public.access_audit_log
  FOR SELECT
  TO authenticated
  USING (public.fn_is_owner());

-- No INSERT/UPDATE/DELETE policy on purpose: the only sanctioned writer
-- is the service-role client inside Edge Functions, which bypasses RLS.

GRANT SELECT ON public.access_audit_log TO authenticated;

-- ── 3. Helper view: most recent action per target ────────────────────
--    Used by /hr/staff to render "Last rotated 2d ago" without a join.

CREATE OR REPLACE VIEW public.v_staff_access_last AS
  SELECT DISTINCT ON (target_staff_id)
    target_staff_id,
    action          AS last_action,
    created_at      AS last_action_at,
    actor_staff_id  AS last_actor_id
  FROM public.access_audit_log
  WHERE target_staff_id IS NOT NULL
  ORDER BY target_staff_id, created_at DESC;

GRANT SELECT ON public.v_staff_access_last TO authenticated;

-- ── 4. Self-register ────────────────────────────────────────────────

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '175_access_audit_log.sql',
  'claude-opus-session-ec24d346',
  'access_audit_log table + RLS (owner-only read) + v_staff_access_last view. MC 6e4b56bf.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
