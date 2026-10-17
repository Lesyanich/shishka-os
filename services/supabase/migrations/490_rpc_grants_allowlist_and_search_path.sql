-- 490_rpc_grants_allowlist_and_search_path.sql
--
-- CONTRACT-REVIEWED: this migration does not touch the menu contract. It changes
-- EXECUTE grants and search_path on FUNCTIONS only — no table, view, column or
-- policy is altered, and menu_public / menu_modifiers / nomenclature_tags /
-- price_tiers / site_content appear here solely as names inside comments, where
-- the verification notes record what was read as anon to prove nothing broke.
-- `node scripts/contract-check.mjs` green before (2 endpoints, 81 dishes); the
-- same reads inside the rolled-back dry run returned identical counts
-- (menu_public=81, menu_modifiers=436, nomenclature_tags=942, price_tiers=3,
-- site_content=4, v_public_menu=134), and the check is to be re-run green after
-- the prod apply.
-- MC f133850a — SECURITY P0. Inventory + allowlist: docs/audits/2026-10-17-rpc-grants-inventory.md
-- Before-state: docs/audits/2026-10-17-rpc-grants-before.csv
--
-- WHY. 109 SECURITY DEFINER functions in `public` are callable by `anon`, 89 of them
-- with no role check inside. The publishable key ships in the live site's JavaScript,
-- so "callable by anon" means callable by anyone. 126 functions also run with a
-- caller-controlled search_path.
--
-- THE ALLOWLIST (approved by the CEO 2026-10-17):
--   anon          — empty. The live site and apps/web read views and tables only;
--                   there is no `.rpc(` call in either repo, and seven days of
--                   edge_logs contain zero anon RPC calls.
--   authenticated — 55 functions: 51 the admin panel / KDS / staff TWA call over
--                   REST (they are one app behind Supabase Auth), plus 4 helpers
--                   that RLS policies and one invoker view evaluate internally.
--   service_role  — untouched. All 190 of our functions carry an explicit
--                   `service_role=X` grant, so revoking PUBLIC does not touch it.
--
-- FOUR CORRECTIONS TO THE ORIGINAL TASK PLAN, each found while inventorying:
--
-- 1. REVOKE ... FROM anon, authenticated WOULD HAVE BEEN A NO-OP.
--    165 of our 190 functions carry a grant to PUBLIC (`{=X/postgres,...}` in
--    proacl). anon and authenticated inherit EXECUTE through PUBLIC, so revoking
--    the two named roles leaves every one of those functions callable. The revoke
--    has to name PUBLIC. Same for ALTER DEFAULT PRIVILEGES: PostgreSQL's built-in
--    default grants EXECUTE on every new function to PUBLIC, and that default is
--    not visible in pg_default_acl at all.
--
-- 2. NOT "ALL FUNCTIONS IN SCHEMA public".
--    164 of the 354 functions in `public` belong to extensions — pgvector (114),
--    pg_trgm (31) and http (19). Revoking pgvector's and pg_trgm's operator and
--    support functions breaks any `%` or `<=>` query a client runs, and ALTER
--    FUNCTION on an extension-owned function breaks pg_dump and extension
--    upgrades. This migration walks pg_proc and skips anything with
--    pg_depend.deptype = 'e'.
--
-- 3. THE RLS HELPERS MUST KEEP EXECUTE, or the admin panel dies.
--    fn_is_authenticated() is named by 58 policies, fn_get_my_role() by 21,
--    fn_is_owner() by 10, fn_has_app_role() by 9 — ~90 tables in total. A policy
--    is evaluated with the *caller's* privileges, so revoking EXECUTE turns every
--    SELECT on those tables into "permission denied for function". Likewise
--    fn_active_menu_ingredient_ids(), which the security_invoker view
--    v_stock_sheet_items calls. None of the five is an RPC; they are granted to
--    `authenticated` only, and never to anon.
--
-- 4. THE http EXTENSION IS THE BIGGER HOLE, AND THIS MIGRATION CANNOT CLOSE IT.
--    The `http` extension sits in `public`, which PostgREST exposes, and all 19 of
--    its functions carry EXECUTE for PUBLIC. They are not SECURITY DEFINER, which
--    is why the advisor's 109 missed them: anon can make the database issue
--    arbitrary outbound HTTP requests and read the response. The extension is
--    owned by supabase_admin, and `postgres` is neither a superuser nor a member
--    of it, so only supabase_admin can revoke a grant supabase_admin made.
--    MEASURED, not assumed: a transactional dry run of this migration against
--    production on 2026-10-17 left all 19 still executable by anon
--    (`http_still_open_to_anon = 19`). Section C therefore attempts the revoke
--    and RAISES A WARNING naming the gap, so the apply log says plainly that the
--    hole is still open. Closing it needs Supabase support, or migrating the only
--    in-house callers — fn_staff_tasks_push and four cron jobs, all running as
--    postgres/cron — onto pg_net and dropping the extension. Tracked separately.
--
-- VERIFIED BEFORE WRITING THIS FILE. The whole migration was run against
-- production inside a transaction that rolled back. End state: 0 of our
-- functions executable by anon, 55 by authenticated, 0 lost service_role, 0 with
-- a mutable search_path. With the roles exercised directly (SET LOCAL ROLE), the
-- live-site surface read as anon — menu_public=81, menu_modifiers=436,
-- nomenclature_tags=942, price_tiers=3, site_content=4, v_public_menu=134 — and
-- the RLS-protected tables read as authenticated — price_tiers=3,
-- v_stock_sheet_items=25, business_tasks=0, staff=0, production_tasks=0 — were
-- byte-identical to the same counts taken before any change. No regression.
-- (The zeros are pre-existing: SET LOCAL ROLE carries no JWT, so auth.uid() is
-- null and the policies correctly return nothing. The point is that they return
-- nothing rather than raising "permission denied for function".)
--
-- WHAT THIS MIGRATION DOES NOT DO: no DROP, no function body changed, no
-- service_role or trigger-function behaviour touched. Role separation inside
-- `authenticated` (any signed-in cook can still call fn_calculate_payroll) is a
-- separate, larger piece of work — it needs guards inside ~20 bodies.
--
-- AFTER THIS LANDS, A NEW FUNCTION IS CLOSED BY DEFAULT. Section B removes the
-- default EXECUTE-to-PUBLIC for functions created in `public`, so any future
-- migration that adds an RPC *or an RLS helper* must grant it explicitly.
-- Forgetting is not silent: a helper without a grant makes its policies raise
-- "permission denied for function". See technical-rules.md § RULE-RPC-GRANTS.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Revoke EXECUTE on every function that is ours (extension functions skipped)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'A: revoked EXECUTE from PUBLIC/anon/authenticated on % functions', v_count;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Default privileges — so the next function created is closed, not open.
--    pg_default_acl lists two grantors for functions in `public`: postgres and
--    supabase_admin. postgres cannot alter supabase_admin's defaults, so that
--    one is attempted and reported.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
             REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated';
  RAISE NOTICE 'B: cleared supabase_admin default privileges';
EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
  RAISE WARNING 'B: could NOT clear supabase_admin default privileges (%) — '
                'functions created by supabase_admin in public will still be '
                'open to PUBLIC. Needs Supabase support.', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. http extension — attempt, then report. See note 4 in the header.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_open_before int;
  v_open_after  int;
BEGIN
  SELECT count(*) INTO v_open_before
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
  JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'http'
  WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'http'
    WHERE n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- collected in the after-count below, not swallowed silently
    END;
  END LOOP;

  SELECT count(*) INTO v_open_after
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
  JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'http'
  WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_open_after = 0 THEN
    RAISE NOTICE 'C: http extension closed to anon (% functions revoked)', v_open_before;
  ELSE
    RAISE WARNING 'C: http extension STILL open to anon — % of % functions remain '
                  'executable. They are owned by supabase_admin and only the '
                  'grantor can revoke. ESCALATE: anon can still drive outbound '
                  'HTTP from the database.', v_open_after, v_open_before;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Re-grant: `authenticated` only. Grouped by the surface that calls each one.
-- ─────────────────────────────────────────────────────────────────────────────

-- D.1 — RLS helpers and invoker-view helpers. NOT RPCs: policies and
--       v_stock_sheet_items evaluate these under the caller's privileges, so
--       without EXECUTE every protected table raises "permission denied".
GRANT EXECUTE ON FUNCTION public.fn_is_authenticated()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_owner()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_has_app_role(p_roles text[])       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_active_menu_ingredient_ids()       TO authenticated;

