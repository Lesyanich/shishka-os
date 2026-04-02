-- ════════════════════════════════════════════════════════════
-- Migration 025: Import Historical Expense Data from Expenses.csv
-- Source: 04_Financial_Control/Expenses and Capex Equipment - Expenses.csv
-- Date: 2026-03-10
-- Total records: 62 expense transactions (Sep 2025 — Mar 2026)
-- ════════════════════════════════════════════════════════════
-- Category mapping:
--   Rent           → 2100 (Rental Space)
--   Equipment      → 1200 (Kitchen Equipment)
--   Construction   → 1100 (Construction / Fit-out)
--   Legal          → 3100 (Legal & Professional)
--   Furniture      → 1300 (Furniture & Fixtures)
--   Decoration     → 1300 (Furniture & Fixtures)
--   IT Software    → 1400 (IT Software License)
--   Water/elec     → 2200 (Utilities)
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────
-- PART 0: Ensure suppliers.name has a UNIQUE constraint
--         (needed for ON CONFLICT)
-- ─────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.suppliers'::regclass
          AND conname = 'uq_suppliers_name'
    ) THEN
        ALTER TABLE public.suppliers
            ADD CONSTRAINT uq_suppliers_name UNIQUE (name);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- PART 1: Upsert suppliers (ON CONFLICT DO NOTHING)
-- ─────────────────────────────────────────────────────────

INSERT INTO suppliers (name) VALUES
  ('landlord-1'),
  ('lawyer-1'),
  ('Tops'),
  ('Lazada'),
  ('Home pro'),
  ('Richi Construction'),
  ('Stiker guy'),
  ('Ram'),
  ('Japanese second hand'),
  ('Global house'),
  ('P N advertising'),
  ('Host'),
  ('Shandong Lingfan Technology Co., Ltd.'),
  ('New Ton'),
  ('Sarah cargo company China'),
  ('Pimonphan pha'),
  ('PIMONPHAN PHA'),
  ('Google Asia Pacific Pte. Ltd.'),
  ('การประปาส่วนภูมิภาคสาขาภูเก็ต')
ON CONFLICT ON CONSTRAINT uq_suppliers_name DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- PART 2: Insert 62 expense records
--         Using details LIKE '%<TransactionID>%' guard for idempotency
-- ─────────────────────────────────────────────────────────

-- Row 1: 20251022000 — landlord-1, Rent deposit
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status, receipt_bank_url
)
SELECT
  '2025-10-22', 'OpEx', 2100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('landlord-1') LIMIT 1),
  '[20251022000] Rent — Deposit',
  20000, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'af9f10ea-de91-4929-9c33-15a87ab35208.JPG'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251022000%');

-- Row 2: 20250909001 — lawyer-1, Consalt
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-09-09', 'CapEx', 3100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('lawyer-1') LIMIT 1),
  '[20250909001] Consalt — Lease agreements',
  10000, 'THB', 1,
  'Bas', 'cash', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20250909001%');

-- Row 3: 20251024001 — landlord-1, Rent 1 year
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-10-24', 'OpEx', 2100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('landlord-1') LIMIT 1),
  '[20251024001] Rent — 1 year rent',
  216000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251024001%');

-- Row 4: 20251026001 — Tops, Rent 6 months
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-10-26', 'OpEx', 2100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Tops') LIMIT 1),
  '[20251026001] Rent (deposit 20+30=50 and 6 months rent 120) — 6month rent',
  170000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251026001%');

-- Row 5: 20251030001 — Lazada, Printer
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-10-30', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Lazada') LIMIT 1),
  '[20251030001] Printer — printer for stickers',
  5000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251030001%');

-- Row 6: 20251030002 — landlord-1, Kitchen renovation
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-10-30', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('landlord-1') LIMIT 1),
  '[20251030002] Kitchen renovation — Door to kitchen/drainer',
  3000, 'THB', 1,
  'Bas', 'cash', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251030002%');

