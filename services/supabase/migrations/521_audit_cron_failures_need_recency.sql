-- 521 — cron failures must be RECENT to be reported, not merely inside the 7-day window
--       (MC 37f5dcaa, epic db-reliability 7352e57c)
--
-- FOUND BY THE FIRST REAL RUN, and it is the flaw that would have made this tool another
-- Data Sheriff. The first audit reported seven cron jobs as failing, two of them as breaches:
-- loyverse-push-drain 287 failures in 7 days (41/day), loyverse-push-watchdog 110 (15.7/day).
-- Alarming, and wrong as a present-tense claim. The distribution:
--
--   2026-10-10   0 failed / 1404 runs      2026-10-14   0 / 2037
--   2026-10-11   5 failed / 2037           2026-10-15   0 / 2037
--   2026-10-12   0 failed / 2037           2026-10-16 241 / 1698   <- the outage
--   2026-10-13   4 failed / 2037           2026-10-17 268 / 1250   <- its tail
--
-- Every one of those failures is the 2026-10-16 outage and the hour after recovery. The last
-- failure of any job is 2026-10-17 07:11 UTC; the database came back at 06:43. Nine hours
-- clean by the time the audit ran. Normal service is 0-5 failures a day out of ~2,000 runs.
--
-- SO THE METRIC WAS MEASURING HISTORY AND REPORTING IT AS NOW. Worse, it would have kept
-- doing so: a 7-day window means one incident re-files the same task every run until the
-- window slides past it — six more Mondays of "loyverse-push-drain is failing" about an
-- outage already closed as MC 7eccdf46. That is exactly the duplicate noise the delta design
-- exists to prevent, and no dedupe on related_ids would have caught it, because each week it
-- is genuinely a new snapshot of a real 7-day count.
--
-- THE FIX. The snapshot now also records failures_24h, and a cron finding is only reported if
-- that is non-zero. The 7-day count stays — it is the right denominator for "how bad" — but
-- recency decides whether it is news. An incident that stopped goes quiet on the next run
-- without anyone editing a threshold or closing a task.
--
-- The CEO's threshold (>10 failures/day) is unchanged; it is now AND-ed with recency rather
-- than replaced. A job failing 41 times a day today still breaches on the first run. A job
-- that failed 41 times a day last Tuesday and is fine today says nothing.
--
-- WHY THIS COULD ONLY BE FOUND BY RUNNING IT. On the PG14 fixture I seeded 105 failures at
-- now() - i minutes and the delta fired correctly — the seed was recent by construction, so
-- the missing recency condition was invisible. Synthetic data tends to be born at now().

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_db_audit_snapshot(p_advisors jsonb DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_run timestamptz := now();
BEGIN
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'db_size', 'database',
         jsonb_build_object('bytes', pg_database_size(current_database()));

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

  -- failures_24h is what decides whether this is news; failures over 7 days is the severity
  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'cron_failed_7d', coalesce(j.jobname, 'jobid:' || d.jobid),
         jsonb_build_object(
           'failures',     count(*),
           'per_day',      round(count(*)::numeric / 7, 1),
           'failures_24h', count(*) FILTER (WHERE d.start_time > v_run - interval '24 hours'),
           'last_failure', max(d.start_time),
           'last_message', left(max(d.return_message), 200))
  FROM cron.job_run_details d
  LEFT JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.status = 'failed' AND d.start_time > v_run - interval '7 days'
  GROUP BY 1, 2, 3;

  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'backup_table', n.nspname || '.' || c.relname,
         jsonb_build_object('bytes', pg_total_relation_size(c.oid),
                            'has_comment', obj_description(c.oid, 'pg_class') IS NOT NULL)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'backup')
    AND c.relname ~ '(_bak|_backup|_old|_tmp)';

  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'storage_size', 'storage',
         jsonb_build_object('bytes', coalesce(sum((metadata->>'size')::bigint), 0),
                            'objects', count(*))
  FROM storage.objects;

  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'retention_capped', schema_name || '.' || table_name,
         jsonb_build_object('last_deleted', last_deleted, 'last_run_at', last_run_at)
  FROM public.log_retention_policy
  WHERE enabled AND last_capped;

  INSERT INTO public.db_audit_snapshots (run_at, metric, key, value)
  SELECT v_run, 'cron_undocumented', j.jobname,
         jsonb_build_object('schedule', j.schedule, 'command_len', length(j.command))
  FROM cron.job j
  LEFT JOIN public.cron_job_catalog k ON k.jobname = j.jobname
  WHERE k.jobname IS NULL;

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
  'Takes one weekly DB audit snapshot into db_audit_snapshots: db size, top-20 table sizes, unused non-unique indexes, cron failures over 7 days WITH a failures_24h recency count, leftover *_bak*/_old/_tmp tables outside schema backup, storage bytes, capped retention runs, and cron jobs missing from cron_job_catalog. p_advisors carries the MCP get_advisors output so advisor lints are stored and diffed the same way. SECURITY DEFINER (mig 519): reads schema cron, which service_role has no USAGE on. Owner: tech/db-reliability (MC 37f5dcaa).';

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
  c_db_bytes      bigint := 350 * 1024 * 1024;
  c_table_bytes   bigint :=  50 * 1024 * 1024;
  c_storage_bytes bigint := 966367641;
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
           (c.value->>'bytes')::bigint        AS cur_bytes,
           (p.value->>'bytes')::bigint        AS prv_bytes,
           (c.value->>'per_day')::numeric     AS cur_per_day,
           coalesce((c.value->>'failures_24h')::int, 0) AS cur_fail_24h,
           c.value->>'level'                  AS cur_level,
           p.key IS NULL                      AS is_new
    FROM cur c LEFT JOIN prv p ON p.metric = c.metric AND p.key = c.key
  )
  SELECT
    CASE
      WHEN j.metric = 'db_size'           AND j.cur_bytes   > c_db_bytes      THEN 'breach'
      WHEN j.metric = 'table_size'        AND j.cur_bytes   > c_table_bytes   THEN 'breach'
      WHEN j.metric = 'storage_size'      AND j.cur_bytes   > c_storage_bytes THEN 'breach'
      WHEN j.metric = 'cron_failed_7d'    AND j.cur_per_day > c_cron_per_day
                                          AND j.cur_fail_24h > 0              THEN 'breach'
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
        format('cron %s failed %s times in 24h (%s in 7 days, %s/day), last at %s: %s',
               j.key, j.cur_v->>'failures_24h', j.cur_v->>'failures', j.cur_v->>'per_day',
               j.cur_v->>'last_failure', j.cur_v->>'last_message')
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
    (j.metric = 'db_size'        AND j.cur_bytes   > c_db_bytes)
 OR (j.metric = 'table_size'     AND j.cur_bytes   > c_table_bytes)
 OR (j.metric = 'storage_size'   AND j.cur_bytes   > c_storage_bytes)
    -- a cron job is reported only if it is STILL failing: the 7-day window alone would
    -- re-file one closed incident every run until the window slid past it
 OR (j.metric = 'cron_failed_7d' AND j.cur_per_day > c_cron_per_day AND j.cur_fail_24h > 0)
 OR (j.is_new AND j.metric IN ('backup_table','retention_capped','cron_undocumented'))
 OR (j.is_new AND j.metric LIKE 'advisor_%')
 OR (j.is_new AND j.metric = 'cron_failed_7d'
     AND (j.cur_v->>'failures')::int >= 3 AND j.cur_fail_24h > 0)
 OR (NOT j.is_new AND j.metric = 'unused_index')
 OR (j.metric IN ('db_size','table_size','storage_size')
     AND j.prv_bytes IS NOT NULL
     AND j.cur_bytes > j.prv_bytes * 1.20
     AND j.cur_bytes - j.prv_bytes > 5 * 1024 * 1024)
  ORDER BY 1, 2, 3;
