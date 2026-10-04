-- 404_add_mayonnaise_soy_sauce.sql
--
-- Add Mayonnaise and Soy Sauce as SALE items in KP-FIN-SDR (Sauces)

BEGIN;

INSERT INTO nomenclature (
  id, product_code, name, category_id, is_available,
  display_order, price, calories, protein, carbs, fat,
  is_web_visible, pos_status, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'SALE-SAUCE_MAYONNAISE',
  'Mayonnaise',
  (SELECT id FROM product_categories WHERE code = 'KP-FIN-SDR'),
  true,
  4,
  0,
  0,
  0,
  0,
  0,
  true,
  'synced'::pos_status_enum,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM nomenclature WHERE product_code = 'SALE-SAUCE_MAYONNAISE'
);

INSERT INTO nomenclature (
  id, product_code, name, category_id, is_available,
  display_order, price, calories, protein, carbs, fat,
  is_web_visible, pos_status, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'SALE-SAUCE_SOY',
  'Soy Sauce',
  (SELECT id FROM product_categories WHERE code = 'KP-FIN-SDR'),
  true,
  6,
  0,
  0,
  0,
  0,
  0,
  true,
  'synced'::pos_status_enum,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM nomenclature WHERE product_code = 'SALE-SAUCE_SOY'
);

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '404_add_mayonnaise_soy_sauce.sql',
  'claude-code',
  NULL,
  'Add Mayonnaise (4) and Soy Sauce (6) to KP-FIN-SDR sauces'
)
ON CONFLICT DO NOTHING;

COMMIT;
