-- ============================================================
-- Migration 155: Extend v_data_health_items with rule-driven metrics
--
-- Problem: v_data_health_items has 8 hardcoded metrics. Adding a new
-- metric requires editing this view. That defeats the whole point of
-- data_health_rules as a declarative registry.
--
-- Solution: Keep the 8 existing metrics (they're load-bearing —
-- dashboards and scripts depend on them) but ALSO append rows for
-- every active rule in data_health_rules. Rules expose their
-- violations via detect_sql; we aggregate them via a function that
-- UNIONs all active rule outputs.
--
-- Architecture:
--   v_data_health_items_legacy — the original 8 hardcoded metrics
--   fn_data_health_rules_items() — dynamically runs every active rule
--   v_data_health_items        — UNION of legacy + rules (same shape)
--
-- Benefit: adding a metric now means inserting a row into
--   data_health_rules. The view reflects it on next query.
-- ============================================================


-- ─── 1. Preserve the legacy view as _legacy ───
-- (dashboards importing it by name will still work via the new wrapper)

CREATE OR REPLACE VIEW public.v_data_health_items_legacy AS
  SELECT 'type_mismatch'::text AS metric, n.id AS entity_id,
         'nomenclature'::text AS entity_kind, n.product_code, n.name,
         jsonb_build_object('current_type', n.type) AS extra_json
    FROM public.nomenclature n
   WHERE n.is_available = true
     AND n.product_code LIKE 'RAW-%'
     AND n.type <> 'raw_ingredient'
  UNION ALL
  SELECT 'duplicate_names', n.id, 'nomenclature', n.product_code, n.name,
         jsonb_build_object('type', n.type)
    FROM public.nomenclature n
   WHERE n.is_available = true
     AND n.name IN (SELECT name FROM public.nomenclature
                     WHERE is_available = true GROUP BY name HAVING count(*) > 1)
  UNION ALL
  SELECT 'no_category', n.id, 'nomenclature', n.product_code, n.name,
         jsonb_build_object('type', n.type, 'cost_per_unit', n.cost_per_unit)
    FROM public.nomenclature n
   WHERE n.is_available = true AND n.product_code LIKE 'RAW-%' AND n.category_id IS NULL
  UNION ALL
  SELECT 'zero_cost_with_purchases', n.id, 'nomenclature', n.product_code, n.name,
         jsonb_build_object('purchase_count',
           (SELECT count(*) FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id))
    FROM public.nomenclature n
   WHERE n.is_available = true
     AND (n.cost_per_unit = 0 OR n.cost_per_unit IS NULL)
     AND EXISTS (SELECT 1 FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id)
  UNION ALL
  SELECT 'misclassified_cogs', e.id, 'expense', NULL::text,
         COALESCE(NULLIF(e.details, ''), 'Expense ' || substring(e.id::text, 1, 8)),
         jsonb_build_object('supplier_name', s.name, 'amount_thb', e.amount_thb, 'transaction_date', e.transaction_date)
    FROM public.expense_ledger e
    JOIN public.suppliers s ON s.id = e.supplier_id
   WHERE e.flow_type = 'COGS' AND s.category_code <> 4100 AND s.category_code <> 2100
  UNION ALL
  SELECT 'unmatched_queue', u.id, 'unmatched_items', NULL::text, u.raw_text,
         jsonb_build_object('barcode', u.barcode, 'confidence', u.confidence,
                            'created_at', u.created_at, 'suggested_match', u.suggested_match)
    FROM public.unmatched_items u
   WHERE u.resolved_to IS NULL
  UNION ALL
  SELECT 'orphan_items', n.id, 'nomenclature', n.product_code, n.name,
         jsonb_build_object('type', n.type, 'created_at', n.created_at, 'category_id', n.category_id)
    FROM public.nomenclature n
   WHERE n.is_available = true AND n.product_code LIKE 'RAW-%'
     AND NOT EXISTS (SELECT 1 FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id)
  UNION ALL
  SELECT 'stale_prices', n.id, 'nomenclature', n.product_code, n.name,
         jsonb_build_object(
           'last_purchase', (SELECT max(pl.invoice_date) FROM public.purchase_logs pl WHERE pl.nomenclature_id = n.id),
           'cost_per_unit', n.cost_per_unit
         )
    FROM public.nomenclature n
   WHERE n.is_available = true AND n.product_code LIKE 'RAW-%'
     AND EXISTS (SELECT 1 FROM public.purchase_logs pl
                  WHERE pl.nomenclature_id = n.id
                  GROUP BY pl.nomenclature_id
                 HAVING max(pl.invoice_date) < (CURRENT_DATE - INTERVAL '30 days'))
     AND NOT EXISTS (SELECT 1 FROM public.purchase_logs pl
                     WHERE pl.nomenclature_id = n.id
                       AND pl.invoice_date >= (CURRENT_DATE - INTERVAL '30 days'));

