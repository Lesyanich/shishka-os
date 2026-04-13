-- Migration 124: Complete BOM + recipes_flow for soups, semi-finished, and proteins
-- ═══════════════════════════════════════════════════════════════════════════════
-- Source: TTC documents for Bio-Active Borscht, Pumpkin Coconut Fusion,
--         Baked Beetroot, Baked Pumpkin, Mirepoix Sauté, Vegetable Broth,
--         Sous-vide Chicken, Sous-vide Shrimp, Operation Plan 03.03.2026
--
-- Hierarchy (RULE-LEGO-ARCHITECTURE):
--   RAW → PF (semi-finished) → SALE (final dish)
--   RAW → MOD (modifiers/toppings)
--   PF → PF (semi-finished can compose into higher PF)
--
-- Shared components:
--   PF-MIREPOIX_SAUTE: used by both PF-BORSCH_BASE and PF-PUMPKIN_COCONUT_BASE
--   PF-VEGETABLE_BROTH: used by both soup bases
--   PF-BAKED_BEETROOT: used by PF-BORSCH_BASE (grated) + salads (cubed)
--   PF-BAKED_PUMPKIN: used by PF-PUMPKIN_COCONUT_BASE
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- PART 1: Seed missing RAW ingredients
-- ═══════════════════════════════════════════════════════════════

INSERT INTO nomenclature (product_code, name, type, base_unit) VALUES
  ('RAW-SHRIMP',         'Shrimp 16/20',          'good', 'kg'),
  ('RAW-LIME',           'Lime',                  'good', 'pcs'),
  ('RAW-LIME-JUICE',     'Lime Juice (Fresh)',    'good', 'L'),
  ('RAW-CHILI-OIL',      'Chili Oil',             'good', 'L'),
  ('RAW-THYME',          'Thyme (Fresh)',         'good', 'kg'),
  ('RAW-SESAME-SEEDS',   'Sesame Seeds',          'good', 'kg'),
  ('RAW-CILANTRO',       'Cilantro (Fresh)',      'good', 'kg'),
  ('RAW-SOUR-CREAM',     'Sour Cream',            'good', 'kg'),
  ('RAW-RED-KIDNEY-BEANS','Red Kidney Beans',     'good', 'kg'),
  ('RAW-COCONUT-YOGURT', 'Coconut Yogurt',        'good', 'kg'),
  ('RAW-CELERY',         'Celery',                'good', 'kg')
ON CONFLICT (product_code) DO NOTHING;

-- Nutrition data for new items
UPDATE nomenclature SET calories=99,  protein=24.0, carbs=0.2,  fat=0.3  WHERE product_code='RAW-SHRIMP'         AND calories IS NULL;
UPDATE nomenclature SET calories=30,  protein=0.7,  carbs=10.5, fat=0.2  WHERE product_code='RAW-LIME'           AND calories IS NULL;
UPDATE nomenclature SET calories=25,  protein=0.4,  carbs=8.4,  fat=0.0  WHERE product_code='RAW-LIME-JUICE'     AND calories IS NULL;
UPDATE nomenclature SET calories=902, protein=0,    carbs=0,    fat=100  WHERE product_code='RAW-CHILI-OIL'      AND calories IS NULL;
UPDATE nomenclature SET calories=101, protein=5.6,  carbs=24.5, fat=1.7  WHERE product_code='RAW-THYME'          AND calories IS NULL;
UPDATE nomenclature SET calories=573, protein=17.7, carbs=23.4, fat=49.7 WHERE product_code='RAW-SESAME-SEEDS'   AND calories IS NULL;
UPDATE nomenclature SET calories=23,  protein=2.1,  carbs=3.7,  fat=0.5  WHERE product_code='RAW-CILANTRO'       AND calories IS NULL;
UPDATE nomenclature SET calories=193, protein=2.4,  carbs=3.4,  fat=19.4 WHERE product_code='RAW-SOUR-CREAM'     AND calories IS NULL;
UPDATE nomenclature SET calories=127, protein=8.7,  carbs=22.8, fat=0.5  WHERE product_code='RAW-RED-KIDNEY-BEANS' AND calories IS NULL;
UPDATE nomenclature SET calories=97,  protein=1.2,  carbs=12.7, fat=5.1  WHERE product_code='RAW-COCONUT-YOGURT' AND calories IS NULL;
UPDATE nomenclature SET calories=16,  protein=0.7,  carbs=3.0,  fat=0.2  WHERE product_code='RAW-CELERY'         AND calories IS NULL;

