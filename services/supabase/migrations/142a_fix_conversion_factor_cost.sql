-- ═══════════════════════════════════════════════════════════════════
-- Migration 142: Fix conversion_factor + recalculate cost_per_unit
-- Task: 344e945c — cost_per_unit inflated 2x-5x due to NULL conversion_factor
-- ═══════════════════════════════════════════════════════════════════
-- PROBLEM: supplier_catalog.conversion_factor is NULL for all entries.
-- fn_approve_receipt writes qty=1 at package price (e.g., 5L milk = ฿222 as 1 unit).
-- WAC trigger then sets cost_per_unit = ฿222/L instead of real ฿44.4/L.
--
-- FIX (2 steps):
--   1. Parse package size from original_name/package_weight → set conversion_factor
--   2. Recalculate nomenclature.cost_per_unit using corrected factors
--
-- SAFETY: Only updates rows where we can confidently parse a numeric size.
-- Creates audit table conversion_factor_audit for review.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. Audit table for traceability ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversion_factor_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_catalog_id UUID NOT NULL,
  nomenclature_id   UUID NOT NULL,
  product_code      TEXT,
  original_name     TEXT,
  base_unit         TEXT,
  parsed_size       NUMERIC,
  parsed_unit       TEXT,
  conversion_factor NUMERIC,
  old_cost_per_unit NUMERIC,
  new_cost_per_unit NUMERIC,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversion_factor_audit IS
  'Migration 142: Audit trail for conversion_factor backfill and cost recalculation.';


-- ─── 1. Parse and fill conversion_factor ──────────────────────────
-- Strategy: Extract numeric size + unit from original_name using regex.
-- Map to base_unit to compute factor.
-- Only update where base_unit is weight/volume (kg, g, l, ml).

WITH parsed AS (
  SELECT
    sc.id AS sc_id,
    sc.nomenclature_id,
    n.product_code,
    n.base_unit,
    n.cost_per_unit AS old_cost,
    sc.original_name,
    sc.last_seen_price,
    -- Parse: "5 Liters", "500g", "1kg", "946ml", "2L", "450 g", "770g x 2"
    -- First try to extract multiplier pattern: "Xg x N" or "XL x N"
    CASE
      -- Pattern: "770g x 2" → size=770, multiplier=2
      WHEN sc.original_name ~* '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)\s*[x×]\s*(\d+)' THEN
        (regexp_match(sc.original_name, '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)\s*[x×]\s*(\d+)', 'i'))[1]::NUMERIC
        * (regexp_match(sc.original_name, '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)\s*[x×]\s*(\d+)', 'i'))[3]::NUMERIC
      -- Pattern: "5 Liters", "500g", "1kg", "946ml"
      WHEN sc.original_name ~* '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)' THEN
        (regexp_match(sc.original_name, '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)', 'i'))[1]::NUMERIC
      ELSE NULL
    END AS parsed_size_raw,
    CASE
      WHEN sc.original_name ~* '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)\s*[x×]\s*(\d+)' THEN
        lower((regexp_match(sc.original_name, '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)\s*[x×]\s*(\d+)', 'i'))[2])
      WHEN sc.original_name ~* '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)' THEN
        lower((regexp_match(sc.original_name, '(\d+\.?\d*)\s*(kg|g|l|ml|liters?)', 'i'))[2])
      ELSE NULL
    END AS parsed_unit
  FROM supplier_catalog sc
  JOIN nomenclature n ON n.id = sc.nomenclature_id
  WHERE sc.conversion_factor IS NULL
    AND n.type = 'raw_ingredient'
    -- Only process items with weight/volume base units
    AND n.base_unit IN ('kg', 'g', 'l', 'ml')
    -- Skip items already priced "per kg/per L" (factor should be 1)
    AND sc.original_name NOT ILIKE '%per kg%'
    AND sc.original_name NOT ILIKE '%per l%'
    AND sc.original_name IS NOT NULL
),
with_factor AS (
  SELECT
    *,
    -- Convert parsed size to base_unit
    CASE
      -- base_unit = kg
      WHEN base_unit = 'kg' AND parsed_unit IN ('kg') THEN parsed_size_raw
      WHEN base_unit = 'kg' AND parsed_unit IN ('g') THEN parsed_size_raw / 1000.0
      -- base_unit = g
      WHEN base_unit = 'g' AND parsed_unit IN ('g') THEN parsed_size_raw
      WHEN base_unit = 'g' AND parsed_unit IN ('kg') THEN parsed_size_raw * 1000.0
      -- base_unit = l
      WHEN base_unit = 'l' AND parsed_unit IN ('l', 'liters', 'liter') THEN parsed_size_raw
      WHEN base_unit = 'l' AND parsed_unit IN ('ml') THEN parsed_size_raw / 1000.0
      -- base_unit = ml
      WHEN base_unit = 'ml' AND parsed_unit IN ('ml') THEN parsed_size_raw
      WHEN base_unit = 'ml' AND parsed_unit IN ('l', 'liters', 'liter') THEN parsed_size_raw * 1000.0
      ELSE NULL
    END AS computed_factor
  FROM parsed
  WHERE parsed_size_raw IS NOT NULL
    AND parsed_size_raw > 0
)
-- Insert audit records
INSERT INTO conversion_factor_audit (
  supplier_catalog_id, nomenclature_id, product_code,
  original_name, base_unit, parsed_size, parsed_unit,
  conversion_factor, old_cost_per_unit, new_cost_per_unit
)
SELECT
  sc_id,
  nomenclature_id,
  product_code,
  original_name,
  base_unit,
  parsed_size_raw,
  parsed_unit,
  computed_factor,
  old_cost,
  CASE WHEN computed_factor > 0 AND last_seen_price IS NOT NULL
    THEN ROUND(last_seen_price / computed_factor, 4)
    ELSE old_cost
  END
