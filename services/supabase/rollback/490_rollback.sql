-- 490_rollback.sql — undo migration 490 (MC f133850a)
--
-- NOT a migration. Do not number it, do not let the canary pick it up, and do
-- not register it in migration_log. Run it by hand, only to reverse 490.
--
-- It restores exactly what 490 recorded in `public.rpc_grant_snapshot_490`
-- before changing anything: every EXECUTE grant to PUBLIC / anon /
-- authenticated, and the search_path of every non-extension function in
-- `public`. Nothing is guessed and nothing is hard-coded — the snapshot is what
-- production actually held at apply time.
--
-- WHAT IT DOES NOT UNDO:
--   * the http extension revoke attempt (section C of 490) — it is a no-op in
--     production anyway, since postgres cannot revoke supabase_admin's grants;
--   * the ALTER DEFAULT PRIVILEGES in section B. Those are restored explicitly
--     at the end of this script, because they are not per-function and so are
--     not in the snapshot.
--
-- AFTER RUNNING IT, THE ANON HOLE IS OPEN AGAIN. 109 SECURITY DEFINER functions
-- become callable by anyone holding the publishable key. Rolling back is an
-- incident response, not a resting state — reopen MC f133850a the same day.

BEGIN;

DO $$
DECLARE
  v_rows int;
BEGIN
  IF to_regclass('public.rpc_grant_snapshot_490') IS NULL THEN
    RAISE EXCEPTION 'rpc_grant_snapshot_490 does not exist — 490 was never applied, or the snapshot was dropped. There is nothing to roll back from; restore from a dump instead.';
  END IF;
  SELECT count(*) INTO v_rows FROM public.rpc_grant_snapshot_490;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'rpc_grant_snapshot_490 is empty — refusing to roll back to an unknown state';
  END IF;
  RAISE NOTICE 'rollback: snapshot has % rows', v_rows;
END $$;

-- 1. Drop everything 490 granted, so the restore is exact rather than additive.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
    WHERE n2.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'rollback 1: cleared grants on % functions', n;
END $$;

-- 2. Replay the recorded grants.
DO $$
DECLARE r record; n int := 0; v_missing int := 0;
BEGIN
  FOR r IN
    SELECT fn_sig, grantee FROM public.rpc_grant_snapshot_490 WHERE kind = 'grant'
  LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', r.fn_sig, r.grantee);
      n := n + 1;
    EXCEPTION WHEN undefined_function THEN
      -- a function dropped since 490 ran; nothing to restore it onto
      v_missing := v_missing + 1;
    END;
  END LOOP;
  RAISE NOTICE 'rollback 2: restored % grants (% skipped, function no longer exists)', n, v_missing;
END $$;

-- 3. Replay the recorded search_path (NULL in the snapshot means it had none).
DO $$
DECLARE r record; n int := 0; v_missing int := 0;
BEGIN
  FOR r IN
    SELECT fn_sig, search_path FROM public.rpc_grant_snapshot_490 WHERE kind = 'search_path'
  LOOP
    BEGIN
      IF r.search_path IS NULL THEN
        EXECUTE format('ALTER FUNCTION %s RESET search_path', r.fn_sig);
      ELSE
        EXECUTE format('ALTER FUNCTION %s SET search_path = %s', r.fn_sig, r.search_path);
      END IF;
      n := n + 1;
    EXCEPTION WHEN undefined_function THEN
      v_missing := v_missing + 1;
    END;
  END LOOP;
  RAISE NOTICE 'rollback 3: restored search_path on % functions (% skipped)', n, v_missing;
END $$;

-- 4. Restore the default privileges section B removed. These are not
--    per-function, so they are not in the snapshot — they are restored to what
--    pg_default_acl held before 490: EXECUTE to anon, authenticated and
--    service_role for functions created by postgres and by supabase_admin,
--    plus PostgreSQL's built-in grant to PUBLIC.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
             GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role';
EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
  RAISE WARNING 'rollback 4: could not restore supabase_admin default privileges (%) — 490 could not change them either, so this is expected', SQLERRM;
END $$;

-- 5. Confirm we are back where we started.
DO $$
DECLARE v_anon int; v_auth int; v_expect_anon int; v_expect_auth int;
BEGIN
  SELECT count(DISTINCT fn_sig) FILTER (WHERE grantee IN ('PUBLIC','anon')),
         count(DISTINCT fn_sig) FILTER (WHERE grantee IN ('PUBLIC','authenticated'))
    INTO v_expect_anon, v_expect_auth
  FROM public.rpc_grant_snapshot_490 WHERE kind = 'grant';

  SELECT count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')),
         count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    INTO v_anon, v_auth
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

  IF v_anon <> v_expect_anon OR v_auth <> v_expect_auth THEN
    RAISE EXCEPTION 'rollback 5: restored state does not match the snapshot (anon %/%s, authenticated %/%s)',
      v_anon, v_expect_anon, v_auth, v_expect_auth;
  END IF;
  RAISE NOTICE 'rollback 5: restored — anon %, authenticated %', v_anon, v_auth;
END $$;

COMMIT;

-- Keep the snapshot table. It is the record of what the grants were, and the
-- next attempt at 490 will want it. Once 490 is settled in production, retire
-- it in a normal numbered migration (claim a number, carry an
-- '-- INTENTIONAL DROP' marker) rather than by hand from a console.
