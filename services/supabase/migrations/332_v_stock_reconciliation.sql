-- 332_v_stock_reconciliation.sql
-- W1 Connected Stock Model (spec §5.1 / CEO decision §10-C, MC c605e2ca).
--
-- The parallel-run safety net. CEO decision (C): make inventory_batches the source of
-- truth and DERIVE on-hand, but keep the legacy global sku_balances running for ONE
-- phase as a cross-check before demoting it. This view diffs the two global figures per
-- nomenclature so we can watch the drift on the ~266 tracked SKUs and only cut over
-- (demote sku_balances to a compat view) once they agree within tolerance. No split-brain.

CREATE OR REPLACE VIEW public.v_stock_reconciliation AS
WITH bal AS (
  SELECT nomenclature_id,
         SUM(quantity)        AS sku_balance_qty,
         MAX(last_counted_at) AS last_counted_at
  FROM public.sku_balances
  GROUP BY nomenclature_id
),
batch AS (
  SELECT nomenclature_id,
         SUM(weight) AS batch_on_hand_qty
  FROM public.inventory_batches
  WHERE status IN ('sealed', 'opened', 'produced')
  GROUP BY nomenclature_id
)
SELECT
  n.id                                                AS nomenclature_id,
  n.product_code,
  COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS name,
  n.base_unit,
  COALESCE(bal.sku_balance_qty, 0)                    AS sku_balance_qty,
  COALESCE(batch.batch_on_hand_qty, 0)               AS batch_on_hand_qty,
  COALESCE(bal.sku_balance_qty, 0) - COALESCE(batch.batch_on_hand_qty, 0) AS drift,
  bal.last_counted_at,
  CASE
    WHEN bal.nomenclature_id IS NULL AND batch.nomenclature_id IS NULL THEN 'untracked'
    WHEN batch.nomenclature_id IS NULL                                 THEN 'batch_missing'
    WHEN bal.nomenclature_id IS NULL                                   THEN 'balance_missing'
    WHEN abs(COALESCE(bal.sku_balance_qty, 0) - COALESCE(batch.batch_on_hand_qty, 0)) < 0.001
                                                                       THEN 'match'
    ELSE 'drift'
  END                                                 AS recon_status
FROM public.nomenclature n
LEFT JOIN bal   ON bal.nomenclature_id   = n.id
LEFT JOIN batch ON batch.nomenclature_id = n.id
WHERE COALESCE(n.is_deleted, false) = false
  AND (bal.nomenclature_id IS NOT NULL OR batch.nomenclature_id IS NOT NULL);

GRANT SELECT ON public.v_stock_reconciliation TO authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '332_v_stock_reconciliation.sql',
  'claude-code',
  NULL,
  'W1 (c605e2ca): v_stock_reconciliation — diff global sku_balances vs batch-derived on-hand per nomenclature (drift + recon_status) to validate before demoting sku_balances (CEO §10-C parallel-run).'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual, for reference):
-- DROP VIEW IF EXISTS public.v_stock_reconciliation;
