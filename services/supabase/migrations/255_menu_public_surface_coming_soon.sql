-- GO-LIVE FLIP: surface coming_soon / out_of_stock dishes on the public site.
-- The site build renders the greyed "Coming soon" badge, so let not-yet-synced
-- items through: keep synced in-stock dishes, plus any is_available SALE dish
-- whose stock_state <> 'in_stock' (e.g. Lion's Mane, pos_status=draft).
-- NOTE: security mode is corrected to DEFINER in mig 256 (253 wrongly set
-- security_invoker=true; the live site reads this view as anon and needs DEFINER).
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
  WHERE n.product_code ~~ 'SALE-%'::text
    AND n.is_available = true
    AND (n.pos_status = 'synced'::pos_status_enum OR n.stock_state <> 'in_stock');

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('255_menu_public_surface_coming_soon.sql', 'claude-code',
        'menu_public surfaces coming_soon/out_of_stock dishes (synced OR stock_state<>in_stock).')
ON CONFLICT (filename) DO NOTHING;
