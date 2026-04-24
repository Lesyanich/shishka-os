-- ═══════════════════════════════════════════════════════════════════
-- Migration 159: Add owner column to business_tasks
-- Task: 94721aa8 — Roadmap v1 owner chips (SPEC §4c)
-- ═══════════════════════════════════════════════════════════════════
-- Roadmap prototype renders a 20px owner chip on every task row.
-- Allowed owners: lesia, bas, coo, kw, unassigned.
--
-- `assigned_to` is a free-text field and cannot be trusted for UI
-- colour mapping. This migration introduces a constrained `owner`
-- column and backfills it from the existing `assigned_to` values.
--
-- Chip colour mapping (frontend):
--   lesia      → --amber-glow
--   bas        → --brick-bright
--   kw         → --forest-soft
--   coo        → --cream-dim
--   unassigned → no chip / neutral
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Add owner column with check constraint ────────────────────
ALTER TABLE public.business_tasks
  ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'unassigned'
    CHECK (owner IN ('lesia', 'bas', 'coo', 'kw', 'unassigned'));

COMMENT ON COLUMN public.business_tasks.owner IS
  'Constrained ownership for UI chip rendering (roadmap v1). '
  'Derived from assigned_to at migration time; kept in sync by admin UI going forward.';

-- ─── 2. Backfill from assigned_to (case-insensitive) ──────────────
UPDATE public.business_tasks
SET owner = CASE lower(coalesce(assigned_to, ''))
  WHEN 'lesia' THEN 'lesia'
  WHEN 'bas'   THEN 'bas'
  WHEN 'coo'   THEN 'coo'
  WHEN 'kw'    THEN 'kw'
  ELSE 'unassigned'
END
WHERE owner = 'unassigned';

-- ─── 3. Partial index for the common "show my tasks" filter ───────
CREATE INDEX IF NOT EXISTS idx_business_tasks_owner
  ON public.business_tasks(owner)
  WHERE owner <> 'unassigned';

-- ─── Migration log ────────────────────────────────────────────────
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '159_business_tasks_owner.sql',
  'claude-code',
  'Add owner enum column to business_tasks for roadmap v1 owner chips; backfilled from assigned_to.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
