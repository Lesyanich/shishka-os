-- Migration 068: Data Quality Improvements
-- 1. UoM normalization (L → l, etc.)
-- 2. name_th NOT NULL constraint on tags
-- 3. Additional nutrition data for missed items
-- 4. WHT percent column on fin_categories & fin_sub_categories

BEGIN;

-- ============================================================
-- Part 1: UoM normalization — lowercase base_unit / standard_output_uom
-- ============================================================
-- Some items have 'L' instead of 'l', 'Kg' instead of 'kg', etc.
UPDATE nomenclature SET base_unit = lower(base_unit)
WHERE base_unit IS DISTINCT FROM lower(base_unit);

UPDATE nomenclature SET standard_output_uom = lower(standard_output_uom)
WHERE standard_output_uom IS NOT NULL
  AND standard_output_uom IS DISTINCT FROM lower(standard_output_uom);


-- ============================================================
-- Part 2: name_th NOT NULL constraint on tags
-- ============================================================
-- Migration 067 backfilled name_th for all existing tags.
-- Ensure no future tags can be inserted without name_th.

-- Safety: fill any remaining NULLs with English name as fallback
UPDATE tags SET name_th = name WHERE name_th IS NULL OR name_th = '';

ALTER TABLE tags ALTER COLUMN name_th SET DEFAULT '';
ALTER TABLE tags ALTER COLUMN name_th SET NOT NULL;


-- ============================================================
-- Part 3: Additional nutrition data (per 100g, USDA FoodData Central)
-- ============================================================
-- Items that exist in nomenclature but were missed in migration 067.

-- RAW-SALT-SEA (was in 043 seed but not in 067 nutrition)
UPDATE nomenclature SET calories=0, protein=0, carbs=0, fat=0
WHERE product_code='RAW-SALT-SEA';

-- RAW-SHISHKA-MIX (proprietary spice blend — estimated avg of turmeric, ginger, pepper, coriander)
UPDATE nomenclature SET calories=185, protein=7.0, carbs=38.0, fat=4.5
WHERE product_code='RAW-SHISHKA-MIX';


-- ============================================================
-- Part 4: WHT percent column on financial categories
-- ============================================================

-- 4a. Add wht_percent column to fin_categories
ALTER TABLE fin_categories
  ADD COLUMN IF NOT EXISTS wht_percent NUMERIC DEFAULT 0;

-- 4b. Add wht_percent column to fin_sub_categories
ALTER TABLE fin_sub_categories
  ADD COLUMN IF NOT EXISTS wht_percent NUMERIC DEFAULT 0;

-- 4c. Populate fin_categories WHT values from CSV REF_Categories
-- Parent categories (1000, 2000, 3000, 4000) have '-' → default 0, skip
UPDATE fin_categories SET wht_percent = 3   WHERE code = 1100;  -- Construction / Fit-out
UPDATE fin_categories SET wht_percent = 0   WHERE code = 1200;  -- Kitchen Equipment (0%*)
UPDATE fin_categories SET wht_percent = 0   WHERE code = 1300;  -- Furniture & Fixtures (0%*)
UPDATE fin_categories SET wht_percent = 3   WHERE code = 1400;  -- IT Software License
UPDATE fin_categories SET wht_percent = 5   WHERE code = 2100;  -- Rental (Space)
UPDATE fin_categories SET wht_percent = 0   WHERE code = 2200;  -- Utilities
UPDATE fin_categories SET wht_percent = 3   WHERE code = 2300;  -- Maintenance & Repair
UPDATE fin_categories SET wht_percent = 2   WHERE code = 2400;  -- Marketing & Branding
UPDATE fin_categories SET wht_percent = 1   WHERE code = 2500;  -- Delivery / Logistics
UPDATE fin_categories SET wht_percent = 3   WHERE code = 3100;  -- Legal & Professional
UPDATE fin_categories SET wht_percent = 0   WHERE code = 3200;  -- Visa & Work Permits (0%**)
UPDATE fin_categories SET wht_percent = 3   WHERE code = 3300;  -- Consulting Fees
UPDATE fin_categories SET wht_percent = 0   WHERE code = 4100;  -- Raw Materials / Food
UPDATE fin_categories SET wht_percent = 0   WHERE code = 4200;  -- Packaging / Takeaway

-- 4d. Populate fin_sub_categories WHT values from CSV REF_Sub_Categories
-- Construction
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 1101;  -- HVAC & Ventilation
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 1102;  -- Electrical & Plumbing
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 1103;  -- Interior Works
-- Kitchen Equipment (0%*)
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 1201;  -- Hot Line Equipment
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 1202;  -- Cold Line Equipment
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 1203;  -- Food Prep & Smallware
-- Furniture (0%*)
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 1301;  -- Dining Furniture
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 1302;  -- Custom Fixtures
-- IT
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 1401;  -- POS System
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 1402;  -- AI & Analytics
-- Rental
UPDATE fin_sub_categories SET wht_percent = 5 WHERE sub_code = 2101;  -- Monthly Rent
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 2102;  -- CAM / Service Fees
-- Utilities
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 2201;  -- Electricity
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 2202;  -- Water
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 2203;  -- Internet
-- Maintenance
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 2301;  -- AC Service
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 2302;  -- Pest Control
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 2303;  -- Cleaning Supplies (product purchase, 0%)
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 2304;  -- Office Supplies (product purchase, 0%)
-- Marketing
UPDATE fin_sub_categories SET wht_percent = 2 WHERE sub_code = 2401;  -- Digital Marketing
UPDATE fin_sub_categories SET wht_percent = 2 WHERE sub_code = 2402;  -- Design & Print
-- Delivery
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code = 2501;  -- Fleet & Fuel
UPDATE fin_sub_categories SET wht_percent = 1 WHERE sub_code = 2502;  -- Platform Commission
-- Legal
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 3101;  -- Accounting & Tax
UPDATE fin_sub_categories SET wht_percent = 3 WHERE sub_code = 3102;  -- Legal Fees
-- Food (all 0%)
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code IN (4101, 4102, 4103, 4104, 4105, 4106, 4107, 4108, 4109, 4110, 4111, 4150);
-- Packaging (all 0%)
UPDATE fin_sub_categories SET wht_percent = 0 WHERE sub_code IN (4201, 4202, 4203);

COMMIT;