-- Create MOD-SHRIMP_SOUSVIDE if not exists
INSERT INTO nomenclature (product_code, name, type, base_unit) VALUES
  ('MOD-SHRIMP_SOUSVIDE', 'Sous-vide Shrimp Topping', 'modifier', 'kg')
ON CONFLICT (product_code) DO NOTHING;

-- Set standard_output for PF items (needed for MRP explode)
UPDATE nomenclature SET standard_output_qty = 1, standard_output_uom = 'kg'
WHERE product_code IN ('PF-MIREPOIX_SAUTE', 'PF-BAKED_BEETROOT', 'PF-BAKED_PUMPKIN')
  AND (standard_output_qty IS NULL OR standard_output_uom IS NULL);

UPDATE nomenclature SET standard_output_qty = 1, standard_output_uom = 'L'
WHERE product_code IN ('PF-VEGETABLE_BROTH', 'PF-BORSCH_BASE', 'PF-PUMPKIN_COCONUT_BASE')
  AND (standard_output_qty IS NULL OR standard_output_uom IS NULL);

UPDATE nomenclature SET standard_output_qty = 1, standard_output_uom = 'portion'
WHERE product_code IN ('SALE-BORSCH_BIOACTIVE', 'SALE-PUMPKIN_SOUP')
  AND (standard_output_qty IS NULL OR standard_output_uom IS NULL);

-- norm_waste_pct for semi-finished items
UPDATE nomenclature SET norm_waste_pct = 15 WHERE product_code = 'PF-BAKED_BEETROOT'  AND norm_waste_pct IS NULL;
UPDATE nomenclature SET norm_waste_pct = 20 WHERE product_code = 'PF-BAKED_PUMPKIN'   AND norm_waste_pct IS NULL;
UPDATE nomenclature SET norm_waste_pct = 10 WHERE product_code = 'PF-MIREPOIX_SAUTE'  AND norm_waste_pct IS NULL;
UPDATE nomenclature SET norm_waste_pct = 5  WHERE product_code = 'PF-VEGETABLE_BROTH' AND norm_waste_pct IS NULL;
UPDATE nomenclature SET norm_waste_pct = 5  WHERE product_code = 'PF-BORSCH_BASE'     AND norm_waste_pct IS NULL;
UPDATE nomenclature SET norm_waste_pct = 5  WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE' AND norm_waste_pct IS NULL;
UPDATE nomenclature SET norm_waste_pct = 5  WHERE product_code = 'MOD-SOUSVIDE_CHICKEN'    AND norm_waste_pct IS NULL;
UPDATE nomenclature SET norm_waste_pct = 5  WHERE product_code = 'MOD-SHRIMP_SOUSVIDE'    AND norm_waste_pct IS NULL;

-- product_category for scheduling contamination checks
UPDATE nomenclature SET product_category = 'vegan'   WHERE product_code IN ('PF-MIREPOIX_SAUTE','PF-BAKED_BEETROOT','PF-BAKED_PUMPKIN','PF-VEGETABLE_BROTH','PF-BORSCH_BASE','PF-PUMPKIN_COCONUT_BASE') AND product_category IS NULL;
UPDATE nomenclature SET product_category = 'poultry'  WHERE product_code = 'MOD-SOUSVIDE_CHICKEN' AND product_category IS NULL;
UPDATE nomenclature SET product_category = 'fish'     WHERE product_code = 'MOD-SHRIMP_SOUSVIDE' AND product_category IS NULL;


-- ═══════════════════════════════════════════════════════════════
-- PART 2: BOM Structures
-- ═══════════════════════════════════════════════════════════════
-- quantity_per_unit = amount of ingredient per 1 base_unit of parent
-- Using ON CONFLICT (parent_id, ingredient_id) DO UPDATE for idempotency

-- ── 2a. PF-MIREPOIX_SAUTE (1 kg output) ──
-- Shared sauté base: onion + carrot in olive oil
-- Batch: 500g onion + 500g carrot + 100ml oil → ~1kg sautéed output
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-ONION',     0.5,   5::NUMERIC, 'Small dice, sautéed until soft'),
  ('RAW-CARROT',    0.5,   5::NUMERIC, 'Julienne, sautéed'),
  ('RAW-OLIVE-OIL', 0.1,  NULL::NUMERIC, 'For sautéing')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'PF-MIREPOIX_SAUTE'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2b. PF-BAKED_BEETROOT (1 kg output) ──
