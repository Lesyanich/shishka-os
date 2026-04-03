-- ============================================================
-- Migration 086: receipt_inbox table
-- Staging area for MCP Finance Agent receipt processing
-- ============================================================
-- The MCP agent tools (check_inbox, update_inbox) already reference
-- this table but it was never created. This migration activates them.
--
-- receipt_jobs (migration 036) is the legacy GAS/Gemini flow table.
-- It remains for backward compatibility but is now deprecated.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.receipt_inbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by     TEXT,
  upload_date     TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_date    DATE,
  supplier_hint   TEXT,
  amount_hint     NUMERIC,
  photo_urls      JSONB DEFAULT '[]'::JSONB,
  file_paths      JSONB DEFAULT '[]'::JSONB,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'processed', 'error', 'skipped')),
  expense_id      UUID REFERENCES public.expense_ledger(id) ON DELETE SET NULL,
  error_message   TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for agent polling: find unprocessed receipts quickly
CREATE INDEX IF NOT EXISTS idx_inbox_status
  ON public.receipt_inbox(status)
  WHERE status NOT IN ('processed', 'skipped');

-- Index for linking back from expense
CREATE INDEX IF NOT EXISTS idx_inbox_expense
  ON public.receipt_inbox(expense_id)
  WHERE expense_id IS NOT NULL;

-- RLS: open for admin-panel and MCP agent
ALTER TABLE public.receipt_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_select" ON public.receipt_inbox
  FOR SELECT USING (true);

CREATE POLICY "inbox_insert" ON public.receipt_inbox
  FOR INSERT WITH CHECK (true);

CREATE POLICY "inbox_update" ON public.receipt_inbox
  FOR UPDATE USING (true);

-- Realtime for admin-panel live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.receipt_inbox;

-- Mark legacy table as deprecated
COMMENT ON TABLE public.receipt_jobs
  IS 'DEPRECATED: Legacy GAS/Gemini receipt parsing flow. New receipts use receipt_inbox + MCP Finance Agent. Do not build new features on this table.';

COMMENT ON TABLE public.receipt_inbox
  IS 'Staging area for MCP Finance Agent receipt processing. Lifecycle: pending → processing → processed (with expense_id) or error/skipped.';
