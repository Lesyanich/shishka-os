-- 218: Salad bar slot layout table
-- MC: ecb1eb05

-- ─── Table ───────────────────────────────────────────────
CREATE TABLE public.salad_bar_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id  UUID NOT NULL REFERENCES public.equipment(id),
  unit_number   INT  NOT NULL CHECK (unit_number IN (1, 2)),
  slot_code     TEXT NOT NULL,
  gn_size       TEXT NOT NULL,
  depth_mm      INT  NOT NULL DEFAULT 100,
  row           TEXT NOT NULL CHECK (row IN ('back', 'front')),
  position      INT  NOT NULL,
  ingredient_id UUID REFERENCES public.nomenclature(id),
  color_group   TEXT,
  prep_location TEXT,
  prep_method   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(equipment_id, slot_code)
);

COMMENT ON TABLE public.salad_bar_slots IS 'GN pan slot assignments for salad bar units';

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE public.salad_bar_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view slots"
  ON public.salad_bar_slots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owner can update slots"
  ON public.salad_bar_slots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.role = 'owner'
    )
  );

CREATE POLICY "Owner can insert slots"
  ON public.salad_bar_slots FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.role = 'owner'
    )
  );

CREATE POLICY "Owner can delete slots"
  ON public.salad_bar_slots FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.role = 'owner'
    )
  );

-- ─── updated_at trigger ──────────────────────────────────
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.salad_bar_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.moddatetime(updated_at);

-- ─── Seed data ───────────────────────────────────────────
-- Unit 1: 1c5b1920-e911-4c0f-a0f9-18f58a552f49
-- Unit 2: d12b2832-07c2-49b6-acd2-9cce09dbd4b3
-- Ingredient IDs resolved via subquery on nomenclature.product_code

-- ═══ UNIT 1 — Bases + Vegetables ═══

-- Back row (325mm depth)
INSERT INTO public.salad_bar_slots (equipment_id, unit_number, slot_code, gn_size, depth_mm, row, position, ingredient_id, color_group, prep_location, prep_method) VALUES
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A1', '1/1', 150, 'back', 1, (SELECT id FROM nomenclature WHERE product_code='PF-SALAD_BASE_CRISPY' LIMIT 1),    'base',      'L2', 'tear morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A2', '1/2', 150, 'back', 2, (SELECT id FROM nomenclature WHERE product_code='PF-SALAD_BASE_SUPERFOOD' LIMIT 1), 'base',      'L2', 'tear morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A3', '1/3', 100, 'back', 3, (SELECT id FROM nomenclature WHERE product_code='RAW-CHERRY-TOMATO' LIMIT 1),       'vegetable', 'L2', 'cut morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-A4', '1/3', 100, 'back', 4, (SELECT id FROM nomenclature WHERE product_code='RAW-CUCUMBER' LIMIT 1),            'vegetable', 'L2', 'cut morning');

-- Front row (176mm depth)
INSERT INTO public.salad_bar_slots (equipment_id, unit_number, slot_code, gn_size, depth_mm, row, position, ingredient_id, color_group, prep_location, prep_method) VALUES
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B1', '1/6', 100, 'front', 1, (SELECT id FROM nomenclature WHERE product_code='RAW-BELL-PEPPER-RED' LIMIT 1),   'vegetable', 'L2', 'cut morning'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B2', '1/6', 100, 'front', 2, (SELECT id FROM nomenclature WHERE product_code='RAW-FROZEN-SWEET-CORN' LIMIT 1), 'vegetable', 'L1', 'grill + chill'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B3', '1/6', 100, 'front', 3, (SELECT id FROM nomenclature WHERE product_code='RAW-RED_CABBAGE' LIMIT 1),       'vegetable', 'L1', 'slicer machine'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B4', '1/6', 100, 'front', 4, (SELECT id FROM nomenclature WHERE product_code='RAW-CARROT' LIMIT 1),            'vegetable', 'L1', 'slicer machine'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B5', '1/6', 100, 'front', 5, (SELECT id FROM nomenclature WHERE product_code='RAW-RADISH' LIMIT 1),            'vegetable', 'L1', 'slicer machine'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B6', '1/9', 100, 'front', 6, (SELECT id FROM nomenclature WHERE product_code='RAW-RED_ONION' LIMIT 1),         'vegetable', 'L1', 'slicer machine'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B7', '1/9', 100, 'front', 7, (SELECT id FROM nomenclature WHERE product_code='RAW-PARSLEY' LIMIT 1),           'vegetable', 'L1', 'wash+strip; L2: chop'),
  ('1c5b1920-e911-4c0f-a0f9-18f58a552f49', 1, 'U1-B8', '1/9', 100, 'front', 8, (SELECT id FROM nomenclature WHERE product_code='RAW-SPRING-ONION' LIMIT 1),      'vegetable', 'L2', 'cut morning');

