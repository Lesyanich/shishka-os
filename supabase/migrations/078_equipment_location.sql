-- Migration 078: Equipment location columns + seed L1 positions from floor plan
-- =====================================================================
-- Context: Kitchen L1 has Hot Zone (8.41 m²), Cold Zone (7.39 m²),
-- Store Zone (corridor). All equipment mapped from 2D/3D floor plans.
--
-- New columns on equipment table:
--   location_zone  — Hot / Cold / Store / Service / L2
--   location_wall  — wall reference (e.g., Hot-W3, Cold-W1)
--   location_floor — floor number (1, 2)
--   location_notes — free text (e.g., "under hood", "bottom-left corner")
--   unit_id        — physical unit tag (already exists as TEXT column)

-- ─── 1. Add location columns ────────────────────────────────────

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS location_zone  TEXT,
  ADD COLUMN IF NOT EXISTS location_wall  TEXT,
  ADD COLUMN IF NOT EXISTS location_floor INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS location_notes TEXT;

COMMENT ON COLUMN equipment.location_zone IS 'Physical zone: Hot, Cold, Store, Service, L2';
COMMENT ON COLUMN equipment.location_wall IS 'Wall reference in zone: Hot-W1, Hot-W2, Hot-W3, Cold-W1, Cold-W2, Cold-W3, Store-W2, Store-W3';
COMMENT ON COLUMN equipment.location_floor IS 'Floor number (1 = ground kitchen, 2 = upper kitchen)';
COMMENT ON COLUMN equipment.location_notes IS 'Precise position notes (e.g. "under hood", "bottom-right corner")';

-- ─── 2. Index for zone queries ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_equipment_location_zone ON equipment(location_zone)
  WHERE location_zone IS NOT NULL;

-- ─── 3. Seed L1 equipment locations from floor plan ─────────────
-- Using unit_id or name pattern to match equipment.
-- Equipment table has unit_id (TEXT) from original schema.

-- === HOT ZONE — Wall W3 (left wall) ===

-- Gas Range 4-Burner (L1-GAS-RNG-570-32)
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W3', location_floor = 1,
  location_notes = 'Top of wall, under hood',
  unit_id = 'L1-GAS-RNG-570-32'
