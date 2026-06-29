-- 321_fn_seed_shopping_list_low_stock.sql
-- Phase 3 (Stock & Reorder): seed the shopping list from par breaches.
--
-- Companion to fn_seed_shopping_list_from_menu. Reads v_stock_status (mig 320)
-- for items at/below their reorder point and pushes one 'needed' line each, in
-- base_unit, idempotently (skips items that already have an open line). This is
-- what makes the Stock view and the Shopping List share ONE buy-list.
--
-- Also widens shopping_list_items.status to allow 'ordered' — the Shopping
-- List -> draft PO bridge stamps lines 'ordered' once a PO is created for them
-- (so they drop out of the "to buy" view without being marked bought).

-- 1) Widen the status CHECK (additive — every existing row is 'needed').
ALTER TABLE public.shopping_list_items
  DROP CONSTRAINT IF EXISTS shopping_list_items_status_check;
ALTER TABLE public.shopping_list_items
  ADD CONSTRAINT shopping_list_items_status_check
  CHECK (status = ANY (ARRAY['needed'::text, 'bought'::text, 'cancelled'::text, 'ordered'::text]));

-- 2) Par-breach seeder.
CREATE OR REPLACE FUNCTION public.fn_seed_shopping_list_low_stock(
  p_store text DEFAULT 'makro'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
BEGIN
  WITH low AS (
    SELECT s.nomenclature_id, s.name, s.base_unit, s.suggested_qty, s.cost_per_unit
    FROM public.v_stock_status s
    WHERE s.stock_status IN ('low', 'out')
      AND COALESCE(s.suggested_qty, 0) > 0
  ), ins AS (
    INSERT INTO public.shopping_list_items
      (name, store, qty, unit, est_price, status, source, nomenclature_id)
    SELECT low.name, p_store, low.suggested_qty, low.base_unit,
           round(low.suggested_qty * COALESCE(low.cost_per_unit, 0))::numeric,
           'needed', 'low_stock', low.nomenclature_id
    FROM low
    WHERE NOT EXISTS (  -- idempotent: skip if an open line already exists for this item
      SELECT 1 FROM public.shopping_list_items sli
      WHERE sli.nomenclature_id = low.nomenclature_id
        AND sli.status IN ('needed', 'ordered'))
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;
  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END
$$;

GRANT EXECUTE ON FUNCTION public.fn_seed_shopping_list_low_stock(text) TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '321_fn_seed_shopping_list_low_stock.sql',
  'claude-code',
  NULL,
  'Phase 3 Stock & Reorder: fn_seed_shopping_list_low_stock (par-breach seeder from v_stock_status) + widen shopping_list_items.status CHECK to allow ordered (Shopping List -> draft PO bridge).'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP FUNCTION IF EXISTS public.fn_seed_shopping_list_low_stock(text);
-- ALTER TABLE public.shopping_list_items DROP CONSTRAINT IF EXISTS shopping_list_items_status_check;
-- ALTER TABLE public.shopping_list_items ADD CONSTRAINT shopping_list_items_status_check
--   CHECK (status = ANY (ARRAY['needed','bought','cancelled']));
