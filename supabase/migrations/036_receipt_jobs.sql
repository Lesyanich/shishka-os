-- ═══════════════════════════════════════════════════════════
-- Migration 036: receipt_jobs — Async Receipt Processing
-- Phase 4.14: Background job table for AI receipt parsing
-- ═══════════════════════════════════════════════════════════
-- Architecture: MagicDropzone inserts a job row, fires Edge Function,
-- Edge Function writes result back, frontend listens via Realtime.
-- Decoupled from expense_ledger (pre-approval stage).
-- ═══════════════════════════════════════════════════════════

-- 1. Create the receipt_jobs table
CREATE TABLE receipt_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  image_urls    JSONB NOT NULL,               -- ["https://...img1.jpg", "https://...img2.jpg"]
  result        JSONB,                        -- ParsedReceipt JSON (null until completed)
  error         TEXT,                         -- Error message (null unless failed)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,                  -- Set when status → completed/failed
  duration_ms   INTEGER,                      -- OpenAI call duration for monitoring
  model         TEXT DEFAULT 'gpt-4o'         -- Model used for parsing
);

COMMENT ON TABLE  receipt_jobs IS 'Async job queue for AI receipt parsing (Phase 4.14). Frontend inserts, Edge Function processes, Realtime notifies.';
COMMENT ON COLUMN receipt_jobs.status IS 'pending → processing → completed|failed';
COMMENT ON COLUMN receipt_jobs.image_urls IS 'Array of Supabase Storage public URLs for receipt images';
COMMENT ON COLUMN receipt_jobs.result IS 'Full ParsedReceipt JSON including line_items, food_items, etc.';
COMMENT ON COLUMN receipt_jobs.duration_ms IS 'Time spent on OpenAI API call (for latency monitoring)';

-- 2. RLS: public read/insert (admin-panel has no auth session)
ALTER TABLE receipt_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipt_jobs_select" ON receipt_jobs FOR SELECT USING (true);
CREATE POLICY "receipt_jobs_insert" ON receipt_jobs FOR INSERT WITH CHECK (true);
-- Edge Function uses service_role key for UPDATE, bypassing RLS
-- TODO (Phase 5): Implement proper Auth or API Gateway rate-limiting to prevent unauthorized OpenAI billing drain

-- 3. Enable Realtime for this table (frontend subscribes to status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE receipt_jobs;

-- 4. Index for cleanup RPC performance
CREATE INDEX idx_receipt_jobs_stale ON receipt_jobs(status, created_at)
  WHERE status IN ('pending', 'processing');

-- 5. Lazy Cleanup RPC: fn_cleanup_stale_receipt_jobs()
-- Called at the start of each Edge Function invocation.
-- Marks zombie jobs (stuck in processing > 5 min) as failed.
-- This replaces pg_cron — no extra permissions needed.
CREATE OR REPLACE FUNCTION fn_cleanup_stale_receipt_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleaned INTEGER;
BEGIN
  UPDATE receipt_jobs
  SET
    status = 'failed',
    error = 'Job timed out or was interrupted (stale > 5 min)',
    completed_at = now()
  WHERE status IN ('pending', 'processing')
    AND created_at < now() - INTERVAL '5 minutes';

  GET DIAGNOSTICS cleaned = ROW_COUNT;

  IF cleaned > 0 THEN
    RAISE LOG '[receipt_jobs] Cleaned % stale jobs', cleaned;
  END IF;

  RETURN cleaned;
END;
$$;

COMMENT ON FUNCTION fn_cleanup_stale_receipt_jobs() IS 'Lazy cleanup: marks zombie receipt_jobs as failed. Called by Edge Function on every invocation.';
