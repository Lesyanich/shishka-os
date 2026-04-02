-- ============================================================
-- Fix: Merge duplicate SKUs + fix return entry
-- Run each statement separately in SQL Editor
-- ============================================================

-- ═══ FIX 1: Product return — link to correct SKU ═══
-- Return entry for Lurpak Butter 2kg (barcode 8850332162240) has sku_id=NULL
-- The purchase of same product has sku_id = 3562a83d
UPDATE purchase_logs
SET sku_id = '3562a83d-6aa9-45d6-aea1-cc92c55ae8d0'
WHERE id = '95e23109-b917-49a5-a937-06bf1b7c839f'
  AND sku_id IS NULL;

-- ═══ FIX 2: Merge Green Peas duplicates ═══
-- Canonical SKU: SKU-0015 (4e7fdde5) — has barcode 9300657790028, from Makro parser
-- Duplicate 1: SKU-0049 (a12103c6) — "Watties Frozen Green Peas 1kg", PL from Feb 27
-- Duplicate 2: SKU-0099 (c764e029) — misnamed "Edamame", actually Green Peas, PL from Mar 30

-- Step 2a: Move purchase_logs from SKU-0049 → SKU-0015
UPDATE purchase_logs
SET sku_id = '4e7fdde5-d34d-47e7-a148-9303349f2721'
WHERE sku_id = 'a12103c6-5660-4cf3-9866-689ab82f5fa5';

-- Step 2b: Move purchase_logs from SKU-0099 → SKU-0015
UPDATE purchase_logs
SET sku_id = '4e7fdde5-d34d-47e7-a148-9303349f2721'
WHERE sku_id = 'c764e029-d9b3-4aff-9887-7602d9ce4690';

-- Step 2c: Move receiving_lines
UPDATE receiving_lines
SET sku_id = '4e7fdde5-d34d-47e7-a148-9303349f2721'
WHERE sku_id IN ('a12103c6-5660-4cf3-9866-689ab82f5fa5', 'c764e029-d9b3-4aff-9887-7602d9ce4690');

-- Step 2d: Move supplier_catalog references
UPDATE supplier_catalog
SET sku_id = '4e7fdde5-d34d-47e7-a148-9303349f2721'
WHERE sku_id IN ('a12103c6-5660-4cf3-9866-689ab82f5fa5', 'c764e029-d9b3-4aff-9887-7602d9ce4690');

-- Step 2e: Merge sku_balances — sum quantities into canonical SKU
-- First, add balances from duplicates to canonical
UPDATE sku_balances
SET quantity = quantity + COALESCE(
  (SELECT SUM(sb2.quantity) FROM sku_balances sb2
   WHERE sb2.sku_id IN ('a12103c6-5660-4cf3-9866-689ab82f5fa5', 'c764e029-d9b3-4aff-9887-7602d9ce4690')),
  0)
WHERE sku_id = '4e7fdde5-d34d-47e7-a148-9303349f2721';

-- If canonical had no balance row, create one
INSERT INTO sku_balances (sku_id, nomenclature_id, quantity, last_received_at)
SELECT '4e7fdde5-d34d-47e7-a148-9303349f2721',
       '3564b7a8-cd1b-4c36-8038-3f7a01992470',
       COALESCE(SUM(sb.quantity), 0),
       now()
FROM sku_balances sb
WHERE sb.sku_id IN ('a12103c6-5660-4cf3-9866-689ab82f5fa5', 'c764e029-d9b3-4aff-9887-7602d9ce4690')
ON CONFLICT (sku_id) DO NOTHING;

-- Delete old balance rows
DELETE FROM sku_balances
WHERE sku_id IN ('a12103c6-5660-4cf3-9866-689ab82f5fa5', 'c764e029-d9b3-4aff-9887-7602d9ce4690');

-- Step 2f: Deactivate duplicate SKUs (soft delete, per P0 rules)
UPDATE sku SET is_active = false
WHERE id IN ('a12103c6-5660-4cf3-9866-689ab82f5fa5', 'c764e029-d9b3-4aff-9887-7602d9ce4690');
