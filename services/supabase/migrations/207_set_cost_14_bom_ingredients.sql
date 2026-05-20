-- Migration 205: Set estimated costs for 14 BOM-used ingredients with cost=0
-- MC task b6ca0bdb
-- Source: Thai market estimates (Makro/retail). Update when actual purchase receipts arrive.
-- 3 items from original list already have costs: TOMATO-PASTE (215), SESAME-SEEDS-WHITE, POMEGRANATE-SEEDS (119)

BEGIN;

-- === SPICES ===

-- Allspice ground — imported, Hand Brand type ~฿69/100g
UPDATE nomenclature SET cost_per_unit = 700, updated_at = now()
WHERE id = 'e1d7c52b-9371-4209-aaa4-b1f845ce47b0' AND product_code = 'RAW-ALLSPICE';

-- Smoked Paprika — specialty import, ~2x regular paprika (RAW-PAPRIKA = ฿75/kg)
UPDATE nomenclature SET cost_per_unit = 400, updated_at = now()
WHERE id = '32ed382c-1ece-413a-a520-60b0f1fe6478' AND product_code = 'RAW-PAPRIKA_SMOKED';

-- Dried Mint — Hand Brand ~฿69/50g
UPDATE nomenclature SET cost_per_unit = 1200, updated_at = now()
WHERE id = 'ea4e8c09-7da0-4f5d-aa13-c1f2b1fe7926' AND product_code = 'RAW-MINT_DRIED';

-- Chili Oil — commercial bottle ~฿200/L
UPDATE nomenclature SET cost_per_unit = 200, updated_at = now()
WHERE id = '183338d9-68b3-4e4c-8a64-109116e675e7' AND product_code = 'RAW-CHILI-OIL';

-- Red Pepper Paste — imported (biber salçası type) ~฿200/kg
UPDATE nomenclature SET cost_per_unit = 200, updated_at = now()
WHERE id = '131d41e7-1409-40b0-9eb0-e7897fe3c2a2' AND product_code = 'RAW-PEPPER_PASTE_RED';

-- Shishka Mix Spices — custom house blend, estimate ฿300/kg
-- TODO: should become PF with own BOM (blend of paprika, cumin, coriander, etc.)
UPDATE nomenclature SET cost_per_unit = 300, updated_at = now()
WHERE id = 'f2d65ebc-564c-4191-affc-9e5c7986c921' AND product_code = 'RAW-SHISHKA-MIX';

-- === SALTS ===

-- Iodized Salt — generic Thai market ฿15/kg
UPDATE nomenclature SET cost_per_unit = 15, updated_at = now()
WHERE id = 'abd573c6-4aab-4439-a81c-a645e42f3abd' AND product_code = 'RAW-SALT-IODIZED';

-- Non-Iodized Salt — same price range
UPDATE nomenclature SET cost_per_unit = 15, updated_at = now()
WHERE id = 'eb5b1e62-e0bb-4b7e-818f-d69a750e511d' AND product_code = 'RAW-SALT-PLAIN';

-- === STAPLES ===

-- Tahini (store-bought) — imported, ฿400/kg
-- Note: PF-TAHINI (homemade) has own BOM. This RAW is fallback if buying ready-made.
UPDATE nomenclature SET cost_per_unit = 400, updated_at = now()
WHERE id = 'b4d15620-b385-498d-bf25-2b906f8ef7f3' AND product_code = 'RAW-TAHINI';

-- === FRESH / DERIVED ===

-- Lemon Juice — derived from lemons (~฿100/kg, 40% yield → ฿250/L)
UPDATE nomenclature SET cost_per_unit = 250, updated_at = now()
WHERE id = '848d7385-17f3-4e55-bff4-3a2940424ffe' AND product_code = 'RAW-LEMON-JUICE';

-- Lime Juice — limes ~฿50/kg, 35% yield → ฿140/L
UPDATE nomenclature SET cost_per_unit = 140, updated_at = now()
WHERE id = '1f00965f-de69-4fc4-a1a7-f087511500a2' AND product_code = 'RAW-LIME-JUICE';

-- Coconut Yogurt — store-bought, ~฿250/kg
UPDATE nomenclature SET cost_per_unit = 250, updated_at = now()
WHERE id = '86e00677-889c-46cc-80ea-c88763615e62' AND product_code = 'RAW-COCONUT-YOGURT';

-- Shrimp 16/20 — large peeled shrimp, retail ~฿350/kg
-- (RAW-SHRIMP-UNPEELED already has ฿264/kg; 16/20 peeled = premium)
UPDATE nomenclature SET cost_per_unit = 350, updated_at = now()
WHERE id = '3a8adadb-aa0c-466c-9b89-ccd25737cade' AND product_code = 'RAW-SHRIMP';

-- Yogurt Starter Culture — freeze-dried sachet, ~฿50 makes 10L.
-- Per kg of culture: ฿3000, but used in gram quantities (2-5g per batch).
-- Effective cost per batch: negligible.
UPDATE nomenclature SET cost_per_unit = 3000, updated_at = now()
WHERE id = 'e36e70da-139b-430d-840d-d8c074a733b1' AND product_code = 'RAW-YOGURT_STARTER';

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '207_set_cost_14_bom_ingredients.sql',
    'claude-code',
    'Set estimated market costs for 14 BOM ingredients (spices, salts, staples, fresh). MC task b6ca0bdb.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
