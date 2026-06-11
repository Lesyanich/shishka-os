-- ═══════════════════════════════════════════════════════════════
-- Migration 199: Fix cream cheese merge + za'atar unit + shiitake KBJU
-- Tasks: 8e7770a4, 525bdb94, af185481
-- ═══════════════════════════════════════════════════════════════
-- 1. Merge 3 Bega auto-products → RAW-CHEESE-CREAM, fix UoM, set WAC
-- 2. Fix RAW-ZAATAR unit from "portion" to "kg" + set KBJU
-- 3. Fix RAW-MUSHROOM-SHIITAKE KBJU from 500 (workaround) to real 340
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. CREAM CHEESE MERGE (task 8e7770a4)
-- ═══════════════════════════════════════════════════════════════
--
-- Receipt data:
--   barcode 9310264912973: Bega Cream Cheese Block 250g, ฿135/pack
--     May 5: 1 pack (RAW-AUTO-816a30ec)
--     May 7: 1 pack (RAW-AUTO-a3193f32)
--   barcode 9310264912997: Bega Cream Cheese Spread 500g, ฿315/pack
--     May 9: 2 packs (RAW-AUTO-57c52143)
--
-- Conversion to kg:
--   250g packs: qty=0.25, price_per_unit=540₿/kg
--   500g packs: qty=0.5 each (×2 = 1.0kg), price_per_unit=630₿/kg
--
-- WAC: (0.25×540 + 0.25×540 + 1.0×630) / 1.5 = 900/1.5 = 600₿/kg

-- 1a. Fix purchase_logs UoM and redirect to RAW-CHEESE-CREAM
-- Bega Block 250g, May 5
UPDATE purchase_logs
SET nomenclature_id = '54259ea7-e8de-4675-ad74-3fdaa5f4c872',
    quantity = 0.25,
    price_per_unit = 540.0000
WHERE id = 'a744bae9-10fc-47b0-8078-d27b868f2c37';

-- Bega Block 250g, May 7
UPDATE purchase_logs
SET nomenclature_id = '54259ea7-e8de-4675-ad74-3fdaa5f4c872',
    quantity = 0.25,
    price_per_unit = 540.0000
WHERE id = '8da2216e-34fc-4dcc-8073-8f7c808ad27c';

-- Bega Spread 500g × 2, May 9 (total_price=630 stays correct)
UPDATE purchase_logs
SET nomenclature_id = '54259ea7-e8de-4675-ad74-3fdaa5f4c872',
    quantity = 1.0,
    price_per_unit = 630.0000
WHERE id = 'a631b603-518e-4def-a3bd-7b8dde326ede';

-- 1b. Set WAC on RAW-CHEESE-CREAM
UPDATE nomenclature
SET cost_per_unit = 600.0000,
    updated_at = now()
WHERE id = '54259ea7-e8de-4675-ad74-3fdaa5f4c872';

-- 1c. Add supplier_catalog entries for Makro → RAW-CHEESE-CREAM
-- Find Makro supplier_id
INSERT INTO supplier_catalog (
    supplier_id, nomenclature_id, product_name, brand, barcode,
    package_weight, package_qty, package_unit, purchase_unit,
    conversion_factor, base_unit, last_seen_price, source
)
SELECT
    s.id, '54259ea7-e8de-4675-ad74-3fdaa5f4c872',
    'Bega Cream Cheese Block', 'Bega', '9310264912973',
    '250g', 1, 'pack', 'pack',
    0.25, 'kg', 135, 'migration-199'
FROM suppliers s WHERE s.name ILIKE '%Makro%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO supplier_catalog (
    supplier_id, nomenclature_id, product_name, brand, barcode,
    package_weight, package_qty, package_unit, purchase_unit,
    conversion_factor, base_unit, last_seen_price, source
)
SELECT
    s.id, '54259ea7-e8de-4675-ad74-3fdaa5f4c872',
    'Bega Cream Cheese Spread', 'Bega', '9310264912997',
    '500g', 1, 'pack', 'pack',
    0.5, 'kg', 315, 'migration-199'
