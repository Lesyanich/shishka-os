-- Migration 184: v_dish_assembly_components view
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §4.6
-- Returns direct BOM children for SALE-* parents that are PF-* or MOD-* (the things L2 assembler physically grabs).
-- L1 RAW ingredients are intentionally excluded — that's L1 Cook's concern, not L2.

BEGIN;

CREATE OR REPLACE VIEW public.v_dish_assembly_components AS
SELECT
  bs.parent_id          AS dish_id,
  c.id                  AS component_id,
  c.product_code        AS component_code,
  c.name                AS component_name,
  c.type                AS component_type,
  bs.quantity_per_unit  AS qty_per_portion,
  c.base_unit,
  bs.slot,
  bs.notes
FROM public.bom_structures bs
JOIN public.nomenclature parent ON parent.id = bs.parent_id
JOIN public.nomenclature c      ON c.id      = bs.ingredient_id
WHERE parent.product_code LIKE 'SALE-%'
  AND c.product_code ~ '^(PF|MOD)-'
ORDER BY bs.parent_id, COALESCE(bs.slot, 'zzz'), c.name;

GRANT SELECT ON public.v_dish_assembly_components TO anon, authenticated;

COMMENT ON VIEW public.v_dish_assembly_components IS
  'L2 Assembler composition projection: direct BOM children of SALE-* dishes filtered to PF/MOD only.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '184_v_dish_assembly_components.sql',
  'claude-code',
  'New view v_dish_assembly_components — derived L2 assembler composition from BOM.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
