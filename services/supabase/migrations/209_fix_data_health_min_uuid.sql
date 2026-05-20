-- Migration 209: Fix v_data_health_summary — MIN(uuid) error
-- MC task 838f3659
--
-- Root cause: rule 'nomenclature_duplicate_barcode' detect_sql uses
-- MIN(n.id) on UUID column (PostgreSQL has no native min(uuid) aggregate)
-- and returns wrong column names (extra instead of extra_json, missing
-- product_code and name).
--
-- Fix:
--   1. Rewrite the detect_sql to use (array_agg(...))[1] instead of MIN
--   2. Return correct column shape (entity_id, product_code, name, extra_json)
--   3. Make fn_data_health_rules_items() resilient — catch per-rule errors
--      so one bad detect_sql doesn't crash the whole view

-- ─── 1. Fix the offending rule's detect_sql ───

UPDATE public.data_health_rules
SET detect_sql = $detect$
  SELECT
    (array_agg(n.id ORDER BY n.created_at))[1] AS entity_id,
    (array_agg(n.product_code ORDER BY n.created_at))[1] AS product_code,
    (array_agg(n.name ORDER BY n.created_at))[1] AS name,
    jsonb_build_object(
      'barcode', sub.barcode,
      'item_count', count(*),
      'items', jsonb_agg(jsonb_build_object(
        'id', n.id, 'name', n.name, 'code', n.product_code
      ) ORDER BY n.created_at)
    ) AS extra_json
  FROM (
    SELECT barcode
    FROM purchase_logs
    WHERE barcode IS NOT NULL AND barcode <> ''
    GROUP BY barcode
    HAVING COUNT(DISTINCT nomenclature_id) > 1
  ) sub
  JOIN purchase_logs pl ON pl.barcode = sub.barcode
  JOIN nomenclature n ON n.id = pl.nomenclature_id AND n.is_available = true
  GROUP BY sub.barcode
$detect$,
    updated_at = now()
WHERE rule_code = 'nomenclature_duplicate_barcode';


-- ─── 2. Harden fn_data_health_rules_items() with per-rule error handling ───

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
    BEGIN
      RETURN QUERY EXECUTE v_sql;
    EXCEPTION WHEN OTHERS THEN
      -- Return a single diagnostic row instead of crashing the whole view
      RETURN QUERY SELECT
        r.metric,
        r.id AS entity_id,
        r.entity_kind,
        NULL::text AS product_code,
        ('ERROR in rule ' || r.rule_code || ': ' || SQLERRM)::text AS name,
        jsonb_build_object(
          'rule_code', r.rule_code,
          'rule_id', r.id::text,
          'error', SQLERRM,
          'sqlstate', SQLSTATE
        ) AS extra_json;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.fn_data_health_rules_items() IS
  'Runs detect_sql from every active row in data_health_rules and returns unified (metric, entity_id, entity_kind, product_code, name, extra_json). Per-rule EXCEPTION handling so one bad detect_sql does not crash the whole view. STABLE + SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.fn_data_health_rules_items() TO authenticated;


-- ─── 3. Self-register ───

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '209_fix_data_health_min_uuid.sql',
    'claude-code',
    'Fix nomenclature_duplicate_barcode detect_sql (MIN(uuid) → array_agg) + harden fn_data_health_rules_items with per-rule error handling. MC 838f3659.'
) ON CONFLICT (filename) DO NOTHING;
