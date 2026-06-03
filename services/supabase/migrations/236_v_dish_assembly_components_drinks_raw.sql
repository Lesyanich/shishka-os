-- Migration 236: v_dish_assembly_components — include RAW children for Drinks
-- Smoothies/drinks (category KP-DRK*) are blended to order at L2 directly from RAW
-- frozen fruit + milk/water + ice. The original view (184) filters BOM children to
-- PF/MOD only, which hid those RAW lines and left smoothie cards near-empty on the
-- L2 Assembler view. This broadens the projection: RAW is still excluded for every
-- non-drink dish (soups/mains keep showing only their PF bag), but for Drinks-subtree
-- dishes ALL direct BOM children are surfaced — that IS what the assembler grabs.

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
LEFT JOIN public.product_categories pc ON pc.id = parent.category_id
WHERE parent.product_code LIKE 'SALE-%'
  AND (
    c.product_code ~ '^(PF|MOD)-'   -- assembly components (PF bags / modifiers)
    OR pc.code LIKE 'KP-DRK%'        -- drinks: blended to order from RAW at L2
  )
ORDER BY bs.parent_id, COALESCE(bs.slot, 'zzz'), c.name;

GRANT SELECT ON public.v_dish_assembly_components TO anon, authenticated;

COMMENT ON VIEW public.v_dish_assembly_components IS
  'L2 Assembler composition projection: direct BOM children of SALE-* dishes. PF/MOD for all dishes; RAW also included for Drinks-subtree (KP-DRK*) dishes blended to order at L2.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '236_v_dish_assembly_components_drinks_raw.sql',
  'claude-code',
  'Broaden v_dish_assembly_components to include RAW children for Drinks (KP-DRK*) so smoothie ingredients surface on L2 Assembler.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
