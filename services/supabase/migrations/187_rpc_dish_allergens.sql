-- Migration 187: fn_dish_allergens — allergen aggregation across BOM tree
-- Source spec: docs/superpowers/specs/2026-05-17-menu-card-full-design.md §5
-- Walks BOM tree (depth ≤ 10), collects tags WHERE tag_group='allergen' on any descendant,
-- UNION with tags directly attached to the dish. Returns sorted distinct slugs.
--
-- Note: this project uses `allergen-*` prefix convention for allergen tags
-- (see mig 183). Phase 2 UI will strip the prefix for display.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_dish_allergens(p_dish_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH RECURSIVE tree AS (
    SELECT p_dish_id AS nomenclature_id, 0 AS depth
    UNION ALL
    SELECT bs.ingredient_id, t.depth + 1
    FROM tree t
    JOIN public.bom_structures bs ON bs.parent_id = t.nomenclature_id
    WHERE t.depth < 10
  ),
  tree_distinct AS (
    SELECT DISTINCT nomenclature_id FROM tree
  ),
  allergens AS (
    SELECT DISTINCT tg.slug
    FROM tree_distinct td
    JOIN public.nomenclature_tags nt ON nt.nomenclature_id = td.nomenclature_id
    JOIN public.tags tg ON tg.id = nt.tag_id
    WHERE tg.tag_group = 'allergen'
  )
  SELECT ARRAY(SELECT slug FROM allergens ORDER BY slug);
$$;

GRANT EXECUTE ON FUNCTION public.fn_dish_allergens(UUID) TO authenticated, anon;

COMMENT ON FUNCTION public.fn_dish_allergens(UUID) IS
  'Walks BOM tree (depth ≤ 10) and aggregates allergen tag slugs from all descendants + direct dish tags. Returns sorted TEXT[].';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '187_rpc_dish_allergens.sql',
  'claude-code',
  'fn_dish_allergens RPC — recursive BOM walk + tag_group=allergen aggregation.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
