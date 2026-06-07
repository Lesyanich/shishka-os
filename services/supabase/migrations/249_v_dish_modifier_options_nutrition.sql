-- Migration 249: per-option nutrition on v_dish_modifier_options
-- Adds calories/protein/carbs/fat per modifier option (= MOD KBJU x quantity_per_unit)
-- so the frontend can compute a live smoothie nutrition counter when the customer
-- picks fruits/boosters. Data already filled on 22/22 Custom Smoothie MOD-* options
-- (chef, 2026-06-07). View-only change; no base table touched. NULL-preserving:
-- a MOD with no nutrition stays NULL (not a fake 0) so missing data stays visible.
-- MC: 647cc100 | cluster: smoothie-nutrition-counter

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
  o.sort_order,
  m.stock_state                 AS modifier_stock_state,
  ROUND(m.calories * COALESCE(o.quantity_per_unit, 1))::int AS calories,
  ROUND(m.protein  * COALESCE(o.quantity_per_unit, 1), 1)   AS protein,
  ROUND(m.carbs    * COALESCE(o.quantity_per_unit, 1), 1)   AS carbs,
  ROUND(m.fat      * COALESCE(o.quantity_per_unit, 1), 1)   AS fat
FROM public.nomenclature_modifier_options o
JOIN public.nomenclature m ON m.id = o.modifier_id
LEFT JOIN public.dish_modifier_groups g
  ON g.dish_id = o.dish_id
 AND g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
ORDER BY o.dish_id, g.sort_order NULLS LAST, o.loyverse_modifier_list_name, o.sort_order;

GRANT SELECT ON public.v_dish_modifier_options TO anon, authenticated;

COMMENT ON VIEW public.v_dish_modifier_options IS
  'Dish customisation menu: modifier options grouped by Loyverse list, with clean name, emoji, price_delta, stock_state and per-option nutrition (calories/protein/carbs/fat = MOD KBJU x quantity_per_unit). Powers the L2 cheat-sheet Customise block and the smoothie live-nutrition counter.';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '249_v_dish_modifier_options_nutrition.sql',
  'claude-code',
  'Add per-option nutrition (calories/protein/carbs/fat) to v_dish_modifier_options for the smoothie live-nutrition counter. MC 647cc100.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
