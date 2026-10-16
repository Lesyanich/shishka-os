-- 458_drop_staff_pin_columns.sql
-- MC 04308003 (follow-up of MC 8ee6783a). CEO 2026-10-09: "удали колонки
-- pin_code и pin_hash".
--
-- Migration 455 emptied staff.pin_code (plaintext PIN) and staff.pin_hash
-- (bcrypt of a 4-digit PIN — brute-forceable) and moved the PIN into Supabase
-- Vault, owner-readable via fn_staff_pin_reveal. The columns stayed only
-- because the admin build then live on main still selected pin_code; PR #592
-- (merged 2026-10-09, 66f7e707) removed that, its production deploy is live,
-- and the last other reader — the never-deployed apps/kds — is deleted in the
-- same PR as this migration.
--
-- Verified before writing: no public function, view or trigger references
-- either column; the live admin bundle contains no "pin_code".

BEGIN;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_no_readable_pin;
ALTER TABLE public.staff DROP COLUMN IF EXISTS pin_code;
ALTER TABLE public.staff DROP COLUMN IF EXISTS pin_hash;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('458_drop_staff_pin_columns.sql', 'claude-opus-session-6d690fa1', 'success',
        'Dropped staff.pin_code and staff.pin_hash (and CHECK staff_no_readable_pin). Emptied in '
     || 'mig 455; PIN lives only in Vault (fn_staff_pin_reveal, owners). Last readers gone: admin '
     || 'build from PR #592 is live, apps/kds deleted. MC 04308003.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN (columns come back empty — the PINs live in Vault now)
-- ---------------------------------------------------------------------------
-- BEGIN;
-- ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS pin_code text;
-- ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS pin_hash text;
-- ALTER TABLE public.staff ADD CONSTRAINT staff_no_readable_pin CHECK (pin_code IS NULL AND pin_hash IS NULL);
-- DELETE FROM public.migration_log WHERE filename='458_drop_staff_pin_columns.sql';
-- COMMIT;