-- Row 7: 20251030003 — landlord-1, Chairs
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-10-30', 'CapEx', 1300,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('landlord-1') LIMIT 1),
  '[20251030003] Chairs — renovating existing',
  4000, 'THB', 1,
  'Bas', 'cash', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251030003%');

-- Row 8: 20251030004 — landlord-1, Parking
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-10-30', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('landlord-1') LIMIT 1),
  '[20251030004] Parking',
  4000, 'THB', 1,
  'Bas', 'cash', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251030004%');

-- Row 9: 20251030005 — landlord-1, Sink in kitchen
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-10-30', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('landlord-1') LIMIT 1),
  '[20251030005] Sink in kitchen',
  3000, 'THB', 1,
  'Bas', 'cash', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251030005%');

-- Row 10: 20251109001 — Richi Construction, windows+doors+ac
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-09', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251109001] windows+doors+ac',
  90000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251109001%');

-- Row 11: 20251110001 — Home pro, tile
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-10', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Home pro') LIMIT 1),
  '[20251110001] tile — floor 32qm',
  8400, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251110001%');

-- Row 12: 20251111001 — Richi Construction, Electricity
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-11', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251111001] Electricity',
  10000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251111001%');

-- Row 13: 20251112001 — Stiker guy, Stiker to cover construction
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-12', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Stiker guy') LIMIT 1),
  '[20251112001] Stiker to cover construction',
  1000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251112001%');

-- Row 14: 20251113001 — Richi Construction, Exsoste fans
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-13', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251113001] Exsoste fans',
  20000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251113001%');

-- Row 15: 20251117001 — Ram, Establishing company
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-17', 'CapEx', 3100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Ram') LIMIT 1),
  '[20251117001] Ram — Establishing company',
  100000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251117001%');

-- Row 16: 20251117002 — Japanese second hand, Tea cups vase
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-17', 'CapEx', 1300,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Japanese second hand') LIMIT 1),
  '[20251117002] Tea cups vase — 20 cups 1 plate and gaze',
  1600, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251117002%');

-- Row 17: 20251119001 — Global house, tile
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-19', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Global house') LIMIT 1),
  '[20251119001] tile — 50sqm',
  6525, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251119001%');

-- Row 18: 20251120001 — Richi Construction, Tile installation
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-20', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251120001] Tile installation — 32 sq.m floor',
  21000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251120001%');

-- Row 19: 20251121001 — Japanese second hand, Coffee cups, plates
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-21', 'CapEx', 1300,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Japanese second hand') LIMIT 1),
  '[20251121001] Coffee cups, plates (2000thb)',
  2500, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251121001%');

-- Row 20: 20251121002 — Home pro, tile
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-21', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Home pro') LIMIT 1),
  '[20251121002] tile — For outside sitting',
  1990, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251121002%');

-- Row 21: 20251123001 — Japanese second hand, Plates
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-23', 'CapEx', 1300,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Japanese second hand') LIMIT 1),
  '[20251123001] Plates — assorted sizes',
  4070, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251123001%');

-- Row 22: 20251122001 — Richi Construction, The rest for windows
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-22', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251122001] The rest for windows',
  50000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251122001%');

-- Row 23: 20251121003 — Global house, tile
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-21', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Global house') LIMIT 1),
  '[20251121003] tile — For kitchen apron',
  937, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251121003%');

-- Row 24: 20251129001 — Richi Construction, Paint hood
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-29', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251129001] Paint hood',
  15000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251129001%');

-- Row 25: 20251128001 — Ram, For 2nd name
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-11-28', 'CapEx', 3100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Ram') LIMIT 1),
  '[20251128001] Ram — For 2nd name',
  5000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251128001%');

-- Row 26: 20251203001 — Richi Construction, Insulation and tiling
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-03', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251203001] Insulation and tiling outside and splash back also the trims',
  23000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251203001%');

