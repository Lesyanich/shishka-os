-- Migration 271: show RAW food ingredients on v_dish_assembly_components
-- The assembler view (L2 cheat-sheet + on-screen) previously listed only PF/MOD
-- components, with a special-case OR for drinks (KP-DRK, added in mig 236a). That
-- hid every direct RAW ingredient on salads — walnuts, garlic, tomato, cucumber,
-- herbs, cheese, eggs, fish — so salad tech cards were incomplete.
--
-- Fix: list ALL food ingredients; exclude only packaging (NF-PKG). The change is
-- strictly additive (surfaces ingredients that already exist in the BOM) and the
-- drinks case is naturally covered, so the KP-DRK special-case is dropped.

BEGIN;

CREATE OR REPLACE VIEW public.v_dish_assembly_components AS
SELECT
  bs.parent_id          AS dish_id,
  c.id                  AS component_id,
  c.product_code        AS component_code,
  c.name                AS component_name,
  c.type                AS component_type,
  bs.quantity_per_unit  AS qty_per_portion,
  c.base_unit,
  bs.slot,
  bs.notes,
  c.customer_short_name AS component_short_name,
  c.emoji               AS component_emoji
FROM public.bom_structures bs
JOIN public.nomenclature parent       ON parent.id = bs.parent_id
JOIN public.nomenclature c            ON c.id      = bs.ingredient_id
LEFT JOIN public.product_categories pc   ON pc.id   = parent.category_id
LEFT JOIN public.product_categories pc_c ON pc_c.id = c.category_id
WHERE parent.product_code LIKE 'SALE-%'
  AND COALESCE(pc_c.code, '') NOT LIKE 'NF-PKG%'
ORDER BY bs.parent_id, COALESCE(bs.slot, 'zzz'), c.name;

GRANT SELECT ON public.v_dish_assembly_components TO anon, authenticated;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '271_v_dish_assembly_components_include_raw.sql',
  'claude-code',
  'Show RAW food ingredients on assembler view; exclude only packaging (NF-PKG). Drops PF/MOD + KP-DRK special-case.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
