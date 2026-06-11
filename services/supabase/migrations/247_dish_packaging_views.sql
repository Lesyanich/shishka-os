-- ============================================================
-- Migration 247: Packaging views for dishes (Packaging-as-BOM phase 2)
-- MC 2385d288.
--
-- Packaging = bom_structures lines whose component is an NF-PKG nomenclature
-- row. The existing cost rollup (fn_rollup_bom_costs, migs 137/211) already
-- folds these lines into nomenclature.cost_per_unit, so packaging cost is part
-- of total dish cost automatically. These views expose:
--
--   v_dish_packaging   — the packaging set per SALE dish (for the L2 assembler
--                        UI + editing), with per-line cost.
--   v_dish_cost_split  — total / packaging / food cost per SALE dish, so the
--                        UI can show a FOOD-ONLY food-cost % (owner decision)
--                        while keeping packaging inside total cost.
--
-- Packaging is identified by CATEGORY (product_categories.code = 'NF-PKG'),
-- NOT by product_code — packaging rows are RAW-AUTO-* like any raw item.
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
JOIN public.product_categories pc ON pc.id = c.category_id AND pc.code = 'NF-PKG'
WHERE parent.product_code LIKE 'SALE-%'
ORDER BY bs.parent_id, c.name;

COMMENT ON VIEW public.v_dish_packaging IS
  'Packaging set per SALE dish: bom_structures lines whose component is in category NF-PKG, with per-line cost. Drives the L2 assembler packaging section.';

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

COMMENT ON VIEW public.v_dish_cost_split IS
  'Per SALE dish cost decomposition: total_cost (= nomenclature.cost_per_unit, includes packaging), packaging_cost (sum of NF-PKG BOM lines), food_cost (total - packaging). Lets the UI show a food-only food-cost %.';

GRANT SELECT ON public.v_dish_packaging  TO anon, authenticated;
GRANT SELECT ON public.v_dish_cost_split TO anon, authenticated;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '247_dish_packaging_views.sql',
  'claude-code',
  'Packaging-as-BOM phase 2 (MC 2385d288): v_dish_packaging + v_dish_cost_split. Packaging = NF-PKG-category BOM lines; cost already rolled into cost_per_unit by mig 137/211. Enables food-only FC%.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
