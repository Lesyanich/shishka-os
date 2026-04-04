-- ============================================================
-- Migration 092: Add DELETE policy + update status CHECK for receipt_inbox
-- Enables receipt deletion from admin-panel UI
-- Also adds 'parsed' to status CHECK (was added in migration 090 column
-- but the CHECK constraint was not updated)
-- ============================================================

-- 1. Add DELETE RLS policy
CREATE POLICY "inbox_delete" ON public.receipt_inbox
  FOR DELETE USING (true);

-- 2. Update status CHECK to include 'parsed'
-- Drop old constraint and add new one
ALTER TABLE public.receipt_inbox
  DROP CONSTRAINT IF EXISTS receipt_inbox_status_check;

ALTER TABLE public.receipt_inbox
  ADD CONSTRAINT receipt_inbox_status_check
  CHECK (status IN ('pending', 'processing', 'parsed', 'processed', 'error', 'skipped'));
