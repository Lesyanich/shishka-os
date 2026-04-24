-- ============================================================
-- Migration 157: Create Culantro nomenclature + Makro supplier_catalog
--
-- Task: 4814e38a — Culantro (ผักชีฝรั่ง, Sawtooth Coriander) from Makro
-- supplier_sku 862441, 150g pack. Appeared as "New" during receipt OCR.
--
-- Decisions (matches existing 15 fresh-herb rows — migration 067 seed):
--   product_code = RAW-CULANTRO     (same pattern as RAW-PARSLEY, RAW-BASIL)
--   base_unit    = kg               (all fresh herbs are kg; pack size
--                                    converted via conversion_factor)
--   category     = F-PRD-HRB        (Fresh Herbs)
--   aliases      = 6 alternate names (1st nomenclature row to use the
--                                    aliases[] column — previous rows
--                                    left empty by seed scripts)
--
-- supplier_catalog row links RAW-CULANTRO to Makro. The trg_auto_conversion_factor
-- trigger (mig 143) parses "150 g" from package_weight and computes
-- conversion_factor = 0.150 automatically.
-- ============================================================


-- ─── 1. Insert Culantro nomenclature ───

INSERT INTO public.nomenclature (
  product_code, name, type, base_unit,
  category_id, aliases, is_available, created_at, updated_at
)
SELECT
  'RAW-CULANTRO',
  'Culantro',
  'raw_ingredient',
  'kg',
  pc.id,
  ARRAY[
    'Sawtooth Coriander',
    'Long Coriander',
    'Recao',
    'Shadon Beni',
    'Eryngium foetidum',
    'ผักชีฝรั่ง'
  ],
  TRUE,
  now(),
  now()
FROM public.product_categories pc
WHERE pc.code = 'F-PRD-HRB'
ON CONFLICT (product_code) DO NOTHING;


-- ─── 2. Link to Makro supplier_catalog (supplier_sku 862441) ───

INSERT INTO public.supplier_catalog (
  supplier_id, nomenclature_id, supplier_sku,
  original_name, product_name, product_name_th,
  package_weight, package_qty, package_unit, package_type,
  category_code, sub_category_code,
  source, verified_at
)
SELECT
  s.id,
  n.id,
  '862441',
  'ผักชีฝรั่ง 150g',
  'Culantro (Sawtooth Coriander)',
  'ผักชีฝรั่ง',
  '150 g',
  150,
  'g',
  'pack',
  4100,        -- Food
  4101,        -- Produce & Fungi
  'manual',
  now()
FROM public.suppliers s
CROSS JOIN public.nomenclature n
WHERE s.name = 'Makro'
  AND n.product_code = 'RAW-CULANTRO'
  AND NOT EXISTS (
    SELECT 1 FROM public.supplier_catalog sc2
     WHERE sc2.supplier_id = s.id AND sc2.supplier_sku = '862441'
  );
  -- conversion_factor computed automatically by trg_auto_conversion_factor
  -- (mig 143): parses "150 g" + base_unit='kg' → conversion_factor = 0.150


-- ─── 3. Verification + log ───

DO $$
DECLARE
  v_nom_id UUID;
  v_sc_count INT;
  v_alias_count INT;
  v_conv_factor NUMERIC;
BEGIN
  SELECT id, array_length(aliases, 1)
    INTO v_nom_id, v_alias_count
    FROM public.nomenclature
   WHERE product_code = 'RAW-CULANTRO';

  IF v_nom_id IS NULL THEN
    RAISE EXCEPTION 'Culantro nomenclature row not created';
  END IF;

  SELECT count(*), max(conversion_factor)
    INTO v_sc_count, v_conv_factor
    FROM public.supplier_catalog
   WHERE nomenclature_id = v_nom_id;

  RAISE NOTICE 'Culantro created: nomenclature_id=%, aliases=% values, supplier_catalog rows=%, conversion_factor=%',
               v_nom_id, v_alias_count, v_sc_count, v_conv_factor;

  IF v_sc_count = 0 THEN
    RAISE WARNING 'No supplier_catalog row linked — check that supplier "Makro" exists';
  END IF;

  IF v_conv_factor IS NULL OR v_conv_factor <> 0.150 THEN
    RAISE WARNING 'conversion_factor not auto-derived — expected 0.150, got %', v_conv_factor;
  END IF;
END $$;


-- ─── 4. migration_log self-register ───

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '157_create_culantro_nomenclature.sql',
  'claude-code',
  'Culantro (ผักชีฝรั่ง) RAW-CULANTRO + Makro supplier_catalog 862441 (150g pack). First row with populated aliases[] (6 names). Task 4814e38a.'
) ON CONFLICT (filename) DO NOTHING;
