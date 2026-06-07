-- =====================================================================
-- Vanilla Ice Cream Protein booster (IN STOCK) — sits alongside plain whey
-- =====================================================================
-- RAW: flavored isolate. Cost mirrors the unflavored RAW-WHEY_PROTEIN until a
-- real flavored-protein purchase price is recorded.
INSERT INTO nomenclature (product_code, name, type, base_unit, cost_per_unit, cost_source, is_available, stock_state, notes)
VALUES ('RAW-WHEY_PROTEIN_VANILLA', 'MS Whey Protein Isolate USA (Vanilla Ice Cream)', 'raw_ingredient', 'kg', 1101.1905, 'manual', true, 'in_stock',
        'Vanilla-ice-cream flavored isolate. Cost mirrors unflavored RAW-WHEY_PROTEIN until a real purchase price is recorded.')
ON CONFLICT (product_code) DO NOTHING;

-- MOD booster option. Whey booster carries its cost directly (no BOM), mirror it.
INSERT INTO nomenclature (product_code, name, customer_short_name, type, cost_per_unit, cost_source, is_available, stock_state, emoji)
VALUES ('MOD-VANILLA_WHEY_PROTEIN_ADD', 'Add Vanilla Ice Cream Protein (30g)', 'Vanilla Protein', 'modifier', 33.0357, 'manual', true, 'in_stock', '🍦')
ON CONFLICT (product_code) DO NOTHING;

-- Attach the vanilla booster to every dish that already offers the plain whey
-- booster, in the same group, same +฿50, just after it.
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name, price_delta, is_default, sort_order, slot, quantity_per_unit)
SELECT o.dish_id,
       (SELECT id FROM nomenclature WHERE product_code = 'MOD-VANILLA_WHEY_PROTEIN_ADD'),
       o.loyverse_modifier_list_id, o.loyverse_modifier_list_name, 50, false, o.sort_order + 1, o.slot, o.quantity_per_unit
FROM nomenclature_modifier_options o
WHERE o.modifier_id = (SELECT id FROM nomenclature WHERE product_code = 'MOD-WHEY_PROTEIN_ADD')
ON CONFLICT (dish_id, modifier_id) DO NOTHING;

-- =====================================================================
-- COMING SOON — stock not yet arrived (visible on menu, not orderable)
-- =====================================================================
-- Lion's Mane dishes: were is_available=false (hidden). Surface them as
-- "coming soon" instead so customers see them as upcoming.
UPDATE nomenclature
   SET stock_state = 'coming_soon', is_available = true
 WHERE product_code IN ('SALE-COFFEE_LIONS_MANE', 'SALE-MANAISH_LIONS_MANE_GF');

-- Plain whey protein + lion's mane boosters: not arrived yet.
UPDATE nomenclature
   SET stock_state = 'coming_soon'
 WHERE product_code IN ('MOD-WHEY_PROTEIN_ADD', 'MOD-LIONS_MANE');

-- =====================================================================
-- MONIN syrups (Makro order ฿380/700ml) — coming soon
--   Caramel arrives next day; the rest later. All coming_soon for now;
--   flip a row to 'in_stock' when it lands.
-- =====================================================================
INSERT INTO nomenclature (product_code, name, type, base_unit, cost_per_unit, cost_source, is_available, stock_state, notes) VALUES
 ('RAW-SYRUP_VANILLA',    'MONIN Vanilla Syrup 700ml',          'raw_ingredient', 'ml', 0.542857, 'manual', true, 'coming_soon', 'Makro ฿380/700ml'),
 ('RAW-SYRUP_CARAMEL',    'MONIN Caramel Syrup 700ml',          'raw_ingredient', 'ml', 0.542857, 'manual', true, 'coming_soon', 'Makro ฿380/700ml; arriving next day'),
 ('RAW-SYRUP_GREEN_MINT', 'MONIN Green Mint Syrup 700ml',       'raw_ingredient', 'ml', 0.542857, 'manual', true, 'coming_soon', 'Makro ฿380/700ml'),
 ('RAW-SYRUP_HAZELNUT',   'MONIN Roasted Hazelnut Syrup 700ml', 'raw_ingredient', 'ml', 0.542857, 'manual', true, 'coming_soon', 'Makro ฿380/700ml')
ON CONFLICT (product_code) DO NOTHING;

