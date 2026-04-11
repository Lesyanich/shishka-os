-- 106: Receipt OCR Pipeline — api_cost_log + receipt_inbox extensions
--
-- Refs: MC task eca16a14, plan calm-tickling-music.md
-- Self-register: RULE-MIGRATION-TRACKING (engineering-rules.md)
--
-- 1. New table api_cost_log — unified cost tracking for all API calls
-- 2. New columns on receipt_inbox — model_used, parse_cost, tokens, gdrive_paths

BEGIN;

-- ============================================================
-- 1. api_cost_log — unified API cost tracking
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'api_cost_log') THEN
    RAISE NOTICE 'api_cost_log already exists — skipping';
    RETURN;
  END IF;

  CREATE TABLE public.api_cost_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
    service         TEXT NOT NULL,               -- 'anthropic', 'openai', 'google'
    model           TEXT NOT NULL,               -- 'claude-sonnet-4-20250514', 'gpt-4o', etc.
    feature         TEXT NOT NULL,               -- 'receipt-ocr', 'brain-query', etc.
    tokens_in       INT DEFAULT 0,
    tokens_out      INT DEFAULT 0,
    cost_usd        NUMERIC(10, 6) DEFAULT 0,
    reference_id    UUID,                        -- FK to receipt_inbox.id, brain_query_log.id, etc.
    reference_type  TEXT,                        -- 'receipt', 'brain', etc.
    metadata        JSONB,                       -- { image_count, prompt_length, ... }
    error           TEXT                         -- null on success
  );

  CREATE INDEX idx_api_cost_log_ts ON public.api_cost_log (ts DESC);
  CREATE INDEX idx_api_cost_log_feature_ts ON public.api_cost_log (feature, ts DESC);
  CREATE INDEX idx_api_cost_log_ref ON public.api_cost_log (reference_id)
    WHERE reference_id IS NOT NULL;

  COMMENT ON TABLE public.api_cost_log IS
    'Unified per-call cost log for all external API usage (receipt OCR, brain, future). Consumed by /admin/api-costs dashboard.';

  ALTER TABLE public.api_cost_log ENABLE ROW LEVEL SECURITY;

  CREATE POLICY api_cost_log_read ON public.api_cost_log
    FOR SELECT TO anon, authenticated
    USING (true);

  CREATE POLICY api_cost_log_write ON public.api_cost_log
    FOR INSERT TO service_role
    WITH CHECK (true);

END $$;

-- ============================================================
-- 2. receipt_inbox — add OCR pipeline columns
-- ============================================================

-- model_used: which model parsed this receipt
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'receipt_inbox'
                   AND column_name = 'model_used') THEN
    ALTER TABLE public.receipt_inbox ADD COLUMN model_used TEXT;
    COMMENT ON COLUMN public.receipt_inbox.model_used IS
      'Model that parsed this receipt: claude-sonnet-4-20250514, gpt-4o, claude-subscription, or null';
  END IF;
END $$;

-- parse_cost_usd: denormalized cost for quick display
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'receipt_inbox'
                   AND column_name = 'parse_cost_usd') THEN
    ALTER TABLE public.receipt_inbox ADD COLUMN parse_cost_usd NUMERIC(10, 6) DEFAULT 0;
  END IF;
END $$;

-- parse_tokens_in / parse_tokens_out
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'receipt_inbox'
                   AND column_name = 'parse_tokens_in') THEN
    ALTER TABLE public.receipt_inbox ADD COLUMN parse_tokens_in INT DEFAULT 0;
    ALTER TABLE public.receipt_inbox ADD COLUMN parse_tokens_out INT DEFAULT 0;
  END IF;
END $$;

-- gdrive_paths: array of GDrive file paths after archival
-- Already referenced by InboxReviewPanel.tsx but never created
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = 'receipt_inbox'
                   AND column_name = 'gdrive_paths') THEN
    ALTER TABLE public.receipt_inbox ADD COLUMN gdrive_paths JSONB;
    COMMENT ON COLUMN public.receipt_inbox.gdrive_paths IS
      'Array of GDrive file paths after post-approve archival, e.g. ["01_Business/Receipts/processed/2026-04/Makro_2026-04-01_p1.webp"]';
  END IF;
END $$;

-- ============================================================
-- Self-register
-- ============================================================

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '106_receipt_ocr_pipeline.sql',
  'claude-code',
  NULL,
  'Create api_cost_log table, add model_used/parse_cost/tokens/gdrive_paths to receipt_inbox (MC eca16a14)'
)
ON CONFLICT DO NOTHING;

COMMIT;
