-- 509_retire_syrve.sql
--
-- MC 9afb9af2 (epic 7352e57c — Database reliability & ops).
--
-- WHY
-- ------------------------------------------------------------------------------
-- SYRVE was connected over its API as a test in March 2026 and rejected in favour of
-- Loyverse. CEO, 2026-10-17: "у нас больше нет syrve — мы тестово только по апи
-- подключали его и отказались в пользу лойверс." This removes what the test left behind
-- in the database. The frontend panels, the hook, the Settings wiring and the
-- services/supabase/functions/syrve-poc source go in the same commit — they were the only
-- writers, and syrve-poc was never deployed to prod (confirmed against the live edge
-- function list, 2026-10-17).
--
-- The constitution's § Systems of Record — which had been naming SYRVE as the System of
-- Record for Inventory, BOM and Sales — was corrected separately in commit 2841e2a6. Not
-- re-touched here.
--
-- WHAT THE DATA CHECK FOUND (prod, 2026-10-17, before this migration)
-- ------------------------------------------------------------------------------
-- All six columns on live tables carry zero SYRVE data:
--
--   nomenclature.syrve_uuid                0 non-null / 1390 rows
--   nomenclature.syrve_tax_category_id     0 non-null / 1390 rows
--   suppliers.syrve_uuid                   0 non-null /  106 rows
--   equipment.syrve_uuid                   0 non-null /   81 rows
--   expense_ledger.syrve_doc_id            0 non-null /  602 rows
--   expense_ledger.syrve_synced          602 non-null /  602 rows — all FALSE, 0 TRUE
--
-- The last one is non-null only because the column carries DEFAULT false, so it holds no
-- information either. The two expense_ledger columns are financial data, so they were
-- counted and recorded before the drop rather than assumed empty.
--
-- Tables: syrve_config 6 rows (base_url + vat_rate only — api_login, organization_id,
-- store_id and default_tax_category_id are all empty, so there is no credential to
-- rotate), syrve_sales 0, syrve_sync_log 0, syrve_sync_queue 0, syrve_uom_map 0.
--
-- Nothing depended on any of it: no view, materialized view, function body, index,
-- constraint, RLS policy or trigger referenced the six columns, and no inbound foreign key
-- pointed at the five tables. Hence plain DROPs, no CASCADE.
--
-- Production has no backups (MC 4405c6e9), so the only undo is the dump in
-- docs/audits/syrve-retirement-2026-10/ — syrve_config verified against prod by row count
-- and md5 (938a50c8… over the sorted key list, 133d8546… over the sorted rows).
--
-- ORDER DEPENDENCY — migration 496
-- ------------------------------------------------------------------------------
-- 496 (branch feature/tooling/db-hygiene-retention-audit) inserts the syrve_sync_log and
-- syrve_sync_queue rows into log_retention_policy. This migration deletes them, so 496
-- must land FIRST or those rows would be re-created pointing at tables that no longer
-- exist. As of 2026-10-17 15:00 UTC, 496 is NOT yet applied — log_retention_policy does
-- not exist in prod. The guard below raises rather than letting the DELETE pass as a
-- silent no-op.
--
-- ------------------------------------------------------------------------------

BEGIN;

-- ── guard 1: migration 496 must already be applied ───────────────────────────
DO $$
BEGIN
  IF to_regclass('public.log_retention_policy') IS NULL THEN
    RAISE EXCEPTION
      'migration 496 is not applied: public.log_retention_policy does not exist. Apply 496 (branch feature/tooling/db-hygiene-retention-audit) before this migration, or its syrve_sync_log / syrve_sync_queue rows will be re-created pointing at dropped tables.';
  END IF;
END $$;

-- ── guard 2: re-assert at APPLY time that the six columns are still empty ────
-- The data check above was taken hours earlier; the apply happens in the quiet hour after
-- 23:00 Phuket. A column that has gained data since is a finding that needs the CEO, not a
-- drop: fail the whole migration instead.
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT (SELECT count(n.syrve_uuid)            FROM public.nomenclature n)
       + (SELECT count(n.syrve_tax_category_id) FROM public.nomenclature n)
       + (SELECT count(s.syrve_uuid)            FROM public.suppliers s)
       + (SELECT count(e.syrve_uuid)            FROM public.equipment e)
       + (SELECT count(el.syrve_doc_id)         FROM public.expense_ledger el)
       + (SELECT count(*) FILTER (WHERE el.syrve_synced IS TRUE)
                                                FROM public.expense_ledger el)
    INTO v_count;

  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'SYRVE columns are no longer empty (% non-default values across the six columns). Someone wrote SYRVE data after the 2026-10-17 check. Re-run the per-column count, dump the data, and get a fresh CEO go before dropping.', v_count;
  END IF;
