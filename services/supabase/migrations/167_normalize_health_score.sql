-- ============================================================
-- Migration 167: Normalize v_data_health.health_score to 0-100
-- ============================================================
-- ⚠ REGRESSION — superseded by mig 168.
-- This migration applied the GREATEST(0, ...) clamp but copied the
-- view body from the mig 128 baseline (8 metrics), accidentally
-- stripping 4 metrics that had been added to prod by 164/165 from
-- branches that were never merged into main. Mig 168 restores the
-- full 12-metric view and keeps the clamp.
--
-- File kept in repo for traceability — it IS in prod's
-- migration_log and overwriting/renaming it would create drift.
-- Do not re-run.
-- ============================================================
-- Fixes MC 48e0a854. The original formula in mig 128 is linear
-- without a floor:
--   100 - errors*5 - warnings*2 - actions*1
-- Once the defect total exceeds 100, the score goes negative
-- (prod observed: -476). The score is documented as 0-100, and
-- /health falls back to "формула сломана" when out of range.
--
-- Fix: clamp the floor to 0 with GREATEST(0, ...). The ceiling
-- (100) is already implicit because every deficit term is
-- non-negative.
--
-- Out of scope: rebalancing the coefficients or per-metric
-- weights. The current 275 warnings × 2 = 550 deficit is
-- legitimate signal (mostly stale_prices and orphan_items) and
-- a tuning question, not a range bug.
-- ============================================================

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

  -- warning: no category assigned
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
    GREATEST(0,
      100
      - COALESCE(SUM(CASE WHEN severity = 'error'   THEN val * 5 ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN severity = 'warning' THEN val * 2 ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN severity = 'action'  THEN val * 1 ELSE 0 END), 0)
    ) AS health_score
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
  IS 'Data health dashboard: one row per metric with severity and health score. Score = GREATEST(0, 100 - errors*5 - warnings*2 - actions*1) — clamped to 0-100. Score=0 means "lots of issues, see error/warning rows for breakdown".';

-- ── Self-register in migration_log ──
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '167_normalize_health_score.sql',
  'claude-code',
  NULL,
  'Clamp v_data_health.health_score floor to 0 (GREATEST). Fix MC 48e0a854 — prod was returning -476.'
) ON CONFLICT (filename) DO NOTHING;