-- Row 27: 20251205001 — Shandong Lingfan, fridges (USD)
-- 3174 USD, Chosen Currency = 111201 THB → rate = 111201/3174 ≈ 35.0382
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-05', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Shandong Lingfan Technology Co., Ltd.') LIMIT 1),
  '[20251205001] Shandong Lingfan Technology Co., Ltd. — fridges and everyth',
  3174, 'USD', 35.0382,
  'Bas', 'transfer', 'pending'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251205001%');

-- Row 28: 20251205002 — Ram, For 1st name
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-05', 'CapEx', 3100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Ram') LIMIT 1),
  '[20251205002] Ram — For 1st name',
  25000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251205002%');

-- Row 29: 20251203002 — Global house, tile
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-03', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Global house') LIMIT 1),
  '[20251203002] tile — unnecessary ones',
  660, 'THB', 1,
  'Bas', 'other', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251203002%');

-- Row 30: 20251206001 — Richi Construction, AC
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-06', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251206001] AC — balance 17500',
  17500, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251206001%');

-- Row 31: 20251208001 — Richi Construction, Ceiling
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_supplier_url
)
SELECT
  '2025-12-08', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251208001] Ceiling — gibsum, service hatches, painting',
  27250, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'PHOTO-2025-12-08-20-33-07.jpg'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251208001%');

-- Row 32: 20251208002 — P N advertising, signboard
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-08', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('P N advertising') LIMIT 1),
  '[20251208002] signboard — First payment',
  35000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251208002%');

-- Row 33: 20251211001 — Host, host (USD)
-- 16 USD, Chosen Currency = 562 THB → rate = 562/16 = 35.125
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-11', 'OpEx', 1400,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Host') LIMIT 1),
  '[20251211001] host — First payment',
  16, 'USD', 35.125,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251211001%');

-- Row 34: 20251212001 — Richi Construction, Ceiling (L1 Sayan)
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_supplier_url
)
SELECT
  '2025-12-12', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251212001] Ceiling — gibsum, painting L1 Sayan',
  26650, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  '13d1b6ca-4228-4cf1-ad1e-f89c3aa251be.jpg'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251212001%');

-- Row 35: 20251212002 — Richi Construction, Ceiling (L1 Sayan, 2nd payment)
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_supplier_url
)
SELECT
  '2025-12-12', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251212002] Ceiling — gibsum, painting L1 Sayan (2nd)',
  21250, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  '13d1b6ca-4228-4cf1-ad1e-f89c3aa251be.jpg'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251212002%');

-- Row 36: 20251220001 — Richi Construction, ceramic
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-20', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20251220001] ceramic',
  14900, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251220001%');

-- Row 37: 20251222001 — #N/A (skip supplier), Electricity
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-22', 'OpEx', 2200,
  NULL,
  '[20251222001] Electricity — November',
  19, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251222001%');

-- Row 38: 20251210001 — Shandong Lingfan, lights (USD)
-- 212 USD, Chosen Currency = 7409 THB → rate = 7409/212 ≈ 34.9481
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2025-12-10', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Shandong Lingfan Technology Co., Ltd.') LIMIT 1),
  '[20251210001] lights — lamps pinecone x 6pc',
  212, 'USD', 34.9481,
  'Bas', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20251210001%');

-- Row 39: 20260103001 — Shandong Lingfan, Blast Chiller (USD)
-- 1019 USD, Chosen Currency = 35243 THB → rate = 35243/1019 ≈ 34.5859
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_bank_url
)
SELECT
  '2026-01-03', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Shandong Lingfan Technology Co., Ltd.') LIMIT 1),
  '[20260103001] Blast Chiller / Shock Freezer — first payment',
  1019, 'USD', 34.5859,
  'Bas', 'transfer', 'paid',
  'WhatsApp Image 2026-01-03 at 09.48.38.jpeg'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260103001%');

-- Row 40: 20260109001 — Shandong Lingfan, fridges (THB)
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-01-09', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Shandong Lingfan Technology Co., Ltd.') LIMIT 1),
  '[20260109001] Shandong Lingfan — fridges and everyth (THB portion)',
  46192, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260109001%');

