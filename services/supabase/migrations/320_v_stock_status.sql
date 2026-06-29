-- 320_v_stock_status.sql
-- Phase 3 (Stock & Reorder): authed stock-status view for the Procurement hub.
--
-- One row per tracked nomenclature: on-hand (from sku_balances) vs par columns
-- (migration 319), computed status + suggested reorder qty, batch/expiry rollup
-- (inventory_batches), and the "decrement-gap" honesty columns.
--
-- Carries cost_per_unit, so it is owner/task_manager-only (authenticated), NOT
-- the anon v_stock_sheet_items.
--
-- Decrement-gap honesty (4B): fn_deduct_order_bom is audit-only — it writes
-- signed stock_movements but never moves sku_balances, so balances drift from
-- reality between counts. We surface this instead of hiding it:
--   consumed_since_count = Σ of consumption (negative qty_delta) booked since the
--                          last count (sku_balances.last_counted_at; all-time if
--                          never counted).
--   theoretical_on_hand  = on_hand - consumed_since_count ("Est. now").
-- The UI shows "Counted" vs "Est. now" so the owner SEES the drift. The live
-- FIFO decrement (fn_apply_stock_movements_fifo) is deferred behind a CEO
-- Socratic gate (it changes what sku_balances means).

CREATE OR REPLACE VIEW public.v_stock_status AS
WITH bal AS (
  SELECT nomenclature_id,
         SUM(quantity)        AS on_hand,
         MAX(last_counted_at) AS last_counted_at
  FROM public.sku_balances
  GROUP BY nomenclature_id
),
mv AS (  -- consumption booked since this item's last count (audit-only ledger drain)
  SELECT m.nomenclature_id,
         SUM(GREATEST(-m.qty_delta, 0)) AS consumed_since_count
  FROM public.stock_movements m
  LEFT JOIN bal b ON b.nomenclature_id = m.nomenclature_id
  WHERE m.created_at > COALESCE(b.last_counted_at, '1970-01-01'::timestamptz)
  GROUP BY m.nomenclature_id
),
batch AS (  -- only physically-present packs count toward expiry awareness
  SELECT nomenclature_id,
         COUNT(*)                                                    AS live_batches,
         MIN(expires_at)                                             AS next_expiry,
         COUNT(*) FILTER (WHERE expires_at <= now() + interval '2 days') AS expiring_soon,
         COUNT(*) FILTER (WHERE expires_at <= now())                 AS expired
  FROM public.inventory_batches
  WHERE status IN ('sealed', 'opened', 'produced')
  GROUP BY nomenclature_id
)
SELECT
  n.id                                               AS nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS name,
  n.base_unit,
  n.storage_location,
  n.shelf_life_days,
  n.cost_per_unit,
  n.default_supplier_id,
  n.min_stock,
  n.par_stock,
  n.reorder_qty,
  COALESCE(b.on_hand, 0)                             AS on_hand,
  b.last_counted_at,
  COALESCE(mv.consumed_since_count, 0)               AS consumed_since_count,
  COALESCE(b.on_hand, 0) - COALESCE(mv.consumed_since_count, 0) AS theoretical_on_hand,
  COALESCE(bt.live_batches, 0)                       AS live_batches,
  bt.next_expiry,
  COALESCE(bt.expiring_soon, 0)                      AS expiring_soon,
  COALESCE(bt.expired, 0)                            AS expired,
  -- suggested order qty in base_unit
  CASE
    WHEN n.min_stock IS NULL                  THEN NULL
    WHEN COALESCE(b.on_hand, 0) > n.min_stock THEN 0
    ELSE COALESCE(n.reorder_qty,
                  GREATEST(COALESCE(n.par_stock, n.min_stock) - COALESCE(b.on_hand, 0), 0))
  END                                                AS suggested_qty,
  CASE
    WHEN n.min_stock IS NULL                  THEN 'untracked'
    WHEN COALESCE(b.on_hand, 0) <= 0          THEN 'out'
    WHEN COALESCE(b.on_hand, 0) <= n.min_stock THEN 'low'
    ELSE 'ok'
  END                                                AS stock_status
FROM public.nomenclature n
LEFT JOIN bal   b  ON b.nomenclature_id  = n.id
LEFT JOIN mv       ON mv.nomenclature_id = n.id
LEFT JOIN batch bt ON bt.nomenclature_id = n.id
WHERE COALESCE(n.is_deleted, false) = false
  AND n.type IN ('raw_ingredient', 'semi_finished', 'good')
  AND (n.min_stock IS NOT NULL OR n.in_stock_sheet = true);

GRANT SELECT ON public.v_stock_status TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '320_v_stock_status.sql',
  'claude-code',
  NULL,
  'Phase 3 Stock & Reorder: authed view v_stock_status — on_hand vs par + suggested_qty + batch/expiry rollup + decrement-gap honesty (consumed_since_count / theoretical_on_hand).'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP VIEW IF EXISTS public.v_stock_status;
