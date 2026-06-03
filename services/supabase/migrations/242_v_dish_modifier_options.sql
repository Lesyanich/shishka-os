-- Migration 242: v_dish_modifier_options view
-- Projection of a dish's customisation menu: every modifier option grouped by its
-- Loyverse modifier list, with clean name + emoji + price delta. Powers the
-- "Customise" block on the L2 cheat-sheet — essential for the build-your-own
-- Custom Smoothie (which has no fixed BOM), useful as add-ons for the rest.

BEGIN;

CREATE OR REPLACE VIEW public.v_dish_modifier_options AS
SELECT
  o.dish_id,
  o.loyverse_modifier_list_name AS group_name,
  g.sort_order                  AS group_sort,
  m.name                        AS modifier_name,
  m.customer_short_name         AS modifier_short_name,
  m.emoji                       AS modifier_emoji,
  o.price_delta,
  o.is_default,
  o.sort_order
FROM public.nomenclature_modifier_options o
JOIN public.nomenclature m ON m.id = o.modifier_id
LEFT JOIN public.dish_modifier_groups g
  ON g.dish_id = o.dish_id
 AND g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
ORDER BY o.dish_id, g.sort_order NULLS LAST, o.loyverse_modifier_list_name, o.sort_order;

GRANT SELECT ON public.v_dish_modifier_options TO anon, authenticated;

COMMENT ON VIEW public.v_dish_modifier_options IS
  'Dish customisation menu: modifier options grouped by Loyverse list, with clean name, emoji and price_delta. Used by the L2 cheat-sheet Customise block.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '242_v_dish_modifier_options.sql',
  'claude-code',
  'New view v_dish_modifier_options for L2 cheat-sheet customisation block.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