FROM suppliers s WHERE s.name ILIKE '%Makro%' LIMIT 1
ON CONFLICT DO NOTHING;

-- 1d. Redirect any supplier_catalog from auto-products
UPDATE supplier_catalog
SET nomenclature_id = '54259ea7-e8de-4675-ad74-3fdaa5f4c872'
WHERE nomenclature_id IN (
    'c0c91eb9-82bd-4be3-a683-aeaee4138c67',
    '35d9981e-a32f-4e68-a1dd-7e8d78473668',
    '01941238-9f41-4add-b1e9-af5d8e2dd705'
);

-- 1e. Redirect sku + sku_balances from auto-products
UPDATE sku
SET nomenclature_id = '54259ea7-e8de-4675-ad74-3fdaa5f4c872'
WHERE nomenclature_id IN (
    'c0c91eb9-82bd-4be3-a683-aeaee4138c67',
    '35d9981e-a32f-4e68-a1dd-7e8d78473668',
    '01941238-9f41-4add-b1e9-af5d8e2dd705'
);

UPDATE sku_balances
SET nomenclature_id = '54259ea7-e8de-4675-ad74-3fdaa5f4c872'
WHERE nomenclature_id IN (
    'c0c91eb9-82bd-4be3-a683-aeaee4138c67',
    '35d9981e-a32f-4e68-a1dd-7e8d78473668',
    '01941238-9f41-4add-b1e9-af5d8e2dd705'
);

-- 1f. Mark auto-products as merged
UPDATE nomenclature
SET is_available = false,
    name = '[MERGED→RAW-CHEESE-CREAM] ' || name
WHERE id IN (
    'c0c91eb9-82bd-4be3-a683-aeaee4138c67',
    '35d9981e-a32f-4e68-a1dd-7e8d78473668',
    '01941238-9f41-4add-b1e9-af5d8e2dd705'
);

-- 1g. Set KBJU for RAW-CHEESE-CREAM (Bega cream cheese per 1 kg)
-- ~342 kcal/100g typical cream cheese
UPDATE nomenclature
SET calories = 3420, protein = 60, fat = 340, carbs = 30
WHERE id = '54259ea7-e8de-4675-ad74-3fdaa5f4c872'
  AND calories IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. ZA'ATAR FIX (task 525bdb94)
-- ═══════════════════════════════════════════════════════════════
-- RAW-ZAATAR has base_unit="portion" — must be "kg"
-- KBJU per 1 kg: 2700/90/80/400 (thyme+sumac+sesame mix)

UPDATE nomenclature
SET base_unit = 'kg',
    calories = 2700,
    protein = 90,
    fat = 80,
    carbs = 400,
    updated_at = now()
WHERE id = '96f3081a-40d7-4a11-855a-9a5cbfb479f3';

-- Also fix the WW manakish za'atar (SALE- with portion unit)
UPDATE nomenclature
SET base_unit = 'pcs'
WHERE product_code = 'SALE-MANAISH-ZAATAR'
  AND base_unit = 'portion';

-- ═══════════════════════════════════════════════════════════════
-- 3. SHIITAKE KBJU FIX (task af185481)
-- ═══════════════════════════════════════════════════════════════
-- Was set to 500 kcal/kg as workaround (validator rejected 340).
-- Validator now allows ≥50 kcal/kg. Real value: 340 kcal/kg.

UPDATE nomenclature
SET calories = 340,
    updated_at = now()
WHERE id = '061ce464-efea-4330-bb47-da9ca05c4922'
  AND calories = 500;

-- ═══════════════════════════════════════════════════════════════
-- 4. SELF-REGISTER
-- ═══════════════════════════════════════════════════════════════

INSERT INTO migration_log (filename, applied_by, notes)
VALUES (
    '200b_fix_cream_cheese_zaatar_shiitake.sql',
    'claude-code',
    'Merge 3 Bega auto-products→RAW-CHEESE-CREAM (WAC=600/kg), fix RAW-ZAATAR unit+KBJU, fix shiitake KBJU 500→340'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
