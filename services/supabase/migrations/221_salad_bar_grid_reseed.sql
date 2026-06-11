-- 221: Salad bar — reseed slots to the factory GN grid (perfect tiling)
-- MC: ecb1eb05 (follow-up)
--
-- WHY: the original seed (218) mixed GN 1/1 + 1/2 + 1/3 + 1/6 + 1/9 with
-- mismatched row widths (back 1147mm vs front 1408mm) → visible gaps.
-- The factory dividers actually give 28 cells per unit: 6×GN1/3 + 16×GN1/6
-- + 6×GN1/9, which tile EXACTLY as an 8-column × 2-row grid:
--   * column = 176mm along the bar, row = 325mm deep
--   * 8 cols × 176 = 1408mm wide · 2 rows × 325 = 650mm deep (fits the 150×80cm unit)
--   * each 176×325 footprint holds 1×GN1/3 (full), or 2×GN1/6, or 3×GN1/9 (split in depth)
-- => zero gaps by construction.
--
-- Layout model:
--   row      = 'back' (far from guest) | 'front' (near guest)
--   position = column index 1..8 along the bar
--   depth_pos= 0-based order of a pan WITHIN a column (front→back of that footprint)
-- Distribution: bases + bulky items in the back row (mostly GN1/3); toppings,
-- herbs and seeds in the front row (GN1/6 / GN1/9). Empty cells = spare capacity.

-- ─── Schema: depth ordering within a column ──────────────
ALTER TABLE public.salad_bar_slots ADD COLUMN IF NOT EXISTS depth_pos INT NOT NULL DEFAULT 0;

-- ─── Clean slate for both units ──────────────────────────
DELETE FROM public.salad_bar_slots
WHERE equipment_id IN (
  '1c5b1920-e911-4c0f-a0f9-18f58a552f49',  -- Unit 1
  'd12b2832-07c2-49b6-acd2-9cce09dbd4b3'   -- Unit 2
);

-- Helper note: ingredient_id resolved via subquery on nomenclature.product_code

-- ═══════════════════════════════════════════════════════════
-- UNIT 1 — Bases + Vegetables   (1c5b1920-…)
-- ═══════════════════════════════════════════════════════════

-- ── BACK row: 6× GN1/3 (cols 1-6) + 2× GN1/6-pair (cols 7-8) ──
INSERT INTO public.salad_bar_slots
  (equipment_id, unit_number, slot_code, gn_size, depth_mm, row, position, depth_pos, ingredient_id, display_name, color_group, prep_location, prep_method) VALUES
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A1',  '1/3', 150, 'back', 1, 0, (SELECT id FROM nomenclature WHERE product_code='PF-SALAD_BASE_CRISPY'    LIMIT 1), 'Crispy Mix',    'base',      'L2', 'tear morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A2',  '1/3', 150, 'back', 2, 0, (SELECT id FROM nomenclature WHERE product_code='PF-SALAD_BASE_SUPERFOOD' LIMIT 1), 'Superfood Mix', 'base',      'L2', 'tear morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A3',  '1/3', 100, 'back', 3, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-CHERRY-TOMATO'       LIMIT 1), 'Cherry Tomato', 'vegetable', 'L2', 'cut morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A4',  '1/3', 100, 'back', 4, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-CUCUMBER'            LIMIT 1), 'Cucumber',      'vegetable', 'L2', 'cut morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A5',  '1/3', 100, 'back', 5, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-RED_CABBAGE'         LIMIT 1), 'Red Cabbage',   'vegetable', 'L1', 'slicer machine'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A6',  '1/3', 100, 'back', 6, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-CARROT'              LIMIT 1), 'Carrot',        'vegetable', 'L1', 'slicer machine'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A7a', '1/6', 100, 'back', 7, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-BELL-PEPPER-RED'     LIMIT 1), 'Bell Pepper',   'vegetable', 'L2', 'cut morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A7b', '1/6', 100, 'back', 7, 1, (SELECT id FROM nomenclature WHERE product_code='RAW-FROZEN-SWEET-CORN'   LIMIT 1), 'Sweet Corn',    'vegetable', 'L1', 'grill + chill'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A8a', '1/6', 100, 'back', 8, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-RADISH'              LIMIT 1), 'Radish',        'vegetable', 'L1', 'slicer machine'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A8b', '1/6', 100, 'back', 8, 1, NULL, NULL, NULL, NULL, NULL);

-- ── FRONT row: 6× GN1/6-pair (cols 1-6) + 2× GN1/9-triple (cols 7-8) ──
INSERT INTO public.salad_bar_slots
  (equipment_id, unit_number, slot_code, gn_size, depth_mm, row, position, depth_pos, ingredient_id, display_name, color_group, prep_location, prep_method) VALUES
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B1a', '1/6', 100, 'front', 1, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-RED_ONION'    LIMIT 1), 'Red Onion',          'vegetable', 'L1', 'slicer machine'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B1b', '1/6', 100, 'front', 1, 1, (SELECT id FROM nomenclature WHERE product_code='RAW-SPRING-ONION'  LIMIT 1), 'Spring Onion & Dill','vegetable', 'L2', 'cut morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B2a', '1/6', 100, 'front', 2, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-PARSLEY'       LIMIT 1), 'Parsley',            'vegetable', 'L1', 'wash+strip; L2: chop'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B2b', '1/6', 100, 'front', 2, 1, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B3a', '1/6', 100, 'front', 3, 0, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B3b', '1/6', 100, 'front', 3, 1, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B4a', '1/6', 100, 'front', 4, 0, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B4b', '1/6', 100, 'front', 4, 1, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B5a', '1/6', 100, 'front', 5, 0, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B5b', '1/6', 100, 'front', 5, 1, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B6a', '1/6', 100, 'front', 6, 0, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B6b', '1/6', 100, 'front', 6, 1, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B7a', '1/9', 100, 'front', 7, 0, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B7b', '1/9', 100, 'front', 7, 1, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B7c', '1/9', 100, 'front', 7, 2, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B8a', '1/9', 100, 'front', 8, 0, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B8b', '1/9', 100, 'front', 8, 1, NULL, NULL, NULL, NULL, NULL),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B8c', '1/9', 100, 'front', 8, 2, NULL, NULL, NULL, NULL, NULL);

