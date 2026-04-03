-- ============================================================
-- Migration 062: Receiving Records & Lines
-- Phase 11.3 — Physical goods receiving (Admin/Cook)
-- ============================================================
-- Two sources:
--   - purchase_order: Path B — goods received against a PO
--   - receipt: Path A — receipt scan creates receiving_records as audit trail
--
-- Design principle: receiving_lines are IMMUTABLE (INSERT-only audit trail).
-- Cook/Admin only records physical facts. No financial data here.
-- Financial reconciliation happens later via fn_approve_po (Controller).
-- ============================================================


-- ─── 1. Receiving Records (header) ───

CREATE TABLE public.receiving_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  expense_id    UUID REFERENCES public.expense_ledger(id) ON DELETE SET NULL,
  source        receiving_source NOT NULL,
  received_by   UUID,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'reconciled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.receiving_records
  IS 'Physical goods receiving header. Links to PO (Path B) or standalone (Path A receipt). Phase 11.';

-- Indexes
CREATE INDEX idx_rr_po ON public.receiving_records(po_id) WHERE po_id IS NOT NULL;
CREATE INDEX idx_rr_received_at ON public.receiving_records(received_at);
CREATE INDEX idx_rr_expense ON public.receiving_records(expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX idx_rr_status ON public.receiving_records(status) WHERE status = 'received';

-- RLS
ALTER TABLE public.receiving_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_full_access ON public.receiving_records
  FOR ALL USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());


-- ─── 2. Receiving Lines (detail) ───

CREATE TABLE public.receiving_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_id      UUID NOT NULL REFERENCES public.receiving_records(id) ON DELETE CASCADE,
  po_line_id        UUID REFERENCES public.po_lines(id) ON DELETE SET NULL,
  nomenclature_id   UUID NOT NULL REFERENCES public.nomenclature(id),
  sku_id            UUID REFERENCES public.sku(id) ON DELETE SET NULL,
  qty_expected      NUMERIC NOT NULL DEFAULT 0,
  qty_received      NUMERIC NOT NULL DEFAULT 0,
  qty_rejected      NUMERIC NOT NULL DEFAULT 0,
  reject_reason     reject_reason,
  unit_price_actual NUMERIC,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (qty_received >= 0),
  CHECK (qty_rejected >= 0)
);

COMMENT ON TABLE public.receiving_lines
  IS 'Physical goods receiving line items. Immutable audit trail (INSERT-only). Phase 11.';

-- Indexes
CREATE INDEX idx_rl_receiving ON public.receiving_lines(receiving_id);
CREATE INDEX idx_rl_poline ON public.receiving_lines(po_line_id) WHERE po_line_id IS NOT NULL;
CREATE INDEX idx_rl_nomenclature ON public.receiving_lines(nomenclature_id);

-- RLS
ALTER TABLE public.receiving_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_full_access ON public.receiving_lines
  FOR ALL USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- Column-level REVOKE: receiving_lines are immutable audit trail
-- Only SECURITY DEFINER RPCs can write (fn_receive_goods, fn_approve_receipt v11)
REVOKE UPDATE ON public.receiving_lines FROM authenticated;
