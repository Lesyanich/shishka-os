-- Seed agent_memory from kitchen-journal.md (6 dated blocks)
-- Source: agents/chef/kitchen-journal.md — migrated per spec-shared-agent-memory.md §4.1

INSERT INTO agent_memory (agent_id, memory_type, title, content, tags, metadata, source, created_by, created_at) VALUES

-- 1. 2026-04-03: Chef Agent launch + menu dev list
('chef', 'conversation_summary',
 'Chef Agent launch and menu development list',
 E'Chef Agent launched (AGENT.md designed, MCP tested). Created menu-development.md with full position list. Active tests: manakeesh dough, sourdough bread. Baking tests TBD — awaiting details from Lesya.',
 ARRAY['launch', 'menu', 'manakeesh', 'sourdough'],
 '{}',
 'kitchen_test', 'chef_agent',
 '2026-04-03T12:00:00+07:00'),

-- 2. 2026-04-05: Hummus A/B test plan — tahini proportions debate
('chef', 'test_result',
 'Hummus A/B test plan — tahini proportions debate',
 E'Chef insisted on high tahini (200g/500g chickpeas = 40%) and garlic (10g). Agent recommended standard: tahini 160g (32%), garlic 6g, lemon 80ml.\n\nVersion A (DB, agent recipe): Tahini 160g, Garlic 6g, Lemon 80ml\nVersion B (chef): Tahini 200g, Garlic 10g, Lemon 60ml\n\nEvaluation criteria: taste, texture, creaminess, shelf life (24h, 48h, 72h). Blind test preferred.\n\nChickpea process locked: soak 1-2h cold (max 6h), shock-cool in ice water after cooking, peel skins for creamier result, ice water in blender (3-4 tbsp) for aeration.\n\nZero-waste idea: aquafaba (chickpea water) as egg white substitute — future PF-AQUAFABA.',
 ARRAY['hummus', 'tahini', 'ab-test', 'chickpeas', 'aquafaba'],
 '{"version_a": {"tahini_g": 160, "garlic_g": 6, "lemon_ml": 80}, "version_b": {"tahini_g": 200, "garlic_g": 10, "lemon_ml": 60}}',
 'kitchen_test', 'chef_agent',
 '2026-04-05T10:00:00+07:00'),

-- 3. 2026-04-05: Shish Tawook spice matrix — Fresh Edition blueprint
('chef', 'decision',
 'Shish Tawook spice matrix — The Fresh Edition blueprint',
 E'Received Lesya''s author spice matrix for Shish Tawook v1 "The Fresh Edition".\n\nKey design decisions:\n- No garlic powder — fresh garlic 50g/kg as structural foundation\n- Mahlab 40g — SHiSHKA Signature (atypical for tawook)\n- Dried Mint 70g — high for this marinade type\n- Deep Infusion: 6h at 4°C mandatory (garlic-acid reaction)\n- Double acid: lemon juice + ACV simultaneously\n- Finishing oil: garlic oil from marinade for crispy exterior\n\nBatch: 530g dry mix (10% scale).\n\nMahlab decision: Syrian chef uses Fenugreek (Hilba) — regional interpretation accepted. Created RAW-FENUGREEK in DB.',
 ARRAY['tawook', 'spice-matrix', 'marinade', 'fenugreek', 'signature'],
 '{"batch_dry_mix_g": 530, "fresh_garlic_per_kg": 50, "mahlab_g": 40, "dried_mint_g": 70, "infusion_hours": 6}',
 'ceo_conversation', 'chef_agent',
 '2026-04-05T14:00:00+07:00'),

-- 4. 2026-04-05: Yogurt — switch to homemade production
('chef', 'decision',
 'Yogurt: switch to homemade production',
 E'No longer purchasing yogurt — making from milk using Yogurt Maker (L-1-K-YOG-10L-17).\n\nProcess:\n1. Milk → Yogurt Maker → 85°C (pasteurize / denature proteins)\n2. Open lid → cool to 43-45°C\n3. Blast Chiller for cooling = better consistency (confirmed by test)\n4. Add starter → incubate 40-43°C → 6-8 hours\n5. Cool to 4°C\n\nBottleneck: Blast Chiller (10kg, 15 min/cycle) competes with other PFs.\n\nDry milk removed from recipe — technically NOVA 3, but doesn''t match Shishka "whole ingredients" philosophy. Chef correct on principle.\n\nMilk: Makro 3.5% for now. 3 test variants planned: A=basic 7h / B=Greek strained 7h / C=extended 10h.',
 ARRAY['yogurt', 'production', 'blast-chiller', 'equipment', 'homemade'],
 '{"equipment_id": "L-1-K-YOG-10L-17", "temp_pasteurize": 85, "temp_incubate_min": 40, "temp_incubate_max": 43, "incubation_hours": "6-8"}',
 'kitchen_test', 'chef_agent',
 '2026-04-05T16:00:00+07:00'),

