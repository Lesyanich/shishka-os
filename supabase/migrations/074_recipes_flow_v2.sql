-- Migration 074: Recreate recipes_flow with enriched production schema
-- =====================================================================
-- Context: recipes_flow was dropped in migration 056 (Ghost RPC rewrite).
-- Migration 073 attempted to INSERT data but table didn't exist.
-- This migration recreates it with enriched schema per Chef AI recommendations.
--
-- Key changes vs original:
--   - nomenclature_id UUID FK (was product_code TEXT) — P0 UUID Compliance
--   - Added: temperature_c, internal_temp_c, is_passive — for KDS & backward scheduling
--   - Added: updated_at trigger
--   - UNIQUE on (nomenclature_id, step_order)
--
-- NOTE: Migration 073 is superseded by this migration's seed data section.

-- ─── 1. Create table ──────────────────────────────────────────────

CREATE TABLE public.recipes_flow (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id UUID NOT NULL REFERENCES nomenclature(id) ON DELETE CASCADE,
  step_order      INT NOT NULL,
  operation_name  TEXT NOT NULL,
  equipment_id    UUID REFERENCES equipment(id),  -- NULL = manual operation
  duration_min    INT NOT NULL,
  instruction_text TEXT NOT NULL,
  temperature_c   NUMERIC,          -- target equipment temperature (e.g. grill 220°C)
  internal_temp_c NUMERIC,          -- target internal product temperature (e.g. chicken 74°C)
  is_passive      BOOLEAN NOT NULL DEFAULT false,  -- passive step: cook is free (marination, chilling)
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_recipe_step UNIQUE (nomenclature_id, step_order)
);

-- ─── 2. Indexes ───────────────────────────────────────────────────

CREATE INDEX idx_recipes_flow_nomenclature ON recipes_flow(nomenclature_id);
CREATE INDEX idx_recipes_flow_equipment ON recipes_flow(equipment_id) WHERE equipment_id IS NOT NULL;

-- ─── 3. Auto-update updated_at ────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_recipes_flow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recipes_flow_updated_at
  BEFORE UPDATE ON recipes_flow
  FOR EACH ROW
  EXECUTE FUNCTION fn_recipes_flow_updated_at();

-- ─── 4. RLS ───────────────────────────────────────────────────────
-- Same pattern as other tables: anon SELECT (for /kitchen KDS), authenticated ALL

ALTER TABLE recipes_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipes_flow_anon_read ON recipes_flow
  FOR SELECT TO anon USING (true);

CREATE POLICY recipes_flow_auth_full ON recipes_flow
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 5. Realtime ──────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE recipes_flow;

-- ─── 6. Comments ──────────────────────────────────────────────────

COMMENT ON TABLE recipes_flow IS 'Production flow steps (tech card) for PF/SALE products. Each row = one step in the recipe.';
COMMENT ON COLUMN recipes_flow.nomenclature_id IS 'FK to nomenclature — the product this recipe belongs to';
COMMENT ON COLUMN recipes_flow.step_order IS 'Sequential step number (1-based). UNIQUE per product.';
COMMENT ON COLUMN recipes_flow.operation_name IS 'Human-readable operation: Preparation, Marination, Grilling, Blast Chilling, etc.';
COMMENT ON COLUMN recipes_flow.equipment_id IS 'FK to equipment. NULL = manual operation (no equipment needed).';
COMMENT ON COLUMN recipes_flow.duration_min IS 'Expected duration in minutes.';
COMMENT ON COLUMN recipes_flow.instruction_text IS 'Detailed cook instruction displayed on KDS.';
COMMENT ON COLUMN recipes_flow.temperature_c IS 'Target equipment temperature in °C (for preheat / backward scheduling setup_time).';
COMMENT ON COLUMN recipes_flow.internal_temp_c IS 'Target internal product temperature in °C (HACCP control point — cook must confirm with probe).';
COMMENT ON COLUMN recipes_flow.is_passive IS 'If true, cook is free during this step (marination, chilling). Shown differently on KDS Gantt.';

-- ─── 7. Seed data: PF-CHICKEN_GRILL_NEUTRAL (enriched, replaces 073) ──
-- Equipment is looked up by name pattern (not hardcoded UUID) for portability.
-- If equipment not found → NULL (manual operation).

INSERT INTO recipes_flow (
  nomenclature_id, step_order, operation_name, equipment_id,
  duration_min, instruction_text, temperature_c, internal_temp_c, is_passive, notes
)
SELECT
  n.id,
  v.step_order,
  v.operation_name,
  (SELECT id FROM equipment WHERE name ILIKE v.eq_pattern LIMIT 1),
  v.duration_min,
  v.instruction_text,
  v.temperature_c,
  v.internal_temp_c,
  v.is_passive,
  v.notes
FROM nomenclature n
CROSS JOIN (VALUES
  (1, 'Preparation', '%cutting board%',
   20,
   'Weigh breast. Butterfly cut, even out thickness to ~2cm. Clean from films.',
   NULL::NUMERIC, NULL::NUMERIC, false,
   'Use cutting board + knife set. Target uniform 2cm thickness.'),

  (2, 'Marination', '%GN pan%',
   120,
   'Mix marinade: olive oil, lemon juice, crushed garlic, salt, pepper, thyme. Rub chicken, place in GN, cover, refrigerate +2..+4°C.',
   4, NULL::NUMERIC, true,
   'Can marinate 2-4h. GN 1/1 fits ~5kg butterflied.'),

  (3, 'Tempering', '%manual%',
   20,
   'Remove from fridge. Bring to room temperature on work surface.',
   NULL::NUMERIC, NULL::NUMERIC, true,
   'Passive step — cook is free.'),

  (4, 'Grilling', '%lava grill%',
   14,
   'Preheat grill to 220°C. Place breast smooth side down, 6-7 min. Flip, 5-6 min more. Probe check: 74°C internal. DO NOT overcook!',
   220, 74, false,
   'Lava grill capacity ~2kg/batch. For 5.2kg raw → 3 batches.'),

  (5, 'Resting', '%manual%',
   5,
   'Transfer to clean GN, cover with foil. Let rest — juices redistribute.',
   NULL::NUMERIC, NULL::NUMERIC, true,
   'Do not skip. Prevents juice loss on slicing.'),

  (6, 'Portioning', '%cutting board%',
   15,
   'Slice/portion. Weigh each portion on scale. Standard portion per BOM.',
   NULL::NUMERIC, NULL::NUMERIC, false,
   'Weigh on digital scale for accuracy.'),

  (7, 'Vacuum Sealing', '%vacuum%seal%',
   15,
   'Pack portions in vacuum bags. Label: product, date, weight, shelf life (72h).',
   NULL::NUMERIC, NULL::NUMERIC, false,
   'HACCP: label must include production date + expiry.'),

  (8, 'Blast Chilling', '%blast chiller%',
   15,
   'Blast chill to +4°C. HACCP: core ≤ +4°C within 90 min.',
   4, 4, true,
   'Passive — timer runs, cook is free.'),

  (9, 'Storage', '%fridge%',
   0,
   'Move to PF storage zone. Shelf life: 72h at +2..+4°C.',
   4, NULL::NUMERIC, true,
   'Final step. Zero active duration.')
) AS v(step_order, operation_name, eq_pattern, duration_min, instruction_text,
       temperature_c, internal_temp_c, is_passive, notes)
WHERE n.product_code = 'PF-CHICKEN_GRILL_NEUTRAL';