WHERE name ILIKE '%gas range%' AND (unit_id = 'L1-GAS-RNG-570-32' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Kitchen Hood (L1-KTC-HOOD-150-31)
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W3', location_floor = 1,
  location_notes = 'Above gas range',
  unit_id = 'L1-KTC-HOOD-150-31'
WHERE name ILIKE '%hood%' AND (unit_id = 'L1-KTC-HOOD-150-31' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Stainless Steel Cabinet 150cm (L1-SS-CAB-150-1) — Hot zone
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W3', location_floor = 1,
  location_notes = 'Below hood area',
  unit_id = 'L1-SS-CAB-150-1'
WHERE name ILIKE '%stainless%cabinet%' AND name ILIKE '%150%'
  AND (unit_id = 'L1-SS-CAB-150-1' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Lava Grill Gas (L1-LAVA-GRILL-650-33)
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W3', location_floor = 1,
  location_notes = 'Mid-wall, main grilling station',
  unit_id = 'L1-LAVA-GRILL-650-33'
WHERE name ILIKE '%lava grill%' AND (unit_id = 'L1-LAVA-GRILL-650-33' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Electric Convection Oven (L1-EL-CON-OVEN-83-20)
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W3', location_floor = 1,
  location_notes = 'Bottom-left corner, built into wall',
  unit_id = 'L1-EL-CON-OVEN-83-20'
WHERE (name ILIKE '%convection%oven%' OR name ILIKE '%oven%convection%')
  AND (unit_id = 'L1-EL-CON-OVEN-83-20' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- === HOT ZONE — Wall W1 (right wall) ===

-- Chamber Vacuum Sealer (L1-VAC-500-67)
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W1', location_floor = 1,
  location_notes = 'Top-right, above counter',
  unit_id = 'L1-VAC-500-67'
WHERE name ILIKE '%vacuum%seal%' AND (unit_id = 'L1-VAC-500-67' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Shelf 200cm (L1-SHELF-200-54) — Hot W1
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W1', location_floor = 1,
  location_notes = 'Above vacuum sealer',
  unit_id = 'L1-SHELF-200-54'
WHERE name ILIKE '%shelf%200%' AND (unit_id = 'L1-SHELF-200-54' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Under Counter Freezer (L1-UC-FRZ-180-22)
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W1', location_floor = 1,
  location_notes = 'Under working surface',
  unit_id = 'L1-UC-FRZ-180-22'
WHERE name ILIKE '%under%counter%freezer%' AND (unit_id = 'L1-UC-FRZ-180-22' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Blast Freezer/Chiller (L1-BL-FRZ-790-66)
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W1', location_floor = 1,
  location_notes = 'Bottom-right, large unit, accessible from passage',
  unit_id = 'L1-BL-FRZ-790-66'
WHERE (name ILIKE '%blast%chiller%' OR name ILIKE '%blast%freezer%')
  AND (unit_id = 'L1-BL-FRZ-790-66' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- === HOT ZONE — Wall W2 (top wall) ===

-- Shelf 200cm (L1-SHELF-200-55) — Hot W2
UPDATE equipment SET
  location_zone = 'Hot', location_wall = 'Hot-W2', location_floor = 1,
  location_notes = 'Above window area',
  unit_id = 'L1-SHELF-200-55'
WHERE name ILIKE '%shelf%200%' AND (unit_id = 'L1-SHELF-200-55' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- === STORE ZONE (corridor) ===

-- Large Standing Fridge 200L (L1-SPM-FRG-200-25)
UPDATE equipment SET
  location_zone = 'Store', location_wall = 'Store-W3', location_floor = 1,
  location_notes = 'Outside hot zone, used for prep/заготовки storage',
  unit_id = 'L1-SPM-FRG-200-25'
WHERE (name ILIKE '%standing%fridge%' OR name ILIKE '%fridge%200%')
  AND (unit_id = 'L1-SPM-FRG-200-25' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Baking Tray Rack (L-1-K-BK-TR-60-73)
UPDATE equipment SET
  location_zone = 'Store', location_wall = 'Store-W2', location_floor = 1,
  location_notes = 'Near entrance to hot zone',
  unit_id = 'L-1-K-BK-TR-60-73'
WHERE name ILIKE '%baking%tray%rack%' AND (unit_id = 'L-1-K-BK-TR-60-73' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- === COLD ZONE — Wall W3 (left wall) ===

-- Kitchen Blender (L1-KITCH-BLND-CHINA-13)
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W3', location_floor = 1,
  location_notes = 'Top of wall',
  unit_id = 'L1-KITCH-BLND-CHINA-13'
WHERE name ILIKE '%blender%' AND name NOT ILIKE '%immersion%'
  AND (unit_id = 'L1-KITCH-BLND-CHINA-13' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Bowl Cutter 8L (L1-BL-CUT-8L-19)
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W3', location_floor = 1,
  location_notes = 'Below blender',
  unit_id = 'L1-BL-CUT-8L-19'
WHERE name ILIKE '%bowl cutter%' AND (unit_id = 'L1-BL-CUT-8L-19' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Juice Extractor (L1-JUIC-EXTR-CHINA-15)
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W3', location_floor = 1,
  location_notes = 'Below cutter',
  unit_id = 'L1-JUIC-EXTR-CHINA-15'
WHERE name ILIKE '%juice%extract%' AND (unit_id = 'L1-JUIC-EXTR-CHINA-15' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Under Counter Fridge 150L (L1-UC-FRG-150-24)
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W3', location_floor = 1,
  location_notes = 'Under working surface',
  unit_id = 'L1-UC-FRG-150-24'
WHERE name ILIKE '%under%counter%fridge%' AND (unit_id = 'L1-UC-FRG-150-24' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Shelf 200cm (L1-SHELF-200-59) — Cold W3
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W3', location_floor = 1,
  location_notes = 'Lower area',
  unit_id = 'L1-SHELF-200-59'
WHERE name ILIKE '%shelf%200%' AND (unit_id = 'L1-SHELF-200-59' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- === COLD ZONE — Wall W1 (right wall) ===

-- Dough Mixer 10KG (L1-D-MIX-10KG-18)
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W1', location_floor = 1,
  location_notes = 'Upper area',
  unit_id = 'L1-D-MIX-10KG-18'
WHERE name ILIKE '%dough%mixer%' AND (unit_id = 'L1-D-MIX-10KG-18' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Shelf 180cm (L1-SHELF-180-60) — Cold W1
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W1', location_floor = 1,
  location_notes = 'Mid-wall',
  unit_id = 'L1-SHELF-180-60'
WHERE name ILIKE '%shelf%180%' AND (unit_id = 'L1-SHELF-180-60' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Stainless Steel Cabinet 120cm (L-1-K-SS-CAB-120-7) — Cold W1
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W1', location_floor = 1,
  location_notes = 'Lower area',
  unit_id = 'L-1-K-SS-CAB-120-7'
WHERE name ILIKE '%stainless%cabinet%120%' AND (unit_id = 'L-1-K-SS-CAB-120-7' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- === COLD ZONE — Wall W2 (bottom wall) ===

-- Double Sink 120cm (L-1-K-DBL-SINK-120-73)
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W2', location_floor = 1,
  location_notes = 'Center of bottom wall',
  unit_id = 'L-1-K-DBL-SINK-120-73'
WHERE name ILIKE '%double%sink%' AND (unit_id = 'L-1-K-DBL-SINK-120-73' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- Grease Trap (L1-GR-TRAP-38) — Cold W2
UPDATE equipment SET
  location_zone = 'Cold', location_wall = 'Cold-W2', location_floor = 1,
  location_notes = 'Below double sink',
  unit_id = 'L1-GR-TRAP-38'
WHERE name ILIKE '%grease%trap%' AND (unit_id = 'L1-GR-TRAP-38' OR unit_id IS NULL)
  AND location_zone IS NULL;

-- ─── 4. Verify: count equipment with location set ───────────────

DO $$
DECLARE
  total INT;
  located INT;
BEGIN
  SELECT count(*) INTO total FROM equipment;
  SELECT count(*) INTO located FROM equipment WHERE location_zone IS NOT NULL;
  RAISE NOTICE 'Equipment location seeded: %/% units have location_zone set', located, total;
END $$;
