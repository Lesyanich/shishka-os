-- 251: expose product_code on v_public_menu
-- Project: Menu Control — bundles
--
-- The ordering site needs product_code to recognise bundle dishes
-- (SALE-BUNDLE_*) and look up their config. product_code is a plain SKU string —
-- it carries no cost/margin/supplier data — so it is safe for anon. Appended as
-- the LAST column (CREATE OR REPLACE VIEW cannot reorder existing columns).

CREATE OR REPLACE VIEW public.v_public_menu AS
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
    n.product_code
   FROM nomenclature n
     LEFT JOIN product_categories pc ON pc.id = n.category_id
  WHERE n.is_available = true AND n.product_code ~~* 'SALE-%'::text;

GRANT SELECT ON public.v_public_menu TO anon, authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('251_public_menu_product_code.sql','claude-code',NULL,
  'Append product_code to v_public_menu so the ordering site can recognise bundle dishes')
ON CONFLICT DO NOTHING;
