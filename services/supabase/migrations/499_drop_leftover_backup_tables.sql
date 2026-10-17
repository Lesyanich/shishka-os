-- 499 — leftover backup tables: four dropped, two quarantined, and a schema that stops this recurring
--       (MC 725371dd, epic db-reliability 7352e57c)
--
-- NOT APPLIED YET. The DROP list needs the CEO's sign-off (MC 725371dd) and a quiet hour.
--
-- WHAT WAS FOUND. Seven ad-hoc copies sitting in public since April, 3.9 MB together. Six are
-- leftovers; the seventh (rpc_grant_snapshot_490) is the live rollback for migration 490 and is
-- NOT touched here — its own COMMENT says keep it until 490 is proven, and that migration is
-- another session's work (MC f133850a).
--
-- Only ONE of the six is traceable to a migration: shifts_hours_backup_pre347 (mig 347). The
-- other five were created by hand against production, which is RULE-NO-DIRECT-DB-EDITS and is
-- the actual root cause of this task existing. Hence the backup schema below.
--
-- EVERY ROW IS ON DISK FIRST. docs/audits/backup-tables-2026-10/*.csv, verified against prod by
-- row count AND md5 of the sorted key list AND a value sum where one exists:
--   expense_ledger_payout_dupes_bak_20260701  10,136 rows  md5 0336147384c9...  sum(amount_thb) 1,167,780.00
--   shifts_hours_backup_pre347                   173 rows
--   nomenclature_rename_backup_20260417          113 rows  md5 e891e3eb94ef...
--   sku_balances_bak_20260901                    266 rows  md5 ace9a01d8c62...  sum(quantity) 4,587.6214
--   coffee_roaster_reversal_bak_20260701           7 rows
--   nomenclature_rename_backup_311dc7fe_…         64 rows  md5 ced161306355...
--
-- DROPPED — source operation proven complete:
--   * expense_ledger_payout_dupes_bak_20260701 — payout dedup finished: expense_ledger now has
--     0 duplicate loyverse_cash_movement_id across 263 linked rows.
--   * shifts_hours_backup_pre347 — mig 347 applied 2026-07-03; every shift now reads
--     09:00-18:00 or 09:30-18:30, none at the pre-347 08:00-17:00.
--   * nomenclature_rename_backup_20260417 — 0 of its 113 rows still match the live name, so
--     every rename landed.
--   * coffee_roaster_reversal_bak_20260701 — all 6 reversed rows are gone from expense_ledger,
--     capex_transactions, opex_items and receiving_records. The 1 receipt_inbox row still exists
--     on purpose: the reversal removed the ledger entries, not the receipt.
--
-- QUARANTINED, NOT DROPPED — the evidence says "not finished" or "cannot tell":
--   * nomenclature_rename_backup_311dc7fe_… — 16 of its 64 rows STILL carry the old name as the
--     live name. Migration 156's own note says "50 auto + 14 CEO-reviewed + 1 skip", so part of
--     that run never applied or was reverted later. This table is the only record of what those
--     names were before; dropping it while the rename is half-applied throws away the undo for a
--     job that is not done. Moved to backup with a date, not deleted.
--   * sku_balances_bak_20260901 — no migration created it and no doc mentions it, so the
--     operation it was protecting is unknown. All 266 sku_ids still exist and ALL 266 quantities
--     have since moved, which is simply six weeks of normal stock movement — it tells us nothing
--     about whether the original job completed. Unknown provenance is not the same as safe.
-- Both carry 'drop after 2026-12-31'. If nothing has needed them by then, fn_log_retention
-- removes them without anyone writing another migration — which is the point of the schema.
--
-- THE SCHEMA IS THE FIX. A temporary copy now has one legal home: schema backup, with a COMMENT
-- carrying 'drop after YYYY-MM-DD'. fn_log_retention drops them once that date passes, so a
-- forgotten copy expires by itself instead of being found in an audit six months later. public
-- is for tables someone owns.

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;

COMMENT ON SCHEMA backup IS
  'The only legal home for temporary table copies. Every table here MUST carry a COMMENT containing ''drop after YYYY-MM-DD''; fn_log_retention drops it once that date has passed. A copy in public is a bug — see CLAUDE.md § Database hygiene. Not exposed to PostgREST, so nothing here is reachable from the API.';

-- ---------------------------------------------------------------------------
-- 1. Quarantine the two that are not provably finished
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.nomenclature_rename_backup_311dc7fe_5a79_4a32_83eb_4cd3ad8de079
  SET SCHEMA backup;
ALTER TABLE IF EXISTS public.sku_balances_bak_20260901
  SET SCHEMA backup;

COMMENT ON TABLE backup.nomenclature_rename_backup_311dc7fe_5a79_4a32_83eb_4cd3ad8de079 IS
  'Pre-rename names from the mig 156 data-health run (run_id 311dc7fe), 64 rows. KEPT because 16 of them still match the live name — that rename is half-applied and this is the only undo. CSV: docs/audits/backup-tables-2026-10/. drop after 2026-12-31';
COMMENT ON TABLE backup.sku_balances_bak_20260901 IS
  'Snapshot of sku_balances quantities taken 2026-08-31 by an unrecorded ad-hoc operation; no migration or doc explains it. Kept for a grace period because its purpose is unknown, not because it is needed. CSV: docs/audits/backup-tables-2026-10/. drop after 2026-12-31';

-- ---------------------------------------------------------------------------
-- 2. Drop the four that are provably finished (CSVs verified above)
-- ---------------------------------------------------------------------------
-- INTENTIONAL DROP — four leftover backup copies, each one's source operation verified
-- complete against live data (see the header and docs/audits/backup-tables-2026-10/README.md),
-- and every row exported to CSV and checksum-matched against production first. The two copies
-- whose source operation could NOT be proven finished are quarantined above, not dropped.
-- The dynamic DROP in fn_log_retention below is also intentional: it only ever touches schema
-- backup, and only a table whose own COMMENT carries a past 'drop after' date.
DROP TABLE IF EXISTS public.expense_ledger_payout_dupes_bak_20260701;
DROP TABLE IF EXISTS public.shifts_hours_backup_pre347;
DROP TABLE IF EXISTS public.nomenclature_rename_backup_20260417;
DROP TABLE IF EXISTS public.coffee_roaster_reversal_bak_20260701;

-- ---------------------------------------------------------------------------
-- 3. fn_log_retention also expires the backup schema
--    Same contract as 496, plus a second pass over schema backup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_log_retention(
  p_max_batches integer DEFAULT 20,
  p_pause_s     numeric DEFAULT 0.1
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r         record;
  v_sql     text;
  v_deleted bigint;
  v_total   bigint;
  v_batches integer;
  v_capped  boolean;
  v_out     jsonb := '[]'::jsonb;
  v_dropped jsonb := '[]'::jsonb;
  v_date    date;
BEGIN
  -- ---- pass 1: row retention, driven by log_retention_policy ----
  FOR r IN
    SELECT id, schema_name, table_name, ts_column, keep_days, status_filter, batch_size
    FROM public.log_retention_policy
    WHERE enabled AND ts_column IS NOT NULL AND keep_days IS NOT NULL
    ORDER BY schema_name, table_name
  LOOP
    IF to_regclass(format('%I.%I', r.schema_name, r.table_name)) IS NULL THEN
      v_out := v_out || jsonb_build_object(
        'table', r.schema_name || '.' || r.table_name, 'skipped', 'target missing');
      CONTINUE;
    END IF;

    v_total   := 0;
    v_batches := 0;
    v_capped  := false;

    v_sql := format(
      'DELETE FROM %I.%I t WHERE t.ctid = ANY (ARRAY(
         SELECT c.ctid FROM %I.%I c
         WHERE c.%I < now() - make_interval(days => %s)%s
         ORDER BY c.%I
         LIMIT %s))',
      r.schema_name, r.table_name,
      r.schema_name, r.table_name,
      r.ts_column, r.keep_days,
      CASE WHEN r.status_filter IS NULL THEN '' ELSE ' AND (' || r.status_filter || ')' END,
      r.ts_column, r.batch_size);

    LOOP
      EXECUTE v_sql;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_total   := v_total + v_deleted;
      v_batches := v_batches + 1;

      EXIT WHEN v_deleted < r.batch_size;

      IF v_batches >= p_max_batches THEN
        v_capped := true;
        EXIT;
      END IF;

      IF p_pause_s > 0 THEN
        PERFORM pg_sleep(p_pause_s);
      END IF;
    END LOOP;

    UPDATE public.log_retention_policy
       SET last_run_at = now(), last_deleted = v_total, last_capped = v_capped
     WHERE id = r.id;

    v_out := v_out || jsonb_build_object(
      'table',   r.schema_name || '.' || r.table_name,
      'deleted', v_total,
      'batches', v_batches,
      'capped',  v_capped);

    IF v_capped THEN
      RAISE WARNING 'fn_log_retention: % still has a backlog after % batches (% rows deleted)',
        r.schema_name || '.' || r.table_name, p_max_batches, v_total;
    END IF;
  END LOOP;

  -- ---- pass 2: expire schema backup ----
  -- Only this schema, only an explicit past date in the table's own COMMENT. A copy with no
  -- parseable date is never dropped — it is reported, so a missing date fails safe and loud.
  FOR r IN
    SELECT c.relname,
           substring(obj_description(c.oid, 'pg_class')
                     from 'drop after ([0-9]{4}-[0-9]{2}-[0-9]{2})') AS drop_after
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'backup' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    IF r.drop_after IS NULL THEN
      RAISE WARNING 'fn_log_retention: backup.% has no ''drop after YYYY-MM-DD'' in its COMMENT; not dropping',
        r.relname;
      v_dropped := v_dropped || jsonb_build_object('table', 'backup.' || r.relname, 'skipped', 'no drop-after date');
      CONTINUE;
    END IF;

    v_date := r.drop_after::date;
    IF v_date < current_date THEN
      EXECUTE format('DROP TABLE IF EXISTS backup.%I', r.relname);
      v_dropped := v_dropped || jsonb_build_object('table', 'backup.' || r.relname, 'dropped_on', current_date, 'was_due', v_date);
      RAISE NOTICE 'fn_log_retention: dropped backup.% (due %)', r.relname, v_date;
    ELSE
      v_dropped := v_dropped || jsonb_build_object('table', 'backup.' || r.relname, 'kept_until', v_date);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ran_at', now(), 'tables', v_out, 'backup_schema', v_dropped);
END;
$fn$;

COMMENT ON FUNCTION public.fn_log_retention(integer, numeric) IS
  'Nightly housekeeping, two passes. (1) Row retention driven by log_retention_policy: deletes in batch_size chunks (ctid sub-select) up to p_max_batches per table, pausing p_pause_s between full batches, and records last_run_at/last_deleted/last_capped. (2) Expires schema backup: drops any table whose COMMENT carries a past ''drop after YYYY-MM-DD''; a copy without that date is warned about, never dropped. Returns a jsonb summary of both. SECURITY INVOKER — runs with the cron owner''s rights. Owner: db-reliability (MC 7352e57c).';

-- CREATE OR REPLACE preserves grants, but restate them so this file is self-contained
-- if it is ever replayed onto a database that never saw 496.
REVOKE ALL ON FUNCTION public.fn_log_retention(integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_log_retention(integer, numeric) TO service_role;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '499_drop_leftover_backup_tables.sql',
  'claude-code',
  NULL,
  'Dropped 4 verified-complete backup tables (~1.9 MB), quarantined 2 unproven ones into new schema backup with drop-after dates; fn_log_retention now expires that schema. CSVs in docs/audits/backup-tables-2026-10 (MC 725371dd)'
)
ON CONFLICT DO NOTHING;

COMMIT;
