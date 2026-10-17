-- 519 — fn_db_audit_snapshot becomes SECURITY DEFINER: service_role cannot read schema cron
--       (MC 37f5dcaa, epic db-reliability 7352e57c)
--
-- FOUND BY THE FIRST REAL RUN, which is the only reason the CEO asked for it to be manual.
-- scripts/db-audit.sh calls fn_db_audit_snapshot over PostgREST as service_role and got:
--
--   {code:42501, message:permission denied for schema cron}
--
-- The function reads cron.job_run_details (7-day failure counts) and cron.job (jobs missing
-- from cron_job_catalog). Migration 498 created it SECURITY INVOKER, so it runs with the
-- caller's rights — and service_role has no USAGE on schema cron; only postgres does. The
-- nightly cron path would have worked, because cron runs as postgres. The weekly audit path
-- could never have worked. It would have failed every Monday, and the only symptom would have
-- been a scheduled session reporting an error nobody reads.
--
-- WHY THE LOCAL FIXTURE MISSED IT, recorded so the next person does not repeat it: the PG14
-- fixture applied and ran everything as the owning superuser, where INVOKER and DEFINER are
-- indistinguishable. A permission bug needs a second, weaker role to show up. Testing
-- behaviour locally is not the same as testing authorisation.
--
-- THE FIX, and the narrow reasoning for it. fn_db_audit_snapshot becomes SECURITY DEFINER,
-- owned by postgres, which is what every other cron-touching function in this database
-- already is (fn_staff_tasks_push, fn_materialize_recurring_tasks, fn_sync_loyverse_payouts_to_ledger).
-- It only ever reads system catalogs and INSERTs into its own table, so DEFINER buys it the
-- cron read and nothing else. Grants stay exactly as 498 set them — PUBLIC revoked,
-- service_role only — so widening the rights of the function does not widen who may call it.
--
-- Granting service_role USAGE on schema cron was the alternative and is worse: it would hand
-- every REST caller with the service key the ability to read and schedule cron jobs, to fix
-- one read in one function.
--
-- NOT CHANGED: fn_db_audit_delta stays SECURITY INVOKER. It reads only public.db_audit_snapshots,
-- which service_role can read on its own. fn_log_retention also stays INVOKER on purpose — it
-- deletes rows and drops tables, so if its grant is ever widened by mistake, invoker rights
-- mean RLS and table privileges still apply. DEFINER here is the exception that one missing
-- read justifies, not a new default.

BEGIN;

ALTER FUNCTION public.fn_db_audit_snapshot(jsonb) SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_db_audit_snapshot(jsonb) IS
  'Takes one weekly DB audit snapshot into db_audit_snapshots: db size, top-20 table sizes, unused non-unique indexes, 7-day cron failures, leftover *_bak*/_old/_tmp tables outside schema backup, storage bytes, capped retention runs, and cron jobs missing from cron_job_catalog. p_advisors carries the MCP get_advisors output (array of findings) so advisor lints are stored and diffed the same way. Returns the run_at to pass to fn_db_audit_delta. SECURITY DEFINER since migration 519: it reads schema cron, which service_role has no USAGE on, and the weekly audit calls it as service_role over PostgREST. Reads catalogs and writes only its own table; PUBLIC has no EXECUTE. Owner: tech/db-reliability (MC 37f5dcaa).';

-- restate the grants so a replay onto a database that never saw 498 is still safe
REVOKE ALL ON FUNCTION public.fn_db_audit_snapshot(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_db_audit_snapshot(jsonb) TO service_role;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '519_audit_snapshot_security_definer.sql',
  'claude-code',
  NULL,
  'fn_db_audit_snapshot -> SECURITY DEFINER: as INVOKER it failed with "permission denied for schema cron" when the weekly audit called it as service_role over PostgREST. Found by the first manual run (MC 37f5dcaa). Grants unchanged: PUBLIC revoked, service_role only.'
)
ON CONFLICT DO NOTHING;

COMMIT;
