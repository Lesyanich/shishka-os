-- Migration 239: expose customer_short_name on v_dish_assembly_components
-- The L2 cheat-sheet labels ingredients with a clean culinary name when present
-- (customer_short_name), falling back to the supplier name. Add the column to the
-- projection so the UI can read it without a second query.

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
  bs.notes,
  c.customer_short_name AS component_short_name
FROM public.bom_structures bs
JOIN public.nomenclature parent ON parent.id = bs.parent_id
JOIN public.nomenclature c      ON c.id      = bs.ingredient_id
LEFT JOIN public.product_categories pc ON pc.id = parent.category_id
WHERE parent.product_code LIKE 'SALE-%'
  AND (
    c.product_code ~ '^(PF|MOD)-'
    OR pc.code LIKE 'KP-DRK%'
  )
ORDER BY bs.parent_id, COALESCE(bs.slot, 'zzz'), c.name;

GRANT SELECT ON public.v_dish_assembly_components TO anon, authenticated;

COMMENT ON VIEW public.v_dish_assembly_components IS
  'L2 Assembler composition projection: direct BOM children of SALE-* dishes. PF/MOD for all dishes; RAW also included for Drinks-subtree (KP-DRK*). Exposes customer_short_name as component_short_name for clean labels.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '239_v_dish_assembly_components_short_name.sql',
  'claude-code',
  'Add component_short_name (customer_short_name) to v_dish_assembly_components for clean L2 cheat-sheet labels.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
