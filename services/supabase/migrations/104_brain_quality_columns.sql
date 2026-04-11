-- 104: brain_query_log — extend schema for quality feedback loop
--
-- Adds: layer, response_preview, quality_score, quality_source, is_gap columns
-- Creates: brain_gaps view, brain_quality_tests table
-- Refs: MC task c07ec19d, docs/plans/spec-brain-feedback-loop.md §7
-- Self-register: RULE-MIGRATION-TRACKING (engineering-rules.md)

BEGIN;

-- ── Extend brain_query_log ──────────────────────────────────────────

ALTER TABLE public.brain_query_log
  ADD COLUMN IF NOT EXISTS layer TEXT DEFAULT 'L2',
  ADD COLUMN IF NOT EXISTS response_preview TEXT,
  ADD COLUMN IF NOT EXISTS quality_score SMALLINT
    CHECK (quality_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS quality_source TEXT
    CHECK (quality_source IN ('heuristic', 'llm-judge', 'ceo')),
  ADD COLUMN IF NOT EXISTS is_gap BOOLEAN DEFAULT false;

-- Index for quality dashboard queries
CREATE INDEX IF NOT EXISTS idx_brain_query_log_quality
  ON public.brain_query_log (quality_score, is_gap)
  WHERE quality_score IS NOT NULL;

-- ── Gap aggregation view ────────────────────────────────────────────

CREATE OR REPLACE VIEW public.brain_gaps AS
SELECT
  layer,
  LEFT(query_preview, 100) AS query_pattern,
  count(*) AS hit_count,
  min(ts) AS first_seen,
  max(ts) AS last_seen,
  round(avg(quality_score), 1) AS avg_score,
  array_agg(DISTINCT agent_id) FILTER (WHERE agent_id IS NOT NULL) AS agents
FROM public.brain_query_log
WHERE is_gap = true
GROUP BY layer, LEFT(query_preview, 100)
ORDER BY hit_count DESC;

-- ── Quality regression test suite (Phase 2 — schema only) ──────────

CREATE TABLE IF NOT EXISTS public.brain_quality_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer TEXT NOT NULL CHECK (layer IN ('L1', 'L2')),
  query TEXT NOT NULL,
  expected_keywords TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_score SMALLINT CHECK (last_score BETWEEN 1 AND 5),
  last_response_preview TEXT
);

ALTER TABLE public.brain_quality_tests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brain_quality_tests' AND policyname = 'brain_quality_tests_read'
  ) THEN
    CREATE POLICY brain_quality_tests_read ON public.brain_quality_tests
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brain_quality_tests' AND policyname = 'brain_quality_tests_write'
  ) THEN
    CREATE POLICY brain_quality_tests_write ON public.brain_quality_tests
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Self-register ───────────────────────────────────────────────────

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '104_brain_quality_columns.sql',
  'claude-code',
  NULL,
  'Extend brain_query_log with quality columns + brain_gaps view + brain_quality_tests table (MC c07ec19d)'
)
ON CONFLICT DO NOTHING;

COMMIT;
