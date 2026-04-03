-- ═══════════════════════════════════════════════════════════════
-- Migration 050: WAC (Weighted Average Cost) for COGS
-- Phase 7.1: DB Architecture Audit — Issue #3 (Finance SSoT)
-- ═══════════════════════════════════════════════════════════════
-- PROBLEM: fn_update_cost_on_purchase() (migration 021) uses Last-In:
--   SET cost_per_unit = NEW.price_per_unit
-- This means 1 kg at 500 THB overrides 50 kg at 300 THB,
-- distorting COGS and financial margins for all dishes.
--
-- SOLUTION: Weighted Average Cost (WAC):
--   new_cost = (current_stock × current_cost + new_qty × new_price)
--              ÷ (current_stock + new_qty)
--
-- DEPENDS ON: purchase_logs.quantity (migration 021)
--             inventory_balances.quantity (migration 017)
--             nomenclature.cost_per_unit (migration 005)
--
-- EXAMPLE:
--   Inventory: 10 kg at 50 THB/kg  (total value = 500 THB)
--   Purchase:   2 kg at 80 THB/kg  (total value = 160 THB)
--   WAC: (500 + 160) ÷ (10 + 2) = 55.00 THB/kg
--
-- EDGE CASES:
--   - No inventory_balances row → qty = 0 → fallback to purchase price
--   - cost_per_unit is NULL → treated as 0
--   - Zero total quantity (shouldn't happen) → fallback to purchase price
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_update_cost_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_qty  NUMERIC;
    v_current_cost NUMERIC;
    v_new_wac      NUMERIC;
BEGIN
    -- Fetch current inventory quantity and unit cost
    -- inventory_balances may not have a row yet (first purchase of new product)
    SELECT
        COALESCE(ib.quantity, 0),
        COALESCE(n.cost_per_unit, 0)
    INTO v_current_qty, v_current_cost
    FROM public.nomenclature n
    LEFT JOIN public.inventory_balances ib ON ib.nomenclature_id = n.id
    WHERE n.id = NEW.nomenclature_id;

    -- WAC formula
    IF (v_current_qty + NEW.quantity) > 0 THEN
        v_new_wac := (v_current_qty * v_current_cost + NEW.quantity * NEW.price_per_unit)
                     / (v_current_qty + NEW.quantity);
    ELSE
        -- Edge case: zero total quantity → use purchase price as baseline
        v_new_wac := NEW.price_per_unit;
    END IF;

    UPDATE public.nomenclature
    SET cost_per_unit = ROUND(v_new_wac, 4),
        updated_at    = now()
    WHERE id = NEW.nomenclature_id;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_update_cost_on_purchase()
  IS 'Phase 7.1: WAC trigger — calculates Weighted Average Cost from inventory_balances.quantity + nomenclature.cost_per_unit on each purchase_logs INSERT. Replaces Last-In pricing (v1, migration 021).';

-- NOTE: Trigger trg_update_cost_on_purchase already exists from migration 021.
-- CREATE OR REPLACE on the function automatically updates trigger behavior.
-- No need to drop/recreate the trigger itself.
