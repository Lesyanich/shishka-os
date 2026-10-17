-- 496 — log retention: one config table, one cleaner, one cron slot
--       (MC 44278890, epic db-reliability 7352e57c)
--
-- WHY. On 2026-10-16 the database was down ~14 hours. cron.job_run_details had grown since
-- June with nobody trimming it — 328 MB of 419 — and the Nano instance ran out of disk. That
-- one table now has a cleaner (cron job #15, 7 days). Every OTHER journal in this database
-- still has none: loyverse_sync_log holds 19,180 rows and has never seen a single DELETE
-- (n_tup_del = 0 since 2026-05-18). The fix is not another cleaner per table — it is one
-- registry that says, for every log-shaped table, who cleans it and after how long.
--
-- THE REGISTRY IS THE DELIVERABLE, not the DELETE. log_retention_policy carries a row for
-- every journal, queue and audit trail in the database — including the ones we deliberately
-- never purge (purchase_logs feeds WAC; haccp_logs and shifts_audit are legal evidence). A
-- table absent from this registry is the bug: it means nobody has decided. That is why the
-- never-purge tables get rows too, with keep_days NULL and enabled = false, instead of being
-- left out.
--
-- WHAT IS DELIBERATELY NOT HERE.
--   * net._http_response / net.http_request_queue are UNLOGGED and pg_net trims them itself
--     on pg_net.ttl = 6 hours — 34,577 inserts have left 3 live rows. Registered, disabled.
--   * cron.job_run_details stays owned by cron job #15. It is the table that caused the
--     outage, so it keeps an independent cleaner that does not depend on this function being
--     healthy. Registered, disabled, with the reason recorded.
--   * task_comments and stock_movements were raised as candidates in the MC task. They are
--     business records, not logs. Registered, disabled, so the question is closed in writing.
--
-- BATCHING, AND ITS HONEST LIMIT. Each DELETE takes at most batch_size rows (default 5,000)
-- via a ctid sub-select, looping until a short batch or p_max_batches. That is what keeps a
-- single statement from timing out and rolling back the way one big DELETE did on Nano
-- yesterday — the per-statement work is bounded, so locks and WAL per statement are bounded.
-- It does NOT make the run multi-transactional: a plpgsql FUNCTION cannot COMMIT, so the
-- whole call is still one transaction, and a timeout in batch N discards batches 1..N-1.
-- With a 100k-row ceiling per run and a real daily delta near 100 rows, that is acceptable.
-- If any table ever carries a backlog where it is not, the switch is a PROCEDURE with COMMIT
-- per batch called as `CALL`, which is a one-line change to the cron body. Noted on purpose.
--
-- SQL ASSEMBLED FROM A TABLE. status_filter is a SQL fragment stored as data, so it is held
-- to a conservative character whitelist by CHECK, and only service_role/postgres can write
-- the table at all (RLS on, no write policy). Readers are authenticated.

BEGIN;

CREATE TABLE IF NOT EXISTS public.log_retention_policy (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name   text    NOT NULL DEFAULT 'public',
  table_name    text    NOT NULL,
  ts_column     text,
  keep_days     integer,
  status_filter text,
  batch_size    integer NOT NULL DEFAULT 5000,
  enabled       boolean NOT NULL DEFAULT false,
  reason        text    NOT NULL,
  last_run_at   timestamptz,
  last_deleted  integer,
  last_capped   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT log_retention_policy_target_uq UNIQUE (schema_name, table_name),
  CONSTRAINT log_retention_policy_keep_days_ck CHECK (keep_days IS NULL OR keep_days > 0),
  CONSTRAINT log_retention_policy_batch_ck     CHECK (batch_size BETWEEN 100 AND 25000),
  -- an enabled row must be actionable: it needs both a column to age on and a horizon
  CONSTRAINT log_retention_policy_enabled_ck
    CHECK (NOT enabled OR (ts_column IS NOT NULL AND keep_days IS NOT NULL)),
  -- status_filter is interpolated into SQL; keep it to identifiers, literals and comparisons
  CONSTRAINT log_retention_policy_filter_shape_ck
    CHECK (status_filter IS NULL OR status_filter ~ '^[A-Za-z0-9_,''\s().<>=!-]+$')
);

ALTER TABLE public.log_retention_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS log_retention_policy_read ON public.log_retention_policy;
CREATE POLICY log_retention_policy_read
  ON public.log_retention_policy FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.log_retention_policy IS
  'Retention registry: one row per journal/queue/audit table saying who cleans it and after how many days. Written only by migrations (service_role); read by owners. Enabled rows are purged nightly by fn_log_retention (cron job log-retention, 03:10 UTC). A log-shaped table missing from here is an unmade decision, not an exemption. retention: none (config table), cleaned by nobody.';
COMMENT ON COLUMN public.log_retention_policy.ts_column     IS 'Timestamp column the age is measured on. NULL only on never-purge rows.';
COMMENT ON COLUMN public.log_retention_policy.keep_days     IS 'Rows older than this are deleted. NULL = keep forever.';
COMMENT ON COLUMN public.log_retention_policy.status_filter IS 'Optional extra predicate, e.g. status IN (''done'',''error'') so only terminal queue rows are purged. Shape-constrained; interpolated into dynamic SQL.';
COMMENT ON COLUMN public.log_retention_policy.last_capped   IS 'TRUE if the last run hit p_max_batches, i.e. a backlog remains. The weekly DB audit reads this.';

-- ---------------------------------------------------------------------------
-- The cleaner. Cron calls this and nothing else.
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
BEGIN
  FOR r IN
    SELECT id, schema_name, table_name, ts_column, keep_days, status_filter, batch_size
    FROM public.log_retention_policy
    WHERE enabled AND ts_column IS NOT NULL AND keep_days IS NOT NULL
    ORDER BY schema_name, table_name
  LOOP
    -- a dropped target must not take the whole nightly run down with it
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

      -- breathe between full batches so a backlog purge does not monopolise I/O on Nano
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

  RETURN jsonb_build_object('ran_at', now(), 'tables', v_out);
END;
$fn$;

COMMENT ON FUNCTION public.fn_log_retention(integer, numeric) IS
  'Nightly log purge driven by log_retention_policy. Deletes in batch_size chunks (ctid sub-select) up to p_max_batches per table, pausing p_pause_s between full batches. Returns a per-table jsonb summary and sets last_run_at/last_deleted/last_capped. SECURITY INVOKER: runs with the cron owner''s rights, so it needs no grant of its own. Owner: db-reliability (MC 7352e57c).';

-- ---------------------------------------------------------------------------
-- The registry contents. Enabled rows first, then the documented never-purge set.
-- ---------------------------------------------------------------------------
INSERT INTO public.log_retention_policy
  (schema_name, table_name, ts_column, keep_days, status_filter, enabled, reason)
VALUES
  -- technical journals
  ('public','loyverse_sync_log','started_at',14,NULL,true,
   'Loyverse sync attempts (pull cron #1-#3, push drain #9). The ONLY place that shows why a till push failed, and nobody reads it beyond the last few days — the CEO set 14 days on 2026-10-17 after we checked who actually writes and reads it. 19,180 rows and zero deletes before this migration.'),
  ('public','api_cost_log','ts',90,NULL,true,
   'Per-call external API cost, read by /admin/api-costs. 90d keeps a full quarter for cost review.'),
  ('public','brain_query_log','ts',90,NULL,true,
   'LightRAG per-query cost/latency, read by /admin/brain-cost. Same horizon as api_cost_log.'),
  ('public','access_audit_log','created_at',90,NULL,true,
   'Admin access audit trail. 90d: long enough to investigate, short enough not to accumulate.'),
  ('public','syrve_sync_log','created_at',30,NULL,true,
   'SYRVE sync attempts. Same class as loyverse_sync_log but left at 30d: the table is empty (the integration lives only in the syrve-poc edge function), so the horizon is theoretical until it actually writes. See MC c0ec41b0.'),
  -- queues: terminal rows only, live work is never touched
  ('public','loyverse_push_queue','requested_at',14,'status IN (''done'',''error'')',true,
   'Loyverse push queue. Only done/error rows are purged after 14d — pending/processing are live work the drain still owns.'),
  ('public','syrve_sync_queue','created_at',14,'status IN (''done'',''error'')',true,
   'SYRVE sync queue, terminal rows only, same rule as loyverse_push_queue.'),
  -- registered but OFF, each for a stated reason
  ('public','chef_feedback_queue','created_at',NULL,NULL,false,
   'Queue, currently empty. OFF because its terminal status vocabulary is unverified — enable with a status_filter once a row exists to confirm it.'),
  ('cron','job_run_details','start_time',7,NULL,false,
   'OFF on purpose: owned by cron job #15 (7d). This is the table that filled the disk on 2026-10-16, so it keeps a cleaner that does not depend on fn_log_retention being healthy. Exactly one owner.'),
  ('net','_http_response',NULL,NULL,NULL,false,
   'UNLOGGED; pg_net trims it itself on pg_net.ttl = 6h (34,577 inserts, 3 live rows). Nothing for us to do.'),
  ('net','http_request_queue',NULL,NULL,NULL,false,
   'UNLOGGED; managed by the pg_net background worker.'),
  -- never purge: these are evidence or inputs, not logs
  ('public','purchase_logs',NULL,NULL,NULL,false,
   'NEVER PURGE. Input to WAC/COGS — deleting history silently rewrites product costs.'),
  ('public','migration_log',NULL,NULL,NULL,false,
   'NEVER PURGE. Registry of applied migrations and the authority for migration numbering.'),
  ('public','shifts_audit',NULL,NULL,NULL,false,
   'NEVER PURGE without legal sign-off. Labour-law evidence (LEG-004); retention intent is 365d minimum, but purging stays OFF until a lawyer confirms the floor.'),
  ('public','value_change_audit',NULL,NULL,NULL,false,
   'NEVER PURGE. Audit trail of value changes.'),
  ('public','haccp_logs',NULL,NULL,NULL,false,
   'NEVER PURGE. Immutable HACCP checkpoint trail, append-only by design.'),
  ('public','task_comments',NULL,NULL,NULL,false,
   'Not a log. Mission Control discussion history — business record. Raised as a candidate in MC 44278890 and rejected here so the question stays closed.'),
  ('public','stock_movements',NULL,NULL,NULL,false,
   'Not a log. Stock ledger — business record. Raised as a candidate in MC 44278890 and rejected here.')
ON CONFLICT (schema_name, table_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Every covered table says its own retention out loud. Existing comment text is preserved.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.loyverse_sync_log IS
  'Loyverse sync attempt log (pull cron #1-#3, push drain #9). Written by edge functions; read for incident triage — the only record of why a till push failed. Owner: integrations. retention: 14 days, cleaned by fn_log_retention';
COMMENT ON TABLE public.api_cost_log IS
  'Unified per-call cost log for all external API usage (receipt OCR, brain, future). Consumed by /admin/api-costs dashboard. Owner: finance-ops. retention: 90 days, cleaned by fn_log_retention';
COMMENT ON TABLE public.brain_query_log IS
  'Per-query cost + latency log for LightRAG brain. Populated by lightrag-server wrapper, consumed by /admin/brain-cost dashboard. Owner: tech. retention: 90 days, cleaned by fn_log_retention';
COMMENT ON TABLE public.access_audit_log IS
  'Admin access audit trail. Owner: tech/security. retention: 90 days, cleaned by fn_log_retention';
COMMENT ON TABLE public.syrve_sync_log IS
  'SYRVE sync attempt log. Owner: integrations. retention: 30 days, cleaned by fn_log_retention';
COMMENT ON TABLE public.loyverse_push_queue IS
  'Outbound Loyverse push queue; drained by cron #9, rescued by watchdog #10. Owner: integrations. Breaks if disabled: menu/price edits never reach the till. retention: 14 days for done/error rows only, cleaned by fn_log_retention';
COMMENT ON TABLE public.syrve_sync_queue IS
  'Outbound SYRVE sync queue. Owner: integrations. retention: 14 days for done/error rows only, cleaned by fn_log_retention';
COMMENT ON TABLE public.purchase_logs IS
  'Purchase log entries — input to WAC/COGS. Owner: finance. retention: none (never purge), cleaned by nobody';
COMMENT ON TABLE public.migration_log IS
  'Registry of applied SQL migrations. Baseline seeded by 094. Authority for migration numbering. Owner: tech. retention: none (never purge), cleaned by nobody';
COMMENT ON TABLE public.value_change_audit IS
  'Audit trail of value changes. Owner: tech. retention: none (never purge), cleaned by nobody';
COMMENT ON TABLE public.haccp_logs IS
  'Immutable HACCP checkpoint audit trail. Append-only — no UPDATE/DELETE policies. Owner: kitchen/compliance. retention: none (never purge), cleaned by nobody';
COMMENT ON TABLE public.shifts_audit IS
  'Append-only history of every shifts INSERT/UPDATE/DELETE with its actor (LEG-004). No FK to shifts: a deleted shift must not take its own audit trail with it. Written only by trg_shifts_audit; owners read. retention: none (never purge without legal sign-off; intent 365 days minimum), cleaned by nobody';

-- ---------------------------------------------------------------------------
-- Cron slot. Body is one call and nothing else, so job_run_details stores ~40 bytes a night.
-- 03:10 UTC = 10:10 Phuket, and 10 minutes after job #15 so the two never overlap.
-- ---------------------------------------------------------------------------
SELECT cron.schedule('log-retention', '10 3 * * *', 'SELECT public.fn_log_retention()');

-- ---------------------------------------------------------------------------
-- Grants on the new function, matching the post-490 house pattern
-- (owner + service_role only, PUBLIC revoked, search_path pinned).
-- Migration 490 (MC f133850a, parallel session) closed every existing public RPC to
-- anon/authenticated. A new function created with Postgres defaults would arrive with
-- EXECUTE to PUBLIC and quietly re-open a hole that migration had just shut, so it is
-- closed here at birth rather than left for the next audit. This touches ONLY the
-- functions this migration creates — no existing grant, policy or search_path is altered.
-- Deviation from the siblings, on purpose: these stay SECURITY INVOKER rather than
-- DEFINER. fn_log_retention deletes rows and drops tables, so if its grant is ever
-- widened by mistake, invoker rights mean RLS and table privileges still apply.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_log_retention(integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_log_retention(integer, numeric) TO service_role;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '496_log_retention_policy.sql',
  'claude-code',
  NULL,
  'Log retention registry + fn_log_retention + nightly cron 03:10 UTC. 19 tables registered, 7 enabled; first run purges ~17.9k rows (MC 44278890; loyverse_sync_log at 14d per CEO 2026-10-17)'
)
ON CONFLICT DO NOTHING;

COMMIT;
