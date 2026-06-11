-- ═══════════════════════════════════════════════════════════
-- 235_protein_peach_half_milk_half_yogurt.sql
-- Protein Peach base tuned: 150g Greek yogurt was too thick. Split 50/50 —
-- 75 g Greek yogurt + 75 ml cow milk (like Peach Apricot). Base modifier list
-- stays "from Yogurt" (yogurt is the premium component). CEO 2026-06-02.
-- ═══════════════════════════════════════════════════════════

BEGIN;

UPDATE bom_structures
SET quantity_per_unit = 0.075
WHERE parent_id = (SELECT id FROM nomenclature WHERE product_code = 'SALE-SMOOTHIE_PROTEIN_PEACH')
  AND ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-YOGURT-GREEK');

INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit)
SELECT
  (SELECT id FROM nomenclature WHERE product_code = 'SALE-SMOOTHIE_PROTEIN_PEACH'),
  (SELECT id FROM nomenclature WHERE product_code = 'RAW-MILK-COW'),
  0.075
WHERE NOT EXISTS (
  SELECT 1 FROM bom_structures
  WHERE parent_id = (SELECT id FROM nomenclature WHERE product_code = 'SALE-SMOOTHIE_PROTEIN_PEACH')
    AND ingredient_id = (SELECT id FROM nomenclature WHERE product_code = 'RAW-MILK-COW')
);

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '235_protein_peach_half_milk_half_yogurt.sql',
  'claude-code',
  NULL,
  'Protein Peach base: 75g Greek yogurt + 75ml cow milk (was 150g yogurt). Base list stays from Yogurt.'
)
ON CONFLICT DO NOTHING;

COMMIT;