-- D.2 — Identity / session
GRANT EXECUTE ON FUNCTION public.fn_get_my_role()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_clock(p_event_type text, p_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_staff_login_status()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_staff_pin_reveal(p_staff_id uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_staff_pin(p_staff_id uuid, p_pin text, p_login text) TO authenticated;

-- D.3 — Menu / dish cards
GRANT EXECUTE ON FUNCTION public.fn_dish_scorecard(p_dish_id uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dish_allergens(p_dish_id uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dish_card_save(p_dish_id uuid, p_payload jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pf_pack_card_save(p_pf_id uuid, p_payload jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_dish_price(p_id uuid, p_price numeric, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_explode_bom(p_nomenclature_id uuid, p_quantity numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_channel_margins(p_channel text)   TO authenticated;

-- D.4 — Stocktake (station count → review → apply → route)
GRANT EXECUTE ON FUNCTION public.fn_open_stocktake_session(p_station_code text, p_counted_by text, p_is_baseline boolean, p_scope text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_stocktake_line(p_session_id uuid, p_nomenclature_id uuid, p_counted_qty numeric, p_counted_by text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delete_stocktake_line(p_session_id uuid, p_nomenclature_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cancel_stocktake_session(p_session_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_route_stocktake_session(p_session_id uuid, p_shopping_ids uuid[], p_production_ids uuid[], p_by text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_stocktake_session(p_session_id uuid, p_applied_by text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_stocktake(p_nomenclature_id uuid, p_counted_qty numeric, p_location_id uuid, p_station text, p_unit text, p_counted_by text, p_source text, p_source_text text, p_session_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_stock_sheet(p_passcode text, p_note text, p_lines jsonb) TO authenticated;

-- D.5 — Procurement: purchase orders, receiving, supplier catalog
GRANT EXECUTE ON FUNCTION public.fn_create_purchase_order(p_payload jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_po(p_po_id uuid, p_patch jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_po(p_payload jsonb)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_archive_purchase_order(p_po_id uuid, p_archived boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delete_purchase_order(p_po_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pending_deliveries()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_receive_goods(p_payload jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_import_supplier_catalog(p_supplier_id uuid, p_supplier_name text, p_source text, p_source_detail text, p_rows jsonb, p_dry_run boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_suggest_catalog_matches(p_catalog_id uuid, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_canonical_cost(p_catalog_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_supplier_quote(p_nomenclature_id uuid, p_unit_price numeric, p_supplier_name text, p_supplier_id uuid, p_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_pack_decision(p_decision_id uuid, p_action text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seed_shopping_list_from_menu(p_store text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_seed_shopping_list_low_stock(p_store text) TO authenticated;

-- D.6 — Finance: receipts, expenses
GRANT EXECUTE ON FUNCTION public.fn_approve_receipt_with_learning(p_payload jsonb, p_inbox_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_expense_duplicate(p_invoice_number text, p_transaction_date date, p_amount numeric, p_supplier text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_expense_amount(p_id uuid, p_amount_original numeric, p_exchange_rate numeric, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delete_inbox_row(p_inbox_id uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_inbox_status(p_inbox_id uuid) TO authenticated;

-- D.7 — HR: payroll, schedule, holidays
GRANT EXECUTE ON FUNCTION public.fn_calculate_payroll(p_period_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_approve_payroll(p_period_id uuid, p_approved_by text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_holiday_credits(p_from date, p_to date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_daily_schedule(p_date date, p_generated_by uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_assign_staff_to_schedule(p_run_id uuid) TO authenticated;

-- D.8 — Kitchen / KDS: tasks, batches, cold chain
GRANT EXECUTE ON FUNCTION public.fn_materialize_recurring_tasks(p_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_start_production_task(p_task_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_batches_from_task(p_task_id uuid, p_containers jsonb, p_produced_by uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_thaw_batch(p_barcode text, p_by uuid) TO authenticated;

-- D.9 — Integrations config (read + write of non-secret Syrve settings)
GRANT EXECUTE ON FUNCTION public.fn_get_syrve_config()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_upsert_syrve_config(p_key text, p_value text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_save_syrve_mapping(p_nomenclature_id uuid, p_syrve_uuid uuid, p_syrve_tax_category_id uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- E. Fix search_path on every function that is ours.
--    Existing schemas are preserved (fn_provision_cook_auth keeps `auth`,
--    rls_auto_enable keeps `pg_catalog`); pg_temp is appended. Functions that
--    already end in pg_temp are left alone. Extension functions are skipped —
--    altering them breaks pg_dump and extension upgrades.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_current text;
  v_new text;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           btrim(coalesce(
             (SELECT substring(c FROM 13) FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'),
             '')) AS sp
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    v_current := r.sp;
    IF v_current = '' THEN
      v_new := 'public, pg_temp';
    ELSIF v_current ~ '(^|,)\s*pg_temp\s*(,|$)' THEN
      CONTINUE;
    ELSE
      v_new := v_current || ', pg_temp';
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = %s', r.sig, v_new);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'E: fixed search_path on % functions', v_count;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- F. Document every grant, so the next audit can read intent off the catalog.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_note text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    v_note := CASE r.proname
      WHEN 'fn_is_authenticated'            THEN 'rls-helper: authenticated — evaluated by RLS policies on ~58 tables, not an RPC'
      WHEN 'fn_is_owner'                    THEN 'rls-helper: authenticated — evaluated by RLS policies on 10 tables, not an RPC'
      WHEN 'fn_has_app_role'                THEN 'rls-helper: authenticated — evaluated by RLS policies on 6 tables, not an RPC'
      WHEN 'fn_active_menu_ingredient_ids'  THEN 'view-helper: authenticated — called by the invoker view v_stock_sheet_items, not an RPC'
      ELSE 'rpc: authenticated — admin panel / KDS / staff TWA (MC f133850a allowlist)'
    END;
    EXECUTE format('COMMENT ON FUNCTION %s IS %L', r.sig, v_note);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. Assertions. These run inside the transaction: if the end state is not what
--    the allowlist says, the whole migration rolls back rather than half-closing
--    the database.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_anon_open     int;
  v_auth_open     int;
  v_service_lost  int;
  v_bad_path      int;
  v_anon_list     text;
BEGIN
  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ')
    INTO v_anon_open, v_anon_list
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_open <> 0 THEN
    RAISE EXCEPTION 'G: % of our functions are still executable by anon: %', v_anon_open, v_anon_list;
  END IF;

  SELECT count(*) INTO v_auth_open
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_auth_open <> 55 THEN
    RAISE EXCEPTION 'G: expected 55 functions executable by authenticated, found %', v_auth_open;
  END IF;

  SELECT count(*) INTO v_service_lost
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');

  IF v_service_lost <> 0 THEN
    RAISE EXCEPTION 'G: % of our functions lost service_role EXECUTE — edge functions would break', v_service_lost;
  END IF;

  SELECT count(*) INTO v_bad_path
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');

  IF v_bad_path <> 0 THEN
    RAISE EXCEPTION 'G: % of our functions still have a mutable search_path', v_bad_path;
  END IF;

  RAISE NOTICE 'G: all assertions passed — anon 0, authenticated 55, service_role intact, search_path fixed';
END $$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '490_rpc_grants_allowlist_and_search_path.sql',
  'claude-code',
  NULL,
  'SECURITY P0 (MC f133850a): revoke EXECUTE from PUBLIC/anon/authenticated on all 190 non-extension functions in public, re-grant 55 to authenticated (51 RPCs + 4 RLS/view helpers), none to anon; close the default-privilege hole; fix search_path on 126; attempt to close the http extension to anon.'
)
ON CONFLICT DO NOTHING;

COMMIT;
