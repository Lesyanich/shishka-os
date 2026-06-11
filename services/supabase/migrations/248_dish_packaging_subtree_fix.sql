-- ============================================================
-- Migration 248: Packaging views must cover the whole NF-PKG subtree
-- MC 2385d288. Fixes mig 247.
--
-- Packaging is not a single category: NF-PKG is a PARENT with children
-- NF-PKG-BAG (bags/film), NF-PKG-CNT (boxes/bowls/cups/bottles),
-- NF-PKG-CTL (cutlery/napkins). Mig 247 matched only the exact 'NF-PKG'
-- code, so cup/bottle lines (category NF-PKG-CNT, already on ~17 dishes)
-- were invisible to v_dish_packaging and were wrongly counted as FOOD cost
-- in v_dish_cost_split. Match the whole subtree via code prefix 'NF-PKG%'.
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_dish_packaging AS
SELECT
  bs.id                AS bom_id,
  bs.parent_id         AS dish_id,
  c.id                 AS packaging_id,
  c.product_code       AS packaging_code,
  c.name               AS packaging_name,
  bs.quantity_per_unit AS qty_per_portion,
  c.base_unit,
  c.cost_per_unit,
  round(bs.quantity_per_unit * COALESCE(c.cost_per_unit, 0), 4) AS line_cost
FROM public.bom_structures bs
JOIN public.nomenclature parent ON parent.id = bs.parent_id
JOIN public.nomenclature c      ON c.id      = bs.ingredient_id
JOIN public.product_categories pc ON pc.id = c.category_id AND pc.code LIKE 'NF-PKG%'
WHERE parent.product_code LIKE 'SALE-%';

CREATE OR REPLACE VIEW public.v_dish_cost_split AS
SELECT
  n.id                                                              AS dish_id,
  n.cost_per_unit                                                   AS total_cost,
  COALESCE(p.packaging_cost, 0)                                     AS packaging_cost,
  GREATEST(COALESCE(n.cost_per_unit, 0) - COALESCE(p.packaging_cost, 0), 0) AS food_cost
FROM public.nomenclature n
LEFT JOIN (
  SELECT dish_id, SUM(line_cost) AS packaging_cost
  FROM public.v_dish_packaging
  GROUP BY dish_id
) p ON p.dish_id = n.id
WHERE n.product_code LIKE 'SALE-%';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '248_dish_packaging_subtree_fix.sql',
  'claude-code',
  'Fix mig 247: packaging views now match whole NF-PKG subtree (code LIKE NF-PKG%), so NF-PKG-CNT/BAG/CTL (cups, bottles, bags, cutlery) count as packaging.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
