-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 145: BOM composition slots — per-BOM-row ingredient role
-- Part of MC d005e136 (CBS tagging + composition slots, Level 1)
--
-- Context: the Lego Modularity protocol (docs/bible/kitchen-philosophy.md
-- § Protocol 2) organises dishes into modules. A single PF can fill
-- different roles in different dishes — e.g. a citrus-herb oil is the
-- 'finish' in a bowl but the 'dressing' in a salad. Expressing this role
-- on the BOM row (not the nomenclature) captures that per-dish polymorphism.
--
-- Decision (CEO 2026-04-21): slot lives on bom_structures, nullable, with
-- a CHECK constraint for the canonical 5-role vocabulary.
-- Future scorecard RPC (e6ec9fa8) uses this column to score CBS coverage
-- (does the dish have a finish? an accent?).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Add slot column with canonical role CHECK ──
ALTER TABLE bom_structures
  ADD COLUMN IF NOT EXISTS slot TEXT
  CHECK (slot IS NULL OR slot IN ('base', 'protein', 'finish', 'accent', 'dressing'));

COMMENT ON COLUMN bom_structures.slot IS
  'Composition role of this ingredient inside the parent dish. '
  'Canonical vocabulary: base / protein / finish / accent / dressing. '
  'Nullable — slot assignment is progressive, not required. '
  'Per-row (not per-nomenclature) so a PF can play different roles in different dishes.';

-- ── 2. Index for future scorecard queries grouping by slot ──
CREATE INDEX IF NOT EXISTS idx_bom_structures_slot
  ON bom_structures(slot)
  WHERE slot IS NOT NULL;

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '145_bom_composition_slots.sql',
  'claude-code',
  'bom_structures.slot column (nullable, CHECK base/protein/finish/accent/dressing) for per-BOM-row composition role. Enables Detail Drawer scorecard + Lego Modularity audit.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
