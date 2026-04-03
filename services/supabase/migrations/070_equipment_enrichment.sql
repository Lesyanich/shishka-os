-- Migration 070: Equipment table enrichment
-- Adds category, status, capacity, timing, and availability fields for production planning
-- Required by: MCP Chef Agent (list_equipment), Backward Scheduling, Planner Agent
--
-- Current equipment columns (pre-migration):
--   id (UUID PK), equipment_code (TEXT), name (TEXT),
--   capacity_unit (TEXT), capacity_uom (GENERATED), unit_id (TEXT),
--   syrve_uuid (UUID), last_service_date (DATE), daily_availability_min (NUMERIC)

-- ─── Classification columns (missing from original schema) ──────

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS category           TEXT,     -- oven, mixer, refrigerator, prep_station, etc.
  ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'maintenance', 'out_of_service', 'retired'));

-- ─── Capacity & scheduling columns ─────────────────────────────

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS is_available       BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS capacity           NUMERIC,      -- max load per cycle
  ADD COLUMN IF NOT EXISTS processing_time_min INTEGER,      -- standard cycle time in minutes
  ADD COLUMN IF NOT EXISTS setup_time_min     INTEGER DEFAULT 0,  -- cleanup between uses
  ADD COLUMN IF NOT EXISTS max_parallel       INTEGER DEFAULT 1,  -- parallel batches (e.g. oven trays)
  ADD COLUMN IF NOT EXISTS notes              TEXT;

-- NOTE: capacity_unit already exists in the original schema, no need to add it.
-- We don't touch capacity_uom (GENERATED ALWAYS AS capacity_unit STORED).

-- ─── Auto-categorize existing equipment by name patterns ────────

UPDATE equipment SET category = 'oven'
  WHERE category IS NULL AND (
    name ILIKE '%oven%' OR name ILIKE '%convection%'
  );
UPDATE equipment SET category = 'refrigeration'
  WHERE category IS NULL AND (
    name ILIKE '%fridge%' OR name ILIKE '%freezer%' OR name ILIKE '%refrigerator%'
    OR name ILIKE '%chiller%' OR name ILIKE '%blast%'
  );
UPDATE equipment SET category = 'cooking'
  WHERE category IS NULL AND (
    name ILIKE '%burner%' OR name ILIKE '%induction%' OR name ILIKE '%range%'
    OR name ILIKE '%grill%' OR name ILIKE '%skillet%' OR name ILIKE '%smoker%'
    OR name ILIKE '%kettle%'
  );
UPDATE equipment SET category = 'prep'
  WHERE category IS NULL AND (
    name ILIKE '%blender%' OR name ILIKE '%mixer%' OR name ILIKE '%slicer%'
    OR name ILIKE '%chopper%' OR name ILIKE '%scale%' OR name ILIKE '%knife%'
    OR name ILIKE '%cutting%' OR name ILIKE '%vacuum%' OR name ILIKE '%sterilizer%'
  );
UPDATE equipment SET category = 'beverage'
  WHERE category IS NULL AND (
    name ILIKE '%espresso%' OR name ILIKE '%coffee%' OR name ILIKE '%juice%'
    OR name ILIKE '%tea%' OR name ILIKE '%smoothie%' OR name ILIKE '%water filtration%'
  );
UPDATE equipment SET category = 'fermentation'
  WHERE category IS NULL AND (
    name ILIKE '%ferment%' OR name ILIKE '%yogurt%'
  );
UPDATE equipment SET category = 'storage'
  WHERE category IS NULL AND (
    name ILIKE '%shelf%' OR name ILIKE '%shelves%' OR name ILIKE '%cabinet%'
    OR name ILIKE '%rack%'
  );
UPDATE equipment SET category = 'service'
  WHERE category IS NULL AND (
    name ILIKE '%salad bar%' OR name ILIKE '%display%' OR name ILIKE '%counter%'
    OR name ILIKE '%table%' OR name ILIKE '%chair%' OR name ILIKE '%plate%'
    OR name ILIKE '%cup%' OR name ILIKE '%tray%' OR name ILIKE '%signage%'
    OR name ILIKE '%lamp%' OR name ILIKE '%POS%'
  );
UPDATE equipment SET category = 'infrastructure'
  WHERE category IS NULL AND (
    name ILIKE '%sink%' OR name ILIKE '%hood%' OR name ILIKE '%grease%'
    OR name ILIKE '%air conditioner%' OR name ILIKE '%router%' OR name ILIKE '%modem%'
  );
UPDATE equipment SET category = 'other'
  WHERE category IS NULL;

-- ─── Comments ───────────────────────────────────────────────────

COMMENT ON COLUMN equipment.category IS 'Equipment type: oven, refrigeration, cooking, prep, beverage, fermentation, storage, service, infrastructure';
COMMENT ON COLUMN equipment.status IS 'Lifecycle: active → maintenance → out_of_service → retired';
COMMENT ON COLUMN equipment.is_available IS 'Quick flag: false = out of service / under maintenance';
COMMENT ON COLUMN equipment.capacity IS 'Max load per cycle in capacity_unit';
COMMENT ON COLUMN equipment.processing_time_min IS 'Standard processing time per cycle (minutes)';
COMMENT ON COLUMN equipment.setup_time_min IS 'Setup/cleanup time between cycles (minutes)';
COMMENT ON COLUMN equipment.max_parallel IS 'Number of parallel batches (e.g., oven with 3 trays = 3)';
COMMENT ON COLUMN equipment.notes IS 'Free-text notes about the equipment';

-- ─── Indexes ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_equipment_available
  ON equipment (is_available)
  WHERE is_available = true;

CREATE INDEX IF NOT EXISTS idx_equipment_category
  ON equipment (category);
