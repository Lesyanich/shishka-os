-- Migration 334 — loyverse_push_queue + pg_cron drain
-- Why: the security audit moved LOYVERSE_API_TOKEN into the loyverse-sync edge
-- function's secrets, so the chat agent can no longer push to the POS. Instead of
-- handing a key back, the agent (or admin) ENQUEUES a push request row here via SQL;
-- a 1-minute pg_cron job drains the queue and calls loyverse-sync server-side,
-- reading a shared secret from supabase_vault. The raw POS token never leaves the
-- edge function. Mirrors the cron+vault+pg_net pattern of migration 276.
--
-- IMPORTANT: secrets are NOT hardcoded here. Before/after applying, create them
-- out-of-band (via execute_sql), and set the matching edge-function secret:
--   SELECT vault.create_secret(
--     'https://qcqgtcsjoacuktcewpvo.supabase.co/functions/v1/loyverse-sync',
--     'loyverse_push_url');
--   SELECT vault.create_secret('<random-32+ char secret>', 'loyverse_internal_secret');
--   -- and, in the loyverse-sync function secrets (dashboard / `supabase secrets set`):
--   --   LOYVERSE_INTERNAL_SECRET=<same value as loyverse_internal_secret>
-- loyverse-sync is deployed --no-verify-jwt, so no Authorization header is needed;
-- the x-internal-secret header is the only gate for the server-to-server path.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. Push-action enum ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyverse_push_action') THEN
    CREATE TYPE loyverse_push_action AS ENUM ('dish', 'prices', 'names', 'modifiers');
  END IF;
END $$;

-- ── 2. The queue ────────────────────────────────────────────
-- processed_at = last dispatch time while status='processing'; overwritten with the
-- completion time by the edge function when it writes the terminal status. The
-- watchdog uses it to detect rows whose edge call never returned.
CREATE TABLE IF NOT EXISTS public.loyverse_push_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action        loyverse_push_action NOT NULL,
  target_id     uuid,                                   -- dish id for action='dish'; NULL for prices/names
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'error')),
  attempts      int NOT NULL DEFAULT 0,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  requested_by  text NOT NULL DEFAULT 'claude-mcp',
  processed_at  timestamptz,
  result        jsonb,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_loyverse_push_queue_pending
  ON public.loyverse_push_queue (requested_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_loyverse_push_queue_processing
  ON public.loyverse_push_queue (processed_at)
  WHERE status = 'processing';

-- ── 3. RLS — mirror loyverse_sync_log (mig 175) ─────────────
ALTER TABLE public.loyverse_push_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyverse_push_queue_read" ON public.loyverse_push_queue;
CREATE POLICY "loyverse_push_queue_read"
  ON public.loyverse_push_queue FOR SELECT
  USING (auth.role() = 'authenticated');

-- Authenticated users (the admin panel) may enqueue, so an owner-triggered "Push"
-- can share the same auditable path as the agent. Cron (postgres) and the edge
-- function (service_role) bypass RLS for the claim/update writes.
DROP POLICY IF EXISTS "loyverse_push_queue_enqueue" ON public.loyverse_push_queue;
CREATE POLICY "loyverse_push_queue_enqueue"
  ON public.loyverse_push_queue FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "loyverse_push_queue_write" ON public.loyverse_push_queue;
CREATE POLICY "loyverse_push_queue_write"
  ON public.loyverse_push_queue FOR ALL
  USING (auth.role() = 'service_role');

-- ── 4. Drain job — every minute ─────────────────────────────
DO $$
DECLARE j TEXT;
BEGIN
  FOREACH j IN ARRAY ARRAY['loyverse-push-drain', 'loyverse-push-watchdog'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

-- Claim up to 5 pending rows (SKIP LOCKED → safe under overlap), flip to processing,
-- and POST each to loyverse-sync?action=internal_push. The edge function writes the
-- terminal status back to the row (net.http_post is fire-and-forget).
SELECT cron.schedule('loyverse-push-drain', '* * * * *', $cron$
  WITH claimed AS (
    UPDATE public.loyverse_push_queue q
    SET status = 'processing', attempts = attempts + 1, processed_at = now()
    WHERE q.id IN (
      SELECT id FROM public.loyverse_push_queue
      WHERE status = 'pending'
      ORDER BY requested_at
      FOR UPDATE SKIP LOCKED
      LIMIT 5
    )
    RETURNING q.id, q.action, q.target_id
  )
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loyverse_push_url') || '?action=internal_push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'loyverse_internal_secret')
    ),
    body := jsonb_build_object('queue_id', c.id, 'action', c.action::text, 'target_id', c.target_id),
    timeout_milliseconds := 150000
  )
  FROM claimed c;
$cron$);

-- ── 5. Watchdog — every 5 minutes ───────────────────────────
-- Rows stuck in 'processing' (edge call never returned) are retried up to 3 attempts,
-- then parked as 'error' so they don't loop forever.
SELECT cron.schedule('loyverse-push-watchdog', '*/5 * * * *', $cron$
  UPDATE public.loyverse_push_queue
  SET status        = CASE WHEN attempts >= 3 THEN 'error' ELSE 'pending' END,
      error_message = CASE WHEN attempts >= 3 THEN 'watchdog: stuck in processing, exceeded 3 attempts' ELSE error_message END
  WHERE status = 'processing'
    AND processed_at < now() - interval '5 minutes';
$cron$);

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '334_loyverse_push_queue.sql',
  'claude-code',
  NULL,
  'Browser-free Loyverse push: loyverse_push_queue table + pg_cron drain (every min, SKIP LOCKED, LIMIT 5) calling loyverse-sync?action=internal_push with x-internal-secret from vault + watchdog (*/5, 3-attempt cap). Edge fn writes terminal status back per row. Secrets (loyverse_push_url, loyverse_internal_secret + LOYVERSE_INTERNAL_SECRET edge secret) created out-of-band. Phase 1 = dish/prices/names; modifiers gated behind reconcile.'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- DOWN (manual, for reference; run only when fully reverting):
-- INTENTIONAL DROP
-- SELECT cron.unschedule('loyverse-push-drain');
-- SELECT cron.unschedule('loyverse-push-watchdog');
-- DROP TABLE IF EXISTS public.loyverse_push_queue;
-- DROP TYPE IF EXISTS loyverse_push_action;
