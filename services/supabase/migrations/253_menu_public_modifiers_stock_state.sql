-- Expose stock_state on the customer-site views (menu_public + menu_modifiers,
-- created by the visitor-site work, mig 249_visitor_site) so shishka.health can
-- render coming-soon dishes/options. ADDITIVE ONLY — the pos_status='synced' row
-- filter is left unchanged here; relaxing it to surface coming_soon dishes is a
-- separate, outward-facing go-live step taken once the site renders the badge:
--   ... WHERE product_code LIKE 'SALE-%' AND is_available = true
--         AND (pos_status = 'synced' OR stock_state <> 'in_stock');
CREATE OR REPLACE VIEW public.menu_public
  WITH (security_invoker = true) AS
 SELECT n.id,
    n.product_code,
    n.name,
    n.customer_short_name,
    n.customer_photo_url,
    n.image_url,
    n.customer_description,
    n.price,
    n.is_available,
    n.is_featured,
    n.pos_status,
    n.calories,
    n.protein,
    n.carbs,
    n.fat,
    n.portion_size,
    n.portion_unit,
    n.category_id,
    n.display_order,
    c.code AS category_code,
    c.name AS category_name,
    c.sort_order AS category_sort_order,
    n.customer_ingredients,
    n.stock_state
   FROM nomenclature n
     LEFT JOIN product_categories c ON c.id = n.category_id
  WHERE n.product_code ~~ 'SALE-%'::text AND n.pos_status = 'synced'::pos_status_enum AND n.is_available = true;

-- menu_modifiers: append the option's stock_state (security_definer = default).
CREATE OR REPLACE VIEW public.menu_modifiers AS
 SELECT o.dish_id,
    o.loyverse_modifier_list_name AS group_name,
    g.sort_order AS group_sort,
    COALESCE(m.customer_short_name, m.name) AS option_name,
    m.emoji AS option_emoji,
    o.price_delta,
    o.is_default,
    o.sort_order,
    m.stock_state AS option_stock_state
   FROM nomenclature_modifier_options o
     JOIN nomenclature m ON m.id = o.modifier_id
     LEFT JOIN dish_modifier_groups g ON g.dish_id = o.dish_id AND g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
  WHERE (o.dish_id IN ( SELECT nomenclature.id
           FROM nomenclature
          WHERE nomenclature.product_code ~~ 'SALE-%'::text AND nomenclature.pos_status = 'synced'::pos_status_enum AND nomenclature.is_available = true));

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '253_menu_public_modifiers_stock_state.sql',
  'claude-code',
  'Expose stock_state on menu_public + menu_modifiers (option_stock_state) for shishka.health coming-soon rendering. Additive; pos_status filter unchanged (go-live flip deferred).'
) ON CONFLICT (filename) DO NOTHING;
