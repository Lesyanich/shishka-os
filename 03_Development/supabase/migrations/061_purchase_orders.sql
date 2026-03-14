-- ============================================================
-- Migration 061: Purchase Orders & PO Lines
-- Phase 11.2 — PO lifecycle for supplier ordering
-- ============================================================
-- Supports:
--   - Auto-generated PO numbers (PO-0001, PO-0002...)
--   - Status lifecycle: draft → submitted → confirmed → shipped
--     → partially_received → received → reconciled | cancelled
--   - Links to production_plans (MRP source) and expense_ledger (reconciliation)
--   - PO lines with expected quantities and prices from supplier_catalog
-- ============================================================


-- ─── 1. PO Number Generator ───

CREATE OR REPLACE FUNCTION public.fn_generate_po_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INT;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN po_number ~ '^PO-\d+$'
         THEN SUBSTRING(po_number FROM 4)::INT
         ELSE 0
    END
  ), 0) + 1
  INTO v_next
  FROM public.purchase_orders;

  RETURN 'PO-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.fn_generate_po_number()
  IS 'Generates next PO code: PO-0001, PO-0002, etc. Phase 11.';


-- ─── 2. Auto-assign PO number trigger ───

CREATE OR REPLACE FUNCTION public.fn_po_set_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := public.fn_generate_po_number();
  END IF;
  RETURN NEW;
END;
$$;


-- ─── 3. Purchase Orders table ───

CREATE TABLE public.purchase_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        TEXT NOT NULL UNIQUE,
  supplier_id      UUID NOT NULL REFERENCES public.suppliers(id),
  status           po_status NOT NULL DEFAULT 'draft',
  expected_date    DATE,
  notes            TEXT,
  -- Financial summary (populated on reconciliation by Controller)
  subtotal         NUMERIC,
  discount_total   NUMERIC NOT NULL DEFAULT 0,
  vat_amount       NUMERIC NOT NULL DEFAULT 0,
  delivery_fee     NUMERIC NOT NULL DEFAULT 0,
  grand_total      NUMERIC,
  -- Source tracking
  source_plan_id   UUID REFERENCES public.production_plans(id) ON DELETE SET NULL,
  -- Financial link (set on reconciliation)
  expense_id       UUID REFERENCES public.expense_ledger(id) ON DELETE SET NULL,
  -- Audit
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.purchase_orders
  IS 'Purchase Orders for supplier ordering. Status lifecycle: draft → submitted → received → reconciled. Phase 11.';

-- Auto-number trigger
CREATE TRIGGER trg_po_set_number
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_po_set_number();

-- Updated_at trigger (reuse existing fn_set_updated_at)
CREATE TRIGGER trg_po_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Indexes
CREATE INDEX idx_po_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_po_status_active ON public.purchase_orders(status)
  WHERE status NOT IN ('reconciled', 'cancelled');
CREATE INDEX idx_po_expected_date ON public.purchase_orders(expected_date)
  WHERE status IN ('submitted', 'confirmed', 'shipped', 'partially_received');
CREATE INDEX idx_po_expense ON public.purchase_orders(expense_id)
  WHERE expense_id IS NOT NULL;

-- RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_full_access ON public.purchase_orders
  FOR ALL USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;


-- ─── 4. PO Lines table ───

CREATE TABLE public.po_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                 UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  nomenclature_id       UUID NOT NULL REFERENCES public.nomenclature(id),
  sku_id                UUID REFERENCES public.sku(id) ON DELETE SET NULL,
  qty_ordered           NUMERIC NOT NULL CHECK (qty_ordered > 0),
  unit                  TEXT NOT NULL DEFAULT 'pcs',
  unit_price_expected   NUMERIC,
  total_expected        NUMERIC GENERATED ALWAYS AS (
    qty_ordered * COALESCE(unit_price_expected, 0)
  ) STORED,
  sort_order            SMALLINT NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.po_lines
  IS 'Purchase Order line items. Expected quantities and prices. Phase 11.';

-- Indexes
CREATE INDEX idx_pol_po ON public.po_lines(po_id);
CREATE INDEX idx_pol_nomenclature ON public.po_lines(nomenclature_id);
CREATE UNIQUE INDEX idx_pol_unique_item ON public.po_lines(po_id, nomenclature_id, COALESCE(sku_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- RLS
ALTER TABLE public.po_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_full_access ON public.po_lines
  FOR ALL USING (public.fn_is_authenticated())
  WITH CHECK (public.fn_is_authenticated());

-- Column-level REVOKE: protect financial fields from direct REST API modification
-- PO financial summary is managed by fn_approve_po RPC only
REVOKE UPDATE (grand_total, expense_id) ON public.purchase_orders FROM authenticated;
