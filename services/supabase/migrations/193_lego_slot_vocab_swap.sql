-- Migration 193 — swap bom_structures.slot CHECK to lego vocabulary
-- Old: base / protein / finish / accent / dressing (set in mig 145)
-- New: base / protein / greens / topping / sauce  (CEO ratified 2026-05-17)
-- Safe: zero rows have non-NULL slot today; verified via Explore agent on 2026-05-17.
-- Note: plan referred to this as mig 192; renumbered to 193 because
--       192_fix_cheese_costs_merge_duplicates.sql was already merged (PR #192).

BEGIN;

ALTER TABLE bom_structures
  DROP CONSTRAINT bom_structures_slot_check;

ALTER TABLE bom_structures
  ADD CONSTRAINT bom_structures_slot_check
  CHECK (slot IS NULL OR slot IN ('base','protein','greens','topping','sauce'));

COMMENT ON COLUMN bom_structures.slot IS
  'Lego/bowl slot grouping for assembly. Vocabulary swapped 2026-05-17 from (finish/accent/dressing) to (greens/topping/sauce). Aligned with nomenclature_modifier_options.slot (mig 194).';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '193_lego_slot_vocab_swap.sql',
  'claude-code',
  'Swap bom_structures.slot CHECK from (finish/accent/dressing) to lego vocab (greens/topping/sauce). CEO ratified 2026-05-17. Zero non-NULL rows affected.'
);

COMMIT;