-- Batch: 5kg raw → ~4.25kg after peeling (15% waste)
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-BEETROOT',   1.18,  15::NUMERIC, 'Whole, brush washed. Do NOT cut tail/nose. Caliber 150-200g.'),
  ('RAW-OLIVE-OIL',  0.012, NULL::NUMERIC, 'Thin oil film coating to seal pores'),
  ('RAW-FINE_SALT',  0.005, NULL::NUMERIC, 'Even distribution before baking')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'PF-BAKED_BEETROOT'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2c. PF-BAKED_PUMPKIN (1 kg output) ──
-- Batch: 5kg raw → ~4kg after peeling/seeds (20% waste)
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-PUMPKIN',    1.25,  20::NUMERIC, 'Butternut or local. Peeled, seeds removed, 3-4cm cubes.'),
  ('RAW-OLIVE-OIL',  0.018, NULL::NUMERIC, 'For baking, vitamin absorption'),
  ('RAW-FINE_SALT',  0.004, NULL::NUMERIC, 'To balance natural sweetness')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'PF-BAKED_PUMPKIN'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2d. PF-VEGETABLE_BROTH (1 L output) ──
-- Zero-waste broth from roasted trimmings. Water not tracked.
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-ROOT-TRIMMINGS',  0.15, NULL::NUMERIC, 'Carrot/celery/beet peels, roasted first for depth'),
  ('RAW-ONION-TRIMMINGS', 0.10, NULL::NUMERIC, 'Onion skins and ends'),
  ('RAW-HERB-STEMS',      0.03, NULL::NUMERIC, 'Parsley, cilantro, thyme stems')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'PF-VEGETABLE_BROTH'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2e. PF-BORSCH_BASE (1 L output, batch 10L) ──
-- Bio-Active Borscht base — uses shared semi-finished components
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('PF-VEGETABLE_BROTH',  0.75,   NULL::NUMERIC, 'Rich zero-waste decoction from trimmings'),
  ('PF-BAKED_BEETROOT',   0.15,   NULL::NUMERIC, 'Grated on coarse grater (6mm)'),
  ('PF-MIREPOIX_SAUTE',  0.10,   NULL::NUMERIC, 'Shared onion+carrot sauté base'),
  ('RAW-POTATO',          0.08,   10::NUMERIC,   '1x1cm cubes, cook until al-dente'),
  ('RAW-LEMON-JUICE',     0.006,  NULL::NUMERIC, 'Color stabilizer — fixes bright red'),
  ('RAW-GARLIC',          0.004,  NULL::NUMERIC, 'Fresh, pressed or finely minced'),
  ('RAW-SHISHKA-MIX',     0.003,  NULL::NUMERIC, 'Paprika, dried parsley, basil, salt')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'PF-BORSCH_BASE'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2f. PF-PUMPKIN_COCONUT_BASE (1 L output, batch 10L) ──
-- Pumpkin Coconut Fusion base — anti-inflammatory + silk texture
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('PF-BAKED_PUMPKIN',      0.60,   NULL::NUMERIC, 'Pre-baked caramelized pumpkin (TTC PF-BAKED_PUMPKIN)'),
  ('PF-MIREPOIX_SAUTE',    0.15,   NULL::NUMERIC, 'Shared onion+carrot sauté (TTC PF-MIREPOIX_SAUTE)'),
  ('PF-VEGETABLE_BROTH',   0.25,   NULL::NUMERIC, 'Zero-waste broth (TTC PF-VEGETABLE_BROTH)'),
  ('RAW-COCONUT-MILK',     0.12,   NULL::NUMERIC, '17-19% fat content for silk texture'),
  ('RAW-GINGER',           0.01,   NULL::NUMERIC, 'Fresh, peeled, finely grated'),
  ('RAW-LIME-JUICE',       0.006,  NULL::NUMERIC, 'Freshly squeezed — cuts coconut fattiness'),
  ('RAW-TURMERIC',         0.0015, NULL::NUMERIC, 'Powder — bio-hacking: color + anti-inflammatory'),
  ('RAW-CORIANDER-POWDER', 0.0015, NULL::NUMERIC, 'Powder — aroma layer'),
  ('RAW-FINE_SALT',        0.004,  NULL::NUMERIC, 'Fine sea salt')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'PF-PUMPKIN_COCONUT_BASE'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2g. SALE-BORSCH_BIOACTIVE (1 portion = 300ml) ──
