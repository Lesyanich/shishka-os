-- 504_close_public_views_to_anon_and_fix_default_acl.sql
--
-- MC 5927338d (high) — the gap migration 490 left and migration 501 walked into.
--
-- THE BUG
-- ------------------------------------------------------------------------------
-- 490 cleared the `postgres` DEFAULT PRIVILEGES for FUNCTIONS in `public`, so functions
-- are closed by default. It left the default for TABLES (which covers VIEWS) untouched:
--
--   pg_default_acl  role=postgres  schema=public  objtype=r
--     {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/…, …}
--
-- A TABLE created under that default is still gated by RLS. A VIEW has no RLS at all, and
-- a view that is `SECURITY DEFINER` (the PostgreSQL default) reads its base tables with the
-- VIEW OWNER's privileges — so it bypasses RLS by design. For views the ACL is therefore
-- the only gate there is, and it was open to `anon`.
--
-- MEASURED AGAINST PROD, 2026-10-17 (not inferred):
--   views in public ................................. 60
--   anon-readable by ACL ............................ 56
--   of those, actually returning DATA to the
--   publishable key over REST ....................... 23   (20 of them illegitimate)
--
-- Confirmed leaking, HEAD with `Prefer: count=exact` and the key from the live site's JS.
-- Count HTTP 206 as well as 200 — PostgREST answers a large result with 206 Partial
-- Content, and a `== 200` filter hides the single biggest leak in the list:
--   v_data_health_items_legacy 1112 (HTTP 206) · v_dish_assembly_components 713
--   v_dish_modifier_options 479 · v_inventory_by_nomenclature 299 · v_stock_reconciliation 275
--   v_loyverse_sync_status 241 · v_dish_cost_split 241 · v_dish_packaging 236
--   v_modifier_drift 151 · v_stocktake_session_lines 122 · v_stock_latest 122
--   v_stock_latest_by_location 122 · v_equipment_hourly_cost 76
--   v_equipment_maintenance_schedule 46 · v_migration_collisions 44 · v_stock_status 26
--   v_stock_on_hand_by_location 26 · v_dangling_bom 10 · v_holiday_credit_balance 4
--   v_learning_metrics 1
--
-- Four more were ACL-open but answered 500 to anon rather than leaking — the 3 s
-- `statement_timeout` on the anon role, not a permission: v_data_health,
-- v_station_checklist, v_station_replenishment and v_public_menu. They are closed here all
-- the same (except v_public_menu, which the site needs). That v_public_menu is close enough
-- to the anon timeout to have failed once mid-sweep is a pre-existing fragility in the live
-- read path, unrelated to grants; filed separately.
-- So our COGS, stock positions, equipment cost and staff holiday balances were readable by
-- anyone who viewed the site source. `v_staff_access_last` returns 0 rows today but is a
-- DEFINER view over staff access data — one data change from leaking, so it is closed here
-- too, not excused.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------------------------------------------------------------
-- A. Snapshots every current table/view ACL in `public` so the change is reversible
--    without a dump (the pattern 490 used with rpc_grant_snapshot_490).
-- B. Revokes ALL from `anon` on every view in `public` except the live-site allowlist.
-- C. Fixes the DEFAULT PRIVILEGES for tables/views so the next object is born closed.
--
-- `authenticated` IS DELIBERATELY KEPT ON VIEWS. The admin panel reads 35 of these views
-- (derived from apps/admin-panel/src: v_analytics_*, v_data_health*, v_dish_cost_split,
-- v_stock_status, v_station_checklist, …) and signs in as `authenticated`. Revoking it
-- would take out the whole panel. Narrowing `authenticated` per screen is a separate job.
--
-- THE ALLOWLIST, and how it was derived
-- ------------------------------------------------------------------------------
-- From the DEPLOYED code, not from a hand-me-down list: `shishka-health` @ origin/main
-- (the checkout sits on a stale feature branch, so origin/main is the authority) plus
-- `apps/web`, cross-checked against contracts/menu-contract.json.
--
--   menu_public        — the one live dish surface      (contract resource, 81 rows)
--   menu_modifiers     — modifier groups per dish       (contract resource, 436 rows)
--   menu_translations  — RU/TH/AR overlay               (useMenu.js:81; 691 rows)
--   v_public_menu      — read by apps/web               (134 rows)
--
-- Two traps found while deriving it, both of which would have caused an outage:
--   1. `menu_translations` is NOT in menu-contract.json, but useMenu.js reads it and
--      scripts/aeo-prerender.mjs:298 THROWS on failure — closing it would hard-fail the
--      prerender build, not merely fall back to English. Contract drift; filed separately.
--   2. `nomenclature_tags` is selected as `nomenclature_id, tags(slug,…)`. That PostgREST
--      embed needs SELECT on `tags` as well, so `tags` is load-bearing for the menu even
--      though no `.from('tags')` exists anywhere. Both are TABLES, so neither is touched
--      by this migration — but the next person narrowing table grants must not miss it.
--
-- EXISTING TABLE GRANTS ARE DELIBERATELY OUT OF SCOPE — stated, not omitted
-- ------------------------------------------------------------------------------
-- 22 tables also return rows to `anon`. That is NOT the default ACL acting alone: there are
-- 31 RLS policies in `public` with `qual = true` admitting `anon` or `public`, several
-- written on purpose for surfaces other than the website — `kds_anon_read` on
-- production_tasks, "TWA anon can view warnings", `staff_tasks_read_anon`,
-- `shifts_read_anon`, `tmpl_read` on staff_schedule_templates. Revoking the table ACL would
-- cut the ACL check in front of RLS and silently break the KDS and the staff Telegram app.
-- Deciding which of those policies are vestigial needs each consumer exercised, which is
-- its own task with its own verification — not something to bundle into a grants sweep.
-- Filed as its own MC task. Views carry no such risk, which is why they are done here.
--
-- Anon WRITES: 5 policies grant unconditional INSERT to anon/public — cook_feedback,
-- recipe_feedback, production_log (all deliberate feedback intake) and haccp_logs,
-- waste_entries (both `roles={public}` with `with_check = true`, which look wider than
-- intended). Also left alone here for the same reason, and filed with the above.

