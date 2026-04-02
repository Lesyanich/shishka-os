-- ═══════════════════════════════════════════════════════════════
-- Receipt Inbox: Add parsed_payload for Stateless Agent v2
-- Agent parses receipt → saves JSON to parsed_payload → exits.
-- Human reviews + approves in Admin UI (no more waiting in chat).
-- Date: 2026-04-02
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Add columns ───

ALTER TABLE public.receipt_inbox
  ADD COLUMN IF NOT EXISTS parsed_payload JSONB,
  ADD COLUMN IF NOT EXISTS parsed_at     TIMESTAMPTZ;

COMMENT ON COLUMN public.receipt_inbox.parsed_payload
  IS 'Full approve_receipt payload JSON, populated by agent when status=parsed. Reviewed and optionally edited by human in Admin UI before final approve.';

COMMENT ON COLUMN public.receipt_inbox.parsed_at
  IS 'Timestamp when agent finished parsing this receipt.';

-- ─── 2. Expand status constraint to include "parsed" ───

ALTER TABLE public.receipt_inbox
  DROP CONSTRAINT IF EXISTS receipt_inbox_status_check;

ALTER TABLE public.receipt_inbox
  ADD CONSTRAINT receipt_inbox_status_check
  CHECK (status IN ('pending', 'processing', 'parsed', 'processed', 'error', 'skipped'));

-- ─── 3. Index for UI: quickly find receipts awaiting review ───

CREATE INDEX IF NOT EXISTS idx_receipt_inbox_parsed
  ON public.receipt_inbox(status)
  WHERE status = 'parsed';

-- ─── 4. Verify ───

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'receipt_inbox'
  AND column_name IN ('parsed_payload', 'parsed_at')
ORDER BY ordinal_position;
