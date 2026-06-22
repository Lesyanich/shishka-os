-- Migration 308 — backfill staff.email from auth.users + validate credential check.
--
-- BUG: editing Bas (or any auth-linked staffer) in the Staff tab failed with
--   "new row for relation \"staff\" violates check constraint \"staff_role_credential_check\""
--
-- ROOT CAUSE: staff_role_credential_check requires a login-capable staffer
-- (auth_user_id IS NOT NULL) to carry the credential matching their app_role:
--   owner/task_manager -> email,  cook -> pin_hash.
-- It was added NOT VALID, so Bas's pre-existing row (app_role='owner',
-- auth account bas@shishka.health, but staff.email NULL — never synced from
-- auth.users) was grandfathered in. NOT VALID still enforces on every UPDATE,
-- so ANY edit to his row re-checks the constraint and fails — regardless of
-- which column changed.
--
-- FIX:
--   1. Backfill staff.email from the linked auth.users.email wherever it is
--      missing (idempotent; today this touches only Bas).
--   2. VALIDATE the constraint to remove the NOT VALID landmine so no future
--      grandfathered violators can exist.

BEGIN;

-- 1. Sync the login email onto the staff row for anyone linked to an auth user
--    but missing staff.email.
UPDATE public.staff s
SET email = u.email
FROM auth.users u
WHERE u.id = s.auth_user_id
  AND s.email IS NULL
  AND u.email IS NOT NULL;

-- 2. All rows now satisfy the credential rule; promote NOT VALID -> validated.
ALTER TABLE public.staff VALIDATE CONSTRAINT staff_role_credential_check;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '308_backfill_staff_email_from_auth.sql',
  'claude-code',
  'Backfill staff.email from auth.users (fixes Bas owner row with NULL email blocking all edits) + VALIDATE staff_role_credential_check.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