END;
$fn$;

COMMENT ON FUNCTION public.fn_db_audit_delta(timestamptz) IS
  'Diffs the latest DB audit snapshot against the one before it and returns ONLY findings worth acting on: absolute threshold breaches (db > 350 MB, table > 50 MB, storage > 0.9 GiB, cron failing > 10/day AND still failing in the last 24h), anything newly appeared, and 20%+ week-on-week size growth above 5 MB. Deliberately silent on: a table merely entering the top-20 (rank churn), a freshly created unused index (never scanned yet by definition), a single cron blip, and — since migration 521 — a cron incident that has stopped, which a 7-day window would otherwise re-report every run for a week. Zero rows means a quiet week. severity is breach | new | standing | worse. Owner: tech/db-reliability (MC 37f5dcaa).';

REVOKE ALL ON FUNCTION public.fn_db_audit_snapshot(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_db_audit_delta(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_db_audit_snapshot(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_db_audit_delta(timestamptz) TO service_role;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '521_audit_cron_failures_need_recency.sql',
  'claude-code',
  NULL,
  'Audit cron findings now require failures in the last 24h, not just inside the 7-day window. The first run reported 7 jobs as failing (drain 41/day) when every failure was the 2026-10-16 outage, last one 07:11 UTC that morning; the 7-day window would have re-filed it weekly. snapshot records failures_24h + last_failure (MC 37f5dcaa).'
)
ON CONFLICT DO NOTHING;

COMMIT;
