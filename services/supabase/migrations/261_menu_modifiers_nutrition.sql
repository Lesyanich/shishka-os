-- Expose per-portion nutrition (calories/protein/carbs/fat) of each modifier
-- option on the customer menu_modifiers view, so shishka.health can show a LIVE
-- calorie/macro counter as the guest builds a custom dish (e.g. Custom Smoothie
-- + fruits). Mirrors the scaling already used by the admin v_dish_modifier_options
-- view (task 647cc100): the option's nomenclature nutrition × quantity_per_unit
-- (grams used per dish), rounded to integer kcal / 1-decimal macros.
--
-- Finishes the web half of the "smoothie builder with live calorie/macro
-- counter" feature (MC 389f0d99). Additive; columns appended at the end of the
-- view (CREATE OR REPLACE can't insert mid-list).
CREATE OR REPLACE VIEW public.menu_modifiers AS
 SELECT o.dish_id,
    o.loyverse_modifier_list_name AS group_name,
    g.sort_order AS group_sort,
    COALESCE(m.customer_short_name, m.name) AS option_name,
    m.emoji AS option_emoji,
    o.price_delta,
    o.is_default,
    o.sort_order,
    m.stock_state AS option_stock_state,
    g.min_select AS group_min_select,
    g.max_select AS group_max_select,
    round(m.calories::numeric * COALESCE(o.quantity_per_unit, 1::numeric))::integer AS calories,
    round(m.protein * COALESCE(o.quantity_per_unit, 1::numeric), 1) AS protein,
    round(m.carbs * COALESCE(o.quantity_per_unit, 1::numeric), 1) AS carbs,
    round(m.fat * COALESCE(o.quantity_per_unit, 1::numeric), 1) AS fat
   FROM nomenclature_modifier_options o
     JOIN nomenclature m ON m.id = o.modifier_id
     LEFT JOIN dish_modifier_groups g ON g.dish_id = o.dish_id AND g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
  WHERE (o.dish_id IN ( SELECT nomenclature.id
           FROM nomenclature
          WHERE nomenclature.product_code ~~ 'SALE-%'::text AND nomenclature.pos_status = 'synced'::pos_status_enum AND nomenclature.is_available = true));

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '261_menu_modifiers_nutrition.sql',
  'claude-code',
  'Expose per-portion calories/protein/carbs/fat of modifier options on menu_modifiers (scaled by quantity_per_unit) for the live KBJU counter on shishka.health (MC 389f0d99 web half).'
) ON CONFLICT (filename) DO NOTHING;
