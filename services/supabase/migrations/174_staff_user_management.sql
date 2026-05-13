-- ============================================================
-- Migration 174: Staff user-management columns
--
-- Spec:   MC 6e4b56bf comment #2 (D1/D2/D3 + spec deliverable #1)
-- MC:     6e4b56bf-3a9a-4125-b03a-0b7b1a7107a4
--
-- Adds three columns to support self-serve invite/PIN flows from /hr/staff:
--   email         TEXT NULL  — owner-tier identity (Supabase Auth email)
--   pin_hash      TEXT NULL  — cook-tier bcrypt hash via pgcrypto crypt()
--                              (separate from legacy pin_code which we leave alone)
--   pin_set_at    TIMESTAMPTZ NULL — last time PIN was created/rotated
--
-- Partial constraint enforces that a *linked* row (auth_user_id present)
-- always has a credential matching its role:
--   owner  -> email present
--   cook   -> pin_hash present
-- During onboarding (auth_user_id IS NULL) both creds can be null.
--
-- D2: staff.app_role CHECK constraint is NOT modified.
-- ============================================================

BEGIN;

-- ── 1. Columns ──────────────────────────────────────────────────────

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS pin_hash   TEXT;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ;

-- Unique email so we don't accidentally re-link two staff rows to the
-- same Supabase auth user. Allow NULL for not-yet-invited rows.
CREATE UNIQUE INDEX IF NOT EXISTS staff_email_unique
  ON public.staff (lower(email))
  WHERE email IS NOT NULL;

-- ── 2. Role-credential constraint ────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff'::regclass
      AND conname  = 'staff_role_credential_check'
  ) THEN
    ALTER TABLE public.staff
      ADD CONSTRAINT staff_role_credential_check CHECK (
        auth_user_id IS NULL
        OR (app_role = 'owner' AND email    IS NOT NULL)
        OR (app_role = 'cook'  AND pin_hash IS NOT NULL)
      ) NOT VALID;
    -- NOT VALID first so existing rows that pre-date this constraint
    -- (e.g. Bas: owner+linked but no email yet) don't break the migration.
    -- The constraint is enforced on all NEW writes immediately.
  END IF;
END $$;

-- ── 3. Self-register ────────────────────────────────────────────────

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '174_staff_user_management.sql',
  'claude-opus-session-ec24d346',
  'Add email/pin_hash/pin_set_at to staff for user-management UI. NOT VALID role-credential constraint. MC 6e4b56bf.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
