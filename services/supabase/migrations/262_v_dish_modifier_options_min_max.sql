-- Expose group_min_select / group_max_select on the admin v_dish_modifier_options
-- view (it already carries per-portion calories/protein/carbs/fat from task
-- 647cc100), so the admin /menu dish drawer can render the same interactive
-- build-preview the customer site has — toggle options, enforce "pick N–M", and
-- show a live KBJU + price counter. Admin half of MC 389f0d99.
--
-- Additive; columns appended at the end (CREATE OR REPLACE can't insert mid-list).
-- ORDER BY is preserved.
CREATE OR REPLACE VIEW public.v_dish_modifier_options AS
 SELECT o.dish_id,
    o.loyverse_modifier_list_name AS group_name,
    g.sort_order AS group_sort,
    m.name AS modifier_name,
    m.customer_short_name AS modifier_short_name,
    m.emoji AS modifier_emoji,
    o.price_delta,
    o.is_default,
    o.sort_order,
    m.stock_state AS modifier_stock_state,
    round(m.calories::numeric * COALESCE(o.quantity_per_unit, 1::numeric))::integer AS calories,
    round(m.protein * COALESCE(o.quantity_per_unit, 1::numeric), 1) AS protein,
    round(m.carbs * COALESCE(o.quantity_per_unit, 1::numeric), 1) AS carbs,
    round(m.fat * COALESCE(o.quantity_per_unit, 1::numeric), 1) AS fat,
    g.min_select AS group_min_select,
    g.max_select AS group_max_select
   FROM nomenclature_modifier_options o
     JOIN nomenclature m ON m.id = o.modifier_id
     LEFT JOIN dish_modifier_groups g ON g.dish_id = o.dish_id AND g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
  ORDER BY o.dish_id, g.sort_order, o.loyverse_modifier_list_name, o.sort_order;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '262_v_dish_modifier_options_min_max.sql',
  'claude-code',
  'Expose group_min_select/group_max_select on v_dish_modifier_options for the admin live KBJU build-preview (MC 389f0d99 admin half / 195e54bc).'
) ON CONFLICT (filename) DO NOTHING;