-- Flavor-shot MOD options. One ~10ml pump ≈ ฿5.43 cost; customer pays +฿15.
INSERT INTO nomenclature (product_code, name, customer_short_name, type, cost_per_unit, cost_source, is_available, stock_state, emoji) VALUES
 ('MOD-SYRUP_VANILLA',    'Add Vanilla Syrup',          'Vanilla Syrup',   'modifier', 5.43, 'manual', true, 'coming_soon', '🍦'),
 ('MOD-SYRUP_CARAMEL',    'Add Caramel Syrup',          'Caramel Syrup',   'modifier', 5.43, 'manual', true, 'coming_soon', '🍯'),
 ('MOD-SYRUP_GREEN_MINT', 'Add Green Mint Syrup',       'Mint Syrup',      'modifier', 5.43, 'manual', true, 'coming_soon', '🌿'),
 ('MOD-SYRUP_HAZELNUT',   'Add Roasted Hazelnut Syrup', 'Hazelnut Syrup',  'modifier', 5.43, 'manual', true, 'coming_soon', '🌰')
ON CONFLICT (product_code) DO NOTHING;

-- "Syrups" modifier group on coffee drinks + lemonades (shared Loyverse list id,
-- not yet synced to POS — push is a follow-up).
INSERT INTO dish_modifier_groups (dish_id, loyverse_modifier_list_id, sort_order)
SELECT n.id, 'c0ffee00-5717-4000-8000-000000000001', 10
FROM nomenclature n
WHERE n.product_code IN (
  'SALE-COFFEE_LATTE','SALE-COFFEE_CAPPUCCINO','SALE-COFFEE_AMERICANO',
  'SALE-COFFEE_ESPRESSO_TONIC','SALE-COFFEE_ORANGE','SALE-MATCHA_LATTE','SALE-COFFEE_LIONS_MANE',
  'SALE-LEMONADE_CLASSIC','SALE-LEMONADE_GINGER','SALE-LEMONADE_MINT','SALE-LEMONADE_PASSIONFRUIT')
ON CONFLICT (dish_id, loyverse_modifier_list_id) DO NOTHING;

-- Attach all 4 syrups to each of those drinks, +฿15.
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name, price_delta, is_default, sort_order, quantity_per_unit)
SELECT d.id, s.id, 'c0ffee00-5717-4000-8000-000000000001', 'Syrups', 15, false, s.sort_order, 1
FROM (
  SELECT id FROM nomenclature WHERE product_code IN (
    'SALE-COFFEE_LATTE','SALE-COFFEE_CAPPUCCINO','SALE-COFFEE_AMERICANO',
    'SALE-COFFEE_ESPRESSO_TONIC','SALE-COFFEE_ORANGE','SALE-MATCHA_LATTE','SALE-COFFEE_LIONS_MANE',
    'SALE-LEMONADE_CLASSIC','SALE-LEMONADE_GINGER','SALE-LEMONADE_MINT','SALE-LEMONADE_PASSIONFRUIT')
) d
CROSS JOIN (
  SELECT id, sort_order FROM (VALUES
    ((SELECT id FROM nomenclature WHERE product_code='MOD-SYRUP_VANILLA'),    1),
    ((SELECT id FROM nomenclature WHERE product_code='MOD-SYRUP_CARAMEL'),    2),
    ((SELECT id FROM nomenclature WHERE product_code='MOD-SYRUP_HAZELNUT'),   3),
    ((SELECT id FROM nomenclature WHERE product_code='MOD-SYRUP_GREEN_MINT'), 4)
  ) v(id, sort_order)
) s
ON CONFLICT (dish_id, modifier_id) DO NOTHING;

-- Record the Makro purchase price for the syrups (pre-purchase pricing rule).
INSERT INTO supplier_catalog (supplier_id, nomenclature_id, product_name, package_weight, package_unit, package_qty, last_seen_price, source)
SELECT 'c548db19-8a70-4f34-96af-d66162793cbf', n.id, n.name, 700, 'ml', 1, 380, 'makro_order'
FROM nomenclature n
WHERE n.product_code IN ('RAW-SYRUP_VANILLA','RAW-SYRUP_CARAMEL','RAW-SYRUP_GREEN_MINT','RAW-SYRUP_HAZELNUT')
  AND NOT EXISTS (
    SELECT 1 FROM supplier_catalog sc
    WHERE sc.nomenclature_id = n.id AND sc.supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf');

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '250_vanilla_protein_syrups_coming_soon.sql',
  'claude-code',
  'Vanilla Ice Cream protein booster (in stock) on 9 smoothies; 4 MONIN syrups as Syrups modifier group on coffee+lemonades (+B15, coming_soon); Lion''s Mane dishes + plain whey/lion''s-mane boosters marked coming_soon.'
) ON CONFLICT (filename) DO NOTHING;
