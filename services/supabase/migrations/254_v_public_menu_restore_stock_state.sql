-- Restore stock_state on v_public_menu. A parallel session re-created the view
-- (adding from_price) and dropped the stock_state column added in mig 249.
-- Re-append it, preserving from_price. (v_public_menu is the shishka-os apps/web
-- source; the live shishka.health site uses menu_public.)
CREATE OR REPLACE VIEW public.v_public_menu AS
 SELECT n.id,
    COALESCE(NULLIF(n.customer_short_name, ''::text), n.name) AS name,
    n.customer_description AS description,
    n.price,
    n.portion_size,
    n.portion_unit,
    COALESCE(NULLIF(n.customer_photo_url, ''::text), ( SELECT img.url
           FROM nomenclature_images img
          WHERE img.nomenclature_id = n.id AND img.is_primary
          ORDER BY img.sort_order
         LIMIT 1), NULLIF(n.image_url, ''::text)) AS image_url,
    n.is_featured,
    n.calories,
    n.protein,
    n.carbs,
    n.fat,
    n.category_id,
    pc.code AS category_code,
    pc.name AS category_name,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'group', t.tag_group, 'color', t.color) ORDER BY t.sort_order) AS jsonb_agg
           FROM nomenclature_tags nt
             JOIN tags t ON t.id = nt.tag_id
          WHERE nt.nomenclature_id = n.id), '[]'::jsonb) AS tags,
    COALESCE(( SELECT array_agg(t.slug ORDER BY t.slug) AS array_agg
           FROM nomenclature_tags nt
             JOIN tags t ON t.id = nt.tag_id
          WHERE nt.nomenclature_id = n.id AND t.tag_group = 'allergen'::tag_group), ARRAY[]::text[]) AS allergens,
    n.product_code,
    ( SELECT
                CASE
                    WHEN COALESCE(sum(dmg.min_select::numeric * opt.cheapest), 0::numeric) > 0::numeric THEN n.price + sum(dmg.min_select::numeric * opt.cheapest)
                    ELSE NULL::numeric
                END AS "case"
           FROM dish_modifier_groups dmg
             CROSS JOIN LATERAL ( SELECT min(mo.price) AS cheapest
                   FROM pos_loyverse_modifier_options mo
                  WHERE mo.list_id = dmg.loyverse_modifier_list_id) opt
          WHERE dmg.dish_id = n.id AND dmg.min_select > 0) AS from_price,
    n.stock_state
   FROM nomenclature n
     LEFT JOIN product_categories pc ON pc.id = n.category_id
  WHERE n.is_available = true AND n.product_code ~~* 'SALE-%'::text;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('254_v_public_menu_restore_stock_state.sql', 'claude-code',
        'Restore stock_state on v_public_menu after a parallel session dropped it (added from_price).')
ON CONFLICT (filename) DO NOTHING;
