-- 523_rbac_gate_payroll_and_holiday_rpcs.sql
--
-- MC 61463954 — `authenticated` is a flat tier. First slice: the payroll/HR writes.
--
-- THE GAP, measured against prod 2026-10-17
-- ------------------------------------------------------------------------------
-- 48 SECURITY DEFINER functions in `public` are executable by `authenticated`. 15 carried a
-- role check; **33 did not**. Role separation for those is UI-only, and the UI is the thing
-- an attacker does not have to use. After this migration: 17 gated, 31 ungated.
--
-- (Counted with a detector that includes all five gate idioms in this schema —
-- `fn_assert_caller_role`, `fn_is_owner`, `fn_has_app_role`, `fn_get_my_role` and an inline
-- `app_role` predicate. A narrower detector is what made the first pass here wrong.)
--
-- Two of the 33 matter most, and both are HR:
--
--   fn_calculate_payroll(p_period_id uuid)      — no gate
--   fn_sync_holiday_credits(p_from, p_to date)  — no gate
--
-- Active staff in prod: 2 `owner` (Lesia, Bas), 2 active `task_manager` (NeNe, Nuk — Mint's
-- row is `is_active = false` now), 0 `cook`. So the concrete exposure is not hypothetical:
-- **an active task_manager can recalculate payroll**, and per the known payroll trap a
-- recalc *wipes manually entered bonuses*. That is a destructive write, reachable by anyone
-- who signs in and calls the RPC directly. One of those accounts signed in today.
--
-- `fn_sync_holiday_credits` does not write despite its name — it only reads. But it is
-- SECURITY DEFINER, so it bypasses `holiday_credits_select`, which otherwise limits a
-- non-owner to their own rows. Any signed-in user can read every employee's holiday
-- credits. The table states the rule; the function hands out an exemption.
--
-- CORRECTION TO THE TASK'S OWN PREMISE
-- ------------------------------------------------------------------------------
-- The task says signed-in users "can call payroll RPCs", plural. **`fn_approve_payroll` is
-- already gated** — migration 457 added
-- `fn_assert_caller_role(ARRAY['owner'], 'Only owners can approve payroll')`. A first pass
-- here reported it as ungated because the detector only looked for `fn_is_owner`,
-- `fn_get_my_role`, `fn_has_app_role` and `app_role`. There are **five** gate idioms in
-- this schema, and `fn_assert_caller_role` is the one 457 introduced. Approving was safe;
-- calculating was not.
--
-- WHICH IDIOM, AND WHY IT IS NOT `fn_is_owner()`
-- ------------------------------------------------------------------------------
-- `fn_is_owner()` is the more common local form, but `fn_assert_caller_role` is correct
-- here. Its body returns early when `session_user <> 'authenticator'` (direct psql, cron)
-- and when `auth.role() = 'service_role'` (edge functions), and only then requires the app
-- role. So it gates humans without locking automation out. `fn_is_owner()` would block both.
--
-- Neither function has a cron or service_role caller today — checked `cron.job`, every
-- other function's source, both repos and all 15 edge functions — so either idiom would
-- work *now*. `fn_assert_caller_role` is chosen so that adding a nightly payroll job later
-- does not silently fail, and so the two payroll functions read identically.
--
-- WHAT IS NOT PROVEN, STATED PLAINLY
-- ------------------------------------------------------------------------------
-- The owner path through this gate has **never been exercised in production**. Migration 457
-- applied on 2026-10-09; the most recent payroll approval was 2026-08-31, so
-- `fn_approve_payroll`'s identical gate has not run for a real owner session even once.
-- A migration cannot test it either: `fn_has_app_role` resolves `auth.uid()`, which is NULL
-- without a JWT, so `SET LOCAL ROLE` proves nothing.
--
-- What *was* verified is the data the gate depends on:
--   fn_has_app_role = EXISTS(SELECT 1 FROM staff
--                            WHERE auth_user_id = auth.uid() AND is_active AND app_role = ANY(...))
--   Lesia  — app_role 'owner', is_active true, auth_user_id links to a real auth.users row,
--            last sign-in 2026-10-17 07:55Z.
--   Bas    — app_role 'owner', is_active true, linked.
-- So the predicate has everything it needs to return true for an owner.
--
-- The residual risk is therefore narrow and loud: if the gate misfires, the owner gets
-- `42501 forbidden` on /hr/payroll — an error, not silent bad data — and the next payroll
-- run is the first real test of it, for the calculate step and the already-shipped approve
-- step alike. Revert for one function is a single statement:
--   re-run this migration's patch logic with the PERFORM line removed, or
--   `CREATE OR REPLACE` from `pg_get_functiondef` minus that line.
--
-- Tiers mirror the UI, which is the house convention 457 set (`fn_approve_po` allows
-- `owner, task_manager`, matching `/receipts` and `/procurement`). Both functions here are
-- reached only from `/hr/payroll` and `/hr/holidays`, both behind `RoleGuard minRole="owner"`
-- — verified via `use-payroll.ts` and `useHolidays.ts`, their only callers.
--
-- WHY THIS PATCHES FROM `pg_get_functiondef` AND NOT FROM THE REPO
-- ------------------------------------------------------------------------------
-- `fn_calculate_payroll` is a known repo-vs-prod drift case: the committed copy is NOT what
-- runs. Re-applying the repo version to add one line would silently revert whatever prod
-- actually has — the exact failure the drift note warns about.
--
-- So the gate is inserted into the **live** definition, programmatically, rather than by
-- retyping 7.5 KB of payroll arithmetic into this file where a single transcription slip
-- would corrupt wage calculations. The patch is idempotent, asserts that it found the
-- function's opening `BEGIN`, and aborts rather than guessing if it did not. The dry run
-- additionally proved that stripping the inserted line reproduces the previous definition
-- byte for byte.

