-- Expose dish_modifier_groups.min_select on the menu_modifiers view as
-- group_min_select, so the customer site (shishka.health) can compute a
-- "from ฿X" floor for build-your-own dishes.
--
-- A required group (min_select > 0) means the guest MUST pick at least N
-- options before the dish is valid. Example: the Custom Smoothie (Build Your
-- Own) has "Pick Fruits" with min_select = 2 — its real entry price is
--   base (฿89) + the 2 cheapest fruits (฿10 + ฿10) = ฿109,
-- not the bare base price. The site reads this column to render "from ฿109"
-- on the card + dialog instead of a misleading flat "฿89".
--
-- ADDITIVE ONLY — adds one column; the row filter is unchanged.
-- NOTE: CREATE OR REPLACE VIEW cannot insert a column mid-list, so
-- group_min_select is appended at the END of the projection.
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
    g.min_select AS group_min_select
   FROM nomenclature_modifier_options o
     JOIN nomenclature m ON m.id = o.modifier_id
     LEFT JOIN dish_modifier_groups g ON g.dish_id = o.dish_id AND g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
  WHERE (o.dish_id IN ( SELECT nomenclature.id
           FROM nomenclature
          WHERE nomenclature.product_code ~~ 'SALE-%'::text AND nomenclature.pos_status = 'synced'::pos_status_enum AND nomenclature.is_available = true));

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '259_menu_modifiers_expose_min_select.sql',
  'claude-code',
  'Expose dish_modifier_groups.min_select as group_min_select on menu_modifiers so shishka.health can render "from ฿X" floor for build-your-own dishes (e.g. Custom Smoothie from ฿109). Additive; row filter unchanged.'
) ON CONFLICT (filename) DO NOTHING;
