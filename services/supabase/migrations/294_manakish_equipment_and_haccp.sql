-- 294_manakish_equipment_and_haccp.sql
-- Enrich manakish-family recipe steps: link equipment + flag HACCP CCPs.
--
-- Data-only follow-up to 292/293. Does NOT touch frontend (the L1/L2 display
-- work is owned by a separate session). Backward-scheduling / KDS Gantt and the
-- step cards read recipes_flow.equipment_id; food-safety relies on is_ccp.
--
--   1. equipment_id by operation_name (only where currently NULL — never
--      overwrites an existing assignment):
--        Boiling / Griddling / Pre-baking  -> Gas Range (4-Burner)
--        Pressing / Peeling / Mashing /
--          Mixing / Portioning / Assembly   -> Manual (no equipment)
--        Blast Freeze                       -> Blast Chiller / Shock Freezer
--        Storage                            -> Under counter freezer
--        Baking (service)                   -> HIGH SPEED OVEN (Merrychef)
--   2. CCP flags on the two food-safety-critical steps of a freeze→reheat dish:
--        Blast Freeze     -> freeze core solid
--        Baking (service) -> reheat core ≥ 75°C
--
-- Scope: 4 active manakish + both manakish doughs.
-- Author: chef agent · 2026-06-16

BEGIN;

WITH fam AS (
  SELECT id FROM nomenclature
  WHERE product_code IN (
    'SALE-MANAISH_ZAATAR_GF', 'SALE-MANAISH_ZAATAR_CHEESE_GF',
    'SALE-MANAISH_CHEESE_GF', 'SALE-MANAISH_SALAMI_GF',
    'PF-MANAISH_DOUGH_POTATO', 'PF-MANAISH_DOUGH_WW'
  )
)
UPDATE recipes_flow rf
SET equipment_id = CASE
      WHEN rf.operation_name IN ('Boiling', 'Griddling', 'Pre-baking dough')
        THEN '5519013d-1a2f-46fe-8003-0751ad8f1753'::uuid   -- Gas Range (4-Burner)
      WHEN rf.operation_name = 'Blast Freeze'
        THEN '1b007995-1061-412c-9935-7273508a2fb9'::uuid   -- Blast Chiller / Shock Freezer
      WHEN rf.operation_name = 'Storage'
        THEN 'eea69b62-c390-4d76-9e95-f54605fa99ed'::uuid   -- Under counter freezer
      WHEN rf.operation_name ILIKE 'Baking%service%'
        THEN 'ee9dd87a-d624-47fb-a4b8-d2d4b9184044'::uuid   -- HIGH SPEED OVEN (Merrychef)
      ELSE '5e0faa74-898d-40a7-a77d-7d5a723f6429'::uuid     -- Manual (no equipment)
    END,
    updated_at = now()
WHERE rf.nomenclature_id IN (SELECT id FROM fam)
  AND rf.equipment_id IS NULL;

-- ── HACCP CCPs ───────────────────────────────────────────────────────────
WITH fam AS (
  SELECT id FROM nomenclature
  WHERE product_code IN (
    'SALE-MANAISH_ZAATAR_GF', 'SALE-MANAISH_ZAATAR_CHEESE_GF',
    'SALE-MANAISH_CHEESE_GF', 'SALE-MANAISH_SALAMI_GF'
  )
)
UPDATE recipes_flow rf
SET is_ccp = true,
    ccp_check_text = CASE
      WHEN rf.operation_name = 'Blast Freeze'
        THEN 'CCP — freeze core solid in blast chiller before storage. Verify no warm centre.'
      WHEN rf.operation_name ILIKE 'Baking%service%'
        THEN 'CCP — reheat from frozen to core ≥ 75°C. Serve immediately; do not hold.'
    END,
    updated_at = now()
WHERE rf.nomenclature_id IN (SELECT id FROM fam)
  AND (rf.operation_name = 'Blast Freeze' OR rf.operation_name ILIKE 'Baking%service%');

INSERT INTO migration_log (filename, status, applied_by, notes)
VALUES (
  '294_manakish_equipment_and_haccp.sql', 'success', 'chef-agent',
  'Link equipment_id by operation (Gas Range / Blast Chiller / UC Freezer / Merrychef HS Oven / Manual) where null, on 4 manakish + 2 doughs; flag Blast Freeze + Merrychef-service as HACCP CCPs on the 4 manakish.'
);

COMMIT;
