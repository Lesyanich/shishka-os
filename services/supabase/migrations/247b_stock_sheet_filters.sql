-- 247b_stock_sheet_filters.sql
-- Adds two staff-sheet filters:
--   1. Location — backfill nomenclature.storage_location from existing storage-* tags
--      so the location filter is populated out of the box (owner can still override).
--   2. On-menu — expose `in_active_menu` on v_stock_sheet_items: whether the item is
--      used (directly or transitively via BOM) by any available SALE dish.

BEGIN;

-- ── 1. Backfill storage_location from storage-* tags (only where unset) ──────
UPDATE public.nomenclature n
SET storage_location = m.loc
FROM (
  SELECT nt.nomenclature_id,
         CASE t.slug
           WHEN 'storage-frozen'  THEN 'freezer'
           WHEN 'storage-chilled' THEN 'fridge'
           WHEN 'storage-dry'     THEN 'dry'
           WHEN 'storage-ambient' THEN 'dry'
         END AS loc
  FROM public.nomenclature_tags nt
  JOIN public.tags t ON t.id = nt.tag_id
  WHERE t.slug IN ('storage-frozen', 'storage-chilled', 'storage-dry', 'storage-ambient')
) m
WHERE n.id = m.nomenclature_id
  AND n.storage_location IS NULL
  AND m.loc IS NOT NULL;

-- ── 1b. Fall back to a category-based guess for items still without a location,
--        so the location filter is meaningful for the whole sheet. Owner overrides
--        in the curation UI. Only food/goods candidates are touched.
UPDATE public.nomenclature n
SET storage_location = CASE
      WHEN n.name ILIKE '%frozen%'      THEN 'freezer'
      WHEN pc.code = 'F-PRD-FRZ'        THEN 'freezer'
      WHEN pc.code LIKE 'F-DAI%'        THEN 'fridge'   -- milk, cheese, butter, yogurt
      WHEN pc.code LIKE 'F-PRD%'        THEN 'fridge'   -- veg, fruit, herbs, mushrooms
      WHEN pc.code LIKE 'F-PRO%'        THEN 'fridge'   -- meat, poultry, seafood, eggs
      WHEN pc.code LIKE 'F-FRM%'        THEN 'fridge'   -- pickled / fermented
      WHEN pc.code LIKE 'F-SAU%'        THEN 'fridge'   -- opened sauces / dressings
      ELSE 'dry'                                         -- spices, flours, nuts, grains, beverages, packaging
    END
FROM public.product_categories pc
WHERE n.category_id = pc.id
  AND n.storage_location IS NULL
  AND COALESCE(n.is_deleted, false) = false
  AND n.type IN ('raw_ingredient', 'good', 'semi_finished');

-- ── 2. Active-menu ingredient set (SECURITY DEFINER so the anon-facing view need
--       not grant anon direct access to bom_structures) ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_active_menu_ingredient_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE menu_tree AS (
    -- seed: dishes currently on the menu
    SELECT id
    FROM public.nomenclature
    WHERE is_available = true AND product_code ILIKE 'SALE-%'
    UNION
    -- walk down the BOM: every ingredient of anything already in the tree
    SELECT b.ingredient_id
    FROM public.bom_structures b
    JOIN menu_tree mt ON b.parent_id = mt.id
  )
  SELECT id FROM menu_tree;
$$;

REVOKE ALL ON FUNCTION public.fn_active_menu_ingredient_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_active_menu_ingredient_ids() TO anon, authenticated;

COMMENT ON FUNCTION public.fn_active_menu_ingredient_ids IS
  'UUIDs of all nomenclature used (transitively via bom_structures) by available SALE dishes. Used by the staff stock sheet "On menu" filter.';

-- ── 3. Rebuild the view with in_active_menu ─────────────────────────────────
DROP VIEW IF EXISTS public.v_stock_sheet_items;
CREATE VIEW public.v_stock_sheet_items
  WITH (security_invoker = true)
AS
  SELECT
    n.id,
    COALESCE(NULLIF(n.customer_short_name, ''), n.name) AS name,
    n.emoji,
    n.base_unit,
    n.storage_location,
    n.category_id,
    pc.code     AS category_code,
    COALESCE(pc.name, 'Other')      AS category_name,
    COALESCE(pc.name_th, 'อื่น ๆ')   AS category_name_th,
    COALESCE(pc.sort_order, 9999)   AS category_sort,
    (n.id IN (SELECT t.id FROM public.fn_active_menu_ingredient_ids() AS t(id))) AS in_active_menu
  FROM public.nomenclature n
  LEFT JOIN public.product_categories pc ON pc.id = n.category_id
  WHERE n.in_stock_sheet = true
    AND COALESCE(n.is_deleted, false) = false;

COMMENT ON VIEW public.v_stock_sheet_items IS
  'Curated, cost-free item list for the public staff stock-order sheet (/stock). No price/cost columns. in_active_menu flags ingredients used by the live menu.';

GRANT SELECT ON public.v_stock_sheet_items TO anon, authenticated;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '247b_stock_sheet_filters.sql',
  'claude-code',
  'Backfill nomenclature.storage_location (tags + category heuristics); fn_active_menu_ingredient_ids (recursive BOM); add in_active_menu to v_stock_sheet_items.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
