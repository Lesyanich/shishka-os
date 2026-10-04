-- 401_rename_protein_chicken_tawook.sql
--
-- Rename SALE-PROTEIN_MEAL_CHICKEN from "Chicken ShishTawook Meal" to "Chicken ShishTawook"

BEGIN;

UPDATE nomenclature
SET name = 'Chicken ShishTawook'
WHERE product_code = 'SALE-PROTEIN_MEAL_CHICKEN';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '401_rename_protein_chicken_tawook.sql',
  'claude-code',
  NULL,
  'Rename SALE-PROTEIN_MEAL_CHICKEN to Chicken ShishTawook'
)
ON CONFLICT DO NOTHING;

COMMIT;
