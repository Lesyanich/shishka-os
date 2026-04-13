-- Migration 115: Batch merge + capacity split
-- Groups identical PFs from multiple targets, then splits if exceeding equipment capacity.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_merge_and_split_batches(
  p_date DATE
)
RETURNS TABLE (
  nomenclature_id UUID,
  product_code TEXT,
  name TEXT,
  total_qty NUMERIC,
  batch_number INT,
  batch_qty NUMERIC,
  batch_group_key TEXT,
  equipment_category_id UUID,
  max_capacity NUMERIC,
  earliest_deadline TIMESTAMPTZ,
  source_target_ids UUID[]
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH merged AS (
    -- Group targets by nomenclature for the given date
    SELECT
      pt.nomenclature_id,
      n.product_code,
      n.name,
      SUM(pt.target_qty) AS total_qty,
      MIN(pt.deadline_at) AS earliest_deadline,
      array_agg(pt.id) AS source_target_ids
    FROM public.production_targets pt
    JOIN public.nomenclature n ON n.id = pt.nomenclature_id
    WHERE pt.date = p_date
      AND pt.status = 'confirmed'
    GROUP BY pt.nomenclature_id, n.product_code, n.name
  ),
  with_equipment AS (
    -- Find the primary equipment for this product (first thermal step)
    SELECT DISTINCT ON (m.nomenclature_id)
      m.*,
      rf.target_equipment_category_id AS equipment_category_id,
      e.capacity AS max_capacity
    FROM merged m
    LEFT JOIN public.recipes_flow rf ON rf.nomenclature_id = m.nomenclature_id
      AND rf.target_equipment_category_id IS NOT NULL
    LEFT JOIN public.equipment e ON e.id = (
      SELECT eq.id FROM public.equipment eq
      WHERE eq.category = (
        SELECT ec.name FROM public.equipment ec WHERE ec.id = rf.target_equipment_category_id LIMIT 1
      )
      LIMIT 1
    )
    ORDER BY m.nomenclature_id, rf.step_order
  ),
  split AS (
    -- Split into batches if total > max_capacity
    SELECT
      we.nomenclature_id,
      we.product_code,
      we.name,
      we.total_qty,
      gs.batch_number,
      LEAST(
        we.total_qty - (gs.batch_number - 1) * COALESCE(we.max_capacity, we.total_qty),
        COALESCE(we.max_capacity, we.total_qty)
      ) AS batch_qty,
      we.product_code || '-' || to_char(p_date, 'YYYYMMDD') || '-B' || gs.batch_number AS batch_group_key,
      we.equipment_category_id,
      we.max_capacity,
      we.earliest_deadline,
      we.source_target_ids
    FROM with_equipment we
    CROSS JOIN LATERAL generate_series(
      1,
      GREATEST(1, CEIL(we.total_qty / GREATEST(COALESCE(we.max_capacity, we.total_qty), 0.001))::INT)
    ) AS gs(batch_number)
  )
  SELECT
    split.nomenclature_id,
    split.product_code,
    split.name,
    split.total_qty,
    split.batch_number,
    split.batch_qty,
    split.batch_group_key,
    split.equipment_category_id,
    split.max_capacity,
    split.earliest_deadline,
    split.source_target_ids
  FROM split
  ORDER BY split.earliest_deadline, split.nomenclature_id, split.batch_number;
END;
$$;

COMMENT ON FUNCTION public.fn_merge_and_split_batches(DATE) IS
  'Merges identical PF targets for a date, splits into batches by equipment capacity';

INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('115_fn_merge_and_split.sql', 'Batch merge and capacity-aware split function', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
