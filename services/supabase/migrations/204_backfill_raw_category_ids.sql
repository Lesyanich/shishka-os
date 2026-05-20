-- ============================================================
-- Migration 204: Backfill category_id for RAW items (127 missing)
--
-- Task: fb05cbec — Backfill category_id for all RAW products
--
-- Assigns L3 product_categories to RAW items that still have
-- category_id IS NULL. Uses CTE+JOIN pattern (safe: unknown
-- category codes resolve to zero updates, not errors).
--
-- 16 items skipped (merged/garbage/unidentifiable):
--   MERGED→ items, "Product return", "Unknown item", "Item N",
--   "Powder 1", water delivery entries, "Miscellaneous", ice,
--   "Whittaker's", "CENTRA ROCK", "267 2000 L"
-- ============================================================

WITH mapping (item_id, cat_code) AS (VALUES

  -- ── F-PRD-VEG: Vegetables ──────────────────────────────────
  ('0b8a1f3b-3967-48f0-b547-503202887569'::uuid, 'F-PRD-VEG'),  -- Dried Eggplant 250g pack
  ('391a408e-2724-4e82-a256-1b8def9663e9'::uuid, 'F-PRD-VEG'),  -- Chinese Garlic 1kg
  ('48c368b5-9c4f-4bfc-8647-ae6a52e72f10'::uuid, 'F-PRD-VEG'),  -- Imported Onion 1kg
  ('531ed355-cf07-4608-a0de-d3bba5513bfc'::uuid, 'F-PRD-VEG'),  -- Red Onion 1kg
  ('9ad50b39-0408-4dc9-ad32-51bba8acffd1'::uuid, 'F-PRD-VEG'),  -- Japanese Pumpkin per kg
  ('bf3f213b-6736-4355-8b19-f8df1c9ae53b'::uuid, 'F-PRD-VEG'),  -- Japanese Sweet Potato 1kg
  ('80b9f2e3-4d3f-4d3b-b6df-9881a8f96ee3'::uuid, 'F-PRD-VEG'),  -- Fresh Tomatoes 1kg
  ('c81fa06e-30ae-45d1-adb1-c78cd2847806'::uuid, 'F-PRD-VEG'),  -- Roma Tomatoes 3kg
  ('a64445c0-1049-45a0-a1fe-b229aa219672'::uuid, 'F-PRD-VEG'),  -- Beetroot 1kg (AUTO)
  ('0ba46e5f-ad70-4ed8-b7c7-d87853924771'::uuid, 'F-PRD-VEG'),  -- Imported Potatoes (AUTO)
  ('85539cf1-c25f-44af-a253-c936b80029f5'::uuid, 'F-PRD-VEG'),  -- Potato Pack 1kg (AUTO)
  ('1de841e6-14ef-4ecf-bd60-d9198d38d004'::uuid, 'F-PRD-VEG'),  -- Potatoes Pack 1kg (AUTO)
  ('44558b97-ad2e-4eb3-9c4e-50b4626c0ac2'::uuid, 'F-PRD-VEG'),  -- Potato pack 1kg (AUTO)
  ('daeb24a9-c6b7-42f5-abdc-0ce743dde3c5'::uuid, 'F-PRD-VEG'),  -- Potatoes 1kg Pack (AUTO)
  ('eef1bb70-b1a7-4fb1-885c-370c782e9ee6'::uuid, 'F-PRD-VEG'),  -- Thai Potatoes (AUTO)
  ('d2765bd5-279d-418c-a600-da76d9220ab2'::uuid, 'F-PRD-VEG'),  -- Japanese Pumpkin (AUTO)
  ('9a30506b-ac7c-4b1f-944c-0ae25620b0ad'::uuid, 'F-PRD-VEG'),  -- Red Onion 1kg (AUTO)
  ('6de4664f-887d-479a-9c1f-5572d237b5db'::uuid, 'F-PRD-VEG'),  -- Roast Seaweed 100g

  -- ── F-PRD-FRU: Fruit ───────────────────────────────────────
  ('72a50f83-446f-454e-adc6-b31d50f39f47'::uuid, 'F-PRD-FRU'),  -- Gala Apple 1.25kg
  ('9cde2279-c656-44e8-8c59-5efcece506b5'::uuid, 'F-PRD-FRU'),  -- Green Apple Pack 10
  ('27ca098f-bc4b-4d60-8938-29350eacc25c'::uuid, 'F-PRD-FRU'),  -- Egg Banana per bunch
  ('d875febd-6841-42bd-9cd1-e850220839b4'::uuid, 'F-PRD-FRU'),  -- Black Raisin 1kg
  ('eec3f0eb-7db2-456e-ba0d-69caf60697a9'::uuid, 'F-PRD-FRU'),  -- Blueberry PE 300g
  ('9fad3978-9e44-455e-9c04-ed3df01d8a1c'::uuid, 'F-PRD-FRU'),  -- Dried Apricots 250g
  ('d72c9eb5-2693-443c-b82b-953b9f98260f'::uuid, 'F-PRD-FRU'),  -- Dried Cranberry
  ('a85bed32-ddae-454b-93f4-1f12a2d110be'::uuid, 'F-PRD-FRU'),  -- Golden Raisin 1kg
  ('01ac591d-8248-4046-93d9-463374e1c491'::uuid, 'F-PRD-FRU'),  -- Green Kiwi Pack 5
  ('c07c4231-3ae8-4b7c-b67d-8fd8aff99949'::uuid, 'F-PRD-FRU'),  -- Small Myrobalan Fruit
  ('55e46b6e-9860-48bc-8a45-76b116824065'::uuid, 'F-PRD-FRU'),  -- Wogan Orange 800g
  ('0b911e24-8af8-492e-8a7a-7d418fc607cd'::uuid, 'F-PRD-FRU'),  -- Indian Pomegranate
  ('024621ed-ddde-4e4b-bbb2-9d4da5ca445d'::uuid, 'F-PRD-FRU'),  -- Luk Sa
  ('23c74afd-a61d-4d3c-9936-398fdc3ee30f'::uuid, 'F-PRD-FRU'),  -- Banana 4 hands (AUTO)
  ('ef64aa21-9aa8-442f-98c6-2a4e14f05614'::uuid, 'F-PRD-FRU'),  -- Pattavia Pineapple (AUTO)

  -- ── F-PRD-FRZ: Frozen Produce ──────────────────────────────
  ('07d7b86e-41e1-4f5f-bca0-453bb8567dec'::uuid, 'F-PRD-FRZ'),  -- Mixed frozen vegetables

  -- ── F-PRD-MSH: Mushrooms ───────────────────────────────────
  ('50ddacf8-482d-47a3-ba20-349032526a72'::uuid, 'F-PRD-MSH'),  -- Fresh Lion's Mane

  -- ── F-PRD-HRB: Fresh Herbs ─────────────────────────────────
  ('25674972-6cdb-45ab-9d09-a5f9e8a32238'::uuid, 'F-PRD-HRB'),  -- Mint Leaves 100g
  ('9229165f-d10c-406c-a41b-04741a68fdeb'::uuid, 'F-PRD-HRB'),  -- Kaffir Lime per kg (AUTO)

  -- ── F-PRO-RED: Red Meat ────────────────────────────────────
  ('bdaf3107-9f6a-411e-8472-48971bbcdb99'::uuid, 'F-PRO-RED'),  -- ARO-G Angus Beef
  ('a22cdea7-242f-43ef-8618-0610e9cb08f3'::uuid, 'F-PRO-RED'),  -- Picanha Beef
  ('837898e7-ae77-47e5-b97c-a57d01302126'::uuid, 'F-PRO-RED'),  -- Beef Sausage 275g
  ('56c2c082-5281-423f-a4e9-3792c8799ed0'::uuid, 'F-PRO-RED'),  -- Lamb Mince (Frozen)
  ('c7e7b12c-f01c-4a72-946a-165f6045a199'::uuid, 'F-PRO-RED'),  -- NZ Lamb Shoulder
  ('7b8ef870-069b-4567-af63-c0f97da32d2c'::uuid, 'F-PRO-RED'),  -- AU Frozen Lamb Shoulder (AUTO)
  ('15ea62ee-c17e-4d34-96eb-4cbf880a271d'::uuid, 'F-PRO-RED'),  -- AU Frozen Lamb Leg (AUTO)

  -- ── F-PRO-PLT: Poultry ─────────────────────────────────────
  ('eaf59ea6-2fc2-4079-aa41-45d4a5fe78a4'::uuid, 'F-PRO-PLT'),  -- Discounted chicken breast
  ('217e06df-c844-4092-b017-feaa028d346a'::uuid, 'F-PRO-PLT'),  -- Chicken breast skinless (AUTO)

  -- ── F-PRO-SEA: Seafood ─────────────────────────────────────
  ('1eda2a0e-6220-424c-8e6e-8aa7fc1df1ec'::uuid, 'F-PRO-SEA'),  -- Frozen Scallop Meat
  ('23e1f216-1113-4261-a2ff-6912d6d7ccfc'::uuid, 'F-PRO-SEA'),  -- Frozen Red Fish Roe
  ('1288cdb5-1dfd-45a0-b53f-ef21249331be'::uuid, 'F-PRO-SEA'),  -- Frozen Sushi Ebi
  ('6830953c-ee8b-49d4-b951-c53521d245f2'::uuid, 'F-PRO-SEA'),  -- Frozen Boiled Scallop
  ('cfedca01-eb8e-4a85-b3d0-bc11df9f6380'::uuid, 'F-PRO-SEA'),  -- Frozen Salmon Steak (AUTO)

  -- ── F-PRO-EGG: Eggs ────────────────────────────────────────
  ('ee155b2b-a51f-4b4e-b45c-79532d4d543e'::uuid, 'F-PRO-EGG'),  -- CP Chicken Eggs (AUTO)

  -- ── F-PRO-VEG: Plant Protein ───────────────────────────────
  ('7238f1c3-3346-4886-be5f-bf569018e4b0'::uuid, 'F-PRO-VEG'),  -- Fresh Big Tofu Box

  -- ── F-DAI-CHZ: Cheese ──────────────────────────────────────
  ('326e235f-bc4c-4331-b7c0-0155890ce164'::uuid, 'F-DAI-CHZ'),  -- Goat Cheese
  ('b1d88ae3-728d-4847-afca-0235042f06f5'::uuid, 'F-DAI-CHZ'),  -- Laughing Cow
  ('100b9ae0-dcf7-4333-8e9b-04c692ccf5ee'::uuid, 'F-DAI-CHZ'),  -- Shredded Cheese 1kg
  ('9f830250-5a65-4fe4-8b4c-fddbc7f5e9ac'::uuid, 'F-DAI-CHZ'),  -- DANA Cheese Triangles
  ('7bf2cf9f-641e-4477-9dc5-6dd3ab75e970'::uuid, 'F-DAI-CHZ'),  -- Emmental Cheese Shredded
  ('7cf976de-7ac7-430a-a84d-c84d74bbc623'::uuid, 'F-DAI-CHZ'),  -- GOLD Shredded Cheddar
  ('da4eef70-fe6e-42a6-87b5-4928c9dc6018'::uuid, 'F-DAI-CHZ'),  -- Mozzarella Mixed Cheddar
  ('092ba565-b13b-447a-941f-8909cda0e808'::uuid, 'F-DAI-CHZ'),  -- ARO Shredded Cheese (AUTO)
  ('b07f46c2-e0dc-4655-935e-ab6a81b2bc18'::uuid, 'F-DAI-CHZ'),  -- Parmesan Cheese (AUTO)
  ('8261ed95-1670-4c03-ae6f-6884ccd64324'::uuid, 'F-DAI-CHZ'),  -- Mozzarella Cheese (AUTO)
  ('dc17ae94-271a-42db-bbdc-6d02839e95aa'::uuid, 'F-DAI-CHZ'),  -- Pizzarella Cheese (AUTO)

  -- ── F-DAI-BTR: Butter ──────────────────────────────────────
  ('b142f79c-13a9-49ba-bea0-5d0e343e224b'::uuid, 'F-DAI-BTR'),  -- Anchor Salted Butter (AUTO)

  -- ── F-DAI-MLK: Milk & Cream ────────────────────────────────
  ('298f99c3-7a5b-4430-b4ed-d0e276beed4f'::uuid, 'F-DAI-MLK'),  -- Meiji Fresh Milk 5L

  -- ── F-DAI-YGT: Yogurt ──────────────────────────────────────
  ('9e1a049f-3e02-4c96-8391-213aa943de76'::uuid, 'F-DAI-YGT'),  -- Cocobella Coconut Yoghurt

  -- ── F-DAI-OIL: Cooking Oils ────────────────────────────────
  ('7de7d5ec-afb0-4b5d-9d3c-132be7574780'::uuid, 'F-DAI-OIL'),  -- Chabroso Virgin Olive Oil (AUTO)

  -- ── F-GRN-RIC: Rice & Pseudocereals ────────────────────────
  ('0e2589fb-a065-45c4-babd-1f90799baf4c'::uuid, 'F-GRN-RIC'),  -- Buckwheat Groats
  ('e1b7b8a6-adf1-4bf3-a445-b7815807092f'::uuid, 'F-GRN-RIC'),  -- Roasted Rice 250g

  -- ── F-BKR-FLR: Flours ──────────────────────────────────────
  ('fded7415-33bb-4222-8ca7-0d5ea61f3c3f'::uuid, 'F-BKR-FLR'),  -- Venus Bread Flour
  ('8ce3f40a-4092-4805-81c4-c4c97d3ddbab'::uuid, 'F-BKR-FLR'),  -- JADE LEAF Rice Flour 1kg
  ('90dfae78-ab82-4f87-9aab-07338ce0be30'::uuid, 'F-BKR-FLR'),  -- Whole Wheat Flour (AUTO)
  ('242f494f-557e-4723-a142-1c2fb9401e65'::uuid, 'F-BKR-FLR'),  -- White Swan Bread Flour (AUTO)
  ('c156d269-4f6a-4d41-9c10-c765211f47b2'::uuid, 'F-BKR-FLR'),  -- ARO Rice Flour (AUTO)
  ('92d75f12-ea74-438e-9c5b-06d054f2c8ce'::uuid, 'F-BKR-FLR'),  -- Aroi Rice Flour (AUTO)
  ('1c8cfb26-0dcb-4bd0-be17-25fb1a29a7a6'::uuid, 'F-BKR-FLR'),  -- Bread Flour White Swan 10kg (AUTO)
  ('bbc45810-ec4f-4df9-8a20-7945eab2e393'::uuid, 'F-BKR-FLR'),  -- Bai Yok Rice Flour (AUTO)

  -- ── F-NTS-NUT: Tree Nuts ───────────────────────────────────
  ('bd387d4c-62d9-47a7-8629-a3506e14130a'::uuid, 'F-NTS-NUT'),  -- Almond Powder 500g
  ('45246935-74e2-4496-97c1-6f07ab768aba'::uuid, 'F-NTS-NUT'),  -- Raw Pistachios 250g
  ('dcf5dd51-6e5b-421b-9c31-aea726fbccd8'::uuid, 'F-NTS-NUT'),  -- Cashew Nuts 300g (AUTO)

  -- ── F-NTS-BUT: Nut Butters ─────────────────────────────────
  ('670ec902-730b-4183-ad5b-88606c2c00a9'::uuid, 'F-NTS-BUT'),  -- Nutella Hazelnut Spread

  -- ── F-NTS-SDS: Seeds ───────────────────────────────────────
  ('1defb02a-2a4d-47e1-982f-5df2e250cd88'::uuid, 'F-NTS-SDS'),  -- Baked Pumpkin Seeds (AUTO)

  -- ── F-SPC-DRY: Dry Spices & Herbs ──────────────────────────
  ('6e7281b7-8bd7-44d6-b8c4-40149a2dca65'::uuid, 'F-SPC-DRY'),  -- Sumac Powder
  ('96f3081a-40d7-4a11-855a-9a5cbfb479f3'::uuid, 'F-SPC-DRY'),  -- Za'atar Spice Mix

  -- ── F-SPC-SWT: Sweeteners ──────────────────────────────────
  ('8000c678-12af-4159-bcdd-732af8e3e194'::uuid, 'F-SPC-SWT'),  -- ARO Pure Honey
  ('4a3016f6-c387-44b9-96c5-fd30ca8d531c'::uuid, 'F-SPC-SWT'),  -- LIN Icing Sugar
  ('7873308b-8ec8-40de-bbe6-36d8d18003b7'::uuid, 'F-SPC-SWT'),  -- Mitr Phol Sugar Base
  ('0835fe7a-8b68-4831-975b-7a69086c4b20'::uuid, 'F-SPC-SWT'),  -- Maple Syrup (AUTO)
  ('fee1ce3c-bd4e-431a-8547-e027bc9fa99e'::uuid, 'F-SPC-SWT'),  -- Black Strap Molasses (AUTO)

  -- ── F-SPC-STR: Starches & Thickeners ───────────────────────
  ('efdc00f6-3d9c-465d-aa0a-833c2fd729d0'::uuid, 'F-SPC-STR'),  -- JADE LEAF Potato Starch
  ('75b2e258-8fdf-4a54-b45d-0ea91d7bb088'::uuid, 'F-SPC-STR'),  -- Tapioca Starch (AUTO)

  -- ── F-FRM-PKL: Pickled (Olives) ────────────────────────────
  ('2875b258-6728-4bc0-b343-373dd9780e55'::uuid, 'F-FRM-PKL'),  -- CRESPO Black Pitted Olive
  ('c33ce50c-031e-4607-8f0c-5502b78cb2d3'::uuid, 'F-FRM-PKL'),  -- Kalamata Olives
  ('cf6d6a77-a6b6-4ea8-b641-9c8f2a3cd9b6'::uuid, 'F-FRM-PKL'),  -- Crispy Pitted Olives (AUTO)
  ('94f41f5d-4eb4-4de4-8d83-99b7428c7034'::uuid, 'F-FRM-PKL'),  -- CRESPO Black Olive (AUTO)
  ('0a05d76e-0fdd-4409-a11c-7fb5f288f089'::uuid, 'F-FRM-PKL'),  -- KRISPO Black Olives (AUTO)

  -- ── F-FRM-CND: Canned Goods ────────────────────────────────
  ('1c2b7523-5e56-4d83-9dc4-725581dbd802'::uuid, 'F-FRM-CND'),  -- Fine Tomato Puree (AUTO)
  ('0b004a01-c3b5-451d-8f18-54b09220831c'::uuid, 'F-FRM-CND'),  -- Strawberry Jam (AUTO)

  -- ── F-SAU-PST: Pastes (Condiments) ─────────────────────────
  ('874c7563-6698-48d3-97e5-8eb3cff35210'::uuid, 'F-SAU-PST'),  -- Pomegranate Molasses

  -- ── F-BKR-BKP: Baking Agents ───────────────────────────────
  ('103871d4-aa62-4196-a913-f4ca5d65dee9'::uuid, 'F-BKR-BKP'),  -- McCormick Vanilla Flavor (AUTO)

  -- ── F-BEV-JCE: Juice Bases ─────────────────────────────────
  ('f7649605-5947-450b-81ec-e9f9dcc262ba'::uuid, 'F-BEV-JCE'),  -- Frozen Lemon Juice (AUTO)
  ('1b00588b-6ad5-4f60-b1eb-83c4946e4723'::uuid, 'F-BEV-JCE'),  -- Chardonnay (cooking wine)

  -- ── NF-PKG-CNT: Containers & Bowls ─────────────────────────
  ('0049d80d-ccac-44ea-b86b-ba481f088e80'::uuid, 'NF-PKG-CNT'),  -- FEST Paper Lunch Box

  -- ── NF-PKG-BAG: Bags & Wrap ────────────────────────────────
  ('9e335d56-ec54-47b1-aa4a-e5c6c9a60b4c'::uuid, 'NF-PKG-BAG'),  -- MAKRO Shopping Bag (AUTO)
  ('ebd9d8d8-ea9b-4811-a3ca-ff93a0b0618a'::uuid, 'NF-PKG-BAG'),  -- Paper Bag Kraft Brown (AUTO)

  -- ── NF-DSP-GLV: Gloves ─────────────────────────────────────
  ('f3b69792-619b-439e-8b35-bfb06b5fe7cf'::uuid, 'NF-DSP-GLV'),  -- ARO Plastic Gloves
  ('a11ee320-ba56-426f-acd9-4eadfcb825df'::uuid, 'NF-DSP-GLV')   -- SATORY Exam Gloves
)
UPDATE public.nomenclature n
   SET category_id = pc.id,
       updated_at  = now()
  FROM mapping m
  JOIN public.product_categories pc ON pc.code = m.cat_code
 WHERE n.id = m.item_id
   AND n.category_id IS NULL;  -- idempotency

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '204_backfill_raw_category_ids.sql',
  'claude-code',
  NULL,
  'Backfill category_id for 111 RAW items. 16 skipped (merged/garbage/unidentifiable). Task fb05cbec.'
) ON CONFLICT (filename) DO NOTHING;
