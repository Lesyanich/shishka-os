-- 299_fix_nomenclature_type_anomalies.sql
-- Data-health (data_health project): align nomenclature.type with the product_code
-- prefix where it drifted. Pure attribute fix by id — no rename, no Loyverse/site impact.
--
--   • PF-CRUNCH_PUMPKIN: type 'good' -> 'semi_finished' (it is a PF, like every other PF-*)
--   • 8 SALE coffee/tea items with type NULL -> 'dish' (every other SALE-* is 'dish')
--
-- Both values pass nomenclature_type_check. Reversible.

BEGIN;

UPDATE nomenclature
   SET type = 'semi_finished', updated_at = now()
 WHERE product_code = 'PF-CRUNCH_PUMPKIN'
   AND type IS DISTINCT FROM 'semi_finished';

UPDATE nomenclature
   SET type = 'dish', updated_at = now()
 WHERE product_code LIKE 'SALE-%'
   AND type IS NULL;

INSERT INTO migration_log (filename, status)
VALUES ('299_fix_nomenclature_type_anomalies.sql', 'success')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