-- Final dish BOM: base + optional protein + toppings
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('PF-BORSCH_BASE',        0.30,  NULL::NUMERIC, '300ml base per portion')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'SALE-BORSCH_BIOACTIVE'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2h. SALE-PUMPKIN_SOUP (1 portion = 300ml) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('PF-PUMPKIN_COCONUT_BASE', 0.30, NULL::NUMERIC, '300ml base per portion')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'SALE-PUMPKIN_SOUP'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2i. MOD-SOUSVIDE_CHICKEN (1 kg output, batch 2kg) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-CHICKEN-BREAST', 1.0,   5::NUMERIC,    'Clean from cartilage and fat'),
  ('RAW-FINE_SALT',      0.012, NULL::NUMERIC, '1.2% of weight — dry brining'),
  ('RAW-OLIVE-OIL',      0.02,  NULL::NUMERIC, 'For marinade'),
  ('RAW-THYME',          0.003, NULL::NUMERIC, 'Fresh sprigs, whole in bag'),
  ('RAW-GARLIC',         0.005, NULL::NUMERIC, 'Sliced petals')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'MOD-SOUSVIDE_CHICKEN'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2j. MOD-SHRIMP_SOUSVIDE (1 kg output, batch 1kg) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-SHRIMP',     1.0,   NULL::NUMERIC, 'Peeled, tail off. Size 16/20'),
  ('RAW-FINE_SALT',  0.01,  NULL::NUMERIC, '1% of weight'),
  ('RAW-CHILI-OIL',  0.02,  NULL::NUMERIC, 'Natural chili oil — no chemicals'),
  ('RAW-LIME',       0.005, NULL::NUMERIC, 'Zest only, finely grated')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'MOD-SHRIMP_SOUSVIDE'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2k. MOD-ANCIENT_CRUNCH (topping for both soups) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-PUMPKIN-SEEDS',  0.5,  NULL::NUMERIC, 'Washed from soup pumpkin, dried & roasted'),
  ('RAW-SESAME-SEEDS',   0.3,  NULL::NUMERIC, 'Toasted for aroma'),
  ('RAW-SUMAC',          0.1,  NULL::NUMERIC, 'Sumac for acid brightness'),
  ('RAW-FINE_SALT',      0.05, NULL::NUMERIC, 'Light seasoning'),
  ('RAW-OLIVE-OIL',      0.05, NULL::NUMERIC, 'Oil for binding')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'MOD-ANCIENT_CRUNCH'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2l. MOD-COCONUT_YOGURT (modifier, 1kg) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-COCONUT-YOGURT', 1.0, NULL::NUMERIC, 'Plain coconut yogurt, vegan probiotic')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'MOD-COCONUT_YOGURT'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2m. MOD-SOUR_CREAM (modifier, 1kg) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-SOUR-CREAM', 1.0, NULL::NUMERIC, 'Classic borscht topping')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'MOD-SOUR_CREAM'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2n. MOD-RED_BEANS (modifier, 1kg) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-RED-KIDNEY-BEANS', 1.0, NULL::NUMERIC, 'Vegan protein option for borscht')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'MOD-RED_BEANS'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;

