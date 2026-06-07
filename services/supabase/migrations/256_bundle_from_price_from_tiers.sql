-- 256: derive bundle "From ฿X" from price_tiers (not from Loyverse slot modifiers)
-- Project: Menu Control — pricing
--
-- The bundle floor ("From ฿212 / 400 / 564") used to be computed from the bundle
-- dish's Loyverse slot modifiers. Those slots are going away, so co-locate the
-- bundle definition with its discount on price_tiers and compute the floor in
-- v_public_menu from the tier prices instead:
--     from_price = manakish_count × cheapest manakish at this tier's discount.

ALTER TABLE public.price_tiers
  ADD COLUMN IF NOT EXISTS bundle_dish_code     text,
  ADD COLUMN IF NOT EXISTS bundle_manakish_count integer,
  ADD COLUMN IF NOT EXISTS bundle_sauce_count    integer;

UPDATE public.price_tiers SET bundle_dish_code='SALE-BUNDLE_MANAKISH_4',  bundle_manakish_count=4,  bundle_sauce_count=1 WHERE tier_code='bundle4';
UPDATE public.price_tiers SET bundle_dish_code='SALE-BUNDLE_MANAKISH_8',  bundle_manakish_count=8,  bundle_sauce_count=2 WHERE tier_code='bundle8';
UPDATE public.price_tiers SET bundle_dish_code='SALE-BUNDLE_MANAKISH_12', bundle_manakish_count=12, bundle_sauce_count=3 WHERE tier_code='bundle12';

DROP VIEW IF EXISTS public.v_public_menu;
CREATE VIEW public.v_public_menu AS
SELECT
    n.id,
    COALESCE(NULLIF(n.customer_short_name, ''::text), n.name) AS name,
    n.customer_description AS description,
    n.price, n.portion_size, n.portion_unit,
    COALESCE(NULLIF(n.customer_photo_url, ''::text), ( SELECT img.url
           FROM nomenclature_images img
          WHERE img.nomenclature_id = n.id AND img.is_primary
          ORDER BY img.sort_order LIMIT 1), NULLIF(n.image_url, ''::text)) AS image_url,
    n.is_featured, n.calories, n.protein, n.carbs, n.fat, n.category_id,
    pc.code AS category_code, pc.name AS category_name,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'group', t.tag_group, 'color', t.color) ORDER BY t.sort_order)
           FROM nomenclature_tags nt JOIN tags t ON t.id = nt.tag_id
          WHERE nt.nomenclature_id = n.id), '[]'::jsonb) AS tags,
    COALESCE(( SELECT array_agg(t.slug ORDER BY t.slug)
           FROM nomenclature_tags nt JOIN tags t ON t.id = nt.tag_id
          WHERE nt.nomenclature_id = n.id AND t.tag_group = 'allergen'::tag_group), ARRAY[]::text[]) AS allergens,
    n.product_code,
    COALESCE(
      -- Bundle floor: count × cheapest manakish at this bundle's tier discount.
      ( SELECT pt.bundle_manakish_count * min(tp.effective_price)
          FROM public.price_tiers pt
          JOIN public.v_dish_tier_prices tp ON tp.tier_code = pt.tier_code
         WHERE pt.bundle_dish_code = n.product_code AND pt.is_active
           AND (pt.valid_from IS NULL OR pt.valid_from <= CURRENT_DATE)
           AND (pt.valid_to   IS NULL OR pt.valid_to   >= CURRENT_DATE)
         GROUP BY pt.bundle_manakish_count ),
      -- Otherwise (e.g. Custom Smoothie): base + Σ(min_select × cheapest option).
      ( SELECT CASE WHEN COALESCE(sum(dmg.min_select * opt.cheapest), 0) > 0
                    THEN n.price + sum(dmg.min_select * opt.cheapest) ELSE NULL END
          FROM dish_modifier_groups dmg
          CROSS JOIN LATERAL (
            SELECT min(mo.price) AS cheapest FROM pos_loyverse_modifier_options mo
            WHERE mo.list_id = dmg.loyverse_modifier_list_id
          ) opt
         WHERE dmg.dish_id = n.id AND dmg.min_select > 0 )
    ) AS from_price
   FROM nomenclature n LEFT JOIN product_categories pc ON pc.id = n.category_id
  WHERE n.is_available = true AND n.product_code ~~* 'SALE-%'::text;

GRANT SELECT ON public.v_public_menu TO anon, authenticated;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('256_bundle_from_price_from_tiers.sql','claude-code',NULL,
  'price_tiers gains bundle metadata; v_public_menu.from_price derives bundle floor from tiers')
ON CONFLICT DO NOTHING;
