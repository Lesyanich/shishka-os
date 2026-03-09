-- Migration 017: Inventory Balances, Waste Logs & Predictive Procurement
-- Phase 3: Smart Waste & Inventory ("Dumb POS" — all stock logic lives here)

-- ─── 1. Custom ENUM types ───

CREATE TYPE public.waste_reason AS ENUM (
  'expiration',
  'spillage_damage',
  'quality_reject',
  'rd_testing'
);

CREATE TYPE public.financial_liability AS ENUM (
  'cafe',
  'employee',
  'supplier'
);

-- ─── 2. Inventory Balances (Zero-Day Stocktake) ───

CREATE TABLE public.inventory_balances (
  nomenclature_id UUID PRIMARY KEY REFERENCES public.nomenclature(id),
  quantity        NUMERIC NOT NULL DEFAULT 0,
  last_counted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inventory_balances IS
  'Current stock levels. UPSERT on stocktake. Used by predictive procurement to calculate shortages.';

-- ─── 3. Waste Logs (with Financial Liability) ───

CREATE TABLE public.waste_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id     UUID NOT NULL REFERENCES public.nomenclature(id),
  quantity            NUMERIC NOT NULL CHECK (quantity > 0),
  reason              public.waste_reason NOT NULL,
  financial_liability public.financial_liability NOT NULL DEFAULT 'cafe',
  comment             TEXT,
  logged_by           UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Enforce comment when liability is employee or supplier
  CONSTRAINT chk_liability_comment CHECK (
    financial_liability = 'cafe'
    OR (comment IS NOT NULL AND length(trim(comment)) > 0)
  )
);

COMMENT ON TABLE public.waste_logs IS
  'Write-off log with financial liability tracking. Every waste event must declare who bears the cost.';

CREATE INDEX idx_waste_logs_nomenclature ON public.waste_logs (nomenclature_id);
CREATE INDEX idx_waste_logs_created ON public.waste_logs (created_at DESC);

-- ─── 4. RPC: fn_predictive_procurement ───
-- Walks the BOM tree recursively from a daily_plan down to RAW leaf ingredients.
-- Compares needed quantities against inventory_balances.
-- Returns JSON array of suggested purchases.

CREATE OR REPLACE FUNCTION public.fn_predictive_procurement(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_code TEXT;
  v_target_qty   NUMERIC;
  v_result       JSONB;
BEGIN
  -- 1. Get plan details
  SELECT product_code, target_quantity
  INTO v_product_code, v_target_qty
  FROM public.daily_plan
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Plan not found');
  END IF;

  -- 2. Recursive CTE: walk BOM tree to leaf (RAW) ingredients
  --    Multiply quantities along the path to get absolute amounts
  WITH RECURSIVE bom_tree AS (
    -- Base: direct children of the plan's product
    SELECT
      bs.ingredient_id,
      bs.quantity_per_unit * v_target_qty AS needed_qty,
      1 AS depth
    FROM public.bom_structures bs
    JOIN public.nomenclature n ON n.id = bs.parent_id
    WHERE n.product_code = v_product_code

    UNION ALL

    -- Recurse: children of children
    SELECT
      bs2.ingredient_id,
      bt.needed_qty * bs2.quantity_per_unit AS needed_qty,
      bt.depth + 1
    FROM bom_tree bt
    JOIN public.bom_structures bs2 ON bs2.parent_id = bt.ingredient_id
    WHERE bt.depth < 10  -- safety limit
  ),

  -- 3. Keep only leaf nodes (no children in bom_structures)
  leaf_ingredients AS (
    SELECT
      bt.ingredient_id,
      SUM(bt.needed_qty) AS total_needed
    FROM bom_tree bt
    WHERE NOT EXISTS (
      SELECT 1 FROM public.bom_structures bs3
      WHERE bs3.parent_id = bt.ingredient_id
    )
    GROUP BY bt.ingredient_id
  )

  -- 4. Join with nomenclature + inventory, compute shortage
  SELECT COALESCE(jsonb_agg(row_data ORDER BY shortage DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'nomenclature_id', li.ingredient_id,
      'product_code', n.product_code,
      'name', n.name,
      'unit', COALESCE(n.base_unit, 'kg'),
      'needed', ROUND(li.total_needed, 4),
      'on_hand', ROUND(COALESCE(ib.quantity, 0), 4),
      'shortage', ROUND(GREATEST(li.total_needed - COALESCE(ib.quantity, 0), 0), 4)
    ) AS row_data,
    GREATEST(li.total_needed - COALESCE(ib.quantity, 0), 0) AS shortage
    FROM leaf_ingredients li
    JOIN public.nomenclature n ON n.id = li.ingredient_id
    LEFT JOIN public.inventory_balances ib ON ib.nomenclature_id = li.ingredient_id
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'plan_id', p_plan_id,
    'product_code', v_product_code,
    'target_quantity', v_target_qty,
    'items', v_result
  );
END;
$$;

COMMENT ON FUNCTION public.fn_predictive_procurement(UUID) IS
  'Predictive procurement: recursively walks BOM tree, compares vs inventory, returns suggested purchase order.';

-- ─── 5. RLS Policies ───

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;

-- Admin read/write for both tables (using anon key for internal admin panel)
CREATE POLICY "inventory_balances_anon_all" ON public.inventory_balances
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "waste_logs_anon_all" ON public.waste_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Authenticated users: read-only
CREATE POLICY "inventory_balances_auth_select" ON public.inventory_balances
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "waste_logs_auth_select" ON public.waste_logs
  FOR SELECT TO authenticated USING (true);

-- ─── 6. Enable Realtime ───

ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_logs;
