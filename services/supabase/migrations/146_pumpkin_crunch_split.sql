-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 146: Split PF-CRUNCH_PUMPKIN from MOD-ANCIENT_CRUNCH
-- Part of MC d005e136 — the immediate-fix item.
--
-- Trigger (from task): MOD-ANCIENT_CRUNCH is one product but represents a
-- category of Finish boosters. The current structure can't express "same
-- CBS role (Finish/Texture/Crunchy), different recipe." PF-CRUNCH_PUMPKIN
-- is the simple single-seed crunch that the pumpkin soup actually uses;
-- MOD-ANCIENT_CRUNCH remains the full seed-mix variant.
--
-- Changes:
--   1. INSERT PF-CRUNCH_PUMPKIN nomenclature (type='good' — semi-finished)
--   2. INSERT BOM: PF-CRUNCH_PUMPKIN = RAW-PUMPKIN-SEEDS + RAW-FINE_SALT
--   3. ADD PF-CRUNCH_PUMPKIN as a BOM child of SALE-PUMPKIN_SOUP (slot='finish')
--   4. ADD PF-PUMPKIN_COCONUT_BASE slot='base' on existing SALE-PUMPKIN_SOUP row
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Seed PF-CRUNCH_PUMPKIN nomenclature ──
-- Following the pattern from 124: type='good', tags applied in Part 3 below.
INSERT INTO nomenclature (product_code, name, type, base_unit) VALUES
  ('PF-CRUNCH_PUMPKIN', 'Toasted Pumpkin Seed Crunch', 'good', 'kg')
ON CONFLICT (product_code) DO NOTHING;

-- Nutrition (toasted pumpkin seeds per 100g)
UPDATE nomenclature
   SET calories = 559, protein = 30.2, carbs = 10.7, fat = 49.1
 WHERE product_code = 'PF-CRUNCH_PUMPKIN'
   AND calories IS NULL;

-- ── 2. BOM for PF-CRUNCH_PUMPKIN (1 kg output) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes, slot)
SELECT p.id, c.id, v.qty, v.loss, v.note, v.slot
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-PUMPKIN-SEEDS', 0.98, NULL::NUMERIC, 'Washed from soup pumpkin, dried & roasted',      'base'::TEXT),
  ('RAW-SALT-SEA',      0.02, NULL::NUMERIC, 'Light seasoning — accent, not balance',           'accent'::TEXT)
) AS v(child_code, qty, loss, note, slot)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'PF-CRUNCH_PUMPKIN'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes,
    slot             = EXCLUDED.slot;

-- ── 3. Tag PF-CRUNCH_PUMPKIN — Finish/Texture/Crunchy ──
-- Uses existing 'boosters' axis markers + new 'texture' role slug.
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id
FROM nomenclature n
CROSS JOIN tags t
WHERE n.product_code = 'PF-CRUNCH_PUMPKIN'
  AND t.slug IN ('texture', 'texture-crunchy', 'zero-waste')
ON CONFLICT (nomenclature_id, tag_id) DO NOTHING;

-- ── 4. Wire PF-CRUNCH_PUMPKIN into SALE-PUMPKIN_SOUP as Finish slot ──
-- Adds the BOM link; keeps the existing PF-PUMPKIN_COCONUT_BASE row.
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes, slot)
SELECT p.id, c.id, v.qty, v.loss, v.note, v.slot
FROM nomenclature p
CROSS JOIN (VALUES
  ('PF-CRUNCH_PUMPKIN', 0.015, NULL::NUMERIC, '15g crunch topping per 300ml portion', 'finish'::TEXT)
) AS v(child_code, qty, loss, note, slot)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'SALE-PUMPKIN_SOUP'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes,
    slot             = EXCLUDED.slot;

-- ── 5. Backfill slot on existing SALE-PUMPKIN_SOUP → PF-PUMPKIN_COCONUT_BASE row ──
UPDATE bom_structures bs
   SET slot = 'base'
  FROM nomenclature p, nomenclature c
 WHERE bs.parent_id     = p.id
   AND bs.ingredient_id = c.id
   AND p.product_code   = 'SALE-PUMPKIN_SOUP'
   AND c.product_code   = 'PF-PUMPKIN_COCONUT_BASE'
   AND bs.slot IS NULL;

-- ── Self-register in migration_log ──
INSERT INTO public.migration_log (filename, applied_by, reviewed_by, description)
VALUES (
  '146_pumpkin_crunch_split.sql',
  'claude-code',
  'lesia',
  'Split PF-CRUNCH_PUMPKIN (single-seed Finish crunch) from MOD-ANCIENT_CRUNCH (full seed mix). Wires it into SALE-PUMPKIN_SOUP BOM with slot=finish + backfills coconut base slot=base.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
