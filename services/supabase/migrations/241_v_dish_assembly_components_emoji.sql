-- Migration 241: expose ingredient emoji on v_dish_assembly_components
-- Appends component_emoji so the L2 cheat-sheet can prefix each ingredient
-- with its emoji (composed at render; name stays clean).

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
  c.customer_short_name AS component_short_name,
  c.emoji               AS component_emoji
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

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '241_v_dish_assembly_components_emoji.sql',
  'claude-code',
  'Add component_emoji to v_dish_assembly_components for L2 cheat-sheet.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
