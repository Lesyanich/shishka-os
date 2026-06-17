-- 298a_remove_wrong_syrup_addons_from_lemonades.sql
-- (Renumbered 298 -> 298a 2026-06-17 to resolve a cross-branch collision with
--  298_manakish_station_tagging_and_pf_filling_categories.sql from a concurrent
--  session; both were already applied to prod. migration_log row reconciled to 298a.)
-- Remove the caramel/hazelnut/mint/vanilla syrup add-ons wrongly attached to the
-- 4 lemonades. CEO (2026-06-17): lemonades already contain honey syrup as part of
-- the recipe; offering nut/caramel syrups on a lemonade is not wanted.
--
-- These 16 rows are the lemonades' ONLY modifier options, all in the synthetic
-- "Syrups" group (placeholder list_id c0ffee00-..., which is NOT in
-- dish_modifier_groups) — so deletion touches ONLY menu-data:
--   • Loyverse: unaffected (placeholder never pushed; lemonades have no POS group).
--   • Site: unaffected (menu_public renders no modifiers).
--   • Admin /menu: lemonades stop offering the bogus syrup add-ons (desired).
-- Honey syrup stays untouched — it lives in the lemonade BOM, not here.
--
-- Scope guard: only the 4 lemonades, only the "Syrups" group. Lions Mane coffee's
-- syrups are intentionally left (syrups are appropriate on coffee).
-- Resolves drift task 9191358e (no Loyverse write needed after all).

BEGIN;

DELETE FROM nomenclature_modifier_options o
USING nomenclature d
WHERE o.dish_id = d.id
  AND d.product_code IN (
    'SALE-LEMONADE_CLASSIC', 'SALE-LEMONADE_GINGER',
    'SALE-LEMONADE_MINT', 'SALE-LEMONADE_PASSIONFRUIT'
  )
  AND o.loyverse_modifier_list_name = 'Syrups';

INSERT INTO migration_log (filename, status)
VALUES ('298a_remove_wrong_syrup_addons_from_lemonades.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
