-- ═══════════════════════════════════════════════════════════════
-- Migration 097: Add context_files to business_tasks
-- Phase B: Computed State (Scoped Context prep)
-- Spec: docs/plans/spec-ai-native-ops.md (B6)
-- ═══════════════════════════════════════════════════════════════
--
-- context_files: JSON array of repo-relative paths that agents
-- should load when working on this task. COO fills this field
-- when creating or triaging tasks. Code agents use get_task()
-- to read context_files and load ONLY those files.
--
-- Example: ["docs/plans/spec-kitchen-ux-v2.md", "docs/domain/nomenclature.md"]
-- ═══════════════════════════════════════════════════════════════

-- 1. Add column (safe: IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'business_tasks'
      AND column_name = 'context_files'
  ) THEN
    ALTER TABLE public.business_tasks
      ADD COLUMN context_files jsonb DEFAULT '[]'::jsonb;

    COMMENT ON COLUMN public.business_tasks.context_files IS
      'JSON array of repo-relative file paths for scoped context loading. COO fills at triage.';
  END IF;
END
$$;

-- 2. Self-register in migration_log (Boris Rule #16)
INSERT INTO migration_log (version, name, description, status)
VALUES (
  97,
  'context_files',
  'Add context_files JSONB column to business_tasks for scoped agent context (Phase B)',
  'applied'
)
ON CONFLICT (version) DO NOTHING;
