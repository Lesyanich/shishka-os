-- Migration 263: Packaging display fixes
-- 1. Exclude NF-PKG items from v_dish_assembly_components so packaging
--    doesn't show in the ingredients list (it's already shown in the
--    packaging block below via v_dish_packaging).
-- 2. Rename NF-PKG nomenclature items to short display names.

BEGIN;

-- ── 1. Fix v_dish_assembly_components ────────────────────────────────────────
-- Add LEFT JOIN on component's category and exclude NF-PKG% codes.

CREATE OR REPLACE VIEW public.v_dish_assembly_components AS
SELECT
  bs.parent_id          AS dish_id,
  c.id                  AS component_id,
  c.product_code        AS component_code,
  c.name                AS component_name,
  c.type                AS component_type,
  bs.quantity_per_unit  AS qty_per_portion,
  c.base_unit,
  c.customer_short_name AS component_short_name,
  c.emoji               AS component_emoji,
  bs.slot,
  bs.notes
FROM public.bom_structures bs
JOIN public.nomenclature parent ON parent.id = bs.parent_id
JOIN public.nomenclature c      ON c.id      = bs.ingredient_id
LEFT JOIN public.product_categories pc   ON pc.id   = parent.category_id
LEFT JOIN public.product_categories pc_c ON pc_c.id = c.category_id
WHERE parent.product_code LIKE 'SALE-%'
  AND COALESCE(pc_c.code, '') NOT LIKE 'NF-PKG%'   -- packaging shown separately
  AND (
    c.product_code ~ '^(PF|MOD)-'   -- assembly components for all dishes
    OR pc.code LIKE 'KP-DRK%'       -- drinks: all RAW children shown at L2
  )
ORDER BY bs.parent_id, COALESCE(bs.slot, 'zzz'), c.name;

GRANT SELECT ON public.v_dish_assembly_components TO anon, authenticated;

-- ── 2. Short display names for NF-PKG items ───────────────────────────────────

UPDATE public.nomenclature SET name = '18oz PP Cup'       WHERE product_code = 'RAW-CUP_PP_18OZ';
UPDATE public.nomenclature SET name = '20oz PP Cup'       WHERE product_code = 'RAW-CUP_PP_20OZ';
UPDATE public.nomenclature SET name = '22oz PET Cup'      WHERE product_code = 'RAW-CUP_PET_22OZ';
UPDATE public.nomenclature SET name = '8oz Paper Cup'     WHERE product_code = 'RAW-CUP_PAPER_8OZ';
UPDATE public.nomenclature SET name = 'Dome Lid 95mm'     WHERE product_code = 'RAW-LID_DOME_95MM';
UPDATE public.nomenclature SET name = 'Dome Lid 98mm'     WHERE product_code = 'RAW-LID_DOME_98MM';
UPDATE public.nomenclature SET name = '8oz Paper Lid'     WHERE product_code = 'RAW-LID_PAPER_8OZ';
UPDATE public.nomenclature SET name = 'Eco Straw 21cm'    WHERE product_code = 'RAW-STRAW_ECO_21CM';
UPDATE public.nomenclature SET name = 'Sauce Cup 2oz'     WHERE product_code = 'RAW-SAUCE_CUP_2OZ';
UPDATE public.nomenclature SET name = 'PET Bottle 250ml'  WHERE product_code = 'RAW-BOTTLE_PET_250';
UPDATE public.nomenclature SET name = 'Kraft Bag (small)' WHERE product_code = 'RAW-KRAFT_BAG_SMALL';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '262a_packaging_display_fixes.sql',
  'claude-code',
  'Exclude NF-PKG from v_dish_assembly_components (shown separately in packaging block). Rename NF-PKG items to short display names.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