BEGIN;

DO $patch$
DECLARE
  r      record;
  v_def  text;
  v_new  text;
  v_gate text;
  v_n    int := 0;
BEGIN
  FOR r IN
    SELECT 'public.fn_calculate_payroll(uuid)'::regprocedure      AS fn,
           'Only owners can calculate payroll'                    AS msg
    UNION ALL
    SELECT 'public.fn_sync_holiday_credits(date,date)'::regprocedure,
           'Only owners can sync holiday credits'
  LOOP
    v_def := pg_get_functiondef(r.fn);

    IF v_def ~ 'fn_assert_caller_role' THEN
      RAISE NOTICE '523: % already gated, skipped', r.fn;
      CONTINUE;
    END IF;

    v_gate := '  PERFORM public.fn_assert_caller_role(ARRAY[''owner''], ''' || r.msg || ''');';

    -- insert the gate as the first statement after the function's own opening BEGIN.
    -- `.` matches newline by default in PostgreSQL ARE, and `.*?` is non-greedy, so this
    -- anchors on the FIRST `\nBEGIN\n` after the body delimiter — past the DECLARE block.
    v_new := regexp_replace(v_def, '(AS \$function\$.*?\nBEGIN\n)', '\1' || v_gate || E'\n');

    IF v_new = v_def THEN
      RAISE EXCEPTION '523: could not locate the opening BEGIN of %; aborting rather than guessing', r.fn;
    END IF;

    EXECUTE v_new;

    -- post-condition: the gate really is in the installed definition
    IF pg_get_functiondef(r.fn) !~ 'fn_assert_caller_role' THEN
      RAISE EXCEPTION '523: gate missing from % after replace', r.fn;
    END IF;

    v_n := v_n + 1;
    RAISE NOTICE '523: gated %', r.fn;
  END LOOP;

  RAISE NOTICE '523: % function(s) gated', v_n;
END
$patch$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('523_rbac_gate_payroll_and_holiday_rpcs.sql', 'claude-opus-session-df80a758', NULL,
        'MC 61463954: gated fn_calculate_payroll and fn_sync_holiday_credits on the owner app role via fn_assert_caller_role (the mig-457 idiom, which lets service_role/cron through and only gates humans). Both were ungated SECURITY DEFINER and authenticated-executable: a task_manager could recalculate payroll (which wipes manual bonuses) and read every employee holiday credit past holiday_credits_select. Both are reached only from owner-tier /hr pages. Patched from pg_get_functiondef, not the repo copy, because fn_calculate_payroll is a known repo-vs-prod drift case; the patch is idempotent and aborts if it cannot find the opening BEGIN. NOTE: fn_approve_payroll was ALREADY gated by mig 457 - the task premise was half stale. 31 other ungated SECURITY DEFINER functions remain, still on 61463954.');

COMMIT;
