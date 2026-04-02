-- Migration 071: Normalize nomenclature.type to match Lego prefixes
--
-- Problem: type CHECK allows ('good','dish','modifier','modifier_group','service')
-- but MCP agent and product_code prefixes use RAW/PF/MOD/SALE.
-- This creates confusion: PF items have type='dish', same as SALE items.
--
-- Solution: Expand CHECK to also accept prefix-aligned values,
-- then migrate existing data to use clear type names.
-- Old values still work (backward compatible with admin-panel).

-- Step 1: Drop the old CHECK constraint
-- The constraint name may vary — try common patterns
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Try dropping by known constraint names
  BEGIN
    ALTER TABLE nomenclature DROP CONSTRAINT IF EXISTS nomenclature_type_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  -- Also try the auto-generated name format
  BEGIN
    ALTER TABLE nomenclature DROP CONSTRAINT IF EXISTS nomenclature_type_check1;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;

  -- Brute force: find and drop any CHECK on the type column
  FOR r IN (
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'nomenclature'::regclass
      AND con.contype = 'c'
      AND att.attname = 'type'
  ) LOOP
    EXECUTE format('ALTER TABLE nomenclature DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Step 2: Add new CHECK that accepts both old and new values
ALTER TABLE nomenclature ADD CONSTRAINT nomenclature_type_check
  CHECK (type IN (
    -- Legacy values (admin-panel compatible)
    'good', 'dish', 'modifier', 'modifier_group', 'service',
    -- New Lego-aligned values
    'raw_ingredient', 'semi_finished'
  ));

-- Step 3: Migrate PF items from 'dish' to 'semi_finished' so they're distinguishable from SALE
-- Only update items whose product_code starts with 'PF-'
UPDATE nomenclature
SET type = 'semi_finished'
WHERE product_code LIKE 'PF-%'
  AND type = 'dish';

-- Step 4: Migrate RAW items from 'good' to 'raw_ingredient' for clarity
UPDATE nomenclature
SET type = 'raw_ingredient'
WHERE product_code LIKE 'RAW-%'
  AND type = 'good';

-- Step 5: Add comment explaining the mapping
COMMENT ON COLUMN nomenclature.type IS
  'Product type. Mapping: RAW→raw_ingredient, PF→semi_finished, MOD→modifier, SALE→dish. Legacy values (good, modifier_group, service) still accepted.';
