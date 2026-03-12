-- Migration 008: Recipe Steps for Pumpkin
-- Goal: Define production flow for Baked Pumpkin and Pumpkin Soup.

-- 1. Baked Pumpkin (PF-BAKED_PUMPKIN)
INSERT INTO public.recipes_flow (product_code, step_order, operation_name, equipment_id, expected_duration_min, instruction_text, notes) VALUES
('PF-BAKED_PUMPKIN', 1, 'Preparation', '5e0faa74-898d-40a7-a77d-7d5a723f6429', 15, 'Wash, peel, de-seed. Cut into 3-4cm cubes.', 'Manual Prep'),
('PF-BAKED_PUMPKIN', 2, 'Seasoning', '5e0faa74-898d-40a7-a77d-7d5a723f6429', 5, 'Mix pumpkin with oil and salt in a bowl.', 'Manual Prep'),
('PF-BAKED_PUMPKIN', 3, 'Baking', '5eed3d0e-9f48-4502-8c6e-3f49bfe7926f', 50, '180°C, Convection 100%, gold-brown edges.', 'Unit 20 (Oven)'),
('PF-BAKED_PUMPKIN', 4, 'Cooling', '1b007995-1061-412c-9935-7273508a2fb9', 45, 'Chill to +3°C in Blast Chiller.', 'Unit 66 (Blast Chiller)');

-- 2. Pumpkin Coconut Soup Base (PF-PUMPKIN_COCONUT_BASE)
INSERT INTO public.recipes_flow (product_code, step_order, operation_name, equipment_id, expected_duration_min, instruction_text, notes) VALUES
('PF-PUMPKIN_COCONUT_BASE', 1, 'Infusion', '5519013d-1a2f-46fe-8003-0751ad8f1753', 3, 'Mirepoix + Spices (Turmeric, Coriander, Ginger) heat 2-3 min.', 'Unit 32 (Gas Range)'),
('PF-PUMPKIN_COCONUT_BASE', 2, 'Combination', '5519013d-1a2f-46fe-8003-0751ad8f1753', 10, 'Add baked pumpkin + veggie broth. Simmer 10 min.', 'Unit 32 (Gas Range)'),
('PF-PUMPKIN_COCONUT_BASE', 3, 'Emulsification', '5519013d-1a2f-46fe-8003-0751ad8f1753', 5, 'Add Coconut Milk. Heat to 85°C (Do NOT boil).', 'Unit 32 (Gas Range)'),
('PF-PUMPKIN_COCONUT_BASE', 4, 'Blending', '8b4391d1-0ba7-4736-ae9e-d0b743d7b2ec', 5, 'Hand blend until completely smooth.', 'Unit 13 (Blender)'),
('PF-PUMPKIN_COCONUT_BASE', 5, 'Cooling', '1b007995-1061-412c-9935-7273508a2fb9', 45, 'Chill to +3°C in Blast Chiller.', 'Unit 66 (Blast Chiller)');
