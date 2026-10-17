-- 498 — weekly DB audit: a snapshot store, a collector, and a delta that only reports change
--       (MC 37f5dcaa, epic db-reliability 7352e57c)
--
-- WHY THIS SHAPE. Data Sheriff and Data Health both died the same death: they were a tab you
-- had to remember to open, and they reported inventory — the same 40 green rows every week —
-- so nobody opened them. This one is built the opposite way round. It takes a snapshot, diffs
-- it against the previous snapshot, and returns ONLY what is new or worse. A quiet week
-- returns zero rows, and zero rows is the success case: nothing to read, nothing to file.
--
-- THE SPLIT. Everything measurable in SQL is measured here, in the database, where it can be
-- tested and cannot drift from a script: sizes, unused indexes, failed cron runs, leftover
-- backup copies, storage bytes, retention backlogs, undocumented cron jobs. The one thing SQL
-- cannot see is the Supabase advisors (security/performance lints) — those come from the
-- Management API via the MCP tool, so the weekly agent passes them INTO fn_db_audit_snapshot
-- as jsonb and they are stored alongside everything else. That way "a new advisor ERROR
-- appeared" is the same kind of delta as "a table crossed 50 MB", and the dedupe logic is one
-- code path instead of two.
--
-- THRESHOLDS are the CEO's, from MC 37f5dcaa: database > 350 MB, any table > 50 MB, storage
-- > 0.9 GB, a cron job failing more than 10 times a day, any new *_bak* table, any new
-- advisor ERROR. They are absolute levels, deliberately separate from the "is it worse than
-- last week" test — a metric can be reported for either reason, and the severity says which.
--
-- WHAT THIS MIGRATION DOES NOT DO. It does not file tasks. emit_business_task needs to check
-- related_ids against open tasks so a finding is not re-filed every Monday, and that check
-- belongs to the agent holding the MC tools, not to a SQL function. This migration gives the
-- agent a clean list; scripts/db-audit.sh prints it; the scheduled session files it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.db_audit_snapshots (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at  timestamptz NOT NULL DEFAULT now(),
  metric  text NOT NULL,
  key     text NOT NULL,
  value   jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS db_audit_snapshots_run_idx    ON public.db_audit_snapshots (run_at DESC);
CREATE INDEX IF NOT EXISTS db_audit_snapshots_metric_idx ON public.db_audit_snapshots (metric, key, run_at DESC);

ALTER TABLE public.db_audit_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS db_audit_snapshots_read ON public.db_audit_snapshots;
CREATE POLICY db_audit_snapshots_read
  ON public.db_audit_snapshots FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.db_audit_snapshots IS
  'Weekly database audit snapshots, one row per metric/key. Written by fn_db_audit_snapshot (Monday 02:00 UTC scheduled session); read by fn_db_audit_delta to report only what changed. Owner: tech/db-reliability. retention: 365 days, cleaned by fn_log_retention';
COMMENT ON COLUMN public.db_audit_snapshots.metric IS 'Metric family: db_size, table_size, unused_index, cron_failed_7d, backup_table, storage_size, retention_capped, cron_undocumented, advisor_security, advisor_performance.';
COMMENT ON COLUMN public.db_audit_snapshots.key    IS 'What the metric is about: schema.table, index name, cron job name, advisor lint name, or a singleton like ''database''.';

-- ---------------------------------------------------------------------------
-- The collector. p_advisors is the MCP get_advisors output, passed in by the agent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_db_audit_snapshot(p_advisors jsonb DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_run timestamptz := now();
BEGIN
  -- database total
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'db_size', 'database',
         jsonb_build_object('bytes', pg_database_size(current_database()));

  -- top 20 tables by total size
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'table_size', n.nspname || '.' || c.relname,
         jsonb_build_object('bytes', pg_total_relation_size(c.oid),
                            'live_rows', coalesce(s.n_live_tup, 0))
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 20;

  -- indexes never used since the last stats reset (ignore unique/constraint indexes:
  -- those exist to enforce, not to be scanned, so idx_scan = 0 is not a finding)
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'unused_index', s.schemaname || '.' || s.indexrelname,
         jsonb_build_object('table', s.schemaname || '.' || s.relname,
                            'bytes', pg_relation_size(s.indexrelid),
                            'idx_scan', s.idx_scan)
  FROM pg_stat_user_indexes s
  JOIN pg_index i ON i.indexrelid = s.indexrelid
  WHERE s.idx_scan = 0
    AND NOT i.indisunique
    AND NOT i.indisprimary
    AND pg_relation_size(s.indexrelid) > 16384;

  -- cron failures over the last 7 days (job_run_details keeps exactly 7 days)
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'cron_failed_7d', coalesce(j.jobname, 'jobid:' || d.jobid),
         jsonb_build_object('failures', count(*),
                            'per_day', round(count(*)::numeric / 7, 1),
                            'last_message', left(max(d.return_message), 200))
  FROM cron.job_run_details d
  LEFT JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.status = 'failed' AND d.start_time > v_run - interval '7 days'
  GROUP BY 1, 2, 3;

  -- leftover copies anywhere outside the backup schema
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'backup_table', n.nspname || '.' || c.relname,
         jsonb_build_object('bytes', pg_total_relation_size(c.oid),
                            'has_comment', obj_description(c.oid, 'pg_class') IS NOT NULL)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'backup')
    AND c.relname ~ '(_bak|_backup|_old|_tmp)';

  -- storage usage from the object metadata
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'storage_size', 'storage',
         jsonb_build_object('bytes', coalesce(sum((metadata->>'size')::bigint), 0),
                            'objects', count(*))
  FROM storage.objects;

  -- retention runs that could not finish: a backlog the nightly job is not keeping up with
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'retention_capped', schema_name || '.' || table_name,
         jsonb_build_object('last_deleted', last_deleted, 'last_run_at', last_run_at)
  FROM public.log_retention_policy
  WHERE enabled AND last_capped;

  -- cron jobs with no row in the catalog (i.e. nobody wrote down what they are for)
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'cron_undocumented', j.jobname,
         jsonb_build_object('schedule', j.schedule, 'command_len', length(j.command))
  FROM cron.job j
  LEFT JOIN public.cron_job_catalog k ON k.jobname = j.jobname
  WHERE k.jobname IS NULL;

  -- advisors, handed in by the agent from the MCP get_advisors call
  IF p_advisors IS NOT NULL THEN
    INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
    SELECT v_run,
           'advisor_' || coalesce(a->>'advisor_type', 'security'),
           coalesce(a->>'name', a->>'title', 'unnamed'),
           jsonb_build_object('level',  upper(coalesce(a->>'level', 'INFO')),
                              'detail', left(coalesce(a->>'detail', a->>'description', ''), 300),
                              'count',  coalesce((a->>'count')::int, 1))
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_advisors) = 'array'
                THEN p_advisors ELSE jsonb_build_array(p_advisors) END) a;
  END IF;

  RETURN v_run;
