-- ============================================================
-- Migration 192: Fix cheese costs, merge mozzarella duplicates
-- ============================================================
-- Root cause: receipt parser wrote pack-level qty/price for sub-kg
-- products where supplier_catalog didn't exist yet at approval time.
-- WAC trigger then calculated wrong cost_per_unit.
--
-- Also merges RAW-SHREDED_MOZZARELLA_CHEESE → RAW-CHEESE-MOZZARELLA
-- and deactivates discontinued RAW-CHEESE-SHREDDED.
-- ============================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. FIX PURCHASE_LOGS — apply retroactive UoM conversion
--    (conversion_factor didn't exist at receipt approval time)
-- ═══════════════════════════════════════════════════════════════

-- Emmental 500g: 224₿/pack → 448₿/kg  (2 receipts, both qty=1)
UPDATE purchase_logs
SET quantity = 0.5, price_per_unit = 448.0000
WHERE nomenclature_id = '7bf2cf9f-641e-4477-9dc5-6dd3ab75e970'
  AND quantity = 1 AND price_per_unit = 224;

-- Gouda 500g, Mar 13: qty=1 pack at 206₿ → 0.5kg at 412₿/kg
UPDATE purchase_logs
SET quantity = 0.5, price_per_unit = 412.0000
WHERE nomenclature_id = 'fb3f8ead-1253-4f80-a62b-e34208106aa1'
  AND quantity = 1 AND price_per_unit = 206;

-- Gouda 500g, Apr 28: qty=500 (grams!) at 0.412₿/g → 0.5kg at 412₿/kg
UPDATE purchase_logs
SET quantity = 0.5, price_per_unit = 412.0000
WHERE nomenclature_id = 'fb3f8ead-1253-4f80-a62b-e34208106aa1'
  AND quantity > 100;  -- only the 500g-as-grams entry

-- Mozzarella 500g, Mar 13: 1 pack at 215₿ → 0.5kg at 430₿/kg
UPDATE purchase_logs
SET quantity = 0.5, price_per_unit = 430.0000
WHERE nomenclature_id = 'a406e010-4354-454f-a53a-cc12feb98a4f'
  AND barcode = '8858768700982'
  AND quantity = 1 AND price_per_unit = 215;

-- DANA Cheese Triangles 120g: 1 pack at 65₿ → 0.12kg at 541.67₿/kg
UPDATE purchase_logs
SET quantity = 0.12, price_per_unit = 541.6667
WHERE nomenclature_id = '9f830250-5a65-4fe4-8b4c-fddbc7f5e9ac'
  AND quantity = 1 AND price_per_unit = 65;

-- ═══════════════════════════════════════════════════════════════
-- 2. MERGE MOZZARELLA DUPLICATES
--    RAW-SHREDED_MOZZARELLA_CHEESE (1kg, 330₿/kg) → RAW-CHEESE-MOZZARELLA
-- ═══════════════════════════════════════════════════════════════

-- Redirect supplier_catalog links
UPDATE supplier_catalog
SET nomenclature_id = 'a406e010-4354-454f-a53a-cc12feb98a4f'
WHERE nomenclature_id = 'df666835-310e-47ec-b8a6-eb9485ac9fda';

-- Redirect purchase_logs
UPDATE purchase_logs
SET nomenclature_id = 'a406e010-4354-454f-a53a-cc12feb98a4f'
WHERE nomenclature_id = 'df666835-310e-47ec-b8a6-eb9485ac9fda';

-- Redirect sku entries
UPDATE sku
SET nomenclature_id = 'a406e010-4354-454f-a53a-cc12feb98a4f'
WHERE nomenclature_id = 'df666835-310e-47ec-b8a6-eb9485ac9fda';

-- Redirect sku_balances
UPDATE sku_balances
SET nomenclature_id = 'a406e010-4354-454f-a53a-cc12feb98a4f'
WHERE nomenclature_id = 'df666835-310e-47ec-b8a6-eb9485ac9fda';

-- Mark duplicate as merged (keep row for audit trail)
UPDATE nomenclature
SET is_available = false,
    name = '[MERGED→RAW-CHEESE-MOZZARELLA] ' || name
WHERE product_code = 'RAW-SHREDED_MOZZARELLA_CHEESE';

-- ═══════════════════════════════════════════════════════════════
-- 3. DEACTIVATE DISCONTINUED + FIX UNITS
-- ═══════════════════════════════════════════════════════════════

-- RAW-CHEESE-SHREDDED: not found on Makro, fix unit pcs→kg, deactivate
UPDATE nomenclature
SET base_unit = 'kg', is_available = false
WHERE product_code = 'RAW-CHEESE-SHREDDED';

-- ═══════════════════════════════════════════════════════════════
-- 4. LINK UNLINKED SUPPLIER_CATALOG ENTRIES
-- ═══════════════════════════════════════════════════════════════

-- ARO Frozen Shredded Cheese 1kg (barcode 8858768700307)
UPDATE supplier_catalog
SET nomenclature_id = '100b9ae0-dcf7-4333-8e9b-04c692ccf5ee'
WHERE barcode = '8858768700307' AND nomenclature_id IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 5. CORRECT cost_per_unit — recalculated from receipt data
-- ═══════════════════════════════════════════════════════════════

-- Emmental: 224₿/500g pack = 448₿/kg (both receipts identical)
UPDATE nomenclature SET cost_per_unit = 448.0000
WHERE product_code = 'RAW-EMMENTAL_CHEESE_SHREDDED';

-- Gouda: 206₿/500g pack = 412₿/kg (both receipts identical)
UPDATE nomenclature SET cost_per_unit = 412.0000
WHERE product_code = 'RAW-CHEESE-GOUDA-SHREDDED';

-- DANA Triangles: 65₿/120g = 541.67₿/kg
UPDATE nomenclature SET cost_per_unit = 541.6667
WHERE product_code = 'RAW-DANA_CHEESE_TRIANGLES';

-- Mozzarella: WAC from corrected purchase_logs
--   2023-04-03: 1.0 kg × 329₿/kg (Tasty Life 1kg)
--   2026-03-13: 0.5 kg × 430₿/kg (ARO 500g, FIXED)
--   2026-04-17: 1.0 kg × 299₿/kg (Perfecta 1000g)
--   2026-04-17: 1.0 kg × 330₿/kg (ARO 1kg, merged from SHREDED)
--   2026-04-28: 0.5 kg × 658₿/kg (NZ barcode 500g)
-- Total: 4.0 kg, ₿1502 → WAC = 375.50₿/kg
UPDATE nomenclature SET cost_per_unit = 375.5000
WHERE product_code = 'RAW-CHEESE-MOZZARELLA';

-- Rename to generic (hosts multiple SKU sizes now)
UPDATE nomenclature
SET name = 'Shredded Mozzarella Cheese'
WHERE product_code = 'RAW-CHEESE-MOZZARELLA';

-- ═══════════════════════════════════════════════════════════════
-- 6. DATA HEALTH RULE — catch future conversion misses
-- ═══════════════════════════════════════════════════════════════

INSERT INTO data_health_rules (
  rule_code, title, description, entity_kind, metric, detect_sql,
  fix_strategy, severity, auto_apply, confidence, created_by
) VALUES (
  'PL_UNCONVERTED_SUBKG',
  'Purchase log: unconverted sub-kg product',
  'Purchase log entry has integer qty for a product with sub-kg conversion_factor in supplier_catalog — likely the conversion was not applied at receipt approval time.',
  'purchase_logs',
  'consistency',
  $detect$
    SELECT pl.id, n.product_code, pl.quantity, pl.price_per_unit, sc.conversion_factor
    FROM purchase_logs pl
    JOIN nomenclature n ON n.id = pl.nomenclature_id AND n.base_unit = 'kg'
    JOIN supplier_catalog sc ON sc.barcode = pl.barcode
      AND sc.conversion_factor IS NOT NULL
      AND sc.conversion_factor < 1
    WHERE pl.quantity = ROUND(pl.quantity)
      AND pl.quantity >= 1
  $detect$,
  'Multiply qty by conversion_factor, divide price_per_unit by same factor, keep total_price unchanged.',
  'warn',
  false,
  0.9,
  'migration-192'
) ON CONFLICT (rule_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 7. SELF-REGISTER
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '192_fix_cheese_costs_merge_duplicates.sql',
  'claude-code',
  'Fix cheese costs (Emmental/Gouda/Mozz/DANA UoM conversion), merge mozzarella dupes, deactivate discontinued, add data_health_rule'
);

COMMIT;