-- Row 41: 20260109002 — Shandong Lingfan, fridges (AED)
-- 22728 AED, Chosen Currency = 214063 THB → rate = 214063/22728 ≈ 9.4184
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-01-09', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Shandong Lingfan Technology Co., Ltd.') LIMIT 1),
  '[20260109002] Shandong Lingfan — fridges and everyth (AED portion)',
  22728, 'AED', 9.4184,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260109002%');

-- Row 42: 20260109003 — Shandong Lingfan, Grill and Burner (THB)
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_bank_url
)
SELECT
  '2026-01-09', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Shandong Lingfan Technology Co., Ltd.') LIMIT 1),
  '[20260109003] Shandong Lingfan — Grill and Burner',
  21463, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'GrillBurnerBill.png'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260109003%');

-- Row 43: 20260114001 — New Ton, Deposit oven
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_bank_url
)
SELECT
  '2026-01-14', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('New Ton') LIMIT 1),
  '[20260114001] Deposit oven — Merrychef',
  57874, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'Merrychef new ton deposit.JPG'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260114001%');

-- Row 44: 20260115001 — Shandong Lingfan, 2nd payment Blast Chiller
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_bank_url
)
SELECT
  '2026-01-15', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Shandong Lingfan Technology Co., Ltd.') LIMIT 1),
  '[20260115001] Shandong Lingfan — 2nd payment Blast Chiller / Shock Freezer',
  50728, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'Blast freezer vacuum.png'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260115001%');

-- Row 45: 20260122001 — Shandong Lingfan, outdoor umbrella
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_bank_url
)
SELECT
  '2026-01-22', 'OpEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Shandong Lingfan Technology Co., Ltd.') LIMIT 1),
  '[20260122001] outdoor umbrella',
  20000, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'Umbrella_L2.png'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260122001%');

-- Row 46: 20260123001 — Sarah cargo company China, delivery
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-01-23', 'OpEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Sarah cargo company China') LIMIT 1),
  '[20260123001] delivery from China',
  91837, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260123001%');

-- Row 47: 20260123002 — Sarah cargo company China, delivery
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-01-23', 'OpEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Sarah cargo company China') LIMIT 1),
  '[20260123002] delivery from China',
  325, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260123002%');

-- Row 48: 20260123003 — Sarah cargo company China, delivery
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-01-23', 'OpEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Sarah cargo company China') LIMIT 1),
  '[20260123003] delivery from China',
  98814, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260123003%');

-- Row 49: 20260123004 — P N advertising, signboard
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-01-23', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('P N advertising') LIMIT 1),
  '[20260123004] signboard',
  1200, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260123004%');

-- Row 50: 20260112001 — การประปาส่วนภูมิภาคสาขาภูเก็ต, Water meter
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_supplier_url
)
SELECT
  '2026-01-12', 'OpEx', 2200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('การประปาส่วนภูมิภาคสาขาภูเก็ต') LIMIT 1),
  '[20260112001] Water meter installation/connection fee',
  321, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'https://drive.google.com/file/d/1MoH8aac67zrBakCzVejH-0tQBnvr8FSi/view?usp=drivesdk'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260112001%');

-- Row 51: 20260125001 — #N/A (skip supplier), general cleaning
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-01-25', 'OpEx', 1100,
  NULL,
  '[20260125001] general cleaning',
  8500, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260125001%');

-- Row 52: 20260203001 — Ram, Visa work Permit
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-02-03', 'CapEx', 3100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Ram') LIMIT 1),
  '[20260203001] Visa work Permit — For 1st name',
  119000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260203001%');

-- Row 53: 20260129001 — New Ton, oven
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_bank_url
)
SELECT
  '2026-01-29', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('New Ton') LIMIT 1),
  '[20260129001] oven — Merrychef',
  135037, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'Merrychef new ton deposit.JPG'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260129001%');