END;
$fn$;

COMMENT ON FUNCTION public.fn_db_audit_snapshot(jsonb) IS
  'Takes one weekly DB audit snapshot into db_audit_snapshots: db size, top-20 table sizes, unused non-unique indexes, 7-day cron failures, leftover *_bak*/_old/_tmp tables outside schema backup, storage bytes, capped retention runs, and cron jobs missing from cron_job_catalog. p_advisors carries the MCP get_advisors output (array of findings) so advisor lints are stored and diffed the same way. Returns the run_at to pass to fn_db_audit_delta. Owner: tech/db-reliability (MC 37f5dcaa).';

-- ---------------------------------------------------------------------------
-- The delta. Returns nothing at all on a quiet week — that is the success case.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_db_audit_delta(p_run_at timestamptz DEFAULT NULL)
RETURNS TABLE (
  severity   text,
  metric     text,
  key        text,
  previous   jsonb,
  current    jsonb,
  headline   text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- the CEO's thresholds (MC 37f5dcaa)
  c_db_bytes      bigint := 350 * 1024 * 1024;
  c_table_bytes   bigint :=  50 * 1024 * 1024;
  c_storage_bytes bigint := 966367641;           -- 0.9 GiB
  c_cron_per_day  numeric := 10;
  v_run  timestamptz;
  v_prev timestamptz;
BEGIN
  v_run := coalesce(p_run_at, (SELECT max(run_at) FROM public.db_audit_snapshots));
  SELECT max(s.run_at) INTO v_prev
    FROM public.db_audit_snapshots s WHERE s.run_at < v_run;

  RETURN QUERY
  WITH cur AS (
    SELECT s.metric, s.key, s.value FROM public.db_audit_snapshots s WHERE s.run_at = v_run
  ), prv AS (
    SELECT s.metric, s.key, s.value FROM public.db_audit_snapshots s WHERE s.run_at = v_prev
  ), joined AS (
    SELECT c.metric, c.key, c.value AS cur_v, p.value AS prv_v,
           (c.value->>'bytes')::bigint     AS cur_bytes,
           (p.value->>'bytes')::bigint     AS prv_bytes,
           (c.value->>'per_day')::numeric  AS cur_per_day,
           c.value->>'level'               AS cur_level,
           p.key IS NULL                   AS is_new
    FROM cur c LEFT JOIN prv p ON p.metric = c.metric AND p.key = c.key
  )
  SELECT
    CASE
      WHEN j.metric = 'db_size'           AND j.cur_bytes   > c_db_bytes      THEN 'breach'
      WHEN j.metric = 'table_size'        AND j.cur_bytes   > c_table_bytes   THEN 'breach'
      WHEN j.metric = 'storage_size'      AND j.cur_bytes   > c_storage_bytes THEN 'breach'
      WHEN j.metric = 'cron_failed_7d'    AND j.cur_per_day > c_cron_per_day  THEN 'breach'
      WHEN j.metric = 'backup_table'      AND j.is_new                        THEN 'breach'
      WHEN j.metric LIKE 'advisor_%'      AND j.is_new AND j.cur_level = 'ERROR' THEN 'breach'
      WHEN j.metric = 'unused_index'                                           THEN 'standing'
      WHEN j.is_new                                                            THEN 'new'
      ELSE 'worse'
    END::text,
    j.metric, j.key, j.prv_v, j.cur_v,
    CASE
      WHEN j.metric = 'db_size' THEN
        format('database is %s (was %s)', pg_size_pretty(j.cur_bytes), coalesce(pg_size_pretty(j.prv_bytes), 'unmeasured'))
      WHEN j.metric = 'table_size' THEN
        format('%s is %s (was %s)', j.key, pg_size_pretty(j.cur_bytes), coalesce(pg_size_pretty(j.prv_bytes), 'absent'))
      WHEN j.metric = 'storage_size' THEN
        format('storage holds %s across %s objects', pg_size_pretty(j.cur_bytes), j.cur_v->>'objects')
      WHEN j.metric = 'cron_failed_7d' THEN
        format('cron %s failed %s times in 7 days (%s/day): %s', j.key, j.cur_v->>'failures', j.cur_v->>'per_day', j.cur_v->>'last_message')
      WHEN j.metric = 'backup_table' THEN
        format('leftover copy %s (%s) sits outside schema backup', j.key, pg_size_pretty(j.cur_bytes))
      WHEN j.metric = 'unused_index' THEN
        format('index %s on %s has never been scanned (%s)', j.key, j.cur_v->>'table', pg_size_pretty(j.cur_bytes))
      WHEN j.metric = 'retention_capped' THEN
        format('retention could not drain %s in one run (deleted %s)', j.key, j.cur_v->>'last_deleted')
      WHEN j.metric = 'cron_undocumented' THEN
        format('cron job %s (%s) has no row in cron_job_catalog', j.key, j.cur_v->>'schedule')
      WHEN j.metric LIKE 'advisor_%' THEN
        format('%s advisor %s: %s', j.cur_v->>'level', j.key, j.cur_v->>'detail')
      ELSE j.metric || ' ' || j.key
    END::text
  FROM joined j
  WHERE
    -- a breach is always reported, changed or not
    (j.metric = 'db_size'        AND j.cur_bytes   > c_db_bytes)
 OR (j.metric = 'table_size'     AND j.cur_bytes   > c_table_bytes)
 OR (j.metric = 'storage_size'   AND j.cur_bytes   > c_storage_bytes)
 OR (j.metric = 'cron_failed_7d' AND j.cur_per_day > c_cron_per_day)
    -- otherwise only genuinely new things
 OR (j.is_new AND j.metric IN ('backup_table','retention_capped','cron_undocumented'))
 OR (j.is_new AND j.metric LIKE 'advisor_%')
    -- a job that has started failing at all, once it is past a single blip
 OR (j.is_new AND j.metric = 'cron_failed_7d' AND (j.cur_v->>'failures')::int >= 3)
    -- an unused index is reported only once it has survived a second snapshot: a freshly
    -- created index has legitimately never been scanned yet, and flagging it is a false alarm
 OR (NOT j.is_new AND j.metric = 'unused_index')
    -- measurable growth. table_size is NOT reported merely for being new: the snapshot keeps
    -- the top 20, so rank 20/21 churn would file a finding every week and this whole report
    -- would go back to being inventory nobody reads.
 OR (j.metric IN ('db_size','table_size','storage_size')
     AND j.prv_bytes IS NOT NULL
     AND j.cur_bytes > j.prv_bytes * 1.20          -- 20% week-on-week growth
     AND j.cur_bytes - j.prv_bytes > 5 * 1024 * 1024)
  ORDER BY 1, 2, 3;
END;
$fn$;

COMMENT ON FUNCTION public.fn_db_audit_delta(timestamptz) IS
  'Diffs the latest DB audit snapshot against the one before it and returns ONLY findings worth acting on: absolute threshold breaches (db > 350 MB, table > 50 MB, storage > 0.9 GiB, cron failing > 10/day), anything newly appeared (leftover copy, unused index, failing job, capped retention, undocumented cron job, new advisor), and 20%+ week-on-week size growth above 5 MB. A table is never reported just for entering the top-20 (rank churn is not a finding), an unused index only after it survives a second snapshot (a fresh index has legitimately never been scanned), and a newly failing cron job only past 3 failures. Zero rows means a quiet week. severity is breach | new | standing | worse. Owner: tech/db-reliability (MC 37f5dcaa).';

-- the snapshot store is itself a growing table, so it registers like everything else
INSERT INTO public.log_retention_policy
  (schema_name, table_name, ts_column, keep_days, status_filter, enabled, reason)
VALUES
  ('public','db_audit_snapshots','run_at',365,NULL,true,
   'Weekly DB audit snapshots. A year of history is enough to see a seasonal trend; older snapshots are never read.')
ON CONFLICT (schema_name, table_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants, matching the post-490 house pattern. The weekly audit runs as service_role
-- (scripts/db-audit.sh); nobody else needs these.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_db_audit_snapshot(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_db_audit_delta(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_db_audit_snapshot(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_db_audit_delta(timestamptz) TO service_role;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '498_db_audit_snapshots.sql',
  'claude-code',
  NULL,
  'db_audit_snapshots + fn_db_audit_snapshot(advisors jsonb) + fn_db_audit_delta: weekly audit stores a snapshot and reports only new/worse findings against the CEO thresholds (MC 37f5dcaa)'
)
ON CONFLICT DO NOTHING;

COMMIT;