-- ═══ UNIT 2 — Proteins + Toppings + Accents ═══

-- Back row
INSERT INTO public.salad_bar_slots (equipment_id, unit_number, slot_code, gn_size, depth_mm, row, position, ingredient_id, color_group, prep_location, prep_method) VALUES
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A1', '1/2', 100, 'back', 1, NULL,                                                                               'protein',   'L1', 'sous vide + grill + vacuum'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A2', '1/3', 100, 'back', 2, (SELECT id FROM nomenclature WHERE product_code='RAW-SMOKED_TROUT' LIMIT 1),        'protein',   'L1', 'thaw from freezer'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A3', '1/3', 100, 'back', 3, (SELECT id FROM nomenclature WHERE product_code='RAW-EGG' LIMIT 1),                 'protein',   'L1', 'boil; L2: peel+cut'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A4', '1/3', 100, 'back', 4, (SELECT id FROM nomenclature WHERE product_code='PF-COOKED_QUINOA' LIMIT 1),        'topping',   'L1', 'cook + blast chill + vacuum'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-A5', '1/3', 100, 'back', 5, (SELECT id FROM nomenclature WHERE product_code='PF-BAKED_BEETROOT' LIMIT 1),       'vegetable', 'L1', 'bake + vacuum; L2: grate');

-- Front row
INSERT INTO public.salad_bar_slots (equipment_id, unit_number, slot_code, gn_size, depth_mm, row, position, ingredient_id, color_group, prep_location, prep_method) VALUES
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B1', '1/6', 100, 'front', 1, (SELECT id FROM nomenclature WHERE product_code='MOD-RED_BEANS' LIMIT 1),          'protein',   'L1', 'cook'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B2', '1/6', 100, 'front', 2, (SELECT id FROM nomenclature WHERE product_code='RAW-FROZEN-EDAMAME' LIMIT 1),     'protein',   'L1', 'boil 3min'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B3', '1/6', 100, 'front', 3, (SELECT id FROM nomenclature WHERE product_code='RAW-POMEGRANATE-SEEDS' LIMIT 1),  'accent',    'L1', 'from frozen pack'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B4', '1/9', 100, 'front', 4, (SELECT id FROM nomenclature WHERE product_code='RAW-CHEESE-FETA' LIMIT 1),        'topping',   'L2', 'cube morning'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B5', '1/9', 100, 'front', 5, (SELECT id FROM nomenclature WHERE product_code='RAW-CHEESE-PARMESAN' LIMIT 1),    'topping',   'L2', 'grate'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B6', '1/9', 100, 'front', 6, (SELECT id FROM nomenclature WHERE product_code='RAW-WALNUTS' LIMIT 1),            'topping',   'L1', 'toast + crush'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B7', '1/9', 100, 'front', 7, (SELECT id FROM nomenclature WHERE product_code='RAW-ALMOND_SLICED' LIMIT 1),      'topping',   NULL, 'ready from pack'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B8', '1/9', 100, 'front', 8, (SELECT id FROM nomenclature WHERE product_code='RAW-DRIED-CRANBERRIES' LIMIT 1),  'topping',   NULL, 'ready from pack'),
  ('d12b2832-07c2-49b6-acd2-9cce09dbd4b3', 2, 'U2-B9', '1/9', 100, 'front', 9, (SELECT id FROM nomenclature WHERE product_code='RAW-PUMPKIN-SEEDS' LIMIT 1),      'topping',   'L1', 'seeds ready; L2: tear mint');

-- ─── Self-register ───────────────────────────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '218_salad_bar_slots.sql',
  'claude-code',
  NULL,
  'Salad bar GN slot layout table with 26 seeded rows (MC ecb1eb05)'
)
ON CONFLICT DO NOTHING;
