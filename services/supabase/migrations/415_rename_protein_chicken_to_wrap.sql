-- 415_rename_protein_chicken_to_wrap.sql
--
-- Rename SALE-PROTEIN_MEAL_CHICKEN from "Chicken ShishTawook" to "Chicken ShishTawook Wrap"

BEGIN;

UPDATE nomenclature
SET name = 'Chicken ShishTawook Wrap'
WHERE product_code = 'SALE-PROTEIN_MEAL_CHICKEN';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '415_rename_protein_chicken_to_wrap.sql',
  'claude-code',
  NULL,
  'Rename SALE-PROTEIN_MEAL_CHICKEN to Chicken ShishTawook Wrap on POS'
)
ON CONFLICT DO NOTHING;

COMMIT;
