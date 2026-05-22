-- Migration 214: Recalculate WAC when purchase_logs.nomenclature_id is reassigned
-- MC task 82a16248
--
-- BUG: fn_update_cost_on_purchase (migration 050) fires on INSERT only.
-- When a purchase_log row is moved between products (typical case: receipt
-- approval misidentified the SKU and an admin re-links it), neither the OLD
-- nor the NEW nomenclature's cost_per_unit is recalculated. The chef hit
-- this when moving frozen-avocado purchases from RAW-AVOCADO (fresh) to a
-- new RAW-FROZEN_AVOCADO_HALVES SKU.
--
-- DESIGN:
--   1. Helper fn_recalc_wac_for_product(uuid): recomputes nomenclature.cost_per_unit
--      as the quantity-weighted average across ALL purchase_logs for that product.
--      If no purchase_logs remain → cost_per_unit = NULL (signal to data_health).
--      This is a full-history recompute, not incremental — safe to call any time.
--   2. Trigger fn_recalc_wac_on_purchase_update(): AFTER UPDATE OF nomenclature_id
--      on purchase_logs. Recalcs WAC for both OLD and NEW nomenclature_id whenever
--      they differ. Coexists with trg_purchase_log_correction (mig 153) — they
--      do different jobs (learning vs WAC) and are independent.
--
-- WHY full-history recompute and not delta:
--   The existing INSERT path uses an incremental (current-stock × current-cost +
--   new-qty × new-price) weighted average, which decays over time as stock is
--   consumed. When a row is *re-linked*, there's no clean way to "undo" its prior
--   contribution to OLD's running WAC — past consumption already happened.
--   A full-history recompute gives a deterministic, auditable result:
--   cost = SUM(qty × price) / SUM(qty) over purchase_logs where nomenclature_id = X.
--   The trade-off (loses inventory_balances integration) is acceptable for the
--   re-link case, which is rare and human-initiated.
--
-- IDEMPOTENT: CREATE OR REPLACE on functions, DROP TRIGGER IF EXISTS on trigger.

-- ─────────────────────────────────────────────────────────────
-- Helper: full-history WAC recompute for a single nomenclature
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recalc_wac_for_product(p_nomenclature_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_cost NUMERIC;
BEGIN
    IF p_nomenclature_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT
        ROUND(SUM(price_per_unit * quantity) / NULLIF(SUM(quantity), 0), 4)
    INTO v_new_cost
    FROM public.purchase_logs
    WHERE nomenclature_id = p_nomenclature_id
      AND quantity > 0
      AND price_per_unit IS NOT NULL;

    UPDATE public.nomenclature
    SET cost_per_unit = v_new_cost,
        updated_at    = now()
    WHERE id = p_nomenclature_id;

    RETURN v_new_cost;
END;
$$;

COMMENT ON FUNCTION public.fn_recalc_wac_for_product(UUID)
  IS 'Full-history WAC recompute for one product. Sets nomenclature.cost_per_unit to the quantity-weighted average across all purchase_logs for that nomenclature_id. NULL if no purchases remain. Idempotent. Use when re-linking purchase_logs between products (mig 214).';

-- ─────────────────────────────────────────────────────────────
-- Trigger: fire on purchase_logs.nomenclature_id reassignment
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recalc_wac_on_purchase_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Recalc old product (purchase moved away from it)
    IF OLD.nomenclature_id IS NOT NULL THEN
        PERFORM public.fn_recalc_wac_for_product(OLD.nomenclature_id);
    END IF;

    -- Recalc new product (purchase moved to it)
    IF NEW.nomenclature_id IS NOT NULL THEN
        PERFORM public.fn_recalc_wac_for_product(NEW.nomenclature_id);
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_recalc_wac_on_purchase_update()
  IS 'AFTER UPDATE OF nomenclature_id on purchase_logs: recompute WAC for both OLD and NEW nomenclature_id via fn_recalc_wac_for_product. Coexists with trg_purchase_log_correction (mig 153). Migration 214.';

DROP TRIGGER IF EXISTS trg_recalc_wac_on_purchase_update ON public.purchase_logs;

CREATE TRIGGER trg_recalc_wac_on_purchase_update
AFTER UPDATE OF nomenclature_id ON public.purchase_logs
FOR EACH ROW
WHEN (OLD.nomenclature_id IS DISTINCT FROM NEW.nomenclature_id)
EXECUTE FUNCTION public.fn_recalc_wac_on_purchase_update();

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '214_wac_recalc_on_purchase_update.sql',
    'claude-code',
    'Add fn_recalc_wac_for_product + AFTER UPDATE trigger on purchase_logs.nomenclature_id. Recomputes WAC for both OLD and NEW on re-link. MC 82a16248.'
) ON CONFLICT (filename) DO NOTHING;
