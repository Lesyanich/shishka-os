-- ============================================================
-- Migration 021: Procurement Module — Suppliers, Purchase Logs & Cost Trigger
-- Phase 4: Procurement & Real-time Food Costing
-- ============================================================

-- ─── 1. Suppliers Table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suppliers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    contact_info TEXT,
    is_deleted   BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.suppliers IS 'Supplier directory for procurement module';

-- ─── 2. Purchase Logs Table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomenclature_id  UUID NOT NULL REFERENCES public.nomenclature(id) ON DELETE RESTRICT,
    supplier_id      UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    quantity         NUMERIC NOT NULL CHECK (quantity > 0),
    price_per_unit   NUMERIC NOT NULL CHECK (price_per_unit >= 0),
    total_price      NUMERIC NOT NULL CHECK (total_price >= 0),
    invoice_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.purchase_logs IS 'Purchase log entries — each row = one line from a supplier invoice';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_purchase_logs_nomenclature ON public.purchase_logs(nomenclature_id);
CREATE INDEX IF NOT EXISTS idx_purchase_logs_supplier     ON public.purchase_logs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_logs_invoice_date ON public.purchase_logs(invoice_date DESC);

-- ─── 3. Trigger: Auto-update cost_per_unit on nomenclature ──

CREATE OR REPLACE FUNCTION public.fn_update_cost_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- SSoT: latest purchase price becomes the new cost_per_unit
    UPDATE public.nomenclature
    SET cost_per_unit = NEW.price_per_unit,
        updated_at    = now()
    WHERE id = NEW.nomenclature_id;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_update_cost_on_purchase()
IS 'Trigger fn: on purchase_logs INSERT, updates nomenclature.cost_per_unit with latest price_per_unit';

-- Drop if exists to allow re-run
DROP TRIGGER IF EXISTS trg_update_cost_on_purchase ON public.purchase_logs;

CREATE TRIGGER trg_update_cost_on_purchase
    AFTER INSERT ON public.purchase_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_update_cost_on_purchase();

-- ─── 4. Updated_at trigger for suppliers ─────────────────────

CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;

CREATE TRIGGER trg_suppliers_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── 5. RLS Policies ────────────────────────────────────────

ALTER TABLE public.suppliers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_logs ENABLE ROW LEVEL SECURITY;

-- Suppliers: full access for authenticated users
DO $$ BEGIN
    CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Purchase Logs: full access for authenticated users
DO $$ BEGIN
    CREATE POLICY "purchase_logs_select" ON public.purchase_logs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "purchase_logs_insert" ON public.purchase_logs FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 6. Realtime ─────────────────────────────────────────────

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
