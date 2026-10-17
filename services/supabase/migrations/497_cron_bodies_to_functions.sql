-- 497 — cron bodies move into functions; every job body becomes one line
--       (MC 2a0ad979, epic db-reliability 7352e57c)
--
-- WHY. cron.job_run_details stores the FULL command text of every run. Job #9
-- (loyverse-push-drain) runs every minute with an 876-character body, so it writes its own
-- SQL into the history 1,440 times a day. Measured on the 7 days of history that survive
-- job #15: 8,484 kB of command text for #9 alone out of 9,629 kB total — 88% of it, about
-- 1.2 MB/day, which is the 148 MB of command text that accumulated over four months and
-- filled the disk on 2026-10-16. Jobs #10, #1, #2 and #3 are the same shape, smaller.
--
-- After this migration the five bodies are `SELECT public.fn_x(...)` — about 40 bytes each.
-- Projected: #9 goes from ~1.2 MB/day to ~58 kB/day, the five together from ~1.37 MB/day to
-- ~75 kB/day. That is the whole point of the change; the logic is unchanged.
--
-- BEHAVIOUR IS PRESERVED, deliberately and exactly:
--   * the drain still claims up to 5 pending rows with FOR UPDATE SKIP LOCKED, marks them
--     processing, increments attempts, and POSTs one request per claimed row;
--   * the watchdog still re-queues processing rows older than 5 minutes and gives up at 3
--     attempts with the same error_message text;
--   * the three pull jobs still POST to the same URL with the same action, headers and
--     150 s timeout.
-- The one intentional difference is the failure path: a missing vault secret now raises with
-- a named reason instead of passing NULL into net.http_post. It still FAILS the run — loudly,
-- in job_run_details — because a silent success would hide a broken integration from the
-- weekly audit. Fail-loud is the behaviour being kept.
--
-- VAULT IS READ INSIDE THE FUNCTION (the question MC 2a0ad979 asks in 2b). Each function
-- does its own SELECT from vault.decrypted_secrets; no secret is ever interpolated into a
-- cron body, so no secret can land in cron.job_run_details. That is a security improvement
-- on top of the size one: until now the command text in the history contained the vault
-- lookups, and any future edit that inlined a literal would have been archived in plain text.
-- The functions are SECURITY INVOKER: they run with the cron owner's rights (postgres), and
-- a caller without the vault grant simply cannot read the secrets. No grant is added here —
-- function grants and search_path hardening belong to MC f133850a, running in parallel.
--
-- CRON JOBS CANNOT BE COMMENTED. pg_cron keeps jobs as rows in cron.job, and COMMENT ON has
-- no target for a row, so "a COMMENT on every cron job" has to live somewhere else:
-- public.cron_job_catalog, one row per job with purpose, owner, what breaks if it is turned
-- off, and the justification for intervals under 5 minutes. It is also machine-readable, so
-- the weekly DB audit can diff the catalog against cron.job and notice an undocumented job.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Job #9 — loyverse-push-drain
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_loyverse_push_drain(p_batch integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_url     text;
  v_secret  text;
  v_claimed integer;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'loyverse_push_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'loyverse_internal_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE EXCEPTION 'fn_loyverse_push_drain: vault secret missing (loyverse_push_url=%, loyverse_internal_secret=%)',
      (v_url IS NOT NULL), (v_secret IS NOT NULL);
  END IF;

  WITH claimed AS (
    UPDATE public.loyverse_push_queue q
       SET status = 'processing', attempts = attempts + 1, processed_at = now()
     WHERE q.id IN (
       SELECT id FROM public.loyverse_push_queue
        WHERE status = 'pending'
        ORDER BY requested_at
        LIMIT p_batch
        FOR UPDATE SKIP LOCKED
     )
    RETURNING q.id, q.action, q.target_id
  ), posted AS (
    SELECT net.http_post(
      url     := v_url || '?action=internal_push',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-internal-secret', v_secret),
      body    := jsonb_build_object(
                   'queue_id',  c.id,
                   'action',    c.action::text,
                   'target_id', c.target_id),
      timeout_milliseconds := 150000) AS request_id
    FROM claimed c
  )
  SELECT count(*)::integer INTO v_claimed FROM posted;

  RETURN v_claimed;
END;
$fn$;

COMMENT ON FUNCTION public.fn_loyverse_push_drain(integer) IS
  'Body of cron job #9 loyverse-push-drain. Claims up to p_batch pending rows from loyverse_push_queue (FOR UPDATE SKIP LOCKED), marks them processing and POSTs one internal_push per row to the Loyverse push edge function. Returns the number of rows claimed. Owner: integrations. Breaks if disabled: menu, price and modifier edits never reach the till — the queue grows and nothing syncs. Reads vault inside the function so no secret reaches cron.job_run_details.';

-- ---------------------------------------------------------------------------
-- 2. Job #10 — loyverse-push-watchdog
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_loyverse_push_watchdog(p_stuck_after interval DEFAULT interval '5 minutes')
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rescued integer;
BEGIN
  UPDATE public.loyverse_push_queue
     SET status        = CASE WHEN attempts >= 3 THEN 'error' ELSE 'pending' END,
         error_message = CASE WHEN attempts >= 3
                              THEN 'watchdog: stuck in processing, exceeded 3 attempts'
                              ELSE error_message END
   WHERE status = 'processing'
     AND processed_at < now() - p_stuck_after;

  GET DIAGNOSTICS v_rescued = ROW_COUNT;
  RETURN v_rescued;
END;
$fn$;

COMMENT ON FUNCTION public.fn_loyverse_push_watchdog(interval) IS
  'Body of cron job #10 loyverse-push-watchdog. Re-queues loyverse_push_queue rows left in processing longer than p_stuck_after; at 3+ attempts marks them error instead. Returns rows touched. Owner: integrations. Breaks if disabled: a push that dies mid-flight stays processing forever and that queue row never retries — silent partial sync.';

-- ---------------------------------------------------------------------------
-- 3. Jobs #1, #2, #3 — loyverse pull, one function parameterised by action
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_loyverse_pull(p_action text)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_url     text;
  v_bearer  text;
  v_request bigint;
BEGIN
  IF p_action NOT IN ('receipts', 'shifts', 'all') THEN
    RAISE EXCEPTION 'fn_loyverse_pull: unknown action %, expected receipts|shifts|all', p_action;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'loyverse_pull_url';
  SELECT decrypted_secret INTO v_bearer
    FROM vault.decrypted_secrets WHERE name = 'loyverse_pull_bearer';

  IF v_url IS NULL OR v_bearer IS NULL THEN
    RAISE EXCEPTION 'fn_loyverse_pull(%): vault secret missing (loyverse_pull_url=%, loyverse_pull_bearer=%)',
      p_action, (v_url IS NOT NULL), (v_bearer IS NOT NULL);
  END IF;

  SELECT net.http_post(
    url     := v_url || '?action=' || p_action,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_bearer),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000)
  INTO v_request;

  RETURN v_request;
