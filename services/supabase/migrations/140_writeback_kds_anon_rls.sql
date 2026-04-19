-- Migration 140: writeback KDS anon SELECT RLS policies
-- MC Task: af26e9a4-a39d-4cca-970f-a42685d852ff
-- Follow-up: f73da9fa-a6b7-4ca7-88bf-5266f653977b (auth hardening → migration 141)
-- Date: 2026-04-19
-- Strategic decision: CEO approved variant A (2026-04-14)
--
-- Codifies three anon-SELECT policies applied to prod via psql during the
-- KDS 3.2 session (2026-04-13) without a migration file:
--
--   - staff_read_anon          ON public.staff
--   - kds_anon_read            ON public.production_tasks
--   - nomenclature_anon_read   ON public.nomenclature
--
-- KNOWN REGRESSION: staff_read_anon was intentionally DROPPED in migration
-- 109_rls_audit_fixes.sql (line 96) as part of a security tightening pass
-- after the repo went public. Re-introducing it here is a documented
-- regression. The KDS PWA currently authenticates cooks via PIN held in
-- React state — not a Supabase auth session — so anon SELECT on staff /
-- production_tasks / nomenclature is required for the PWA to function.
--
-- Migration 126_staff_auth_role.sql introduced staff.auth_user_id and the
-- staff_auth_role infrastructure but the PWA login flow was never wired
-- through it. Follow-up task f73da9fa-a6b7-4ca7-88bf-5266f653977b covers
-- the rework + revoke in migration 141.
--
-- Apply semantics: idempotent. On prod this should be a no-op because the
-- policies already exist (applied 2026-04-13). The DROP IF EXISTS +
-- CREATE pattern makes the file safe to replay on a fresh environment.

BEGIN;

-- ============================================================
-- staff.staff_read_anon — cooks must list themselves on the PIN login screen
-- ============================================================
DROP POLICY IF EXISTS "staff_read_anon" ON public.staff;
CREATE POLICY "staff_read_anon"
  ON public.staff FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- production_tasks.kds_anon_read — cook dashboard reads tasks assigned to them
-- ============================================================
DROP POLICY IF EXISTS "kds_anon_read" ON public.production_tasks;
CREATE POLICY "kds_anon_read"
  ON public.production_tasks FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- nomenclature.nomenclature_anon_read — step wizard resolves dish metadata
-- ============================================================
DROP POLICY IF EXISTS "nomenclature_anon_read" ON public.nomenclature;
CREATE POLICY "nomenclature_anon_read"
  ON public.nomenclature FOR SELECT
  TO anon
  USING (true);

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '140_writeback_kds_anon_rls.sql',
  'claude-code',
  NULL,
  'Writeback 3 anon SELECT policies from KDS 3.2 session (staff_read_anon, kds_anon_read, nomenclature_anon_read). Known regression from migration 109. Follow-up: MC f73da9fa (auth hardening + revoke in mig 141).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
