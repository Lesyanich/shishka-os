-- ============================================================
-- Migration 136: v_data_health_items — per-metric drill-down view
--
-- Returns the individual failing rows grouped by health metric, so the
-- Data Health tab in Mission Control can expand any check to see the
-- actual items. Mirrors the WHERE clauses used in v_data_health (migration 128).
--
-- Columns:
--   metric       — one of: type_mismatch, duplicate_names, no_category,
--                  zero_cost_with_purchases, misclassified_cogs,
--                  unmatched_queue, orphan_items, stale_prices
--   entity_id    — UUID of the failing row (nomenclature.id or
--                  unmatched_items.id or expense_ledger.id)
--   entity_kind  — which table: 'nomenclature' | 'unmatched_items' | 'expense'
--   product_code — RAW/PF/SALE/MOD code (NULL for non-nomenclature rows)
--   name         — human-readable label
--   extra_json   — per-metric payload for UI context
-- ============================================================

CREATE OR REPLACE VIEW public.v_data_health_items AS
-- ── errors ──
-- type_mismatch: RAW code but wrong type
SELECT 'type_mismatch'::text AS metric,
       n.id                  AS entity_id,
       'nomenclature'::text  AS entity_kind,
       n.product_code,
       n.name,
       jsonb_build_object('current_type', n.type) AS extra_json
  FROM public.nomenclature n
 WHERE n.is_available = TRUE
   AND n.product_code LIKE 'RAW-%'
   AND n.type != 'raw_ingredient'

UNION ALL
-- duplicate_names: every active row whose name is shared by >1 active row
SELECT 'duplicate_names',
       n.id,
       'nomenclature',
       n.product_code,
       n.name,
       jsonb_build_object('type', n.type)
  FROM public.nomenclature n
 WHERE n.is_available = TRUE
   AND n.name IN (
     SELECT name FROM public.nomenclature
      WHERE is_available = TRUE
      GROUP BY name HAVING COUNT(*) > 1
   )

UNION ALL
-- ── warnings ──
-- no_category: active RAW items without a category assigned
SELECT 'no_category',
       n.id,
       'nomenclature',
       n.product_code,
       n.name,
       jsonb_build_object('type', n.type, 'cost_per_unit', n.cost_per_unit)
  FROM public.nomenclature n
 WHERE n.is_available = TRUE
   AND n.product_code LIKE 'RAW-%'
   AND n.category_id IS NULL

UNION ALL
-- zero_cost_with_purchases: cost=0 but has purchase history
SELECT 'zero_cost_with_purchases',
       n.id,
       'nomenclature',
       n.product_code,
       n.name,
       jsonb_build_object(
         'purchase_count',
         (SELECT COUNT(*) FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id)
       )
  FROM public.nomenclature n
 WHERE n.is_available = TRUE
   AND (n.cost_per_unit = 0 OR n.cost_per_unit IS NULL)
   AND EXISTS (SELECT 1 FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id)

UNION ALL
-- misclassified_cogs: expense row flagged COGS but supplier is non-food
SELECT 'misclassified_cogs',
       e.id,
       'expense',
       NULL,
       COALESCE(NULLIF(e.details, ''), 'Expense ' || substring(e.id::text, 1, 8)),
       jsonb_build_object(
         'supplier_name', s.name,
         'amount_thb', e.amount_thb,
         'transaction_date', e.transaction_date
       )
  FROM public.expense_ledger e
  JOIN public.suppliers s ON s.id = e.supplier_id
 WHERE e.flow_type = 'COGS'
   AND s.category_code != 4100
   AND s.category_code != 2100

UNION ALL
-- ── actions ──
-- unmatched_queue: items waiting for manual review
SELECT 'unmatched_queue',
       u.id,
       'unmatched_items',
       NULL,
       u.raw_text,
       jsonb_build_object(
         'barcode', u.barcode,
         'confidence', u.confidence,
         'created_at', u.created_at,
         'suggested_match', u.suggested_match
       )
  FROM public.unmatched_items u
 WHERE u.resolved_to IS NULL

UNION ALL
-- ── info ──
-- orphan_items: active RAW items never purchased
SELECT 'orphan_items',
       n.id,
       'nomenclature',
       n.product_code,
       n.name,
       jsonb_build_object(
         'type', n.type,
         'created_at', n.created_at,
         'category_id', n.category_id
       )
  FROM public.nomenclature n
 WHERE n.is_available = TRUE
   AND n.product_code LIKE 'RAW-%'
   AND NOT EXISTS (SELECT 1 FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id)

UNION ALL
-- stale_prices: last purchase > 30 days ago, no recent purchases
SELECT 'stale_prices',
       n.id,
       'nomenclature',
       n.product_code,
       n.name,
       jsonb_build_object(
         'last_purchase',
         (SELECT MAX(pl.invoice_date) FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id),
         'cost_per_unit', n.cost_per_unit
       )
  FROM public.nomenclature n
 WHERE n.is_available = TRUE
   AND n.product_code LIKE 'RAW-%'
   AND EXISTS (
     SELECT 1 FROM public.purchase_logs pl
      WHERE pl.nomenclature_id = n.id
      GROUP BY pl.nomenclature_id
      HAVING MAX(pl.invoice_date) < CURRENT_DATE - INTERVAL '30 days'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.purchase_logs pl
      WHERE pl.nomenclature_id = n.id
        AND pl.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
   );

COMMENT ON VIEW public.v_data_health_items
  IS 'Per-metric drill-down of failing rows for the Data Health tab. Mirrors v_data_health aggregate metrics.';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '136_v_data_health_items.sql',
  'claude-code',
  NULL,
  'Add v_data_health_items drill-down view for the Mission Control Data Health tab.'
) ON CONFLICT (filename) DO NOTHING;