-- ═══════════════════════════════════════════════════════════
-- UNIT 2 — Proteins + Toppings + Accents   (d12b2832-…)
-- ═══════════════════════════════════════════════════════════

-- ── BACK row: 6× GN1/3 (cols 1-6) + 2× GN1/6-pair (cols 7-8) ──
INSERT INTO public.salad_bar_slots
  (equipment_id, unit_number, slot_code, gn_size, depth_mm, row, position, depth_pos, ingredient_id, display_name, color_group, prep_location, prep_method) VALUES
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A1',  '1/3', 100, 'back', 1, 0, NULL,                                                                              'Chicken',      'protein',   'L1', 'sous vide + grill + vacuum'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A2',  '1/3', 100, 'back', 2, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-SMOKED_TROUT' LIMIT 1),       'Smoked Trout', 'protein',   'L1', 'thaw from freezer'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A3',  '1/3', 100, 'back', 3, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-EGG' LIMIT 1),                'Boiled Eggs',  'protein',   'L1', 'boil; L2: peel+cut'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A4',  '1/3', 100, 'back', 4, 0, (SELECT id FROM nomenclature WHERE product_code='PF-COOKED_QUINOA' LIMIT 1),       'Quinoa',       'topping',   'L1', 'cook + blast chill + vacuum'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A5',  '1/3', 100, 'back', 5, 0, (SELECT id FROM nomenclature WHERE product_code='PF-BAKED_BEETROOT' LIMIT 1),      'Beetroot',     'vegetable', 'L1', 'bake + vacuum; L2: grate'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A6',  '1/3', 100, 'back', 6, 0, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A7a', '1/6', 100, 'back', 7, 0, (SELECT id FROM nomenclature WHERE product_code='MOD-RED_BEANS' LIMIT 1),          'Red Beans',    'protein',   'L1', 'cook'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A7b', '1/6', 100, 'back', 7, 1, (SELECT id FROM nomenclature WHERE product_code='RAW-FROZEN-EDAMAME' LIMIT 1),     'Edamame',      'protein',   'L1', 'boil 3min'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A8a', '1/6', 100, 'back', 8, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-POMEGRANATE-SEEDS' LIMIT 1),  'Pomegranate',  'accent',    'L1', 'from frozen pack'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A8b', '1/6', 100, 'back', 8, 1, NULL, NULL, NULL, NULL, NULL);

-- ── FRONT row: 6× GN1/6-pair (cols 1-6) + 2× GN1/9-triple (cols 7-8) ──
INSERT INTO public.salad_bar_slots
  (equipment_id, unit_number, slot_code, gn_size, depth_mm, row, position, depth_pos, ingredient_id, display_name, color_group, prep_location, prep_method) VALUES
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B1a', '1/6', 100, 'front', 1, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-CHEESE-FETA' LIMIT 1),       'Feta',          'topping', 'L2', 'cube morning'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B1b', '1/6', 100, 'front', 1, 1, (SELECT id FROM nomenclature WHERE product_code='RAW-CHEESE-PARMESAN' LIMIT 1),   'Parmesan',      'topping', 'L2', 'grate'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B2a', '1/6', 100, 'front', 2, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-WALNUTS' LIMIT 1),           'Walnuts',       'topping', 'L1', 'toast + crush'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B2b', '1/6', 100, 'front', 2, 1, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B3a', '1/6', 100, 'front', 3, 0, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B3b', '1/6', 100, 'front', 3, 1, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B4a', '1/6', 100, 'front', 4, 0, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B4b', '1/6', 100, 'front', 4, 1, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B5a', '1/6', 100, 'front', 5, 0, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B5b', '1/6', 100, 'front', 5, 1, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B6a', '1/6', 100, 'front', 6, 0, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B6b', '1/6', 100, 'front', 6, 1, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B7a', '1/9', 100, 'front', 7, 0, (SELECT id FROM nomenclature WHERE product_code='RAW-ALMOND_SLICED' LIMIT 1),     'Almond',        'topping', NULL, 'ready from pack'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B7b', '1/9', 100, 'front', 7, 1, (SELECT id FROM nomenclature WHERE product_code='RAW-DRIED-CRANBERRIES' LIMIT 1), 'Cranberries',   'accent',  NULL, 'ready from pack'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B7c', '1/9', 100, 'front', 7, 2, (SELECT id FROM nomenclature WHERE product_code='RAW-PUMPKIN-SEEDS' LIMIT 1),     'Pumpkin Seeds', 'topping', 'L1', 'seeds ready'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B8a', '1/9', 100, 'front', 8, 0, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B8b', '1/9', 100, 'front', 8, 1, NULL, NULL, NULL, NULL, NULL),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B8c', '1/9', 100, 'front', 8, 2, NULL, NULL, NULL, NULL, NULL);

-- ─── Self-register ───────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '221_salad_bar_grid_reseed.sql',
  'claude-code',
  NULL,
  'Reseed salad_bar_slots to factory 8x2 GN grid (6x1/3 + 16x1/6 + 6x1/9 per unit), gapless tiling; adds depth_pos column (MC ecb1eb05)'
)
ON CONFLICT DO NOTHING;
