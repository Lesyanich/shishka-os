-- 100: Fix spec_file path for 4 Kitchen UX v2 tasks
-- Tasks referenced 'docs/plans/spec-kitchen-ux-v2.md' but the actual file lives
-- at 'docs/projects/app/plans/spec-kitchen-ux-v2.md'. Found during context_files
-- audit (MC task e1f6963c). Fix tracked as MC task f3c13234.

UPDATE business_tasks
SET spec_file = 'docs/projects/app/plans/spec-kitchen-ux-v2.md'
WHERE id IN (
  'd7bca994-f8f8-49ab-8cf3-341419417c4c',  -- Kitchen UX v2: Phase B — Planner + Staff Assignment
  '7d49630d-d337-489b-9de6-ecb71540b696',  -- Kitchen UX v2: Phase C — Cook Feedback
  '3b3a6e5b-f6cf-4a1b-af60-824e973a4283',  -- Kitchen UX v2: Phase D — Live Kitchen View
  'a551a520-3d54-490e-9aa4-a30c398a4a85'   -- Kitchen UX v2: Phase E — BOM Hub Enhancement
)
  AND spec_file = 'docs/plans/spec-kitchen-ux-v2.md';

-- Self-register (Boris Rule #16 / engineering-rules)
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '100_fix_kitchen_ux_v2_spec_path.sql',
  'claude-code',
  md5('100_fix_kitchen_ux_v2_spec_path'),
  'Fix spec_file path for 4 Kitchen UX v2 tasks (MC f3c13234)'
)
ON CONFLICT DO NOTHING;