COMMENT ON VIEW public.v_data_health_items_legacy IS
  'Original 8 hardcoded data-health metrics. Preserved so dashboards importing by name keep working. New metrics live in data_health_rules and are exposed via fn_data_health_rules_items()/v_data_health_items.';


-- ─── 2. Function that dynamically runs every active rule ───

CREATE OR REPLACE FUNCTION public.fn_data_health_rules_items()
RETURNS TABLE (
  metric       TEXT,
  entity_id    UUID,
  entity_kind  TEXT,
  product_code TEXT,
  name         TEXT,
  extra_json   JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
#variable_conflict use_column
DECLARE
  r RECORD;
  v_sql TEXT;
BEGIN
  FOR r IN
    SELECT dhr.id, dhr.rule_code, dhr.metric, dhr.entity_kind, dhr.detect_sql
      FROM public.data_health_rules dhr
     WHERE dhr.is_active = TRUE
  LOOP
    v_sql := format(
      'SELECT %L::text AS metric, x.entity_id, %L::text AS entity_kind,
              x.product_code, x.name,
              COALESCE(x.extra_json, ''{}''::jsonb) ||
                jsonb_build_object(''rule_code'', %L, ''rule_id'', %L::text) AS extra_json
         FROM (%s) x',
      r.metric, r.entity_kind, r.rule_code, r.id::text, r.detect_sql
    );
    RETURN QUERY EXECUTE v_sql;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_data_health_rules_items() IS
  'Runs detect_sql from every active row in data_health_rules and returns unified (metric, entity_id, entity_kind, product_code, name, extra_json). extra_json is enriched with rule_code/rule_id for traceability. STABLE + SECURITY DEFINER so views can use it without elevated grants.';

GRANT EXECUTE ON FUNCTION public.fn_data_health_rules_items() TO authenticated;


-- ─── 3. Rebuild v_data_health_items = legacy ∪ rules ───

CREATE OR REPLACE VIEW public.v_data_health_items AS
  SELECT * FROM public.v_data_health_items_legacy
  UNION ALL
  SELECT * FROM public.fn_data_health_rules_items();

COMMENT ON VIEW public.v_data_health_items IS
  'Unified data health feed. Legacy metrics (hardcoded in _legacy view) plus every active rule from data_health_rules. To add a new check, insert into data_health_rules — no migration needed.';


-- ─── 4. Helper: summary counts per metric ───

CREATE OR REPLACE VIEW public.v_data_health_summary AS
  SELECT metric,
         entity_kind,
         count(*) AS item_count,
         max(COALESCE((extra_json->>'rule_code'), 'legacy')) AS rule_code
    FROM public.v_data_health_items
   GROUP BY metric, entity_kind
   ORDER BY 3 DESC;

COMMENT ON VIEW public.v_data_health_summary IS
  'One-row-per-metric rollup of v_data_health_items. rule_code=legacy for hardcoded metrics.';


-- ─── 5. migration_log self-register ───

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '155_data_health_view_plus_rules.sql',
  'claude-code',
  'Refactor v_data_health_items: split legacy hardcoded metrics from rule-driven metrics via fn_data_health_rules_items(). Adding a new check = INSERT into data_health_rules.'
) ON CONFLICT (filename) DO NOTHING;
