-- ============================================================
-- Migration 165: Add 3 new v_data_health metrics
-- MC task ade8c9e6
--
-- New metrics:
--   nutrition_missing (warning) — active RAW food items with no calories
--   fuzzy_duplicate_candidates (info) — RAW-AUTO items similar to existing RAW
--   variant_without_yield (info) — peeled/trimmed items missing yield comparison
--
-- Skipped: packaging_missing — no tagging system for packaging items yet.
-- ============================================================

-- Recreate view with all existing + 3 new metrics
CREATE OR REPLACE VIEW public.v_data_health AS
WITH metrics AS (
  -- error: type mismatch (RAW code but wrong type)
  SELECT 'type_mismatch' AS metric, 'error' AS severity,
    count(*)::INTEGER AS val
  FROM nomenclature
  WHERE product_code LIKE 'RAW-%'
    AND type != 'raw_ingredient'
    AND is_available = true

  UNION ALL

  -- error: duplicate active names
  SELECT 'duplicate_names', 'error',
    count(*)::INTEGER
  FROM (
    SELECT name FROM nomenclature
    WHERE is_available = true
    GROUP BY name HAVING count(*) > 1
  ) d

  UNION ALL

  -- warning: no category assigned (RAW items)
  SELECT 'no_category', 'warning',
    count(*)::INTEGER
  FROM nomenclature
  WHERE category_id IS NULL
    AND is_available = true
    AND product_code LIKE 'RAW-%'

  UNION ALL

  -- warning: zero cost but has purchases
  SELECT 'zero_cost_with_purchases', 'warning',
    count(*)::INTEGER
  FROM nomenclature n
  WHERE (n.cost_per_unit = 0 OR n.cost_per_unit IS NULL)
    AND n.is_available = true
    AND EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id)

  UNION ALL

  -- warning: misclassified expenses (COGS from non-food suppliers)
  SELECT 'misclassified_cogs', 'warning',
    count(*)::INTEGER
  FROM expense_ledger e
  JOIN suppliers s ON s.id = e.supplier_id
  WHERE e.flow_type = 'COGS'
    AND s.category_code != 4100
    AND s.category_code != 2100

  UNION ALL

  -- warning: equipment with missing specs
  SELECT 'equipment_missing_specs', 'warning',
    count(*)::INTEGER
  FROM equipment e
  WHERE e.is_available = true
    AND (
      (e.capacity_value = 1 AND e.capacity_unit = 'slot')
      OR e.processing_time_min IS NULL
      OR e.category IS NULL
      OR NOT EXISTS (SELECT 1 FROM capex_assets ca WHERE ca.equipment_id = e.id)
    )

  UNION ALL

  -- warning: RAW food items with no nutrition data
  SELECT 'nutrition_missing', 'warning',
    count(*)::INTEGER
  FROM nomenclature
  WHERE product_code LIKE 'RAW-%'
    AND is_available = true
    AND calories IS NULL
    AND type = 'raw_ingredient'

  UNION ALL

  -- action: unmatched items pending review
  SELECT 'unmatched_queue', 'action',
    count(*)::INTEGER
  FROM unmatched_items
  WHERE resolved_to IS NULL

  UNION ALL

  -- info: orphan items (never purchased)
  SELECT 'orphan_items', 'info',
    count(*)::INTEGER
  FROM nomenclature n
  WHERE n.is_available = true
    AND n.product_code LIKE 'RAW-%'
    AND NOT EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id)

  UNION ALL

  -- info: stale prices (last purchase > 30 days ago)
  SELECT 'stale_prices', 'info',
    count(*)::INTEGER
  FROM nomenclature n
  WHERE n.is_available = true
    AND n.product_code LIKE 'RAW-%'
    AND EXISTS (
      SELECT 1 FROM purchase_logs pl
      WHERE pl.nomenclature_id = n.id
      GROUP BY pl.nomenclature_id
      HAVING max(pl.invoice_date) < CURRENT_DATE - INTERVAL '30 days'
    )
    AND NOT EXISTS (
      SELECT 1 FROM purchase_logs pl
      WHERE pl.nomenclature_id = n.id
        AND pl.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
    )

  UNION ALL

  -- info: RAW-AUTO items that fuzzy-match an existing named RAW item (pg_trgm)
  SELECT 'fuzzy_duplicate_candidates', 'info',
    count(DISTINCT a.id)::INTEGER
  FROM nomenclature a
  JOIN nomenclature b
    ON a.id != b.id
    AND b.product_code LIKE 'RAW-%'
    AND b.product_code NOT LIKE 'RAW-AUTO-%'
    AND b.is_available = true
    AND similarity(lower(a.name), lower(b.name)) > 0.6
  WHERE a.product_code LIKE 'RAW-AUTO-%'
    AND a.is_available = true

  UNION ALL

  -- info: peeled/trimmed/cleaned variants without yield_loss_pct in BOM
  SELECT 'variant_without_yield', 'info',
    count(*)::INTEGER
  FROM nomenclature n
  WHERE n.is_available = true
    AND n.product_code LIKE 'RAW-%'
    AND (n.name ILIKE '%trimmed%' OR n.name ILIKE '%peeled%' OR n.name ILIKE '%cleaned%')
    AND NOT EXISTS (
      SELECT 1 FROM bom_structures bs
      WHERE bs.ingredient_id = n.id
        AND bs.yield_loss_pct IS NOT NULL
        AND bs.yield_loss_pct > 0
    )
),
score AS (
  SELECT
    100
    - COALESCE(SUM(CASE WHEN severity = 'error'   THEN val * 5 ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN severity = 'warning' THEN val * 2 ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN severity = 'action'  THEN val * 1 ELSE 0 END), 0)
    AS health_score
  FROM metrics
)
SELECT m.metric, m.severity, m.val, s.health_score
FROM metrics m
CROSS JOIN score s
ORDER BY
  CASE m.severity
    WHEN 'error' THEN 0
    WHEN 'warning' THEN 1
    WHEN 'action' THEN 2
    WHEN 'info' THEN 3
  END,
  m.val DESC;

COMMENT ON VIEW public.v_data_health
  IS 'Data health dashboard: one row per metric with severity and health score. Score = 100 - (errors*5) - (warnings*2) - (actions*1).';

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '165_data_health_new_metrics.sql',
  'claude-code',
  NULL,
  'Add nutrition_missing (warn), fuzzy_duplicate_candidates (info), variant_without_yield (info) to v_data_health. MC ade8c9e6.'
) ON CONFLICT (filename) DO NOTHING;