END;
$fn$;

COMMENT ON FUNCTION public.fn_loyverse_pull(text) IS
  'Body of cron jobs #1 loyverse-pull-receipts (receipts), #2 loyverse-pull-shifts (shifts) and #3 loyverse-pull-dim (all). POSTs to the Loyverse pull edge function and returns the pg_net request id. Owner: integrations. Breaks if disabled: sales receipts, shift records and item/modifier dimensions stop arriving — analytics, payroll hours and the POS mirror all go stale. Reads vault inside the function so no secret reaches cron.job_run_details.';

-- ---------------------------------------------------------------------------
-- 4. The catalog that stands in for a COMMENT on a cron job
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_job_catalog (
  jobname             text PRIMARY KEY,
  purpose             text NOT NULL,
  owner               text NOT NULL,
  breaks_if_disabled  text NOT NULL,
  interval_rationale  text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_job_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_job_catalog_read ON public.cron_job_catalog;
CREATE POLICY cron_job_catalog_read
  ON public.cron_job_catalog FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.cron_job_catalog IS
  'Documentation for every pg_cron job: purpose, owner, what breaks if it is turned off, and why a sub-5-minute interval is justified. Exists because pg_cron stores jobs as rows in cron.job and COMMENT ON cannot target a row. The weekly DB audit diffs this against cron.job to catch undocumented jobs. Written only by migrations; read by owners. retention: none (config table), cleaned by nobody';

INSERT INTO public.cron_job_catalog (jobname, purpose, owner, breaks_if_disabled, interval_rationale)
VALUES
  ('loyverse-pull-receipts','Pull sales receipts from Loyverse into the local mirror.','integrations',
   'Sales data stops arriving: analytics, COGS and the control reports go stale.',
   '15 min: Loyverse is the till, and a quarter-hour lag is invisible to reporting.'),
  ('loyverse-pull-shifts','Pull till shift records from Loyverse.','integrations',
   'Shift records stop arriving; cash reconciliation and payroll hours lose their source.',
   '30 min: shifts change a few times a day.'),
  ('loyverse-pull-dim','Pull the full item/modifier dimension once a day.','integrations',
   'The POS mirror drifts from the till: dish and modifier edits made in Back Office are never seen.',
   'Daily at 20:00 UTC (03:00 Phuket) — a full pull, deliberately outside trading hours.'),
  ('staff-tasks-materialize','Materialise recurring staff tasks for the current date.','ops',
   'Daily, weekly and monthly SOP tasks never appear in /my-tasks; the kitchen loses its checklist.',
   'Once a day, just after midnight UTC.'),
  ('staff-tasks-morning','Push the morning task digest to staff via Telegram.','ops',
   'Staff get no morning digest and work from memory.', 'Once a day.'),
  ('staff-tasks-schedule','Push the shift schedule notification to staff.','ops',
   'Staff are not told who works today.', 'Once a day.'),
  ('staff-tasks-reminders','Re-notify staff about tasks still open.','ops',
   'Open tasks are never chased and quietly expire.',
   '15 min: a reminder has to land inside the shift it belongs to.'),
  ('loyverse-payouts-to-ledger','Copy Loyverse cash payouts into expense_ledger.','finance',
   'Cash payouts never reach the ledger: the cash position and expense totals under-report.',
   'Hourly.'),
  ('loyverse-push-drain','Drain loyverse_push_queue: send queued menu/price/modifier edits to the till.','integrations',
   'Menu, price and modifier edits never reach the till; the queue grows unbounded.',
   'Every minute today. The queue takes 38 rows a month (max 13 in any one hour, 0.05/hour on average), so a minute buys nothing a 5-minute tick would not: see MC 2a0ad979, awaiting the CEO decision. Kept at 1 minute until then so this migration changes size, not timing.'),
  ('loyverse-push-watchdog','Rescue loyverse_push_queue rows stuck in processing.','integrations',
   'A push that dies mid-flight stays processing forever and never retries.',
   '5 min, matched to the 5-minute stuck threshold it enforces.'),
  ('attendance-no-show','Flag staff who have not clocked in.','ops',
   'No-shows are noticed only by eye, and attendance-driven payroll silently over-pays.',
   '15 min during 02:00-11:00 UTC (09:00-18:00 Phuket) — clock-ins only happen in the working day.'),
  ('staff-fire-date-expiry','Retire staff whose fire_date has passed.','ops',
   'Departed staff keep appearing in schedules, payroll and the task tracker.', 'Once a day.'),
  ('cron-history-cleanup','Delete cron.job_run_details rows older than 7 days.','tech',
   'THE 2026-10-16 OUTAGE. The run history grows without limit until it fills the disk and the whole database stops. Deliberately independent of fn_log_retention so this table is never left without a cleaner.',
   'Daily at 03:00 UTC, 10 minutes before log-retention so the two never overlap.'),
  ('log-retention','Purge every journal and queue registered in log_retention_policy.','tech',
   'Every log table except cron.job_run_details grows without limit again — loyverse_sync_log alone added 19k rows in five months.',
   'Daily at 03:10 UTC (10:10 Phuket), after cron-history-cleanup.')
ON CONFLICT (jobname) DO UPDATE
  SET purpose = EXCLUDED.purpose,
      owner = EXCLUDED.owner,
      breaks_if_disabled = EXCLUDED.breaks_if_disabled,
      interval_rationale = EXCLUDED.interval_rationale;

-- ---------------------------------------------------------------------------
-- 5. Swap the bodies. Schedules are untouched on purpose.
-- ---------------------------------------------------------------------------
SELECT cron.alter_job(1,  command => 'SELECT public.fn_loyverse_pull(''receipts'')');
SELECT cron.alter_job(2,  command => 'SELECT public.fn_loyverse_pull(''shifts'')');
SELECT cron.alter_job(3,  command => 'SELECT public.fn_loyverse_pull(''all'')');
SELECT cron.alter_job(9,  command => 'SELECT public.fn_loyverse_push_drain()');
SELECT cron.alter_job(10, command => 'SELECT public.fn_loyverse_push_watchdog()');

-- ---------------------------------------------------------------------------
-- Grants, matching the post-490 house pattern (owner + service_role only).
-- These three functions read vault secrets, so PUBLIC EXECUTE on them is not acceptable
-- even for a moment. They stay SECURITY INVOKER: cron runs them as its own owner, which
-- already has the vault grant, and any other caller simply cannot read the secrets.
-- Only functions created by this migration are affected.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_loyverse_push_drain(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_loyverse_push_watchdog(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_loyverse_pull(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_loyverse_push_drain(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_loyverse_push_watchdog(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_loyverse_pull(text) TO service_role;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '497_cron_bodies_to_functions.sql',
  'claude-code',
  NULL,
  'Cron jobs 1,2,3,9,10 bodies moved into fn_loyverse_pull/fn_loyverse_push_drain/fn_loyverse_push_watchdog; cron_job_catalog documents all 14 jobs. Command text per day: ~1.37 MB -> ~75 kB (MC 2a0ad979)'
)
ON CONFLICT DO NOTHING;

COMMIT;
