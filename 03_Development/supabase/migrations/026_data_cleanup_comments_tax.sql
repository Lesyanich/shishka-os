-- ════════════════════════════════════════════════════════════
-- Migration 026: Data Cleanup — Details, Comments, Sub-categories, Tax Invoice Flag
-- Phase 4.3b — CEO-friendly data cleanup for expense_ledger
-- Date: 2026-03-10
-- ════════════════════════════════════════════════════════════
-- What this migration does:
--   1. Adds `comments` TEXT column
--   2. Adds `has_tax_invoice` BOOLEAN column
--   3. Ensures ALL REF categories & sub-categories exist
--   4. Merges duplicate supplier PIMONPHAN PHA → Pimonphan pha
--   5. Cleans up all 62 rows: details, comments, sub_category_code, fixes category_code
--   6. Fixes receipt URLs (plain filenames → full Supabase Storage URLs)
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────
-- PART 1: Add new columns
-- ─────────────────────────────────────────────────────────
ALTER TABLE expense_ledger ADD COLUMN IF NOT EXISTS comments TEXT;
ALTER TABLE expense_ledger ADD COLUMN IF NOT EXISTS has_tax_invoice BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────
-- PART 2: Ensure all REF categories & sub-categories exist
-- ─────────────────────────────────────────────────────────
INSERT INTO fin_categories (code, name, type) VALUES
  (1000, 'Fixed Assets',           'Asset'),
  (1100, 'Construction / Fit-out', 'Asset'),
  (1200, 'Kitchen Equipment',      'Asset'),
  (1300, 'Furniture & Fixtures',   'Asset'),
  (1400, 'IT Software License',    'Asset'),
  (2000, 'Operating Expenses',     'Expense'),
  (2100, 'Rental (Space)',         'Expense'),
  (2200, 'Utilities',             'Expense'),
  (2300, 'Maintenance & Repair',   'Expense'),
  (2400, 'Marketing & Branding',   'Expense'),
  (2500, 'Delivery / Logistics',   'Expense'),
  (3000, 'Admin Expenses',         'Expense'),
  (3100, 'Legal & Professional',   'Expense'),
  (3200, 'Visa & Work Permits',    'Expense'),
  (3300, 'Consulting Fees',        'Expense'),
  (4000, 'Cost of Goods Sold',     'Expense'),
  (4100, 'Raw Materials / Food',   'Expense'),
  (4200, 'Packaging / Takeaway',   'Expense')
ON CONFLICT (code) DO NOTHING;

INSERT INTO fin_sub_categories (sub_code, category_code, name) VALUES
  (1101, 1100, 'HVAC & Ventilation'),
  (1102, 1100, 'Electrical & Plumbing'),
  (1103, 1100, 'Interior Works'),
  (1201, 1200, 'Hot Line Equipment'),
  (1202, 1200, 'Cold Line Equipment'),
  (1203, 1200, 'Food Prep & Smallware'),
  (1301, 1300, 'Dining Furniture'),
  (1302, 1300, 'Custom Fixtures'),
  (1401, 1400, 'POS System'),
  (1402, 1400, 'AI & Analytics'),
  (2101, 2100, 'Monthly Rent'),
  (2102, 2100, 'CAM / Service Fees'),
  (2201, 2200, 'Electricity'),
  (2202, 2200, 'Water'),
  (2203, 2200, 'Internet'),
  (2301, 2300, 'AC Service'),
  (2302, 2300, 'Pest Control'),
  (2401, 2400, 'Digital Marketing'),
  (2402, 2400, 'Design & Print'),
  (2501, 2500, 'Fleet & Fuel'),
  (2502, 2500, 'Platform Commission'),
  (3101, 3100, 'Accounting & Tax'),
  (3102, 3100, 'Legal Fees'),
  (4101, 4100, 'Produce (Veg/Fruit)'),
  (4102, 4100, 'Proteins (Meat/Fish)'),
  (4103, 4100, 'Grains & Superfoods'),
  (4201, 4200, 'Bowls & Containers'),
  (4202, 4200, 'Cutlery & Napkins')
