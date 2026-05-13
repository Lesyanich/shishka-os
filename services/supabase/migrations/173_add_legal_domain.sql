-- ============================================================
-- Migration 173: add 'legal' to business_tasks.domain CHECK constraint
--
-- Spec:  docs/superpowers/specs/2026-05-13-lawyer-agent-design.md
-- Plan:  docs/superpowers/plans/2026-05-13-lawyer-agent.md
-- MC:    b27168ce-fdc6-42eb-8fe3-bae55a089575 (Lawyer Agent Phase 1)
-- Predecessor: existing constraint covers 8 domains
--   (kitchen, procurement, finance, marketing, ops, sales, strategy, tech)
--
-- Purpose: enable /lawyer agent to emit MC tasks with domain="legal"
--          for AGM, FS filings, work permit renewals, VAT/PND deadlines.
--
-- Date: 2026-05-13
-- ============================================================

BEGIN;

-- Drop existing CHECK, recreate with 'legal' appended
ALTER TABLE business_tasks DROP CONSTRAINT IF EXISTS business_tasks_domain_check;
ALTER TABLE business_tasks ADD CONSTRAINT business_tasks_domain_check
  CHECK (domain = ANY (ARRAY[
    'kitchen'::text,
    'procurement'::text,
    'finance'::text,
    'marketing'::text,
    'ops'::text,
    'sales'::text,
    'strategy'::text,
    'tech'::text,
    'legal'::text
  ]));

-- Self-register (RULE-MIGRATION-TRACKING)
INSERT INTO migration_log (filename, applied_by, checksum)
VALUES ('173_add_legal_domain.sql', 'manual', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- Verification queries (run after apply):
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'business_tasks'::regclass
--    AND conname = 'business_tasks_domain_check';
-- Expected: array includes 'legal'.
--
-- Smoke test (rollback afterwards):
-- INSERT INTO business_tasks (id, title, domain, status, created_by)
--   VALUES (gen_random_uuid(), 'mig-173 smoke', 'legal', 'inbox', 'mig-173-smoke');
-- DELETE FROM business_tasks WHERE created_by = 'mig-173-smoke';
