-- 105: brain_quality_tests — seed 6 known-answer pairs for regression suite
--
-- Refs: MC task 087e6502, docs/plans/spec-brain-feedback-loop.md §4.3
-- Sources:
--   L2 Q1-Q3: docs/plans/spec-lightrag.md (quality gate)
--   L1 Q1-Q3: docs/plans/spec-mempalace-phase2.md Section 6
--
-- Keywords verified against live brain responses (2026-04-11).
-- Adjust expected_keywords if brain corpus changes significantly.

BEGIN;

-- Guard: only seed if table is empty (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.brain_quality_tests LIMIT 1) THEN
    RAISE NOTICE 'brain_quality_tests already seeded — skipping';
    RETURN;
  END IF;

  -- L2 (LightRAG) tests — from spec-lightrag.md quality gate
  INSERT INTO public.brain_quality_tests (layer, query, expected_keywords) VALUES
    ('L2',
     'What ingredients are forbidden in Shishka kitchen?',
     ARRAY['msg', 'artificial', 'preservative']),
    ('L2',
     'What fats are allowed for cooking?',
     ARRAY['olive', 'coconut', 'ghee']),
    ('L2',
     'What is the language contract?',
     ARRAY['english', 'storage', 'russian', 'conversation']);

  -- L1 (MemPalace) tests — from spec-mempalace-phase2.md Section 6
  INSERT INTO public.brain_quality_tests (layer, query, expected_keywords) VALUES
    ('L1',
     'What was the storage architecture decision?',
     ARRAY['local', 'mac', 'age', 'encrypted']),
    ('L1',
     'Why did we pick MemPalace over Graphify for Phase 2?',
     ARRAY['cross-session', 'context loss']),
    ('L1',
     'What was the 1Password decision?',
     ARRAY['defer', 'keychain']);

END $$;

-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '105_brain_quality_tests_seed.sql',
  'claude-code',
  NULL,
  'Seed 6 known-answer regression tests for brain quality (MC 087e6502)'
)
ON CONFLICT DO NOTHING;

COMMIT;
