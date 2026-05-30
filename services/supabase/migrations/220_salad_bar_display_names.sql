-- 220: Add display_name to salad_bar_slots for customer-facing labels
-- MC: ecb1eb05

ALTER TABLE public.salad_bar_slots ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Unit 1 — Bases + Vegetables
UPDATE public.salad_bar_slots SET display_name = 'Crispy Mix'        WHERE slot_code = 'U1-A1';
UPDATE public.salad_bar_slots SET display_name = 'Superfood Mix'     WHERE slot_code = 'U1-A2';
UPDATE public.salad_bar_slots SET display_name = 'Cherry Tomato'     WHERE slot_code = 'U1-A3';
UPDATE public.salad_bar_slots SET display_name = 'Cucumber'          WHERE slot_code = 'U1-A4';
UPDATE public.salad_bar_slots SET display_name = 'Bell Pepper'       WHERE slot_code = 'U1-B1';
UPDATE public.salad_bar_slots SET display_name = 'Sweet Corn'        WHERE slot_code = 'U1-B2';
UPDATE public.salad_bar_slots SET display_name = 'Red Cabbage'       WHERE slot_code = 'U1-B3';
UPDATE public.salad_bar_slots SET display_name = 'Carrot'            WHERE slot_code = 'U1-B4';
UPDATE public.salad_bar_slots SET display_name = 'Radish'            WHERE slot_code = 'U1-B5';
UPDATE public.salad_bar_slots SET display_name = 'Red Onion'         WHERE slot_code = 'U1-B6';
UPDATE public.salad_bar_slots SET display_name = 'Parsley'           WHERE slot_code = 'U1-B7';
UPDATE public.salad_bar_slots SET display_name = 'Spring Onion & Dill' WHERE slot_code = 'U1-B8';

-- Unit 2 — Proteins + Toppings + Accents
UPDATE public.salad_bar_slots SET display_name = 'Chicken'           WHERE slot_code = 'U2-A1';
UPDATE public.salad_bar_slots SET display_name = 'Smoked Trout'      WHERE slot_code = 'U2-A2';
UPDATE public.salad_bar_slots SET display_name = 'Boiled Eggs'       WHERE slot_code = 'U2-A3';
UPDATE public.salad_bar_slots SET display_name = 'Quinoa'            WHERE slot_code = 'U2-A4';
UPDATE public.salad_bar_slots SET display_name = 'Beetroot'          WHERE slot_code = 'U2-A5';
UPDATE public.salad_bar_slots SET display_name = 'Red Beans'         WHERE slot_code = 'U2-B1';
UPDATE public.salad_bar_slots SET display_name = 'Edamame'           WHERE slot_code = 'U2-B2';
UPDATE public.salad_bar_slots SET display_name = 'Pomegranate'       WHERE slot_code = 'U2-B3';
UPDATE public.salad_bar_slots SET display_name = 'Feta'              WHERE slot_code = 'U2-B4';
UPDATE public.salad_bar_slots SET display_name = 'Parmesan'          WHERE slot_code = 'U2-B5';
UPDATE public.salad_bar_slots SET display_name = 'Walnuts'           WHERE slot_code = 'U2-B6';
UPDATE public.salad_bar_slots SET display_name = 'Almond'            WHERE slot_code = 'U2-B7';
UPDATE public.salad_bar_slots SET display_name = 'Cranberries'       WHERE slot_code = 'U2-B8';
UPDATE public.salad_bar_slots SET display_name = 'Pumpkin Seeds'     WHERE slot_code = 'U2-B9';

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '220_salad_bar_display_names.sql',
  'claude-code',
  NULL,
  'Add display_name column to salad_bar_slots with customer-facing labels (MC ecb1eb05)'
)
ON CONFLICT DO NOTHING;
