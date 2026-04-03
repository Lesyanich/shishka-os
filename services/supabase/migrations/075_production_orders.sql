-- Migration 075: Production Orders
-- =====================================================================
-- Production orders represent work orders: "produce X kg of product Y by deadline Z".
-- The system calculates raw material requirements (from BOM), backward schedule,
-- and equipment bookings. Used by managers to plan daily kitchen production.
--
-- Lifecycle: planned → in_progress → completed | cancelled
-- Backward scheduling fills estimated_start_at and estimated_duration_min.
-- After completion, actual_qty and waste_qty are recorded for variance analysis.

-- ─── 1. Create table ──────────────────────────────────────────────

CREATE TABLE public.production_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number           TEXT UNIQUE NOT NULL,  -- PO-YYYY-MMDD-NNN (auto or manual)
  nomenclature_id        UUID NOT NULL REFERENCES nomenclature(id),
  target_qty             NUMERIC NOT NULL CHECK (target_qty > 0),
  target_unit            TEXT NOT NULL,          -- kg, pcs, l (from nomenclature.base_unit)
  deadline_at            TIMESTAMPTZ NOT NULL,

  -- Calculated fields (filled by backward scheduling / BOM walk)
  raw_requirements       JSONB,                  -- [{nomenclature_id, product_code, qty, unit}, ...]
  estimated_start_at     TIMESTAMPTZ,
  estimated_duration_min INT,

  -- Status & assignment
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  assigned_to            UUID REFERENCES staff(id),
  priority               INT NOT NULL DEFAULT 0  -- 0=normal, 1=high, 2=urgent
    CHECK (priority BETWEEN 0 AND 2),

  -- Actuals (filled on completion)
  actual_qty             NUMERIC,
  actual_started_at      TIMESTAMPTZ,
  actual_completed_at    TIMESTAMPTZ,
  waste_qty              NUMERIC DEFAULT 0,
  waste_reason           TEXT,

  notes                  TEXT,
  created_by             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Indexes ───────────────────────────────────────────────────

CREATE INDEX idx_prod_orders_status ON production_orders(status) WHERE status != 'cancelled';
CREATE INDEX idx_prod_orders_deadline ON production_orders(deadline_at);
CREATE INDEX idx_prod_orders_nomenclature ON production_orders(nomenclature_id);
CREATE INDEX idx_prod_orders_number ON production_orders(order_number);

-- ─── 3. Auto-generate order_number ────────────────────────────────
-- Format: PO-YYYY-MMDD-NNN (sequential within the day)

CREATE OR REPLACE FUNCTION fn_generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  today_str TEXT;
  seq_num INT;
BEGIN
  -- Only generate if not provided
  IF NEW.order_number IS NOT NULL AND NEW.order_number != '' THEN
    RETURN NEW;
  END IF;

  today_str := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MMDD');

  SELECT COALESCE(MAX(
    NULLIF(split_part(order_number, '-', 4), '')::INT
  ), 0) + 1
  INTO seq_num
  FROM production_orders
  WHERE order_number LIKE 'PO-' || today_str || '-%';

  NEW.order_number := 'PO-' || today_str || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prod_order_number
  BEFORE INSERT ON production_orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_generate_order_number();

-- ─── 4. Auto-update updated_at ────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_production_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prod_orders_updated_at
  BEFORE UPDATE ON production_orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_production_orders_updated_at();

-- ─── 5. RLS ───────────────────────────────────────────────────────

ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY prod_orders_auth_full ON production_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon can read (for /kitchen dashboard display)
CREATE POLICY prod_orders_anon_read ON production_orders
  FOR SELECT TO anon USING (true);

-- ─── 6. Realtime ──────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE production_orders;

-- ─── 7. Comments ──────────────────────────────────────────────────

COMMENT ON TABLE production_orders IS 'Production work orders. Manager creates order with target qty + deadline. System calculates schedule, raw requirements, and equipment bookings.';
COMMENT ON COLUMN production_orders.order_number IS 'Auto-generated: PO-YYYY-MMDD-NNN (Bangkok timezone). Can be overridden.';
COMMENT ON COLUMN production_orders.raw_requirements IS 'JSONB array of required raw materials calculated from BOM walk. [{nomenclature_id, product_code, qty, unit}]';
COMMENT ON COLUMN production_orders.estimated_start_at IS 'Backward scheduling result: when production should begin to meet deadline.';
COMMENT ON COLUMN production_orders.priority IS '0=normal, 1=high, 2=urgent. Affects KDS display order.';
COMMENT ON COLUMN production_orders.waste_qty IS 'Waste above norm (actual - target - acceptable loss). For variance reporting.';
