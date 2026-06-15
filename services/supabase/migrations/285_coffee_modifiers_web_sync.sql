-- 285_coffee_modifiers_web_sync.sql
-- Phase 1 of "DB is the source of truth, Loyverse is derived".
--
-- Coffee/matcha modifiers currently live only in Loyverse. The website reads
-- menu_public (no modifiers) and the DB web-config (nomenclature_modifier_options)
-- was stale/divergent: a fake "Syrups ฿15 coming_soon" group, missing Milk /
-- Temperature / Boosters, and several dishes with zero options.
--
-- This migration rebuilds nomenclature_modifier_options for in-scope coffee dishes
-- straight from the Loyverse mirror (pos_loyverse_modifier_lists/options +
-- dish_modifier_groups attachments), so the DB matches POS reality.
--
-- Scope: KP-DRK-COF dishes that are is_available AND already have Loyverse
-- modifier groups attached. (Caramel Latte is excluded — not yet pushed to POS,
-- so it has no groups to mirror; handle it when it is published.)
--
-- Follow-ups (not in this migration): Phase 2 v_modifier_drift tracking view,
-- Phase 3 flip sync to push DB->Loyverse, Phase 4 shishka-health interactive
-- modifier selector with live price recalculation.

BEGIN;

-- 1) Temperature option products (Hot / Iced) — the only options without an
--    existing MOD-* product. Everything else maps to existing MOD products.
INSERT INTO nomenclature (product_code, name, type, customer_short_name, emoji,
                          is_available, stock_state, is_web_visible)
VALUES
  ('MOD-TEMP_HOT',  'Hot',  'modifier', 'Hot',  '🔥', true, 'in_stock', false),
  ('MOD-TEMP_ICED', 'Iced', 'modifier', 'Iced', '🧊', true, 'in_stock', false)
ON CONFLICT (product_code) DO NOTHING;

-- 2) MONIN syrups are live & sellable on POS (configured 2026-06-14); the web
--    config still flagged them coming_soon. Mark them in_stock.
UPDATE nomenclature SET stock_state = 'in_stock'
WHERE product_code IN ('MOD-SYRUP_CARAMEL','MOD-SYRUP_VANILLA',
                       'MOD-SYRUP_HAZELNUT','MOD-SYRUP_GREEN_MINT')
  AND stock_state <> 'in_stock';

-- 3) Clean rebuild: drop existing web options for in-scope coffee dishes
--    (removes the stale "Syrups ฿15" rows before re-mirroring from Loyverse).
DELETE FROM nomenclature_modifier_options o
USING nomenclature n
JOIN product_categories c ON c.id = n.category_id
WHERE o.dish_id = n.id
  AND c.code = 'KP-DRK-COF'
  AND n.is_available = true
  AND EXISTS (SELECT 1 FROM dish_modifier_groups g WHERE g.dish_id = n.id);

-- 4) Re-insert from the Loyverse mirror, deduped per (dish, MOD product).
--    A few options (Creatine, MCT Oil) appear in two Loyverse lists; the
--    uq_dish_modifier unique index forbids a dish having the same MOD twice, so
--    we keep the instance from the higher-priority group (Coffee Boosters first).
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, price_delta, is_default, sort_order, quantity_per_unit,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT DISTINCT ON (src.dish_id, src.modifier_id)
  src.dish_id, src.modifier_id, src.price_delta, src.is_default,
  0 AS sort_order, 1 AS quantity_per_unit,
  src.loyverse_modifier_id, src.loyverse_modifier_list_id, src.loyverse_modifier_list_name
FROM (
  SELECT
    g.dish_id,
    modn.id                              AS modifier_id,
    o.price                              AS price_delta,
    CASE WHEN ml.name = 'Milk'        AND o.name = 'Cow Milk' THEN true
         WHEN ml.name = 'Temperature' AND o.name = 'Hot'      THEN true
         ELSE false END                  AS is_default,
    o.id::text                           AS loyverse_modifier_id,
    ml.id::text                          AS loyverse_modifier_list_id,
    ml.name                              AS loyverse_modifier_list_name,
    CASE ml.name
      WHEN 'Coffee Boosters' THEN 1
      WHEN 'Milk'            THEN 2
      WHEN 'Temperature'     THEN 3
      WHEN 'Boosters'        THEN 4
      WHEN 'Add MCT Oil'     THEN 5
      ELSE 9 END                         AS grp_priority
  FROM dish_modifier_groups g
  JOIN nomenclature n         ON n.id = g.dish_id AND n.is_available = true
  JOIN product_categories c   ON c.id = n.category_id AND c.code = 'KP-DRK-COF'
  JOIN pos_loyverse_modifier_lists   ml ON ml.id = g.loyverse_modifier_list_id
  JOIN pos_loyverse_modifier_options o  ON o.list_id = ml.id
  JOIN (VALUES
    ('Caramel',            'MOD-SYRUP_CARAMEL'),
    ('Vanilla',            'MOD-SYRUP_VANILLA'),
    ('Hazelnut',           'MOD-SYRUP_HAZELNUT'),
    ('Green Mint',         'MOD-SYRUP_GREEN_MINT'),
    ('Maple Syrup',        'MOD-SYRUP_MAPLE'),
    ('Extra Espresso Shot','MOD-ESPRESSO_EXTRA'),
    ('MCT Oil',            'MOD-COFFEE_MCT'),
    ('Creatine',           'MOD-CREATINE'),
    ('Whey Protein',       'MOD-WHEY_PROTEIN_ADD'),
    ('Cow Milk',           'MOD-MILK_COW'),
    ('Oat Milk',           'MOD-MILK_OAT'),
    ('Almond Milk',        'MOD-MILK_ALMOND'),
    ('Coconut Milk',       'MOD-MILK_COCONUT'),
    ('Hot',                'MOD-TEMP_HOT'),
    ('Iced',               'MOD-TEMP_ICED')
  ) AS mapn(option_name, mod_code) ON mapn.option_name = o.name
  JOIN nomenclature modn ON modn.product_code = mapn.mod_code
) src
ORDER BY src.dish_id, src.modifier_id, src.grp_priority;

-- 5) Recompute sort_order within each (dish, group): default first, then price, then name.
WITH ranked AS (
  SELECT o.id,
    row_number() OVER (
      PARTITION BY o.dish_id, o.loyverse_modifier_list_id
      ORDER BY o.is_default DESC, o.price_delta, m.name
    ) AS rn
  FROM nomenclature_modifier_options o
  JOIN nomenclature n       ON n.id = o.dish_id AND n.is_available = true
  JOIN product_categories c ON c.id = n.category_id AND c.code = 'KP-DRK-COF'
  JOIN nomenclature m       ON m.id = o.modifier_id
)
UPDATE nomenclature_modifier_options o
SET sort_order = ranked.rn
FROM ranked
WHERE ranked.id = o.id;

-- Self-register in the ledger of record.
INSERT INTO migration_log (filename, applied_by, status)
VALUES ('285_coffee_modifiers_web_sync.sql', 'manual', 'success')
ON CONFLICT DO NOTHING;

COMMIT;