ON CONFLICT (sub_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- PART 3: Merge duplicate supplier PIMONPHAN PHA → Pimonphan pha
-- ─────────────────────────────────────────────────────────
UPDATE expense_ledger
SET supplier_id = (SELECT id FROM suppliers WHERE name = 'Pimonphan pha' LIMIT 1)
WHERE supplier_id = (SELECT id FROM suppliers WHERE name = 'PIMONPHAN PHA' LIMIT 1)
  AND (SELECT id FROM suppliers WHERE name = 'PIMONPHAN PHA' LIMIT 1) IS NOT NULL;

UPDATE suppliers SET is_deleted = true
WHERE name = 'PIMONPHAN PHA'
  AND id != COALESCE((SELECT id FROM suppliers WHERE name = 'Pimonphan pha' LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid);

-- ─────────────────────────────────────────────────────────
-- PART 4: Bulk update — details, comments, sub_category, category fixes
-- Using transaction ID embedded in details field for matching
-- ─────────────────────────────────────────────────────────
WITH updates(txid, new_details, new_comments, sub_cat, fix_cat) AS (VALUES
  -- Row 1: Rent deposit
  ('20251022000', 'Rent', 'Deposit', 2101, NULL::integer),
  -- Row 2: Legal consultation
  ('20250909001', 'Legal consultation', 'Lease agreements', 3102, NULL),
  -- Row 3: Rent 1 year
  ('20251024001', 'Rent (1 year)', '1 year rent', 2101, NULL),
  -- Row 4: Rent deposit + 6 months
  ('20251026001', 'Rent (deposit + 6 months)', 'Deposit 50k + 6 months rent 120k', 2101, NULL),
  -- Row 5: Label printer
  ('20251030001', 'Label printer', 'Printer for stickers', 1203, NULL),
  -- Row 6: Kitchen renovation
  ('20251030002', 'Kitchen renovation', 'Door to kitchen, drainer', 1103, NULL),
  -- Row 7: Chairs
  ('20251030003', 'Chairs', 'Renovating existing', 1301, NULL),
  -- Row 8: Parking
  ('20251030004', 'Parking', NULL, 1103, NULL),
  -- Row 9: Kitchen sink
  ('20251030005', 'Kitchen sink', NULL, 1102, NULL),
  -- Row 10: Windows, doors, AC
  ('20251109001', 'Windows, doors, AC', NULL, 1103, NULL),
  -- Row 11: Floor tiles
  ('20251110001', 'Floor tiles', '32 sqm', 1103, NULL),
  -- Row 12: Electrical work
  ('20251111001', 'Electrical work', NULL, 1102, NULL),
  -- Row 13: Construction cover sticker
  ('20251112001', 'Construction cover sticker', NULL, 1103, NULL),
  -- Row 14: Exhaust fans
  ('20251113001', 'Exhaust fans', NULL, 1101, NULL),
  -- Row 15: Company registration (details was "Ram" = supplier name, fixing)
  ('20251117001', 'Company registration', 'Establishing company', 3102, NULL),
  -- Row 16: Tea cups, vase
  ('20251117002', 'Tea cups, vase', '20 cups, 1 plate, vase', 1302, NULL),
  -- Row 17: Floor tiles
  ('20251119001', 'Floor tiles', '50 sqm', 1103, NULL),
  -- Row 18: Tile installation
  ('20251120001', 'Tile installation', '32 sq.m floor', 1103, NULL),
  -- Row 19: Coffee cups, plates
  ('20251121001', 'Coffee cups, plates', '5 plates 30cm, 1 plate 26cm, 6 cups', 1302, NULL),
  -- Row 20: Tiles for outside sitting
  ('20251121002', 'Tiles', 'For outside sitting area', 1103, NULL),
  -- Row 21: Plates (various sizes)
  ('20251123001', 'Plates (various sizes)', '6x30cm, 5x26cm, 5x20x13cm, 6x21cm, pearl set', 1302, NULL),
  -- Row 22: Windows final payment
  ('20251122001', 'Windows (final payment)', NULL, 1103, NULL),
  -- Row 23: Tiles for kitchen apron
  ('20251121003', 'Tiles', 'Kitchen apron', 1103, NULL),
  -- Row 24: Hood painting
  ('20251129001', 'Hood painting', NULL, 1103, NULL),
  -- Row 25: Legal services
  ('20251128001', 'Legal services', 'For 2nd company name', 3102, NULL),
  -- Row 26: Insulation, tiling, splash back
  ('20251203001', 'Insulation, tiling, splash back', 'Outside tiling and splash back with trims', 1103, NULL),
  -- Row 27: Refrigeration equipment (USD)
  ('20251205001', 'Refrigeration equipment', 'Fridges and everything', 1202, NULL),
  -- Row 28: Legal services
  ('20251205002', 'Legal services', 'For 1st company name', 3102, NULL),
  -- Row 29: Tiles return
  ('20251203002', 'Tiles (extra/return)', 'Unnecessary tiles', 1103, NULL),
  -- Row 30: AC balance payment
  ('20251206001', 'AC (balance payment)', 'AC complete and tested, balance 17500', 1101, NULL),
  -- Row 31: Ceiling and painting
  ('20251208001', 'Ceiling gypsum and painting', 'Ceiling gypsum, 2 service hatches, painting 52sqm', 1103, NULL),
  -- Row 32: Signboard first payment → FIX cat from 1100 to 1300
  ('20251208002', 'Signboard (first payment)', 'First payment', 1302, 1300),
  -- Row 33: Web hosting
  ('20251211001', 'Web hosting', 'First payment', 1402, NULL),
  -- Row 34: Ceiling and painting L1 Sayan
  ('20251212001', 'Ceiling and painting (L1)', 'Ceiling gypsum, service hatches, painting', 1103, NULL),
  -- Row 35: Ceiling and painting L1 Sayan (2nd payment)
  ('20251212002', 'Ceiling and painting (L1)', 'Ceiling gypsum, service hatches, painting (2nd payment)', 1103, NULL),
  -- Row 36: Ceramic tiles
  ('20251220001', 'Ceramic tiles', NULL, 1103, NULL),
  -- Row 37: Electricity bill November
  ('20251222001', 'Electricity (November)', 'November bill', 2201, NULL),
  -- Row 38: Decorative lamps → FIX cat from 1200 to 1300
  ('20251210001', 'Decorative lamps (6 pcs)', 'Pinecone lamps x6', 1302, 1300),
  -- Row 39: Blast Chiller 1st payment
  ('20260103001', 'Blast Chiller (1st payment)', 'First payment for L1-BCH-01', 1202, NULL),
  -- Row 40: Refrigeration equipment
  ('20260109001', 'Refrigeration equipment', 'Fridges and everything', 1202, NULL),
  -- Row 41: Refrigeration equipment (AED)
  ('20260109002', 'Refrigeration equipment', 'Fridges and everything', 1202, NULL),
  -- Row 42: Grill and Burner
  ('20260109003', 'Grill and Burner', NULL, 1201, NULL),
  -- Row 43: Merrychef oven deposit
  ('20260114001', 'Merrychef oven (deposit)', 'Deposit for oven', 1201, NULL),
  -- Row 44: Blast Chiller 2nd payment
  ('20260115001', 'Blast Chiller (2nd payment)', '2nd payment for L1-BCH-01', 1202, NULL),
  -- Row 45: Outdoor umbrella
  ('20260122001', 'Outdoor umbrella', NULL, 1302, 1300),
  -- Row 46-48: Delivery from China → FIX cat from 1100 to 2500
  ('20260123001', 'Delivery from China', 'Equipment delivery', 2501, 2500),
  ('20260123002', 'Delivery from China', 'Equipment delivery', 2501, 2500),
  ('20260123003', 'Delivery from China', 'Equipment delivery', 2501, 2500),
  -- Row 49: Signboard → FIX cat from 1100 to 1300
  ('20260123004', 'Signboard', NULL, 1302, 1300),
  -- Row 50: Water meter installation
  ('20260112001', 'Water meter installation', 'Connection fee, invoice CT1216/69000008', 2202, NULL),
  -- Row 51: General cleaning → FIX cat from 1100 to 2300
  ('20260125001', 'General cleaning', NULL, 2302, 2300),
  -- Row 52: Visa and work permit → FIX cat from 3100 to 3200
  ('20260203001', 'Visa and work permit', 'For 1st name', NULL, 3200),
  -- Row 53: Merrychef oven final
  ('20260129001', 'Merrychef oven (final payment)', 'Full oven payment', 1201, NULL),
  -- Row 54: Salad bar repair
  ('20260206001', 'Salad bar repair', 'Salad bar repair and deposit for SS tables', 1103, NULL),
  -- Row 55: Salad bar repair
  ('20260209001', 'Salad bar repair', 'Salad bar repair and deposit for SS tables', 1103, NULL),
  -- Row 56: Painting and umbrella
  ('20260209002', 'Painting and umbrella work', '12000 for painting and work, rest for umbrella', 1103, NULL),
  -- Row 57: Hood fabrication
  ('20260222001', 'Hood fabrication', 'Stainless steel hood', 1101, NULL),
  -- Row 58: Gas installation
  ('20260226001', 'Gas installation', NULL, 1102, NULL),
  -- Row 59: Kitchen AC → FIX cat from 1200 to 1100
  ('20260225001', 'Kitchen AC', 'AC unit', 1101, 1100),
  -- Row 60: SS Sink kitchen L2 (clean up "Bank transfer payment to..." noise)
  ('20260301001', 'SS Sink (kitchen L2)', 'Stainless steel sink for L2 kitchen', 1302, 1300),
  -- Row 61: Google Workspace
  ('20260228001', 'Google Workspace (2 users)', 'Business Standard subscription, Feb 2026', 1402, NULL),
  -- Row 62: Water supply Dec 2025
  ('20260112002', 'Water supply (Dec 2025)', '6000 liters, meter 671-677', 2202, NULL)
)
UPDATE expense_ledger e
SET
  details = u.new_details,
  comments = u.new_comments,
  sub_category_code = u.sub_cat,
  category_code = COALESCE(u.fix_cat, e.category_code)
FROM updates u
WHERE e.details LIKE '%' || u.txid || '%';

-- ─────────────────────────────────────────────────────────
-- PART 5: Set has_tax_invoice flag
-- ─────────────────────────────────────────────────────────
UPDATE expense_ledger
SET has_tax_invoice = true
WHERE tax_invoice_url IS NOT NULL AND tax_invoice_url <> '';

-- ─────────────────────────────────────────────────────────
-- PART 6: Fix receipt URLs — plain filenames → full Supabase Storage URLs
-- Project: qcqgtcsjoacuktcewpvo, Bucket: receipts
-- ─────────────────────────────────────────────────────────
UPDATE expense_ledger
SET receipt_supplier_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/receipts/' || receipt_supplier_url
WHERE receipt_supplier_url IS NOT NULL
  AND receipt_supplier_url <> ''
  AND receipt_supplier_url NOT LIKE 'http%';

UPDATE expense_ledger
SET receipt_bank_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/receipts/' || receipt_bank_url
WHERE receipt_bank_url IS NOT NULL
  AND receipt_bank_url <> ''
  AND receipt_bank_url NOT LIKE 'http%';

UPDATE expense_ledger
SET tax_invoice_url = 'https://qcqgtcsjoacuktcewpvo.supabase.co/storage/v1/object/public/receipts/' || tax_invoice_url
WHERE tax_invoice_url IS NOT NULL
  AND tax_invoice_url <> ''
  AND tax_invoice_url NOT LIKE 'http%';

-- ─────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────
DO $$
DECLARE
  cnt_with_sub INTEGER;
  cnt_with_comments INTEGER;
  cnt_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt_total FROM expense_ledger;
  SELECT COUNT(*) INTO cnt_with_sub FROM expense_ledger WHERE sub_category_code IS NOT NULL;
  SELECT COUNT(*) INTO cnt_with_comments FROM expense_ledger WHERE comments IS NOT NULL AND comments <> '';
  RAISE NOTICE 'Total: %, With sub-category: %, With comments: %', cnt_total, cnt_with_sub, cnt_with_comments;
END $$;

COMMIT;
