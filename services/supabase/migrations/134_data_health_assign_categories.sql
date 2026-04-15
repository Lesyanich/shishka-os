-- ============================================================
-- Migration 134: Data Health — Assign categories to 14 remaining RAW items
--
-- Block 4 of the follow-up cleanup for spec:
--   docs/superpowers/specs/2026-04-14-data-health-makro-design.md
--
-- Problem: 14 active RAW items still have category_id IS NULL. All are curated
-- ingredients (not auto-generated). Manual mapping below — each item paired
-- with its L3 category in product_categories based on product name/content.
--
-- Safety:
--   - Uses a CTE + JOIN so an unknown category code raises no error but also
--     updates nothing (the UPDATE touches only items whose mapping resolved)
--   - Idempotent — re-running is a no-op (nothing to update once assigned)
-- ============================================================

WITH mapping (item_id, cat_code) AS (VALUES
  -- Vegetables
  ('4328e12e-4315-4ff2-9de5-938cc5676074'::uuid, 'F-PRD-VEG'),  -- Okra 300g per pack
  ('2529fff0-bb29-4828-a9ab-8f90249430a2'::uuid, 'F-PRD-VEG'),  -- Sunflower Sprouts 500g

  -- Fruit
  ('d4bbe782-d697-47f6-9cd6-d0f87d86ed32'::uuid, 'F-PRD-FRU'),  -- Cantaloupe Chanslady per kg

  -- Coffee
  ('58b5c15b-cfc0-45e1-b3b3-dbba4aa564b7'::uuid, 'F-BEV-COF'),  -- Nescafe Red Cup 2000X1
  ('cfea210f-5e8f-4488-aaf8-b9434e599918'::uuid, 'F-BEV-COF'),  -- Boncafe Espresso Beans 250G

  -- Juice bases
  ('7008cb47-822b-41f4-b349-68e79f9f91c5'::uuid, 'F-BEV-JCE'),  -- Mixed Fruit Juice CS
  ('4111873b-d927-41ab-b151-44020330ba53'::uuid, 'F-BEV-JCE'),  -- Mixed Fruit Juice _CS

  -- Tea & herbal (dried flowers for infusions)
  ('81c692db-adde-43fa-b89d-439693b1f7c5'::uuid, 'F-BEV-TEA'),  -- Dried Chrysanthemum 300g
  ('191dd692-0174-4e15-b25f-017c6357eafb'::uuid, 'F-BEV-TEA'),  -- Dried Roselle 200g

  -- Legumes
  ('c200fd31-898e-4997-807f-88d5ba0f1cbd'::uuid, 'F-GRN-LGM'),  -- Mixed Beans 5 Color 500g

  -- Red meat / cured
  ('1173403d-7828-46b7-ae84-7e05f413680c'::uuid, 'F-PRO-RED'),  -- TGM Italian Salami 100g x1

  -- Dry spices
  ('df4e54f6-3f3f-4b84-8603-95c64b4df5fb'::uuid, 'F-SPC-DRY'),  -- MDH Bombay Biryani Masala
  ('d7e5000c-db71-4676-bbca-6507e7bdd51b'::uuid, 'F-SPC-DRY'),  -- Fenugreek (Hilba)

  -- Tree nuts
  ('1a0fc0ff-58b4-4e30-95f9-e9e370a61d0f'::uuid, 'F-NTS-NUT')   -- Roasted Chestnuts
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
  '134_data_health_assign_categories.sql',
  'claude-code',
  NULL,
  'Assign L3 product_categories to 14 curated RAW items that had no category. Keyword-based mapping.'
) ON CONFLICT (filename) DO NOTHING;
