-- ═══════════════════════════════════════════════════════════
-- 231_smoothie_modifiers_extra.sql
-- Follow-up to 230. A fresh Loyverse pull revealed smoothie lists
-- had grown beyond the initial snapshot. Map the remaining options:
--   Base Upgrade (from Milk): "Water" (฿-20 downgrade)
--   Extra Fruit / Pick Fruits: "Almond Slices", "Chia Seeds"
-- Re-runs the same binding insert with an extended option map;
-- existing 159 bindings are skipped via ON CONFLICT.
-- ═══════════════════════════════════════════════════════════

BEGIN;

INSERT INTO nomenclature (product_code, name, type, base_unit, is_available)
VALUES
  ('MOD-BASE_WATER',    'Water',         'modifier', 'pcs', true),
  ('MOD-ALMOND_SLICES', 'Almond Slices', 'modifier', 'pcs', true),
  ('MOD-CHIA_SEEDS',    'Chia Seeds',    'modifier', 'pcs', true)
ON CONFLICT (product_code) DO NOTHING;

WITH opt_map(option_name, mod_code) AS (
  VALUES
    ('Greek Yogurt',  'MOD-GREEK_YOGURT'),
    ('Coconut Milk',  'MOD-MILK_COCONUT'),
    ('Cow Milk',      'MOD-MILK_COW'),
    ('Water',         'MOD-BASE_WATER'),
    ('Creatine',      'MOD-CREATINE'),
    ('Lions Mane',    'MOD-LIONS_MANE'),
    ('Whey Protein',  'MOD-WHEY_PROTEIN_ADD'),
    ('Peanut Butter', 'MOD-PEANUT_BUTTER_ADD'),
    ('Cashew Butter', 'MOD-CASHEW_BUTTER_ADD'),
    ('Avocado',       'MOD-AVOCADO'),
    ('Banana',        'MOD-BANANA'),
    ('Blueberry',     'MOD-BLUEBERRY'),
    ('Kiwi',          'MOD-KIWI'),
    ('Mango',         'MOD-MANGO'),
    ('Passion Fruit', 'MOD-PASSION_FRUIT'),
    ('Peach',         'MOD-PEACH'),
    ('Pineapple',     'MOD-PINEAPPLE'),
    ('Spinach',       'MOD-SPINACH'),
    ('Strawberry',    'MOD-STRAWBERRY'),
    ('Almond Slices', 'MOD-ALMOND_SLICES'),
    ('Chia Seeds',    'MOD-CHIA_SEEDS')
),
dish_list(loyverse_item_id, list_id) AS (
  VALUES
    ('c6cf422b-9694-43d0-85f7-3f8ca6a3b4ae','a7b51226-1c97-4310-948f-7c5a008d3775'),
    ('c6cf422b-9694-43d0-85f7-3f8ca6a3b4ae','6a1eb7c2-3665-4f5f-aa9b-83474e48ab63'),
    ('c6cf422b-9694-43d0-85f7-3f8ca6a3b4ae','667b07ca-0c3c-4d59-b527-ff53c433244c'),
    ('94aa4479-b159-4ba1-8fcb-486d39e59560','ae08eb2b-5d75-4063-a067-ec29df159d4e'),
    ('94aa4479-b159-4ba1-8fcb-486d39e59560','6a1eb7c2-3665-4f5f-aa9b-83474e48ab63'),
    ('94aa4479-b159-4ba1-8fcb-486d39e59560','667b07ca-0c3c-4d59-b527-ff53c433244c'),
    ('d2467b94-c359-46f8-b40f-6a752bdc63e7','ae08eb2b-5d75-4063-a067-ec29df159d4e'),
    ('d2467b94-c359-46f8-b40f-6a752bdc63e7','877f9fea-717f-4d16-a8cc-141baa43c80d'),
    ('d2467b94-c359-46f8-b40f-6a752bdc63e7','667b07ca-0c3c-4d59-b527-ff53c433244c'),
    ('4984b42f-bb02-4bb2-9ad1-48703959a8fa','a7b51226-1c97-4310-948f-7c5a008d3775'),
    ('4984b42f-bb02-4bb2-9ad1-48703959a8fa','6a1eb7c2-3665-4f5f-aa9b-83474e48ab63'),
    ('4984b42f-bb02-4bb2-9ad1-48703959a8fa','667b07ca-0c3c-4d59-b527-ff53c433244c'),
    ('7a49cd61-a8d7-420f-9e29-228cacce8cb5','a7b51226-1c97-4310-948f-7c5a008d3775'),
    ('7a49cd61-a8d7-420f-9e29-228cacce8cb5','6a1eb7c2-3665-4f5f-aa9b-83474e48ab63'),
    ('7a49cd61-a8d7-420f-9e29-228cacce8cb5','667b07ca-0c3c-4d59-b527-ff53c433244c'),
    ('1920122a-459b-493a-97b6-f9715a8a9763','ae08eb2b-5d75-4063-a067-ec29df159d4e'),
    ('1920122a-459b-493a-97b6-f9715a8a9763','6a1eb7c2-3665-4f5f-aa9b-83474e48ab63'),
    ('1920122a-459b-493a-97b6-f9715a8a9763','667b07ca-0c3c-4d59-b527-ff53c433244c'),
    ('d03e5f5d-3b22-4a20-a6d9-c916face5552','6a1eb7c2-3665-4f5f-aa9b-83474e48ab63'),
    ('d03e5f5d-3b22-4a20-a6d9-c916face5552','667b07ca-0c3c-4d59-b527-ff53c433244c'),
    ('990f9e9c-f478-4a74-a23b-57a800a3c94e','a7b51226-1c97-4310-948f-7c5a008d3775'),
    ('990f9e9c-f478-4a74-a23b-57a800a3c94e','6a1eb7c2-3665-4f5f-aa9b-83474e48ab63'),
    ('990f9e9c-f478-4a74-a23b-57a800a3c94e','667b07ca-0c3c-4d59-b527-ff53c433244c'),
    ('11eb308f-86e2-4806-9135-ddc0a2d789dc','ae08eb2b-5d75-4063-a067-ec29df159d4e'),
    ('11eb308f-86e2-4806-9135-ddc0a2d789dc','6a1eb7c2-3665-4f5f-aa9b-83474e48ab63'),
    ('11eb308f-86e2-4806-9135-ddc0a2d789dc','667b07ca-0c3c-4d59-b527-ff53c433244c')
),
slot_map(list_id, slot) AS (
  VALUES
    ('a7b51226-1c97-4310-948f-7c5a008d3775','base'),
    ('ae08eb2b-5d75-4063-a067-ec29df159d4e','base')
)
INSERT INTO nomenclature_modifier_options
  (dish_id, modifier_id, slot, quantity_per_unit, price_delta, is_default, sort_order,
   loyverse_modifier_id, loyverse_modifier_list_id, loyverse_modifier_list_name)
SELECT
  dish.id, modn.id, sm.slot, 1, COALESCE(o.price, 0), false,
  ROW_NUMBER() OVER (PARTITION BY dish.id ORDER BY l.name, o.name),
  o.id, o.list_id, l.name
FROM dish_list dl
JOIN nomenclature dish        ON dish.loyverse_item_id = dl.loyverse_item_id
JOIN pos_loyverse_modifier_options o ON o.list_id = dl.list_id
JOIN pos_loyverse_modifier_lists   l ON l.id = o.list_id
JOIN opt_map om               ON om.option_name = o.name
JOIN nomenclature modn        ON modn.product_code = om.mod_code
LEFT JOIN slot_map sm         ON sm.list_id = dl.list_id
ON CONFLICT (dish_id, modifier_id) DO NOTHING;

-- ─── Self-register ───────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '231_smoothie_modifiers_extra.sql',
  'claude-code',
  NULL,
  'Map remaining smoothie options revealed by fresh Loyverse pull: Water (base downgrade), Almond Slices, Chia Seeds'
)
ON CONFLICT DO NOTHING;

COMMIT;
