-- 253: "From ฿X" pricing for build-your-own dishes (custom smoothie, bundles)
-- Project: Menu Control — bundles / pricing display
--
-- A build-your-own dish (e.g. Custom Smoothie ฿89) can't actually be bought at
-- its base price — you MUST add some mandatory options. The true floor for the
-- smoothie is ฿89 + 2 cheapest fruits (฿10) = ฿109, so the menu should read
-- "From ฿109", not ฿89.
--
-- Loyverse does not sync min_select (our mirror has it NULL), so we store the
-- mandatory count on dish_modifier_groups (a table we own; survives Loyverse
-- pulls — fn_refresh_dish_modifier_groups only deletes detached groups and
-- inserts new ones ON CONFLICT DO NOTHING). v_public_menu then exposes a
-- computed from_price = base + Σ(min_select × cheapest option in that group).

-- 1) Mandatory-selection count per attached group (0 = optional).
ALTER TABLE public.dish_modifier_groups
  ADD COLUMN IF NOT EXISTS min_select integer NOT NULL DEFAULT 0;

-- 2) Custom Smoothie requires 2 fruits → floor becomes ฿109.
UPDATE public.dish_modifier_groups dmg
SET min_select = 2
FROM nomenclature n, pos_loyverse_modifier_lists ml
WHERE dmg.dish_id = n.id
  AND n.product_code = 'SALE-SMOOTHIE_CUSTOM'
  AND ml.id = dmg.loyverse_modifier_list_id
  AND ml.name = 'Pick Fruits';

-- 3) Expose from_price on the public menu (NULL when the dish has no mandatory
--    build-your-own component → callers fall back to the plain price).
--    DROP+CREATE (not CREATE OR REPLACE — appending a column trips the
--    "cannot drop columns from view" guard on some PG versions).
DROP VIEW IF EXISTS public.v_public_menu;
CREATE VIEW public.v_public_menu AS
SELECT
    n.id,
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
    n.is_featured, n.calories, n.protein, n.carbs, n.fat, n.category_id,
    pc.code AS category_code, pc.name AS category_name,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'group', t.tag_group, 'color', t.color) ORDER BY t.sort_order)
           FROM nomenclature_tags nt JOIN tags t ON t.id = nt.tag_id
          WHERE nt.nomenclature_id = n.id), '[]'::jsonb) AS tags,
    COALESCE(( SELECT array_agg(t.slug ORDER BY t.slug)
           FROM nomenclature_tags nt JOIN tags t ON t.id = nt.tag_id
          WHERE nt.nomenclature_id = n.id AND t.tag_group = 'allergen'::tag_group), ARRAY[]::text[]) AS allergens,
    n.product_code,
    ( SELECT CASE WHEN COALESCE(sum(dmg.min_select * opt.cheapest), 0) > 0
                  THEN n.price + sum(dmg.min_select * opt.cheapest)
                  ELSE NULL END
        FROM dish_modifier_groups dmg
        CROSS JOIN LATERAL (
          SELECT min(mo.price) AS cheapest
          FROM pos_loyverse_modifier_options mo
          WHERE mo.list_id = dmg.loyverse_modifier_list_id
        ) opt
       WHERE dmg.dish_id = n.id AND dmg.min_select > 0
    ) AS from_price
   FROM nomenclature n LEFT JOIN product_categories pc ON pc.id = n.category_id
  WHERE n.is_available = true AND n.product_code ~~* 'SALE-%'::text;

GRANT SELECT ON public.v_public_menu TO anon, authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('253_buildyourown_from_price.sql','claude-code',NULL,
  'Add dish_modifier_groups.min_select + v_public_menu.from_price; smoothie floor ฿109')
ON CONFLICT DO NOTHING;
