-- Migration 193 — swap bom_structures.slot CHECK to lego vocabulary
-- Old: base / protein / finish / accent / dressing (full set from mig 145)
-- New: base / protein / greens / topping / sauce  (CEO ratified 2026-05-17)
-- Data remap (pre-CHECK swap): production has 2 rows in old vocab found on 2026-05-18:
--   1× accent on PF-CRUNCH_PUMPKIN (RAW-SALT-SEA)  → topping
--   1× finish on SALE-PUMPKIN_SOUP (PF-CRUNCH_PUMPKIN) → topping
-- (Initial verification missed these — Explore agent inspected source state, not live DB.)
-- Note: plan referred to this as mig 192; renumbered to 193 because
--       192_fix_cheese_costs_merge_duplicates.sql was already merged (PR #192).

BEGIN;

-- Step 1: remap old-vocab rows to new vocab BEFORE flipping the CHECK.
-- Idempotent: re-runs do nothing (rows already in new vocab).
UPDATE bom_structures
SET slot = CASE slot
  WHEN 'finish'   THEN 'topping'
  WHEN 'accent'   THEN 'topping'
  WHEN 'dressing' THEN 'sauce'
  ELSE slot
END
WHERE slot IN ('finish','accent','dressing');

-- Step 2: swap the CHECK constraint.
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
  'Swap bom_structures.slot CHECK from (finish/accent/dressing) to lego vocab (greens/topping/sauce). CEO ratified 2026-05-17. Data remap: 2 rows in prod migrated (finish→topping, accent→topping).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
