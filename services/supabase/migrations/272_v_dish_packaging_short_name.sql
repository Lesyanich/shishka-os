-- Migration 272: expose clean packaging name + emoji on v_dish_packaging
-- The assembler card showed raw supplier names ("White Paper Bowl 1300ml/50oz
-- 1X50"). Add packaging_short_name (customer_short_name) and packaging_emoji so
-- the L2 card can render clean labels ("🥡 Bowl 1300 ml"). packaging_name (the
-- full supplier SKU) is kept for the drawer edit tab where the exact SKU matters.

BEGIN;

CREATE OR REPLACE VIEW public.v_dish_packaging AS
SELECT
  bs.id                 AS bom_id,
  bs.parent_id          AS dish_id,
  c.id                  AS packaging_id,
  c.product_code        AS packaging_code,
  c.name                AS packaging_name,
  bs.quantity_per_unit  AS qty_per_portion,
  c.base_unit,
  c.cost_per_unit,
  round(bs.quantity_per_unit * COALESCE(c.cost_per_unit, 0::numeric), 4) AS line_cost,
  -- new columns appended at the end (CREATE OR REPLACE cannot insert mid-list)
  c.customer_short_name AS packaging_short_name,
  c.emoji               AS packaging_emoji
FROM public.bom_structures bs
JOIN public.nomenclature parent ON parent.id = bs.parent_id
JOIN public.nomenclature c      ON c.id      = bs.ingredient_id
JOIN public.product_categories pc ON pc.id = c.category_id AND pc.code LIKE 'NF-PKG%'
WHERE parent.product_code LIKE 'SALE-%';

GRANT SELECT ON public.v_dish_packaging TO anon, authenticated;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '272_v_dish_packaging_short_name.sql',
  'claude-code',
  'Add packaging_short_name + packaging_emoji to v_dish_packaging for clean L2 card labels.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
