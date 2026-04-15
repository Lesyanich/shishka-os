-- ============================================================
-- Migration 131: Data Health — Recover zero cost_per_unit from purchase_logs (WAC)
--
-- Block 1 of the follow-up cleanup for spec:
--   docs/superpowers/specs/2026-04-14-data-health-makro-design.md
--
-- Problem: 38 nomenclature items have cost_per_unit = 0 (or NULL) despite
-- having purchase_logs with real prices. The WAC trigger (fn_update_cost_on_purchase)
-- only fires on new INSERTs; historical rows never got backfilled after item merges
-- and RAW-AUTO resolutions.
--
-- Fix: one-shot backfill that computes WAC across the full purchase history
-- for every active item with cost = 0 AND at least one real purchase.
--
--   WAC = SUM(quantity * price_per_unit) / SUM(quantity)
--
-- Safety:
--   - Only touches rows where current cost IS NULL OR = 0 (no legitimate zero cost overwritten)
--   - Only considers purchase rows with price > 0 AND quantity > 0
--   - Skips items whose entire purchase history sums to zero value (e.g. "Water delivery")
--   - Idempotent-ish: re-running after it's done is a no-op because cost is no longer zero
-- ============================================================

WITH wac_calc AS (
  SELECT pl.nomenclature_id,
         ROUND(SUM(pl.quantity * pl.price_per_unit) / NULLIF(SUM(pl.quantity), 0), 4) AS wac
    FROM public.purchase_logs pl
    JOIN public.nomenclature  n ON n.id = pl.nomenclature_id
   WHERE n.is_available = TRUE
     AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
     AND pl.price_per_unit IS NOT NULL
     AND pl.price_per_unit > 0
     AND pl.quantity > 0
   GROUP BY pl.nomenclature_id
  HAVING SUM(pl.quantity) > 0
     AND SUM(pl.quantity * pl.price_per_unit) > 0
)
UPDATE public.nomenclature n
   SET cost_per_unit = w.wac,
       updated_at    = now()
  FROM wac_calc w
 WHERE n.id = w.nomenclature_id;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '131_data_health_recover_zero_cost.sql',
  'claude-code',
  NULL,
  'Backfill cost_per_unit via WAC for items with zero cost + purchase history. Block 1 of data-health cleanup follow-up.'
) ON CONFLICT (filename) DO NOTHING;
