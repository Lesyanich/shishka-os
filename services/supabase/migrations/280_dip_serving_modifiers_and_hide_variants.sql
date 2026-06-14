-- ═══════════════════════════════════════════════════════════
-- 280_dip_serving_modifiers_and_hide_variants.sql
--
-- Collapse the dip "serving" variants into ONE card per dip with an
-- in-dialog "Served with" add-on, instead of three separate hummus cards
-- on the customer site (shishka.health).
--
-- Owner request: see ONE Hummus, and pick "with mini buns / with seed
-- crackers" inside the card. Same for Muhammara. Beetroot/Pesto stay as
-- separate flavours (different products, not serving variants).
--
-- Mechanism (web-only, zero POS-sync risk):
--   * The add-ons already exist as standalone nomenclature rows with exact
--     KBJU — SALE-MINI_BUNS (394 kcal) and SALE-SEED_CRACKERS (554 kcal).
--     The variant totals are base + add-on to the gram:
--       Hummus 425 + buns 394 = 819  (SALE-HUMMUS_BUNS)      ✓
--       Hummus 425 + crackers 554 = 979 (SALE-HUMMUS_CRACKERS) ✓
--   * Bind them to the base Hummus + Muhammara via
--     nomenclature_modifier_options (group "Served with"). The menu_modifiers
--     view derives the group name from loyverse_modifier_list_name and the
--     per-option KBJU from the add-on nomenclature row, so the site's live
--     KBJU counter + "from ฿X" pricing work with no UI changes.
--   * loyverse_modifier_id / loyverse_modifier_list_id are LEFT NULL on
--     purpose — this is a website-only add-on, never pushed to Loyverse.
--     We deliberately do NOT insert dish_modifier_groups: that table is
--     refreshed from Loyverse by fn_refresh_dish_modifier_groups (it DELETES
--     any group not present in the POS pull), so a hand-inserted group would
--     be wiped on the next modifiers_pull. With no group row the view returns
--     min_select=0 / max_select=NULL → an optional add-on group, which is the
--     intended behaviour.
--
--   * Hide the now-redundant variant SKUs and the standalone add-on SKUs from
--     the website only (is_web_visible=false). They stay in nomenclature +
--     Loyverse so the kitchen/POS and accounting are untouched.
--
-- Price deltas: buns +฿38 (149-111 / 237-199), crackers +฿78 (189-111).
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 0. MOD-* option products. nomenclature_modifier_options is guarded
--    (fn_modifier_options_type_guard) to require modifier_id → MOD-*. The
--    menu_modifiers view reads the per-option KBJU straight off these rows, so
--    they carry the served portion's nutrition (matching SALE-MINI_BUNS /
--    SALE-SEED_CRACKERS to the gram).
INSERT INTO nomenclature
  (product_code, name, customer_short_name, type, base_unit, is_available,
   calories, protein, carbs, fat)
VALUES
  ('MOD-MINI_BUNS', 'Sourdough Mini Buns (2 pcs)', 'Sourdough Mini Buns',
     'modifier', 'pcs', true, 394, 11.0, 73.4, 7.4),
  ('MOD-SEED_CRACKERS', 'Seed Crackers', 'Seed Crackers',
     'modifier', 'pcs', true, 554, 20.9, 23.6, 45.9)
ON CONFLICT (product_code) DO UPDATE SET
  calories = EXCLUDED.calories, protein = EXCLUDED.protein,
  carbs = EXCLUDED.carbs, fat = EXCLUDED.fat,
  customer_short_name = EXCLUDED.customer_short_name;

-- 1. "Served with" add-on options for the base Hummus and Muhammara.
WITH dish(code, id) AS (
  SELECT n.product_code, n.id
  FROM nomenclature n
  WHERE n.product_code IN ('SALE-HUMMUS_PLAIN', 'SALE-MUHAMMARA')
),
addon(code, id) AS (
  SELECT n.product_code, n.id
  FROM nomenclature n
  WHERE n.product_code IN ('MOD-MINI_BUNS', 'MOD-SEED_CRACKERS')
),
spec(dish_code, addon_code, price_delta, sort_order) AS (
  VALUES
    ('SALE-HUMMUS_PLAIN', 'MOD-MINI_BUNS',     38::numeric, 1),
    ('SALE-HUMMUS_PLAIN', 'MOD-SEED_CRACKERS', 78::numeric, 2),
    ('SALE-MUHAMMARA',    'MOD-MINI_BUNS',     38::numeric, 1),
    ('SALE-MUHAMMARA',    'MOD-SEED_CRACKERS', 78::numeric, 2)
)
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, slot, quantity_per_unit, price_delta, is_default,
   sort_order, loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT
  d.id, a.id, NULL, 1, s.price_delta, false,
  s.sort_order, NULL, NULL, 'Served with'
FROM spec s
JOIN dish  d ON d.code = s.dish_code
JOIN addon a ON a.code = s.addon_code
WHERE NOT EXISTS (
  SELECT 1 FROM nomenclature_modifier_options o
  WHERE o.dish_id = d.id AND o.modifier_id = a.id
);

-- 2. Hide redundant serving-variant SKUs from the website (POS keeps them).
UPDATE nomenclature
SET is_web_visible = false
WHERE product_code IN (
  'SALE-HUMMUS_BUNS',
  'SALE-HUMMUS_CRACKERS',
  'SALE-MUHAMMARA_BUNS',
  -- standalone add-on SKUs are now "Served with" options, not their own cards
  'SALE-MINI_BUNS',
  'SALE-SEED_CRACKERS'
);

-- 3. Pesto Hummus had a blank card (no description). Add a safe, generic
--    description so the card reads properly. KBJU / ingredients (allergens!) /
--    BOM are intentionally LEFT for the kitchen to finalise — we do not invent
--    nutrition or allergen data. Tracked as a follow-up.
UPDATE nomenclature
SET customer_description = COALESCE(customer_description,
      'Our classic chickpea hummus swirled with fresh basil pesto — herby, bright and aromatic, finished with a drizzle of olive oil.')
WHERE product_code = 'SALE-HUMMUS_PESTO';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '280_dip_serving_modifiers_and_hide_variants.sql',
  'claude-code',
  'Collapse hummus/muhammara serving-variants into one card with a web-only "Served with" add-on group (MOD-MINI_BUNS/MOD-SEED_CRACKERS); hide variant + standalone add-on SKUs from the site; add Pesto Hummus description.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