END $$;

-- ── 1. the three RPCs ────────────────────────────────────────────────────────
-- Dropped before the tables they read, so nothing is left pointing at a missing relation.
DROP FUNCTION IF EXISTS public.fn_get_syrve_config();
DROP FUNCTION IF EXISTS public.fn_save_syrve_mapping(p_nomenclature_id uuid, p_syrve_uuid uuid, p_syrve_tax_category_id uuid);
DROP FUNCTION IF EXISTS public.fn_upsert_syrve_config(p_key text, p_value text);

-- ── 2. the five tables ───────────────────────────────────────────────────────
-- INTENTIONAL DROP — SYRVE is retired (CEO, 2026-10-17). Four are empty; syrve_config's
-- 6 rows are dumped to docs/audits/syrve-retirement-2026-10/syrve_config.csv and verified
-- against prod by row count and md5. No inbound FKs, so no CASCADE needed.
DROP TABLE IF EXISTS public.syrve_sync_queue;
DROP TABLE IF EXISTS public.syrve_sync_log;
DROP TABLE IF EXISTS public.syrve_sales;
DROP TABLE IF EXISTS public.syrve_uom_map;
DROP TABLE IF EXISTS public.syrve_config;

-- ── 3. the retention registry rows for the two log tables ────────────────────
-- Guard 1 above has already proved the table exists, so this cannot no-op silently.
DELETE FROM public.log_retention_policy
WHERE table_name IN ('syrve_sync_log', 'syrve_sync_queue');

-- ── 4. the six columns on live tables — LAST ─────────────────────────────────
-- Deliberately after the tables and functions: these are the only irreversible statements
-- that touch tables we keep, and expense_ledger is financial. Guard 2 proved them empty at
-- apply time.
ALTER TABLE public.nomenclature   DROP COLUMN IF EXISTS syrve_uuid;
ALTER TABLE public.nomenclature   DROP COLUMN IF EXISTS syrve_tax_category_id;
ALTER TABLE public.suppliers      DROP COLUMN IF EXISTS syrve_uuid;
ALTER TABLE public.equipment      DROP COLUMN IF EXISTS syrve_uuid;
ALTER TABLE public.expense_ledger DROP COLUMN IF EXISTS syrve_doc_id;
ALTER TABLE public.expense_ledger DROP COLUMN IF EXISTS syrve_synced;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('509_retire_syrve.sql', 'claude-opus-session-7280448b', NULL,
        'MC 9afb9af2: retired SYRVE, an API test rejected in favour of Loyverse (CEO 2026-10-17). Dropped 3 functions (fn_get_syrve_config, fn_save_syrve_mapping, fn_upsert_syrve_config), 5 tables (syrve_config 6 rows; syrve_sales, syrve_sync_log, syrve_sync_queue, syrve_uom_map all empty; 120 kB total), the 2 syrve rows in log_retention_policy added by 496, and 6 columns on live tables (nomenclature.syrve_uuid, nomenclature.syrve_tax_category_id, suppliers.syrve_uuid, equipment.syrve_uuid, expense_ledger.syrve_doc_id, expense_ledger.syrve_synced). Every one of the 6 columns was counted first and held zero SYRVE data - the two on expense_ledger are financial, so they were counted rather than assumed: syrve_doc_id 0 non-null of 602, syrve_synced 602 non-null of 602 but all FALSE because of DEFAULT false. syrve_config dumped to docs/audits/syrve-retirement-2026-10/ and verified by row count and md5; it held only base_url and vat_rate, no credentials, nothing to rotate. Nothing depended on any of it (no view, function body, index, constraint, policy, trigger or inbound FK), so plain DROPs. Depends on 496 being applied first; both the dependency and the emptiness are enforced by guards at the top of this file. Frontend (SyrveConfigPanel, SyrvePocReport, useSyrveIntegration, Settings.tsx wiring) and the never-deployed syrve-poc edge function source removed in the same commit. Constitution Systems of Record corrected separately in 2841e2a6.');

COMMIT;
