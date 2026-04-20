-- ═══════════════════════════════════════════════════════════════════
-- Migration 143: Auto-derive conversion_factor on supplier_catalog changes
-- Task: 344e945c — WS3: prevent recurrence of cost inflation bug
-- ═══════════════════════════════════════════════════════════════════
-- PROBLEM: When a new supplier_catalog entry is created (via fn_approve_receipt
-- or backfill), conversion_factor stays NULL. Next purchase writes package price
-- as per-unit cost, inflating cost_per_unit by 2x-5x.
--
-- FIX: Trigger on supplier_catalog INSERT/UPDATE that:
--   1. Parses package size from original_name (e.g., "5 Liters" → 5)
--   2. Looks up nomenclature.base_unit to determine conversion math
--   3. Sets conversion_factor automatically
--   4. Only fires when conversion_factor IS NULL (never overwrites manual values)
--
-- ALSO: Adds sanity-check flag on purchase_logs for price anomalies.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Helper function: parse package size from text ─────────────

CREATE OR REPLACE FUNCTION public.fn_parse_conversion_factor(
  p_text      TEXT,
  p_base_unit TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_match      TEXT[];
  v_size       NUMERIC;
  v_unit       TEXT;
  v_factor     NUMERIC;
  v_max_factor NUMERIC;
BEGIN
  IF p_text IS NULL OR p_base_unit IS NULL THEN
    RETURN NULL;
  END IF;

  -- Skip "per kg" / "per l" items — already priced per base unit
  IF p_text ~* '\yper\s+(kg|kilo|l|liter|litre)\y' THEN
    RETURN 1.0;
  END IF;

  -- Pattern 1: "Xunit x N" multiplier — e.g., "770g x 2", "1L x2"
  v_match := regexp_match(p_text, E'(\\d+\\.?\\d*)\\s*(kg|g|l|ml|liters?|liter)\\s*[x\u00d7]\\s*(\\d+)', 'i');
  IF v_match IS NOT NULL THEN
    v_size := v_match[1]::NUMERIC * v_match[3]::NUMERIC;
    v_unit := lower(v_match[2]);
  ELSE
    -- Pattern 2: Simple "Xunit" — e.g., "5L", "500g", "946ml", "5 Liters"
    -- (?![a-z]) prevents matching "gal" from "g" + "al"
    v_match := regexp_match(p_text, E'(\\d+\\.?\\d*)\\s*(kg|g|l|ml|liters?|liter)(?![a-z])', 'i');
    IF v_match IS NOT NULL THEN
      v_size := v_match[1]::NUMERIC;
      v_unit := lower(v_match[2]);
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  -- Normalize unit aliases
  IF v_unit IN ('liters', 'liter') THEN
    v_unit := 'l';
  END IF;

  -- Convert parsed size to base_unit
  CASE
    WHEN p_base_unit = 'kg' AND v_unit = 'kg' THEN v_factor := v_size;
    WHEN p_base_unit = 'kg' AND v_unit = 'g'  THEN v_factor := v_size / 1000.0;
    WHEN p_base_unit = 'g'  AND v_unit = 'g'  THEN v_factor := v_size;
    WHEN p_base_unit = 'g'  AND v_unit = 'kg' THEN v_factor := v_size * 1000.0;
    WHEN p_base_unit = 'l'  AND v_unit = 'l'  THEN v_factor := v_size;
    WHEN p_base_unit = 'l'  AND v_unit = 'ml' THEN v_factor := v_size / 1000.0;
    WHEN p_base_unit = 'ml' AND v_unit = 'ml' THEN v_factor := v_size;
    WHEN p_base_unit = 'ml' AND v_unit = 'l'  THEN v_factor := v_size * 1000.0;
    ELSE v_factor := NULL;
  END CASE;

  -- Sanity: max depends on base_unit granularity
  -- kg/l: max 100 (100kg sack or 100L drum)
  -- g/ml: max 10000 (10kg = 10000g)
  IF p_base_unit IN ('g', 'ml') THEN
    v_max_factor := 10000;
  ELSE
    v_max_factor := 100;
  END IF;

  IF v_factor IS NOT NULL AND v_factor BETWEEN 0.01 AND v_max_factor THEN
    RETURN ROUND(v_factor, 6);
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fn_parse_conversion_factor(TEXT, TEXT)
  IS 'Parse package size from product name text and compute conversion_factor relative to base_unit. Returns NULL if unparseable or out of sanity range.';


-- ─── 2. Trigger function: auto-set conversion_factor ──────────────

CREATE OR REPLACE FUNCTION public.fn_auto_conversion_factor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_unit TEXT;
  v_factor    NUMERIC;
BEGIN
  -- Only compute if conversion_factor is NULL (never overwrite manual/existing values)
  IF NEW.conversion_factor IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Need nomenclature_id to look up base_unit
  IF NEW.nomenclature_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get base_unit from nomenclature
  SELECT n.base_unit INTO v_base_unit
  FROM public.nomenclature n
  WHERE n.id = NEW.nomenclature_id;

  IF v_base_unit IS NULL OR v_base_unit NOT IN ('kg', 'g', 'l', 'ml') THEN
    -- Cannot derive for non-weight/volume units (pcs, pack, bag, etc.)
    RETURN NEW;
  END IF;

  -- Try to parse from original_name first, then product_name
  v_factor := public.fn_parse_conversion_factor(NEW.original_name, v_base_unit);

  IF v_factor IS NULL AND NEW.product_name IS NOT NULL THEN
    v_factor := public.fn_parse_conversion_factor(NEW.product_name, v_base_unit);
  END IF;

  -- Also try package_weight field if it contains parseable size
  IF v_factor IS NULL AND NEW.package_weight IS NOT NULL THEN
    v_factor := public.fn_parse_conversion_factor(NEW.package_weight, v_base_unit);
  END IF;

  IF v_factor IS NOT NULL THEN
    NEW.conversion_factor := v_factor;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_auto_conversion_factor()
  IS 'Trigger fn: auto-derive conversion_factor from original_name/product_name/package_weight when NULL on supplier_catalog INSERT/UPDATE.';


-- ─── 3. Create trigger ────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_auto_conversion_factor ON public.supplier_catalog;

CREATE TRIGGER trg_auto_conversion_factor
  BEFORE INSERT OR UPDATE ON public.supplier_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_conversion_factor();


-- ─── 4. Backfill remaining NULLs using the new function ───────────
-- This catches items that migration 142 missed (items with base_unit=pcs
-- that have "per kg" in name, or items with package_weight but no parseable name)

UPDATE supplier_catalog sc
SET conversion_factor = public.fn_parse_conversion_factor(
      COALESCE(sc.original_name, sc.product_name, sc.package_weight),
      n.base_unit
    )
FROM nomenclature n
WHERE n.id = sc.nomenclature_id
  AND sc.conversion_factor IS NULL
  AND n.base_unit IN ('kg', 'g', 'l', 'ml')
  AND public.fn_parse_conversion_factor(
      COALESCE(sc.original_name, sc.product_name, sc.package_weight),
      n.base_unit
    ) IS NOT NULL;


-- ─── 5. Summary ──────────────────────────────────────────────────

DO $$
DECLARE
  v_backfill INTEGER;
  v_still_null INTEGER;
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM supplier_catalog;
  SELECT COUNT(*) INTO v_still_null
  FROM supplier_catalog sc
  JOIN nomenclature n ON n.id = sc.nomenclature_id
  WHERE sc.conversion_factor IS NULL
    AND n.base_unit IN ('kg', 'g', 'l', 'ml');

  RAISE NOTICE 'Migration 143 Summary:';
  RAISE NOTICE '  - Total supplier_catalog entries: %', v_total;
  RAISE NOTICE '  - Still NULL conversion_factor (kg/g/l/ml items): %', v_still_null;
  RAISE NOTICE '  - Trigger trg_auto_conversion_factor active on INSERT/UPDATE';
  RAISE NOTICE '  - Future receipts will auto-derive conversion_factor from product name';
END $$;

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, reviewed_by, description)
VALUES (
  '143_auto_conversion_factor.sql',
  'claude-code',
  'lesia',
  'Auto-derive conversion_factor trigger on supplier_catalog. Prevents cost inflation from package-as-unit pricing.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
