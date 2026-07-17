-- 376_staff_warnings_owner_only_writes.sql
-- "The system proposes; only an owner issues" — now actually true.
--
-- Mig 371 opens with exactly that sentence, but it never touched RLS, and mig
-- 367 had already granted INSERT/UPDATE on staff_warnings to task_manager.
-- Only DELETE was owner-only. The result is worse than a missing safeguard:
-- Mint (task_manager) is the main subject of LEG-004, and she can INSERT a row
-- for herself with status='dismissed' and for_period=<her bad month>.
-- v_warning_proposals hides any month that already carries a warning row —
-- so the proposal vanishes from the owner's dashboard permanently. She never
-- needs DELETE; filing the decision is enough to bury it.
--
-- The /hr/punctuality page is owner-gated, but that gate is a client-side
-- redirect (RoleGuard → Navigate). It stops a menu click, not a POST.
--
-- A warning is a legal record that leads to §119(4) dismissal without
-- severance. Writing one — or deciding not to — is an owner act. This is the
-- narrow fix: SELECT is untouched (the administrator still needs to see the
-- team's register to do her job), only the write side closes.

BEGIN;

DROP POLICY IF EXISTS staff_warnings_insert ON staff_warnings;
CREATE POLICY staff_warnings_insert ON staff_warnings
  FOR INSERT
  WITH CHECK ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

DROP POLICY IF EXISTS staff_warnings_update ON staff_warnings;
CREATE POLICY staff_warnings_update ON staff_warnings
  FOR UPDATE
  USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

-- DELETE was already owner-only (mig 367) — left as is.

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '376_staff_warnings_owner_only_writes.sql',
  'claude-code',
  NULL,
  'staff_warnings INSERT/UPDATE → owner only (was owner+task_manager since mig 367). Stops the subject of LEG-004 from filing a status=dismissed row for her own month and burying the proposal forever; enforces what mig 371 only declared. SELECT unchanged. Audit task 1209dafa'
)
ON CONFLICT DO NOTHING;

COMMIT;
