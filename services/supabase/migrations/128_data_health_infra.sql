-- ============================================================
-- Migration 128: Data Health Infrastructure
-- pg_trgm extension, unmatched_items table, v_data_health view
-- ============================================================

-- ── pg_trgm for fuzzy text matching ──
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── unmatched_items: review queue for receipt items that couldn't be matched ──
CREATE TABLE IF NOT EXISTS public.unmatched_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id      UUID REFERENCES public.expense_ledger(id) ON DELETE SET NULL,
  raw_text        TEXT NOT NULL,
  barcode         TEXT,
  supplier_id     UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  suggested_match UUID REFERENCES public.nomenclature(id) ON DELETE SET NULL,
  confidence      NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  resolved_to     UUID REFERENCES public.nomenclature(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.unmatched_items
  IS 'Review queue for receipt line items that could not be auto-matched to nomenclature. Resolved items feed back into supplier_catalog.';

CREATE INDEX IF NOT EXISTS idx_unmatched_pending
  ON public.unmatched_items(created_at)
  WHERE resolved_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_unmatched_expense
  ON public.unmatched_items(expense_id);

-- ── v_data_health: single-query health dashboard ──
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

-- ── Self-register in migration_log ──
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '128_data_health_infra.sql',
  'claude-code',
  NULL,
  'Add pg_trgm extension, unmatched_items review queue, v_data_health dashboard view.'
) ON CONFLICT (filename) DO NOTHING;
