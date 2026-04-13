-- Migration 114: Recursive BOM explosion for scheduling
-- Walks the bom_structures tree, calculates required quantities,
-- and flags frozen ingredients needing D-1 defrost.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_explode_bom(
  p_nomenclature_id UUID,
  p_quantity NUMERIC
)
RETURNS TABLE (
  nomenclature_id UUID,
  product_code TEXT,
  name TEXT,
  type TEXT,
  required_qty NUMERIC,
  storage_type TEXT,
  defrost_hours INT,
  product_category TEXT,
  depth INT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE bom_tree AS (
    -- Base: the root product itself
    SELECT
      n.id AS nomenclature_id,
      n.product_code,
      n.name,
      n.type,
      p_quantity AS required_qty,
      n.storage_type,
      n.defrost_hours,
      n.product_category,
      0 AS depth
    FROM public.nomenclature n
    WHERE n.id = p_nomenclature_id

    UNION ALL

    -- Recursive: walk children
    SELECT
      child.id AS nomenclature_id,
      child.product_code,
      child.name,
      child.type,
      (bt.required_qty * bs.quantity_per_unit) AS required_qty,
      child.storage_type,
      child.defrost_hours,
      child.product_category,
      bt.depth + 1 AS depth
    FROM bom_tree bt
    JOIN public.bom_structures bs ON bs.parent_id = bt.nomenclature_id
    JOIN public.nomenclature child ON child.id = bs.ingredient_id
    WHERE bt.depth < 10  -- safety limit
  )
  SELECT
    bom_tree.nomenclature_id,
    bom_tree.product_code,
    bom_tree.name,
    bom_tree.type,
    bom_tree.required_qty,
    bom_tree.storage_type,
    bom_tree.defrost_hours,
    bom_tree.product_category,
    bom_tree.depth
  FROM bom_tree
  WHERE bom_tree.depth > 0;  -- exclude root
END;
$$;

COMMENT ON FUNCTION public.fn_explode_bom(UUID, NUMERIC) IS
  'Recursively explodes BOM tree, returning all ingredients with scaled quantities';

INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('114_fn_explode_bom.sql', 'Recursive BOM explosion function for scheduling engine', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