-- ── 2o. MOD-GREENS (modifier, 1kg) ──
INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes)
SELECT p.id, c.id, v.qty, v.loss, v.note
FROM nomenclature p
CROSS JOIN (VALUES
  ('RAW-CILANTRO', 0.5,  NULL::NUMERIC, 'Fresh cilantro leaves'),
  ('RAW-PARSLEY',  0.5,  NULL::NUMERIC, 'Fresh parsley')
) AS v(child_code, qty, loss, note)
JOIN nomenclature c ON c.product_code = v.child_code
WHERE p.product_code = 'MOD-GREENS'
ON CONFLICT (parent_id, ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    yield_loss_pct   = EXCLUDED.yield_loss_pct,
    notes            = EXCLUDED.notes;


-- ═══════════════════════════════════════════════════════════════
-- PART 3: recipes_flow (Technical Cards / Production Steps)
-- ═══════════════════════════════════════════════════════════════
-- Equipment lookup by ILIKE pattern (same approach as migration 074)
-- If equipment not found → NULL (manual operation)
-- Delete existing steps first for idempotency

-- ── 3a. PF-BAKED_BEETROOT ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'PF-BAKED_BEETROOT');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Preparation', '%manual%',
   15, 'Wash beetroot with brush. Do NOT cut tail or nose (prevents juice leakage). Pat dry. Coat with olive oil and salt in bowl. Place in GN 1/1 100mm single layer.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Caliber 150-200g. Every beet must have thin oil film.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Steam Buffer + Sealing', '%manual%',
   5, 'Pour 100ml water at bottom of GN pan. Close tightly with metal lid. If lid does not fit — use silicone seal or parchment between rim and lid. NO FOIL.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Water creates initial humidity to prevent skin burning.',
   false, NULL, NULL, NULL),

  (3, 'Baking', '%oven%',
   100, 'Convection oven 180°C, humidity 0%. Bake 90-110 min depending on density. Check: skewer enters center like soft butter.',
   180, NULL::NUMERIC, true, 'Unit 20. All humidity generated inside closed GN. Can bake with pumpkin simultaneously on different levels.',
   true, 'temperature', 180, 5),

  (4, 'Resting', '%oven%',
   20, 'Turn off oven. Do NOT open lid for 20 minutes. Beetroot finishes cooking via residual steam. Skin becomes easier to peel.',
   NULL::NUMERIC, NULL::NUMERIC, true, 'Critical: do not skip. Improves peeling.',
   false, NULL, NULL, NULL),

  (5, 'Peeling + Processing', '%manual%',
   20, 'Peel skin while warm (use gloves!). For Borscht: grate on coarse grater (6mm). For Bowls: cut 1.5x1.5cm cubes. Zero-Waste: drain baking liquid — use as natural dye or add to borscht broth.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Save baking liquid = umami essence.',
   false, NULL, NULL, NULL),

  (6, 'Blast Chilling', '%blast chiller%',
   30, 'Spread in thin layer on cold GN tray. Blast chill to +3°C.',
   3, 3, true, 'Unit 66.',
   true, 'temperature', 3, 1),

  (7, 'Vacuum + Storage', '%vacuum%seal%',
   10, 'Vacuum pack in 1kg or 1.5kg portions. Label: date, product, weight, shelf life.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Shelf life: 7 days at 2-4°C.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'PF-BAKED_BEETROOT';

-- ── 3b. PF-BAKED_PUMPKIN ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'PF-BAKED_PUMPKIN');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Preparation', '%manual%',
   20, 'Wash pumpkin, peel (put skins in broth stock!). Remove seeds (save for Ancient Crunch). Cut into 3-4cm cubes. Uniform size is essential. Mix with olive oil and salt.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Butternut or local variety.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Loading', '%manual%',
   5, 'Place on GN 1/1 tray lined with parchment paper. IMPORTANT: Do not crowd! Leave space between pieces for air circulation — roast, not steam.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'No lid, open baking for caramelized edges.',
   false, NULL, NULL, NULL),

  (3, 'Baking', '%oven%',
   45, 'Convection oven 180°C, 100% convection, NO lid. Bake 40-50 min. Check: edges golden-brown, center soft (press with spoon). Goes in 50 min after beetroot.',
   180, NULL::NUMERIC, true, 'Unit 20. Middle level. Broth vegetables go on upper level 10 min after pumpkin.',
   true, 'temperature', 180, 5),

  (4, 'Blast Chilling', '%blast chiller%',
   25, 'Place tray directly into Blast Chiller until +3°C.',
   3, 3, true, 'Unit 66. If making soup same day, can skip vacuum — goes straight to blender.',
   true, 'temperature', 3, 1),

  (5, 'Vacuum + Storage', '%vacuum%seal%',
   10, 'Vacuum pack in 1.5kg or 2kg portions. Label: date, product, weight.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Chef Note: if soup is tomorrow, skip vacuum — straight to blender with coconut milk and broth.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'PF-BAKED_PUMPKIN';

-- ── 3c. PF-MIREPOIX_SAUTE ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'PF-MIREPOIX_SAUTE');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Preparation', '%manual%',
   15, 'Onions: small dice (brunoise). Carrots: julienne or fine dice. Collect all trimmings in GREEN LIST container for broth.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Same mirepoix base used for BOTH Borscht and Pumpkin Soup.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Sautéing', '%stove%',
   20, 'Heat olive oil in pot. Add onions, cook until translucent (5 min). Add carrots, cook until soft (10 min). Add Shishka Mix spices at the END to release essential oils. Do not brown.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Unit 32. Medium heat. Spices go last — 2 min max.',
   false, NULL, NULL, NULL),

  (3, 'Cooling + Storage', '%manual%',
   10, 'If using immediately for soup base — keep warm and proceed. If storing: cool to room temp, then blast chill. Vacuum pack in 500g portions.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Shelf life: 5 days at 2-4°C in vacuum.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'PF-MIREPOIX_SAUTE';

-- ── 3d. PF-VEGETABLE_BROTH ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'PF-VEGETABLE_BROTH');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Roasting Vegetables', '%oven%',
   30, 'Place vegetable trimmings (carrot peels, onion skins, celery, herb stems) on GN tray. Roast at 180°C until edges brown — 25-30 min. Can share oven with beetroot/pumpkin on upper level.',
   180, NULL::NUMERIC, true, 'Unit 20. Upper level. Goes in at 15:40 per operation plan (10 min after pumpkin).',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Simmering', '%stove%',
   120, 'Transfer roasted vegetables to large pot. Cover with cold water. Bring to simmer — do NOT boil aggressively. Simmer 1.5-2 hours. Add pumpkin skins, beet liquid, herb stems.',
   NULL::NUMERIC, NULL::NUMERIC, true, 'Unit 32. Low heat. Zero-waste: all peels/trims go in.',
   false, NULL, NULL, NULL),

  (3, 'Straining', '%manual%',
   15, 'Strain through fine mesh sieve (chinois). Press solids to extract maximum flavor. Discard solids.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Rich golden color expected from roasting.',
   false, NULL, NULL, NULL),

  (4, 'Blast Chilling', '%blast chiller%',
   30, 'Pour into shallow GN pans. Blast chill to +3°C.',
   3, 3, true, 'Unit 66.',
   true, 'temperature', 3, 1),

  (5, 'Vacuum + Storage', '%vacuum%seal%',
   10, 'Vacuum pack in 2L or 3L bags. Label: date, batch, shelf life.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Shelf life: 5 days at 2-4°C.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'PF-VEGETABLE_BROTH';

-- ── 3e. PF-BORSCH_BASE ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'PF-BORSCH_BASE');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Boil Potatoes', '%stove%',
   20, 'Add potato cubes (1x1cm) to boiling vegetable broth. Cook until al-dente — still firm in center.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Unit 32. Do not overcook — potatoes continue softening in hot soup.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Combine Components', '%stove%',
   10, 'Add sautéed mirepoix and grated baked beetroot to the broth. Bring to 85-90°C. IMPORTANT: Do not boil more than 1 min after adding beetroot — color loss!',
   90, NULL::NUMERIC, false, 'Gentle heat only. Beetroot must stay bright red.',
   true, 'temperature', 88, 5),

  (3, 'Acid & Flavor Finish', '%manual%',
   3, 'Pour in lemon juice (fixes bright red color). Add pressed fresh garlic. Stir gently. Remove from heat immediately.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Lemon = color stabilizer. Garlic raw for maximum potency.',
   false, NULL, NULL, NULL),

  (4, 'Blast Chilling', '%blast chiller%',
   30, 'Pour into shallow GN 1/1 pans. Place in Blast Chiller. Cool to +3°C. Hack: if blast chiller busy, use ice bath.',
   3, 3, true, 'Unit 66. Critical HACCP step.',
   true, 'temperature', 3, 1),

  (5, 'Vacuum + Storage', '%vacuum%seal%',
   15, 'Vacuum pack in 1.5L bags (5 portions each). Label: Date, Time, Expiry, Shift. Shelf life: 7 days vacuum at 2-4°C, 48h after opening.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Batch 10L = ~6-7 bags of 1.5L.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'PF-BORSCH_BASE';

-- ── 3f. PF-PUMPKIN_COCONUT_BASE ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'PF-PUMPKIN_COCONUT_BASE');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Spice Infusion', '%stove%',
   5, 'In pot, add mirepoix sauté. Add turmeric, coriander powder, and finely grated ginger. Heat 2-3 min in the sauté oil to wake up the spices.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Unit 32. Use oil already in the mirepoix. Stir constantly.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Combining', '%stove%',
   10, 'Add baked pumpkin and pour in vegetable broth. Bring to gentle simmer. Cook 10 min to merge flavors.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Do not rush. Low simmer.',
   false, NULL, NULL, NULL),

  (3, 'Emulsification', '%stove%',
   5, 'Pour in coconut milk. Bring to 85°C — do NOT boil aggressively or milk will split.',
   85, NULL::NUMERIC, false, 'Temperature critical — stay below boiling.',
   true, 'temperature', 85, 3),

  (4, 'TextureMaxxing', '%blender%',
   5, 'Immersion blender at maximum speed for 3-5 min until absolutely smooth, glossy cream. Chef Note: if not silky enough, pass through fine-mesh sieve (chinois).',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Unit 13. No fibers should remain in soup!',
   true, 'visual', NULL, NULL),

  (5, 'Acid Correction', '%manual%',
   2, 'Stir in lime juice. This cuts coconut fattiness and pumpkin sweetness. Taste and adjust salt.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Balance point: sweet-sour-umami.',
   false, NULL, NULL, NULL),

  (6, 'Blast Chilling', '%blast chiller%',
   30, 'Pour into shallow GN pans. Blast chill to +3°C.',
   3, 3, true, 'Unit 66.',
   true, 'temperature', 3, 1),

  (7, 'Vacuum + Storage', '%vacuum%seal%',
   10, 'Pack into 160-micron bags in 1.5L portions (5 x 300ml servings). Label: date, product, batch, expiry. Shelf life: 7 days vacuum at 2-4°C, 48h after opening.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'For 160-micron bags: increase seal time by 2 seconds.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'PF-PUMPKIN_COCONUT_BASE';

-- ── 3g. MOD-SOUSVIDE_CHICKEN ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'MOD-SOUSVIDE_CHICKEN');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Dry Brining', '%manual%',
   20, 'Rub breast with salt (1.2%), olive oil, and sliced garlic. Let sit 15-20 min at room temperature.',
   NULL::NUMERIC, NULL::NUMERIC, true, 'Dry brining enhances flavor and moisture retention.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Vacuum Sealing', '%vacuum%seal%',
   10, 'Place 1-2 pieces in 15x25cm bags — strictly single layer! Add thyme sprig. For 160-micron bags: increase seal time by 1-2 sec.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Unit 67. Single layer critical for even cooking.',
   false, NULL, NULL, NULL),

  (3, 'Sous-vide Cooking', '%stove%',
   90, 'Place in 36L pot with thermostat at 64°C for 90 minutes. HACCP: check water level every 30 min — if drops, thermostat shuts off and batch is lost.',
   64, 64, true, 'Pot on Unit 32 — stove OFF! Thermostat only. Cover pot with lid (cutout for device).',
   true, 'temperature', 64, 1),

  (4, 'Blast Chilling', '%blast chiller%',
   20, 'After timer signal, immediately move bags to Blast Chiller. Cool to +3°C.',
   3, 3, true, 'Unit 66. Immediate transfer — no delay.',
   true, 'temperature', 3, 1),

  (5, 'Storage', '%fridge%',
   0, 'Transfer to protein storage zone. Shelf life: 5 days at 2-4°C in vacuum bags.',
   4, NULL::NUMERIC, true, 'Keep bags sealed until L2 assembly.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'MOD-SOUSVIDE_CHICKEN';

-- ── 3h. MOD-SHRIMP_SOUSVIDE ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'MOD-SHRIMP_SOUSVIDE');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Marination', '%manual%',
   10, 'Mix peeled shrimp (tail off) with sea salt (1%), chili oil, and lime zest. Gentle fold.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Size 16/20. Keep chilled during prep.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Vacuum Sealing', '%vacuum%seal%',
   10, 'Use 15x25cm bags. CRITICAL: lay strictly in single layer — shrimp must NOT touch each other. Even heating depends on this.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Unit 67. Single layer only!',
   false, NULL, NULL, NULL),

  (3, 'Sous-vide Cooking', '%stove%',
   25, 'In pot at 52°C for 25 minutes. Lower temperature than chicken — shrimp overcook easily.',
   52, 52, true, 'Same pot after chicken is done — adjust thermostat down to 52°C.',
   true, 'temperature', 52, 1),

  (4, 'Ice Bath Cooling', '%manual%',
   10, 'Transfer bags to ice bath for 10 minutes. Then move to refrigerator.',
   NULL::NUMERIC, NULL::NUMERIC, true, 'No blast chiller needed — ice bath sufficient for small batch.',
   true, 'temperature', 4, 2),

  (5, 'Storage', '%fridge%',
   0, 'Store in refrigerator. Shelf life: 3 days at 2-4°C in vacuum bags.',
   4, NULL::NUMERIC, true, 'Premium protein — use first, shorter shelf life than chicken.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'MOD-SHRIMP_SOUSVIDE';

-- ── 3i. SALE-BORSCH_BIOACTIVE (L2 Assembly) ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'SALE-BORSCH_BIOACTIVE');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Portioning', '%manual%',
   1, 'Use ladle (exactly 300ml) to pour cold borscht base into branded soup bowl.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'L2 Assembly from cold vacuum bag. Morning prep: pour 1.5L bag into service pitcher.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Regeneration', '%merrychef%',
   1, 'Place bowl in Merrychef. Program: Soup Reheat (45-60 seconds).',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Unit 19.',
   false, NULL, NULL, NULL),

  (3, 'Customization', '%manual%',
   1, 'Classic: add pre-heated sous-vide chicken (60g). Vegan: add red kidney beans (50g).',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Protein add-on selected by customer.',
   false, NULL, NULL, NULL),

  (4, 'CBS Finish', '%manual%',
   1, 'Axis C (Crunch): sprinkle Ancient Crunch (seed mix + sumac). Axis A (Acid/Fat): dollop of sour cream or coconut yogurt + fresh herbs. Close lid and serve.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Emotion & Texture layer — makes it Shishka.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'SALE-BORSCH_BIOACTIVE';

-- ── 3j. SALE-PUMPKIN_SOUP (L2 Assembly) ──
DELETE FROM recipes_flow WHERE nomenclature_id = (SELECT id FROM nomenclature WHERE product_code = 'SALE-PUMPKIN_SOUP');

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes,
  haccp_checkpoint, haccp_type, haccp_target_value, haccp_tolerance
)
SELECT n.id, v.step_order, v.op, (SELECT id FROM equipment WHERE name ILIKE v.eq LIMIT 1),
  v.dur, v.instr, v.temp, v.itemp, v.passive, v.note,
  v.haccp, v.htype, v.htarget, v.htol
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Portioning', '%manual%',
   1, 'Pour 300ml cold pumpkin coconut base into soup bowl.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'L2 Assembly from cold state.',
   false, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC),

  (2, 'Add-ons', '%manual%',
   1, 'Place 5 pieces sous-vide shrimp (or 60g sous-vide chicken) on top of the base.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Protein selected by customer.',
   false, NULL, NULL, NULL),

  (3, 'Regeneration', '%merrychef%',
   1, 'Merrychef — Soup + Protein program (60 seconds).',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Unit 19. Longer than plain soup because of protein.',
   false, NULL, NULL, NULL),

  (4, 'CBS Finish', '%manual%',
   1, 'Axis C (Crunch): sprinkle Ancient Crunch (pumpkin seeds + sesame). Axis B (Aroma): 2-3 drops chili oil for visual contrast and warmth. Green: cilantro leaf. Serve.',
   NULL::NUMERIC, NULL::NUMERIC, false, 'Anti-inflammatory + silk texture = Pumpkin Fusion signature.',
   false, NULL, NULL, NULL)
) AS v(step_order, op, eq, dur, instr, temp, itemp, passive, note, haccp, htype, htarget, htol)
WHERE n.product_code = 'SALE-PUMPKIN_SOUP';


