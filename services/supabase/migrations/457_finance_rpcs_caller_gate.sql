-- 457_finance_rpcs_caller_gate.sql
-- MC 49cc8776 (found under MC 8ee6783a). CEO 2026-10-09: "да, закрой все пять".
--
-- THE HOLE. Five SECURITY DEFINER finance functions were executable by PUBLIC
-- and anon and checked nothing about the caller, so anyone holding the site's
-- public anon key — not logged in — could call them:
--   fn_approve_payroll(uuid, text)        writes salaries into expense_ledger
--   fn_approve_po(jsonb)                  writes PO purchases into expense_ledger
--   fn_sync_loyverse_payouts_to_ledger()  writes Loyverse payouts into the ledger
--   fn_vat_report(date, date)             returns the VAT report
--   fn_validate_reconciliation(uuid)      returns a ledger reconciliation
-- Migration 456 closed the same hole on receipt approval.
--
-- AFTER
--   * fn_assert_caller_role(roles, message): one gate. Passes for active staff
--     with one of the roles, the service_role key (MCP servers, scripts), and
--     direct DB sessions (migrations, cron, SQL console — session_user is not
--     'authenticator'); raises 42501 with the message otherwise.
--   * fn_assert_receipt_approver() (mig 456) now delegates to it.
--   * The four plpgsql functions get the gate as their first statement,
--     patched into the LIVE definition (pg_get_functiondef) rather than a repo
--     copy — the repo copies of finance/payroll functions are known to drift
--     from prod (memory: fn_calculate_payroll repo ≠ prod):
--        fn_approve_payroll          owner
--        fn_approve_po               owner, task_manager (Procurement → reconciliation)
--        fn_vat_report               owner
--        fn_validate_reconciliation  owner
--     EXECUTE revoked from PUBLIC and anon.
--   * fn_sync_loyverse_payouts_to_ledger is run only by pg_cron
--     'loyverse-payouts-to-ledger' as postgres: EXECUTE revoked from PUBLIC,
--     anon and authenticated; service_role kept. Body untouched.
--
-- Idempotent: a function that already calls fn_assert_caller_role is skipped.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_assert_caller_role(p_roles text[], p_message text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- API requests arrive through PostgREST, which logs in as 'authenticator'.
  -- Anything else is a direct DB session (migration, cron, SQL console).
  IF session_user <> 'authenticator' THEN
    RETURN;
  END IF;

  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;

  IF public.fn_has_app_role(p_roles) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION '%', p_message
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_assert_caller_role(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assert_caller_role(text[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_assert_receipt_approver()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_assert_caller_role(
    ARRAY['owner', 'task_manager'],
    'Only owners and managers can approve receipts'
  );
END;
$$;

-- Gate the four plpgsql functions in their live definitions.
DO $gate$
DECLARE
  r      record;
  v_def  text;
  v_new  text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.fn_approve_payroll(uuid, text)'::regprocedure,
       $r$ARRAY['owner']$r$,
       'Only owners can approve payroll'),
      ('public.fn_approve_po(jsonb)'::regprocedure,
       $r$ARRAY['owner', 'task_manager']$r$,
       'Only owners and managers can approve purchase orders'),
      ('public.fn_vat_report(date, date)'::regprocedure,
       $r$ARRAY['owner']$r$,
       'Only owners can see the VAT report'),
      ('public.fn_validate_reconciliation(uuid)'::regprocedure,
       $r$ARRAY['owner']$r$,
       'Only owners can run reconciliation checks')
    ) AS t(fn, roles, msg)
  LOOP
    v_def := pg_get_functiondef(r.fn);

    CONTINUE WHEN position('fn_assert_caller_role' in v_def) > 0;

    IF regexp_count(v_def, '^BEGIN\s*$', 1, 'n') <> 1 THEN
      RAISE EXCEPTION '% does not have exactly one top-level BEGIN line — gate it by hand', r.fn;
    END IF;

    v_new := regexp_replace(
      v_def,
      '^BEGIN\s*$',
      'BEGIN' || E'\n'
        || '  -- Caller gate (mig 457): this function was executable by anon with no check.' || E'\n'
        || '  PERFORM public.fn_assert_caller_role(' || r.roles || ', ' || quote_literal(r.msg) || ');',
      'n'
    );

    EXECUTE v_new;
  END LOOP;
END
$gate$;

REVOKE ALL ON FUNCTION public.fn_approve_payroll(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_approve_payroll(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_approve_po(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_approve_po(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_vat_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vat_report(date, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_validate_reconciliation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_validate_reconciliation(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_sync_loyverse_payouts_to_ledger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_loyverse_payouts_to_ledger() TO service_role;

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('457_finance_rpcs_caller_gate.sql', 'claude-opus-session-6d690fa1', 'success',
        'Five SECURITY DEFINER finance functions were executable by anon with no caller check. New '
     || 'fn_assert_caller_role(roles, message) (staff role, service_role, or direct DB session; '
     || 'else 42501); fn_assert_receipt_approver delegates to it. Gate patched into the live bodies '
     || 'of fn_approve_payroll (owner), fn_approve_po (owner+task_manager), fn_vat_report (owner), '
     || 'fn_validate_reconciliation (owner); EXECUTE revoked from PUBLIC/anon. '
     || 'fn_sync_loyverse_payouts_to_ledger: cron/service_role only. MC 49cc8776.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.fn_approve_payroll(uuid, text) TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.fn_approve_po(jsonb) TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.fn_vat_report(date, date) TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.fn_validate_reconciliation(uuid) TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.fn_sync_loyverse_payouts_to_ledger() TO PUBLIC, anon, authenticated;
-- -- remove the two gate lines from each body: re-create from pg_get_functiondef
-- -- with the "-- Caller gate (mig 457)" and PERFORM lines deleted.
-- DELETE FROM public.migration_log WHERE filename='457_finance_rpcs_caller_gate.sql';
-- COMMIT;
