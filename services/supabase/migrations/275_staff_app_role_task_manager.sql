-- Migration 275 — add 'task_manager' app_role tier (staff task tracker).
--
-- A task_manager logs into the admin panel but sees ONLY the Staff Tasks page
-- (not finance/menu/etc.). Lets e.g. the cashier (Mint) distribute tasks without
-- full owner access. Enforced in the UI (RoleGuard) + this CHECK widening.

BEGIN;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_app_role_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_app_role_check CHECK (app_role IN ('owner', 'cook', 'task_manager'));

-- A task_manager logs in with an email (like an owner). Widen the credential
-- constraint to permit it, but only if that constraint exists (it ships with the
-- separate user-management feature; guard so fresh installs without it don't fail).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_role_credential_check') THEN
    ALTER TABLE public.staff DROP CONSTRAINT staff_role_credential_check;
    ALTER TABLE public.staff ADD CONSTRAINT staff_role_credential_check CHECK (
      auth_user_id IS NULL
      OR (app_role = 'owner' AND email IS NOT NULL)
      OR (app_role = 'task_manager' AND email IS NOT NULL)
      OR (app_role = 'cook' AND pin_hash IS NOT NULL)
    ) NOT VALID;
  END IF;
END $$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '275_staff_app_role_task_manager.sql',
  'claude-code',
  'Add task_manager to staff.app_role CHECK — scoped admin role that sees only Staff Tasks.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
