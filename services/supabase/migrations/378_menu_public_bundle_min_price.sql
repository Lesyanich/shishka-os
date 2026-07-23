-- 378: menu_public.bundle_min_price — margin floor for the bundle constructor
--
-- WHY: bundle tiers (price_tiers: −10/−15/−20%) discount each taco individually.
-- A flat % is margin-blind: post-garnish costs put Salami/Beef below the 60%
-- margin floor at every tier. CEO decision 2026-07-23: clip per-item bundle
-- prices at the 60%-margin price and market the discount as "up to X%".
--
-- bundle_min_price = CEIL(cost_per_unit / 0.4)  (the price at which margin = 60%)
-- Exposed ONLY when it actually binds at the deepest active tier, and ONLY for
-- the taco pool (KP-FIN-MAN%). NULL otherwise, so cost is not inferable from
-- the public view for unclipped items. The client clamps:
--   bundle price = max(round(price × (1 − pct/100)), bundle_min_price)
--
-- NOTE: security_invoker=false is load-bearing (anon reads the view; if lost,
-- the site silently falls back to MOCK_DATA). Recreate WITH the option.

CREATE OR REPLACE VIEW public.menu_public WITH (security_invoker = false) AS
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
    n.stock_state,
    s.id AS section_id,
    s.name AS section_name,
    s.sort_order AS section_sort_order,
    n.is_web_visible,
    n.web_published_at,
    CASE
        WHEN c.code LIKE 'KP-FIN-MAN%'
         AND n.cost_per_unit > 0
         AND n.price > 0
         AND CEIL(n.cost_per_unit / 0.4) > ROUND(n.price * (
               SELECT 1 - max(pt.discount_pct) / 100.0
               FROM price_tiers pt
               WHERE pt.bundle_dish_code IS NOT NULL AND pt.is_active
             ))
        THEN CEIL(n.cost_per_unit / 0.4)::integer
        ELSE NULL
    END AS bundle_min_price
   FROM nomenclature n
     LEFT JOIN product_categories c ON c.id = n.category_id
     LEFT JOIN product_categories s ON s.id =
        CASE
            WHEN c.is_menu_section THEN c.id
            ELSE c.parent_id
        END
  WHERE n.product_code LIKE 'SALE-%'
    AND n.is_web_visible = true
    AND COALESCE(n.is_deleted, false) = false
    AND (n.name IS NULL OR n.name NOT ILIKE '[ARCHIVED]%');

-- Self-register in the migration ledger
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '378_menu_public_bundle_min_price.sql',
  'claude-code',
  NULL,
  'menu_public.bundle_min_price = ceil(cost/0.4), only for KP-FIN-MAN% and only when it binds at the deepest active tier (Lamb 76 / Beef 83 / Salami 87). Bundle constructor clamps per-item tier prices at this floor; customer copy = "up to X%". security_invoker=false preserved. CEO decision 2026-07-23, MC 06abd77e.'
);
