-- 098: Seed context_files for HIGH priority tasks (Phase C: Scoped Context)
-- context_files tells agents which files to load for scoped context loading
-- Column is JSONB (added in 097), so values must be JSON arrays

-- Receipt OCR Model Selector (a494bea8)
UPDATE business_tasks SET context_files = '["docs/plans/spec-receipt-model-selector.md", "agents/finance/AGENT.md", "docs/domain/financial-codes.md", "docs/constitution/p0-rules.md"]'::jsonb
WHERE id = 'a494bea8-c29c-4365-a4aa-fc6a2c8a1c90';

-- Benchmark Gemma 4 for Thai receipt OCR (0bc0c807)
UPDATE business_tasks SET context_files = '["docs/plans/spec-receipt-model-selector.md", "agents/finance/AGENT.md"]'::jsonb
WHERE id = '0bc0c807-aa01-413e-b09c-5e801979dafb';

-- Receipt Inbox: validation + confirmation (23198990)
UPDATE business_tasks SET context_files = '["docs/projects/admin/plans/spec-inbox-management.md", "agents/finance/AGENT.md", "docs/domain/financial-codes.md"]'::jsonb
WHERE id = '23198990-8fc7-498d-922d-78be47c800dc';

-- Kitchen UX v2: Phase C — Cook Feedback (7d49630d)
UPDATE business_tasks SET context_files = '["docs/projects/app/plans/spec-kitchen-ux-v2.md", "docs/domain/nomenclature.md", "agents/chef/AGENT.md"]'::jsonb
WHERE id = '7d49630d-d337-489b-9de6-ecb71540b696';

-- Kitchen UX v2: Phase B — Planner + Staff Assignment (d7bca994)
UPDATE business_tasks SET context_files = '["docs/projects/app/plans/spec-kitchen-ux-v2.md", "docs/domain/nomenclature.md"]'::jsonb
WHERE id = 'd7bca994-f8f8-49ab-8cf3-341419417c4c';

-- Phase C: Scoped Context — this task itself (00f7e84f)
UPDATE business_tasks SET context_files = '["docs/plans/spec-ai-native-ops.md", "docs/constitution/p0-rules.md"]'::jsonb
WHERE id = '00f7e84f-be6d-4975-8f02-b2a9080658e5';

-- Phase D: Full Loop (9ae802d7)
UPDATE business_tasks SET context_files = '["docs/plans/spec-ai-native-ops.md", "docs/constitution/p0-rules.md"]'::jsonb
WHERE id = '9ae802d7-8fd5-4c85-a702-3ad085405c0f';

-- Phase D2: Supabase RLS (9df2c5ff)
UPDATE business_tasks SET context_files = '["docs/plans/spec-ai-native-ops.md", "docs/domain/db-contracts.md"]'::jsonb
WHERE id = '9df2c5ff-fb1b-433c-b30d-a100b459ddaf';

-- Self-register (Boris Rule #16)
INSERT INTO migration_log (version, name, description, status)
VALUES (98, 'seed_context_files', 'Seed context_files for HIGH priority tasks (Phase C)', 'applied')
ON CONFLICT (version) DO NOTHING;