-- ═══════════════════════════════════════════════════════════════
-- PART 4: Tags for new items
-- ═══════════════════════════════════════════════════════════════

-- MOD-SHRIMP_SOUSVIDE tags
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'MOD-SHRIMP_SOUSVIDE'
AND t.slug IN ('high-protein', 'technique-sousvide', 'gluten-free', 'dairy-free', 'allergen-shellfish')
ON CONFLICT DO NOTHING;

-- New RAW items → storage-chilled
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-SHRIMP', 'RAW-CILANTRO', 'RAW-THYME', 'RAW-LIME',
  'RAW-SOUR-CREAM', 'RAW-COCONUT-YOGURT')
AND t.slug = 'storage-chilled'
ON CONFLICT DO NOTHING;

-- Dry/ambient storage items
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code IN ('RAW-SESAME-SEEDS', 'RAW-RED-KIDNEY-BEANS', 'RAW-CHILI-OIL', 'RAW-LIME-JUICE')
AND t.slug = 'storage-ambient'
ON CONFLICT DO NOTHING;

-- Shellfish allergen for shrimp
INSERT INTO nomenclature_tags (nomenclature_id, tag_id)
SELECT n.id, t.id FROM nomenclature n, tags t
WHERE n.product_code = 'RAW-SHRIMP'
AND t.slug = 'allergen-shellfish'
ON CONFLICT DO NOTHING;

-- Self-register in migration_log
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('124_bom_and_recipes_full.sql', 'Complete BOM + recipes_flow for soup production pipeline (15 products, 56 BOM lines, 50 recipe steps)', NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