-- CONTRACT-REVIEWED: menu_public, menu_modifiers and menu_translations are on this
-- migration's ALLOWLIST and are explicitly NOT revoked; nomenclature_tags and `tags` are
-- tables, which this migration does not touch at all. No column, view definition or row
-- filter changes here — only ACLs on views outside the allowlist. contract-check.mjs was
-- run green against both endpoints (supabase.co and shishka.health/sb) BEFORE the apply and
-- again AFTER it, and all 8 live-site objects returned byte-identical row counts to the
-- publishable key across the change: menu_public 81, menu_modifiers 436,
-- menu_translations 691, v_public_menu 134, nomenclature_tags 942, site_content 4,
-- price_tiers 3, tags 72. contracts/menu-contract.json needs no update (no columns moved);
-- the drift it already had is filed as MC fb0dc997.

BEGIN;

-- ── A. reversibility snapshot ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acl_snapshot_504 (
  captured_at  timestamptz NOT NULL DEFAULT now(),
  relkind      "char"      NOT NULL,
  relname      text        NOT NULL,
  relacl       text,
  PRIMARY KEY (relname, captured_at)
);
REVOKE ALL ON public.acl_snapshot_504 FROM anon, authenticated;

INSERT INTO public.acl_snapshot_504 (relkind, relname, relacl)
SELECT c.relkind, c.relname, c.relacl::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p');

-- ── B. close every view in public to anon, except the live-site surface ──────
DO $close$
DECLARE
  v_allow text[] := ARRAY['menu_public','menu_modifiers','menu_translations','v_public_menu'];
  r       record;
  n_done  int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v','m')
      AND NOT (c.relname = ANY(v_allow))
      AND has_table_privilege('anon', c.oid, 'SELECT')
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    n_done := n_done + 1;
  END LOOP;
  RAISE NOTICE '504: revoked anon on % views', n_done;
END
$close$;

-- ── C. so the next view is not born open ─────────────────────────────────────
-- `ON TABLES` covers views too. After this, a new table or view in `public` is callable
-- by postgres and service_role only, exactly as functions have been since 490 — which
-- means every migration that adds one must grant explicitly. That is the intended
-- discipline, now recorded in technical-rules.md § RULE-RPC-GRANTS.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- The second default ACL in `public` belongs to supabase_admin, which we are not a member
-- of, so the equivalent statement for it cannot be issued from a migration. It only applies
-- to objects supabase_admin itself creates (none of ours), so it is noted, not fought.
DO $note$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
      AND pg_get_userbyid(d.defaclrole) = 'supabase_admin'
      AND d.defaclacl::text LIKE '%anon=%'
  ) THEN
    RAISE WARNING '504: supabase_admin''s default ACL for public tables still grants anon. '
                  'Out of reach as postgres; applies only to objects supabase_admin creates.';
  END IF;
END
$note$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('504_close_public_views_to_anon_and_fix_default_acl.sql', 'claude-opus-session-15df4dbe', NULL,
        'MC 5927338d: revoked anon on all public views except menu_public/menu_modifiers/menu_translations/v_public_menu (22 were actively leaking rows to the publishable key, incl. COGS, stock and holiday balances). Fixed ALTER DEFAULT PRIVILEGES for TABLES so new objects are born closed. authenticated kept (admin panel reads 35 views). Existing table grants + 5 anon INSERT policies deliberately out of scope - deliberate qual=true RLS serves the KDS and staff TWA; filed separately. Prior ACLs snapshotted in acl_snapshot_504.');

COMMIT;