-- 5. 2026-05-18: Porridge R&D — coconut rice + overnight oats + CEO food science corrections
('chef', 'test_result',
 'Porridge R&D: coconut rice + overnight oats with CEO food science corrections',
 E'CEO corrections (critical food science gaps):\n1. Shelf life max 48h, not 5 days — B. cereus spores survive cooking, germinate at 4-55°C; starch retrogradation by day 3-4\n2. Honey ONLY at L2 serving (<40°C) — heat destroys enzymes, turns into cheap invert sugar. Use coconut sugar at L1 (thermostable, low GI)\n3. Al dente at L1 — microwave reheat finishes cooking; ratio 1:2.06 (rice:liquid), cook 15 min\n4. Raw oats carry wild microflora — overnight oats need 3 min boil → blast chill → add chia cold\n5. Puffed rice (Murmura) — add ONLY at L2 serving, absorbs moisture instantly\n\nFinal recipes (v2):\n- Rice porridge: 330g jasmine rice + 580ml coconut milk + 100ml water + 15g coconut sugar + 3g cinnamon + 2ml vanilla. Cook 15 min al dente → blast chill → 250g portions. Cost ~57 THB/kg.\n- Overnight oats: 300g oats + 550ml coconut milk + 150ml water + 30g chia (post-chill) + 15g coconut sugar + 3g cinnamon + 2ml vanilla. Boil 3 min → blast chill → add chia → mature 6-12h cold. Cost ~99 THB/kg.\n\nSweetener decision: CANE SUGAR (coconut sugar rejected — strong aftertaste, CEO decision).',
 ARRAY['porridge', 'rice', 'oats', 'food-safety', 'b-cereus', 'sweetener', 'cane-sugar'],
 '{"rice_cost_per_kg_thb": 57, "oats_cost_per_kg_thb": 99, "shelf_life_hours": 48, "sweetener": "cane_sugar"}',
 'ceo_conversation', 'chef_agent',
 '2026-05-18T12:00:00+07:00'),

-- 6. 2026-05-18: Manakeesh recipe flows + porridge pudding concept
('chef', 'decision',
 'Manakeesh full recipe flows + porridge pudding cold-serve concept',
 E'All 7 active GF manakeesh now have complete 6-step recipe flows:\n1. Pressing (Gas Range) → 2. Pre-baking → 3. Assembly → 4. Blast Freeze → 5. Storage → 6. Merrychef (260°C, Fan 100%, MW 10-15%, 1:40)\n\nCreated PF-CHEESE_MIX_MANAKEESH — 3-cheese mix (Mozz+Cheddar 40%, Gouda 30%, Emmental 30%), 392 THB/kg.\n\nPrices set: Cheese GF 59 THB (FC 18%), Cheese+Mushroom 69 THB (FC 22%), Za''atar 45 THB (FC 16%), Pumpkin+Goat 69 THB (FC 24%).\n\nGoat cheese: Soignon from Villa Market, 1,245 THB/kg.\n\nPorridge Pudding Concept (CEO idea — R&D):\nServe rice + oat porridge COLD as puddings. Health angle: cooled rice = resistant starch RS3 (lower GI). Two models: Grab & Go (pre-assembled in open fridge, max 12h display) and Build Your Own (base + toppings at sweet salad bar). Packaging: medium bowl + clear lid + sticker with KBJU. Food safety: rice base 48h max at 0-4°C, cut fruit 24h max, fruit added at L2 morning only.\n\nNew idea: ricotta in overnight oats (protein + creaminess).',
 ARRAY['manakeesh', 'recipe-flow', 'porridge-pudding', 'cold-serve', 'rs3', 'grab-and-go', 'cheese-mix'],
 '{"cheese_mix_cost_thb_kg": 392, "goat_cheese_cost_thb_kg": 1245, "merrychef_temp_c": 260}',
 'ceo_conversation', 'chef_agent',
 '2026-05-18T16:00:00+07:00');

-- Self-register in migration log
INSERT INTO migration_log (filename, applied_by, description)
VALUES (
    '215_seed_agent_memory_from_journal.sql',
    'claude-code',
    'Seed 6 chef agent memories from kitchen-journal.md (decisions, tests, summaries)'
) ON CONFLICT (filename) DO NOTHING;