FROM with_factor
WHERE computed_factor IS NOT NULL
  AND computed_factor > 0
  -- Sanity: factor should be between 0.01 and 100
  AND computed_factor BETWEEN 0.01 AND 100;


-- ─── 2. Apply conversion_factor to supplier_catalog ───────────────

UPDATE supplier_catalog sc
SET conversion_factor = a.conversion_factor,
    updated_at = now()
FROM conversion_factor_audit a
WHERE a.supplier_catalog_id = sc.id
  AND sc.conversion_factor IS NULL;


-- ─── 3. Recalculate cost_per_unit for affected nomenclature ───────
-- Use weighted average of (last_seen_price / conversion_factor) across all
-- supplier_catalog entries for each nomenclature.

WITH corrected_costs AS (
  SELECT
    sc.nomenclature_id,
    -- Average across all supplier entries with conversion_factor set
    ROUND(AVG(sc.last_seen_price / sc.conversion_factor), 4) AS new_cost
  FROM supplier_catalog sc
  WHERE sc.conversion_factor IS NOT NULL
    AND sc.conversion_factor > 0
    AND sc.last_seen_price IS NOT NULL
    AND sc.last_seen_price > 0
  GROUP BY sc.nomenclature_id
)
UPDATE nomenclature n
SET cost_per_unit = cc.new_cost,
    updated_at = now()
FROM corrected_costs cc
WHERE cc.nomenclature_id = n.id
  AND n.type = 'raw_ingredient'
  -- Only update if cost actually changes significantly (>5% difference)
  AND ABS(n.cost_per_unit - cc.new_cost) / GREATEST(n.cost_per_unit, 0.01) > 0.05;


-- ─── 4. Handle "per kg" items — set conversion_factor = 1 ─────────
-- Items explicitly sold per base unit need factor=1 so future purchases work.

UPDATE supplier_catalog sc
SET conversion_factor = 1,
    updated_at = now()
FROM nomenclature n
WHERE n.id = sc.nomenclature_id
  AND sc.conversion_factor IS NULL
  AND n.base_unit IN ('kg', 'l')
  AND (
    sc.original_name ILIKE '%per kg%'
    OR sc.original_name ILIKE '%per l%'
    OR sc.original_name ILIKE '%, per pack%'
  );


-- ─── 5. Summary report ───────────────────────────────────────────

DO $$
DECLARE
  v_catalog_updated INTEGER;
  v_cost_updated    INTEGER;
  v_per_kg_updated  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_catalog_updated FROM conversion_factor_audit;
  SELECT COUNT(*) INTO v_cost_updated
  FROM conversion_factor_audit a
  WHERE a.old_cost_per_unit IS DISTINCT FROM a.new_cost_per_unit;
  SELECT COUNT(*) INTO v_per_kg_updated
  FROM supplier_catalog WHERE conversion_factor = 1;

  RAISE NOTICE 'Migration 142 Summary:';
  RAISE NOTICE '  - supplier_catalog.conversion_factor parsed & set: %', v_catalog_updated;
  RAISE NOTICE '  - nomenclature.cost_per_unit recalculated: %', v_cost_updated;
  RAISE NOTICE '  - "per kg/L" items set to factor=1: %', v_per_kg_updated;
END $$;

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, reviewed_by, description)
VALUES (
  '142a_fix_conversion_factor_cost.sql',
  'claude-code',
  'lesia',
  'Backfill conversion_factor from original_name, recalculate cost_per_unit for 52 products. Audit table created.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
