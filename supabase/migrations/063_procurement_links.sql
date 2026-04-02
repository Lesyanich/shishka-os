-- ============================================================
-- Migration 063: Procurement Cross-References
-- Phase 11.4 — Link existing tables to new procurement entities
-- ============================================================
-- Adds FK columns to purchase_logs and expense_ledger so that
-- receipt-based and PO-based purchases share a unified audit trail.
-- ============================================================


-- ─── 1. purchase_logs: link to PO line and receiving line ───

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_logs'
      AND column_name = 'po_line_id'
  ) THEN
    ALTER TABLE public.purchase_logs
      ADD COLUMN po_line_id UUID REFERENCES public.po_lines(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_logs'
      AND column_name = 'receiving_line_id'
  ) THEN
    ALTER TABLE public.purchase_logs
      ADD COLUMN receiving_line_id UUID REFERENCES public.receiving_lines(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for join queries
CREATE INDEX IF NOT EXISTS idx_pl_po_line ON public.purchase_logs(po_line_id)
  WHERE po_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pl_receiving_line ON public.purchase_logs(receiving_line_id)
  WHERE receiving_line_id IS NOT NULL;


-- ─── 2. expense_ledger: link to PO ───

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_ledger'
      AND column_name = 'po_id'
  ) THEN
    ALTER TABLE public.expense_ledger
      ADD COLUMN po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_el_po ON public.expense_ledger(po_id)
  WHERE po_id IS NOT NULL;