-- Row 54: 20260206001 — Pimonphan pha, salad bar repair
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-02-06', 'OpEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Pimonphan pha') LIMIT 1),
  '[20260206001] salad bar repair — salad bar repair and deposit for SS tables',
  11000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260206001%');

-- Row 55: 20260209001 — Pimonphan pha, salad bar repair
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-02-09', 'OpEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Pimonphan pha') LIMIT 1),
  '[20260209001] salad bar repair — salad bar repair and deposit for SS tables',
  20000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260209001%');

-- Row 56: 20260209002 — Richi Construction, painting and umbrella
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_supplier_url
)
SELECT
  '2026-02-09', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20260209002] 12000 for painting and work, rest of money for umbrella',
  24000, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  '13d1b6ca-4228-4cf1-ad1e-f89c3aa251be.jpg'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260209002%');

-- Row 57: 20260222001 — Pimonphan pha, salad bar repair (hood)
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-02-22', 'OpEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Pimonphan pha') LIMIT 1),
  '[20260222001] salad bar repair — hood',
  25000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260222001%');

-- Row 58: 20260226001 — Richi Construction, gas
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_supplier_url
)
SELECT
  '2026-02-26', 'CapEx', 1100,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Richi Construction') LIMIT 1),
  '[20260226001] gas',
  10000, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  '13d1b6ca-4228-4cf1-ad1e-f89c3aa251be.jpg'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260226001%');

-- Row 59: 20260225001 — #N/A (skip supplier), AC to the kitchen
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_bank_url
)
SELECT
  '2026-02-25', 'CapEx', 1200,
  NULL,
  '[20260225001] AC to the kitchen',
  10700, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'Merrychef new ton deposit.JPG'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260225001%');

-- Row 60: 20260301001 — PIMONPHAN PHA, SS Sink kitchen L2
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status
)
SELECT
  '2026-03-01', 'CapEx', 1200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('PIMONPHAN PHA') LIMIT 1),
  '[20260301001] Bank transfer payment to Pimonphan Pha via PromptPay — SS Sink kitchen L2',
  15000, 'THB', 1,
  'Lesya', 'transfer', 'paid'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260301001%');

-- Row 61: 20260228001 — Google Asia Pacific, Workspace subscription
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_supplier_url
)
SELECT
  '2026-02-28', 'OpEx', 1400,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('Google Asia Pacific Pte. Ltd.') LIMIT 1),
  '[20260228001] Google Workspace Business Standard subscription (2 users) — Feb 2026',
  835, 'THB', 1,
  'Lesya', 'transfer', 'paid',
  'https://drive.google.com/file/d/1SEDY36RQ6enC7ASdDLB-CuYKGf6XE-UI/view?usp=drivesdk'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260228001%');

-- Row 62: 20260112002 — การประปาส่วนภูมิภาคสาขาภูเก็ต, Water supply Dec 2025
INSERT INTO expense_ledger (
  transaction_date, flow_type, category_code, supplier_id,
  details, amount_original, currency, exchange_rate,
  paid_by, payment_method, status,
  receipt_supplier_url
)
SELECT
  '2026-01-12', 'OpEx', 2200,
  (SELECT id FROM suppliers WHERE LOWER(name) = LOWER('การประปาส่วนภูมิภาคสาขาภูเก็ต') LIMIT 1),
  '[20260112002] Water supply for Dec 2025 (6000 liters, meter 671-677)',
  193, 'THB', 1,
  'Bas', 'cash', 'paid',
  'https://drive.google.com/file/d/1pWbrxV9okzdzf2M8WWbsShc0Shq7A9U7/view?usp=drivesdk'
WHERE NOT EXISTS (SELECT 1 FROM expense_ledger WHERE details LIKE '%20260112002%');

-- ─────────────────────────────────────────────────────────
-- Verification: count imported records
-- ─────────────────────────────────────────────────────────
DO $$
DECLARE
  cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM expense_ledger;
  RAISE NOTICE 'expense_ledger now has % total records', cnt;
END $$;

COMMIT;
