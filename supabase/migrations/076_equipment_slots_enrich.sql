-- Migration 076: Enrich equipment_slots for production orders + seed equipment capacity
-- =====================================================================
-- Part A: Add production_order_id, recipe_step_id, status to equipment_slots
--         to link equipment bookings to production orders and recipe flow steps.
--
-- Part B: Seed capacity data for key kitchen equipment.
--         Without capacity, backward scheduling can't calculate batch cycles
--         (e.g., 5.2 kg chicken on a 2 kg grill = 3 cycles).
--
-- NOTE: equipment_slots already has production_task_id (069) and shift_task_id (069).
--       We add production_order_id as the higher-level link.

-- ─── Part A: Enrich equipment_slots ───────────────────────────────

ALTER TABLE equipment_slots
  ADD COLUMN IF NOT EXISTS production_order_id UUID REFERENCES production_orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recipe_step_id      UUID REFERENCES recipes_flow(id),
  ADD COLUMN IF NOT EXISTS status              TEXT NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'active', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_eq_slots_prod_order ON equipment_slots(production_order_id)
  WHERE production_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eq_slots_status ON equipment_slots(status)
  WHERE status != 'cancelled';

COMMENT ON COLUMN equipment_slots.production_order_id IS 'FK to production_orders — which production order booked this slot.';
COMMENT ON COLUMN equipment_slots.recipe_step_id IS 'FK to recipes_flow — which recipe step this slot corresponds to.';
COMMENT ON COLUMN equipment_slots.status IS 'Slot lifecycle: booked → active → completed | cancelled.';

-- ─── Part B: Seed equipment capacity ──────────────────────────────
-- Values from Chef AI recommendations + kitchen reality.
-- capacity = max load per cycle in capacity_unit.
-- setup_time_min = cleanup/preheat between uses.

-- Lava Grill Gas
UPDATE equipment SET
  capacity = 2,
  setup_time_min = 15,
  processing_time_min = 14,
  max_parallel = 1,
  notes = COALESCE(notes || E'\n', '') || 'Capacity: ~2kg per batch. Preheat 15min to 220°C.'
WHERE name ILIKE '%lava grill%' AND capacity IS NULL;

-- Blast Chiller
UPDATE equipment SET
  capacity = 10,
  setup_time_min = 5,
  processing_time_min = 15,
  max_parallel = 1,
  notes = COALESCE(notes || E'\n', '') || 'Capacity: 10kg. HACCP: core ≤ +4°C in ≤ 90min.'
WHERE name ILIKE '%blast chiller%' AND capacity IS NULL;

-- Chamber Vacuum Sealer
UPDATE equipment SET
  capacity = 4,
  setup_time_min = 2,
  processing_time_min = 3,
  max_parallel = 1,
  notes = COALESCE(notes || E'\n', '') || 'Capacity: 4 bags/cycle, 3 min/cycle.'
WHERE name ILIKE '%vacuum%sealer%' AND capacity IS NULL;

-- Convection Oven (all units)
UPDATE equipment SET
  capacity = 5,
  setup_time_min = 10,
  max_parallel = 3,
  notes = COALESCE(notes || E'\n', '') || 'Capacity: 5 GN trays. Preheat 10min.'
WHERE (name ILIKE '%convection%' OR name ILIKE '%oven%')
  AND category = 'oven'
  AND capacity IS NULL;

-- Gas Range (4-burner)
UPDATE equipment SET
  capacity = 4,
  setup_time_min = 5,
  max_parallel = 4,
  notes = COALESCE(notes || E'\n', '') || 'Capacity: 4 slots (burners). Setup 5min.'
WHERE name ILIKE '%gas range%' AND capacity IS NULL;

-- Induction Cooker (single)
UPDATE equipment SET
  capacity = 1,
  setup_time_min = 2,
  max_parallel = 1
WHERE name ILIKE '%induction%' AND capacity IS NULL;

-- Food Dehydrator
UPDATE equipment SET
  capacity = 3,
  setup_time_min = 5,
  max_parallel = 1,
  notes = COALESCE(notes || E'\n', '') || 'Capacity: 3 trays. Long cycles (4-12h).'
WHERE name ILIKE '%dehydrator%' AND capacity IS NULL;

-- Smoker
UPDATE equipment SET
  capacity = 5,
  setup_time_min = 20,
  max_parallel = 1,
  notes = COALESCE(notes || E'\n', '') || 'Capacity: ~5kg. Long preheat + smoke generation.'
WHERE name ILIKE '%smoker%' AND capacity IS NULL;

-- Yogurt Maker / Fermentation Station
UPDATE equipment SET
  capacity = 2,
  setup_time_min = 5,
  max_parallel = 1
WHERE name ILIKE '%yogurt%' AND capacity IS NULL;

-- Fridge / Refrigerator (high capacity, no setup)
UPDATE equipment SET
  capacity = 50,
  setup_time_min = 0,
  max_parallel = 10
WHERE category = 'refrigeration'
  AND name NOT ILIKE '%blast%'
  AND capacity IS NULL;

-- Cutting Board / Prep stations (manual, capacity = 1 cook)
UPDATE equipment SET
  capacity = 1,
  setup_time_min = 2,
  max_parallel = 1
WHERE (name ILIKE '%cutting board%' OR name ILIKE '%prep station%')
  AND capacity IS NULL;

-- Scales (no capacity limit, instant)
UPDATE equipment SET
  capacity = 1,
  setup_time_min = 0,
  processing_time_min = 1,
  max_parallel = 1
WHERE name ILIKE '%scale%' AND capacity IS NULL;
