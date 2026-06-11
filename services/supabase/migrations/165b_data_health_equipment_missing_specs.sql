-- ============================================================
-- Migration 164: Data health rule — detect equipment with missing specs
-- MC task 05795744
--
-- Adds EQUIPMENT_MISSING_SPECS rule to data_health_rules.
-- Detects active equipment where key operational fields are still
-- at defaults: capacity_value=1/slot, no processing_time, no capex link.
-- ============================================================

INSERT INTO public.data_health_rules (
  rule_code, title, description, entity_kind, metric,
  detect_sql, fix_strategy, severity, auto_apply, confidence, created_by
) VALUES (
  'EQUIPMENT_MISSING_SPECS',
  'Equipment with incomplete operational specs',
  'Active equipment records where capacity is still at default (1 slot), '
  'processing_time_min is NULL, or no linked capex_asset exists. '
  'These records were likely auto-created and need manual review to fill '
  'brand/model details, real capacity, and processing times.',
  'equipment',
  'completeness',
  $sql$
    SELECT e.id, e.equipment_code, e.name,
      jsonb_build_object(
        'default_capacity', (e.capacity_value = 1 AND e.capacity_unit = 'slot'),
        'no_processing_time', (e.processing_time_min IS NULL),
        'no_capex_link', NOT EXISTS (
          SELECT 1 FROM capex_assets ca WHERE ca.equipment_id = e.id
        ),
        'no_category', (e.category IS NULL)
      ) AS issues
    FROM public.equipment e
    WHERE e.is_available = true
      AND (
        (e.capacity_value = 1 AND e.capacity_unit = 'slot')
        OR e.processing_time_min IS NULL
        OR e.category IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM capex_assets ca WHERE ca.equipment_id = e.id
        )
      )
  $sql$,
  'Manual review: fill capacity, processing_time_min, and link to capex_asset. '
  'Equipment detail page or MCP manage_capex_assets tool can be used.',
  'warn',
  false,
  NULL,
  'claude-code'
)
ON CONFLICT (rule_code) DO NOTHING;

-- Also add to v_data_health view as a new metric
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
  '165b_data_health_equipment_missing_specs.sql',
  'claude-code',
  NULL,
  'Add EQUIPMENT_MISSING_SPECS rule to data_health_rules + equipment_missing_specs metric to v_data_health view. MC 05795744.'
) ON CONFLICT (filename) DO NOTHING;
