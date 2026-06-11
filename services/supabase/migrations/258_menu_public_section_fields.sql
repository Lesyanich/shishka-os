-- Migration 258: menu_public — expose section (umbrella) rollup for the site
-- ============================================================================
-- Stage 2 of the menu-taxonomy work (see mig 257). The public customer site
-- (shishka-health) groups the menu by the dish's DIRECT category. After 257,
-- a dish's direct category is the LEAF subcategory (Classic, Coffee, …), so we
-- also expose the SECTION (umbrella: Manakish, Drinks, …) it rolls up to, so
-- the site can render umbrella sections with subcategory subheaders.
--
-- Section = nearest is_menu_section ancestor-or-self. The category tree is one
-- level deep under each section (section → subcategory → dishes), so a single
-- CASE/self-join resolves it: when the dish's category is itself a section it
-- IS the section; otherwise its parent.
--
-- Columns are appended at the end (CREATE OR REPLACE VIEW requirement). The
-- view stays SECURITY DEFINER (security_invoker=false, per mig 256) so the anon
-- key reads the curated projection; grants are preserved by REPLACE.
-- ============================================================================

CREATE OR REPLACE VIEW public.menu_public WITH (security_invoker = false) AS
SELECT
  n.id,
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
  s.sort_order AS section_sort_order
FROM nomenclature n
LEFT JOIN product_categories c ON c.id = n.category_id
LEFT JOIN product_categories s
  ON s.id = CASE WHEN c.is_menu_section THEN c.id ELSE c.parent_id END
WHERE n.product_code ~~ 'SALE-%'::text
  AND n.is_available = true
  AND (n.pos_status = 'synced'::pos_status_enum OR n.stock_state <> 'in_stock'::text);

INSERT INTO public.migration_log (filename, applied_at, applied_by, status, notes)
VALUES (
  '258_menu_public_section_fields.sql', NOW(), 'claude-code', 'success',
  'menu_public exposes section_id/section_name/section_sort_order (umbrella rollup via is_menu_section) for shishka-health umbrella+subcategory grouping. Stage 2 of mig 257.'
);
