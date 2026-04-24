-- ═══════════════════════════════════════════════════════════════════
-- Migration 160: Add is_critical_path flag to business_tasks
-- Task: 4b3adb59 — Roadmap v1 "Before Recipe Lock" must-do list (SPEC §4a)
-- ═══════════════════════════════════════════════════════════════════
-- The "Before Recipe Lock" primary panel on /roadmap shows the five
-- tasks that MUST ship before phase-0 lock. Flagging them explicitly
-- beats deriving from sprint/tag heuristics — the panel is load-bearing
-- and must not silently pick the wrong rows.
--
-- Frontend query:
--   SELECT * FROM business_tasks
--   WHERE tags @> ARRAY['phase-0'] AND is_critical_path = true
--   ORDER BY due_date ASC NULLS LAST LIMIT 5;
--
-- Rule (SPEC §4a): if a phase ever has >5 critical_path items, split
-- the phase. Not enforced at DB level — it's a planning signal.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Add is_critical_path column ───────────────────────────────
ALTER TABLE public.business_tasks
  ADD COLUMN IF NOT EXISTS is_critical_path boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.business_tasks.is_critical_path IS
  'True if this task is on the critical path for its phase lock. '
  'Powers the roadmap "Before Recipe Lock" must-do panel.';

-- ─── 2. Partial index for the panel query ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_business_tasks_critical_path
  ON public.business_tasks(due_date NULLS LAST)
  WHERE is_critical_path = true;

-- ─── Migration log ────────────────────────────────────────────────
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '160_business_tasks_critical_path.sql',
  'claude-code',
  'Add is_critical_path boolean to business_tasks for roadmap must-do panel.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
