-- Migration 077: Verify & fix is_passive in recipes_flow seed data
-- =====================================================================
-- Context: Chef reported all steps return is_passive=false via MCP.
-- Root cause: most likely old MCP build (pre-074 code). But as a
-- safety net, this migration ensures the DB data is correct.
-- Idempotent: only UPDATEs rows where is_passive differs from expected.

-- ─── 1. Fix is_passive for PF-CHICKEN_GRILL_NEUTRAL ──────────────

UPDATE recipes_flow
SET is_passive = true
WHERE nomenclature_id = (
  SELECT id FROM nomenclature WHERE product_code = 'PF-CHICKEN_GRILL_NEUTRAL' LIMIT 1
)
AND step_order IN (2, 3, 5, 8, 9)
AND is_passive = false;

-- ─── 2. Ensure active steps stay active ──────────────────────────

UPDATE recipes_flow
SET is_passive = false
WHERE nomenclature_id = (
  SELECT id FROM nomenclature WHERE product_code = 'PF-CHICKEN_GRILL_NEUTRAL' LIMIT 1
)
AND step_order IN (1, 4, 6, 7)
AND is_passive = true;

-- ─── 3. Verify (raises NOTICE) ──────────────────────────────────

DO $$
DECLARE
  r RECORD;
  expected_passive INT[] := ARRAY[2,3,5,8,9];
BEGIN
  FOR r IN
    SELECT rf.step_order, rf.operation_name, rf.is_passive,
           (rf.step_order = ANY(expected_passive)) AS expected_passive
    FROM recipes_flow rf
    JOIN nomenclature n ON rf.nomenclature_id = n.id
    WHERE n.product_code = 'PF-CHICKEN_GRILL_NEUTRAL'
    ORDER BY rf.step_order
  LOOP
    IF r.is_passive != r.expected_passive THEN
      RAISE WARNING 'Step % (%) is_passive=% but expected=%',
        r.step_order, r.operation_name, r.is_passive, r.expected_passive;
    END IF;
  END LOOP;
  RAISE NOTICE 'is_passive verification complete for PF-CHICKEN_GRILL_NEUTRAL';
END $$;
