-- 226: Public, customer-safe menu projection for the website/app (anon access)
-- Project: Customer site + ordering app
-- NOTE: file authored for review — NOT yet applied to the live project.
--
-- SECURITY MODEL (deliberate):
--   * nomenclature stays LOCKED to anon (no anon RLS policy) — it holds commercial
--     secrets (cost_per_unit, markup_pct, BOM links, supplier data).
--   * This view runs with the privileges of its owner (security_invoker = false,
--     the Postgres default), so it can read the locked base table, but it projects
--     ONLY customer-safe columns. anon is granted SELECT on the VIEW, never the table.
--   * Therefore anon can read the public menu and CANNOT read costs/margins.

CREATE OR REPLACE VIEW public.v_public_menu AS
SELECT
    n.id,
    COALESCE(NULLIF(n.customer_short_name, ''), n.name)          AS name,
    n.customer_description                                       AS description,
    n.price,
    n.portion_size,
    n.portion_unit,
    COALESCE(
        NULLIF(n.customer_photo_url, ''),
        (SELECT img.url
           FROM public.nomenclature_images img
          WHERE img.nomenclature_id = n.id AND img.is_primary
          ORDER BY img.sort_order
          LIMIT 1),
        NULLIF(n.image_url, '')
    )                                                            AS image_url,
    n.is_featured,
    n.calories,
    n.protein,
    n.carbs,
    n.fat,
    n.category_id,
    pc.code                                                      AS category_code,
    pc.name                                                      AS category_name,
    -- Customer-safe tags (slug/name/group/color) as a JSON array
    COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
                    'slug', t.slug, 'name', t.name, 'group', t.tag_group, 'color', t.color)
                    ORDER BY t.sort_order)
           FROM public.nomenclature_tags nt
           JOIN public.tags t ON t.id = nt.tag_id
          WHERE nt.nomenclature_id = n.id),
        '[]'::jsonb
    )                                                            AS tags,
    -- Allergen slugs only (tag_group = 'allergen')
    COALESCE(
        (SELECT array_agg(t.slug ORDER BY t.slug)
           FROM public.nomenclature_tags nt
           JOIN public.tags t ON t.id = nt.tag_id
          WHERE nt.nomenclature_id = n.id AND t.tag_group = 'allergen'),
        ARRAY[]::text[]
    )                                                            AS allergens
FROM public.nomenclature n
LEFT JOIN public.product_categories pc ON pc.id = n.category_id
WHERE n.is_available = true
  AND n.product_code ILIKE 'SALE-%';

COMMENT ON VIEW public.v_public_menu IS 'Customer-safe public menu (anon). Excludes cost_per_unit/markup/BOM/suppliers. See migration 226.';

-- Expose the view (not the base table) to unauthenticated visitors.
GRANT SELECT ON public.v_public_menu TO anon, authenticated;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '224b_public_menu_view.sql',
  'claude-code',
  NULL,
  'Add v_public_menu view (anon SELECT) exposing only customer-safe dish fields; base nomenclature stays locked'
)
ON CONFLICT DO NOTHING;
