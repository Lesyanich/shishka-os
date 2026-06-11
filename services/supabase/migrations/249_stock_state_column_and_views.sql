-- Adds a tri-state stock indicator so items can be shown on the menu but flagged
-- "coming soon" / "out of stock" (visible-but-not-orderable) instead of only the
-- binary is_available on/off.
--   is_available = whether the item appears on the menu at all (hard hide stays false)
--   stock_state  = whether it can actually be bought right now
--     in_stock | coming_soon | out_of_stock
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS stock_state text NOT NULL DEFAULT 'in_stock';

ALTER TABLE public.nomenclature
  DROP CONSTRAINT IF EXISTS nomenclature_stock_state_check;
ALTER TABLE public.nomenclature
  ADD CONSTRAINT nomenclature_stock_state_check
  CHECK (stock_state IN ('in_stock', 'coming_soon', 'out_of_stock'));

COMMENT ON COLUMN public.nomenclature.stock_state IS
  'in_stock | coming_soon | out_of_stock. Visible-but-not-orderable state, orthogonal to is_available (which hard-hides). coming_soon/out_of_stock render greyed on menu surfaces.';

-- v_public_menu: append product_code + stock_state + is_available last
-- (CREATE OR REPLACE is positional). product_code/is_available overlap with the
-- parallel visitor-site work; this is the superset so one view serves every
-- menu surface (admin preview, showcase site, future visitor site).
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
    n.stock_state,
    n.is_available
   FROM nomenclature n
     LEFT JOIN product_categories pc ON pc.id = n.category_id
  WHERE n.is_available = true AND n.product_code ~~* 'SALE-%'::text;

-- v_dish_modifier_options: append modifier_stock_state last.
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
    m.stock_state AS modifier_stock_state
   FROM nomenclature_modifier_options o
     JOIN nomenclature m ON m.id = o.modifier_id
     LEFT JOIN dish_modifier_groups g ON g.dish_id = o.dish_id AND g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
  ORDER BY o.dish_id, g.sort_order, o.loyverse_modifier_list_name, o.sort_order;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '249_stock_state_column_and_views.sql',
  'claude-code',
  'Add nomenclature.stock_state (in_stock|coming_soon|out_of_stock); v_public_menu + v_dish_modifier_options expose it. v_public_menu superset also carries product_code + is_available (parallel visitor-site work).'
) ON CONFLICT (filename) DO NOTHING;
