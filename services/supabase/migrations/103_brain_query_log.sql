-- 103: brain_query_log — track LightRAG queries + LLM costs
--
-- Refs: MC task 350a6738, spec-lightrag.md §Observability
-- Self-register: RULE-MIGRATION-TRACKING (engineering-rules.md)
--
-- Populated by lightrag-server query middleware.
-- Consumed by /admin/brain/cost dashboard (anon key, SELECT only).

BEGIN;

-- Guard: skip if table already exists (re-runnable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'brain_query_log') THEN
    RAISE NOTICE 'brain_query_log already exists — skipping';
    RETURN;
  END IF;

  CREATE TABLE public.brain_query_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
    agent_id        TEXT,                    -- 'techlead', 'chef-agent', 'brain-view-ui', null if unknown
    query_mode      TEXT NOT NULL,           -- 'naive' | 'local' | 'global' | 'hybrid' | 'mix' | 'bypass'
    query_preview   TEXT,                    -- first 200 chars of the query, for dashboard
    chunks_returned INT,
    llm_tokens_in   INT DEFAULT 0,           -- 0 for naive mode
    llm_tokens_out  INT DEFAULT 0,           -- 0 for naive mode
    embed_tokens    INT DEFAULT 0,           -- always >0 (query embedding)
    cost_usd        NUMERIC(10, 6) DEFAULT 0,
    latency_ms      INT,
    error           TEXT                     -- null on success
  );

  CREATE INDEX idx_brain_query_log_ts ON public.brain_query_log (ts DESC);
  CREATE INDEX idx_brain_query_log_agent_ts ON public.brain_query_log (agent_id, ts DESC);

  COMMENT ON TABLE public.brain_query_log IS
    'Per-query cost + latency log for LightRAG brain. Populated by lightrag-server wrapper, consumed by /admin/brain-cost dashboard.';

  -- RLS: admin-panel reads via anon key; writes from lightrag-server use service role
  ALTER TABLE public.brain_query_log ENABLE ROW LEVEL SECURITY;

  CREATE POLICY brain_query_log_read ON public.brain_query_log
    FOR SELECT TO anon, authenticated
    USING (true);

  CREATE POLICY brain_query_log_write ON public.brain_query_log
    FOR INSERT TO service_role
    WITH CHECK (true);

END $$;

-- Self-register (NULL checksum per 101 workaround)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '103_brain_query_log.sql',
  'claude-code',
  NULL,
  'Create brain_query_log table for LightRAG cost tracking (MC 350a6738)'
)
ON CONFLICT DO NOTHING;

COMMIT;
