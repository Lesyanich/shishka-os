-- 501_http_extension_anon_exposure_status.sql
--
-- MC 16ad5772 (critical) — follow-up to migration 490 / MC f133850a.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- ------------------------------------------------------------------------------
-- It does not close the `http` hole. It cannot. Measured against prod 2026-10-17:
--
--   pg_has_role('postgres', extowner, 'USAGE') = false   -- extension owner is supabase_admin
--   postgres holds no WITH GRANT OPTION                   -- proacl has no `postgres=X*/`
--   every grantor in proacl                = supabase_admin
--
-- DROP EXTENSION and ALTER EXTENSION SET SCHEMA both require extension ownership;
-- REVOKE requires being the grantor. All three routes therefore need `supabase_admin`,
-- which we do not have and cannot obtain from a migration. Migration 490 already
-- attempts the revoke and raises a WARNING so the apply log is honest about the gap.
-- The ask for Supabase support is written up in
-- docs/audits/2026-10-17-http-extension-support-request.md.
--
-- WHAT IT DOES DO
-- ------------------------------------------------------------------------------
-- The reason the hole is now safe to close by simply dropping the extension is that
-- NOTHING IN-HOUSE CALLS IT any more: `fn_staff_tasks_push` and the four Loyverse cron
-- jobs are all already on `pg_net` (`net.http_post`). The earlier audit said otherwise
-- because its detector regex `\mhttp_(get|post)\M` also matches the `http_post` inside
-- `net.http_post` — `.` is a word boundary. Corrected count of real callers: 0.
--
-- That "0" is load-bearing: it is the whole argument for a plain DROP. So this migration
-- installs a view that keeps it measurable, and makes the post-support fix verifiable in
-- one query instead of re-deriving the catalog archaeology above.
--
-- Grants: explicitly revoked from `anon` and `authenticated`. NOTE — and this is a trap:
-- "closed by default" (RULE-RPC-GRANTS) is true for FUNCTIONS only. Migration 490 cleared
-- the `postgres` default privilege for functions in `public`, but the one for TABLES AND
-- VIEWS still reads `anon=arwdDxtm/postgres`, so a brand-new view in `public` is born
-- readable AND writable by `anon`, with no RLS to save it because views have none. Measured
-- here: this very view came out with `has_table_privilege('anon', ..., 'SELECT') = true`
-- on first apply. Hence the explicit REVOKE below. Filed as its own finding.
-- There is no admin-panel screen for this view; it is an operator check.

CREATE OR REPLACE VIEW public.v_security_outbound_http_exposure AS
WITH ext AS (
  SELECT e.extname,
         n.nspname                        AS ext_schema,
         pg_get_userbyid(e.extowner)      AS ext_owner
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname IN ('http', 'pg_net')
),
fns AS (
  SELECT e.extname,
         fn_ns.nspname                                                          AS fn_schema,
         count(*)                                                               AS fns_total,
         count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))          AS anon_executable,
         count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authenticated_executable
  FROM pg_extension e
  JOIN pg_depend d  ON d.refobjid = e.oid AND d.deptype = 'e' AND d.classid = 'pg_proc'::regclass
  JOIN pg_proc p    ON p.oid = d.objid
  JOIN pg_namespace fn_ns ON fn_ns.oid = p.pronamespace
  WHERE e.extname IN ('http', 'pg_net')
  GROUP BY 1, 2
),
-- real in-house callers. The leading `[^.[:alnum:]_]` guard is the whole point: it stops
-- `net.http_post` from being counted as a call to the `http` extension.
callers AS (
  SELECT count(*) AS n
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosrc ~* '(^|[^.[:alnum:]_])http_(get|post|put|delete|patch|head)[[:space:]]*\('
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
),
cron_callers AS (
  SELECT count(*) AS n
  FROM cron.job
  WHERE command ~* '(^|[^.[:alnum:]_])http_(get|post|put|delete|patch|head)[[:space:]]*\('
)
SELECT
  ext.extname                                    AS extension,
  ext.ext_schema                                 AS extension_schema,
  ext.ext_owner                                  AS extension_owner,
  fns.fn_schema                                  AS function_schema,
  fns.fns_total                                  AS functions,
  fns.anon_executable,
  fns.authenticated_executable,
  -- PostgREST exposes `public` (+ `graphql_public`); `net` is not in db-schemas, verified
  -- 2026-10-17 by calling /rest/v1/rpc/net.http_post with the publishable key -> 404.
  (fns.fn_schema = 'public')                     AS rest_reachable,
  (fns.fn_schema = 'public' AND fns.anon_executable > 0) AS anon_ssrf_open,
  CASE WHEN ext.extname = 'http'
       THEN (SELECT n FROM callers) + (SELECT n FROM cron_callers)
       END                                       AS in_house_callers,
  pg_has_role(current_user, ext.ext_owner, 'USAGE') AS we_can_drop_it
FROM ext
LEFT JOIN fns ON fns.extname = ext.extname;

COMMENT ON VIEW public.v_security_outbound_http_exposure IS
  'MC 16ad5772 — operator check on the anon-reachable SSRF surface. '
  '`anon_ssrf_open` is true while the hole is open; it goes false when Supabase support '
  'drops/moves the `http` extension. `in_house_callers` must stay 0 — if it goes above 0, '
  'someone added a caller and a plain DROP EXTENSION is no longer safe. '
  '`we_can_drop_it` is false because the extension is owned by supabase_admin. '
  'No grants: postgres/service_role only.';

-- Born open: the public-schema default ACL for views grants anon/authenticated
-- arwdDxtm. Take it back. Grantor is `postgres`, so this revoke actually bites
-- (unlike the http ones above, where the grantor is supabase_admin).
REVOKE ALL ON public.v_security_outbound_http_exposure FROM anon, authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('501_http_extension_anon_exposure_status.sql', 'claude-opus-session-9b07627f', NULL,
        'MC 16ad5772: v_security_outbound_http_exposure. Monitors the http-extension anon SSRF surface that 490 could not close (supabase_admin-owned). Corrects the audit: real in-house http_* callers = 0, not 5 — the old regex matched net.http_post. Also revokes anon/authenticated on the new view - the public-schema default ACL for views still grants them arwdDxtm (490 fixed functions only).');
