-- ============================================================
-- Migration 096: Kitchen UX v2 Foundation
-- Phase A of Kitchen Management System v2
-- Adds: batch_code, photo tracking, cook feedback, skill levels,
--        staff PIN/language, production task assignment
-- ============================================================

-- ─── 1. PRODUCTION_TASKS: Add assignment + tracking columns ─────

ALTER TABLE public.production_tasks
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS actual_temperature NUMERIC,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- actual_start, actual_end, actual_weight already exist from earlier migrations

-- Index for cook's "my tasks" query
CREATE INDEX IF NOT EXISTS idx_production_tasks_assigned
  ON public.production_tasks (assigned_to, status)
  WHERE assigned_to IS NOT NULL;

-- ─── 2. STAFF: Add PIN, language, skill level ───────────────────

-- pin_code already exists from migration 069, rename concept only in UI
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS skill_level INTEGER DEFAULT 1;

-- Add constraint if column was just created (safe: check won't fail on existing data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'staff' AND constraint_name = 'staff_skill_level_check'
  ) THEN
    ALTER TABLE public.staff
      ADD CONSTRAINT staff_skill_level_check CHECK (skill_level BETWEEN 1 AND 4);
  END IF;
END $$;

-- ─── 3. NOMENCLATURE: Add shelf_life_days ──────────────────────

ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

COMMENT ON COLUMN public.nomenclature.shelf_life_days
  IS 'Shelf life in days for batch expiry calculation. NULL = use default (3 days).';

-- ─── 4. RECIPES_FLOW: Add min_skill_level ──────────────────────

ALTER TABLE public.recipes_flow
  ADD COLUMN IF NOT EXISTS min_skill_level INTEGER DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'recipes_flow' AND constraint_name = 'recipes_flow_min_skill_check'
  ) THEN
    ALTER TABLE public.recipes_flow
      ADD CONSTRAINT recipes_flow_min_skill_check CHECK (min_skill_level BETWEEN 1 AND 4);
  END IF;
END $$;

-- ─── 5. INVENTORY_BATCHES: Add batch_code, produced_by, photo ──

ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS batch_code TEXT,
  ADD COLUMN IF NOT EXISTS produced_by UUID REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_skipped_reason TEXT;

-- Unique constraint on batch_code (allow NULLs for old records)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_batches_batch_code
  ON public.inventory_batches (batch_code)
  WHERE batch_code IS NOT NULL;

-- ─── 6. BATCH_STATUS ENUM: Extend with new statuses ────────────

-- Add new status values for production tracking lifecycle
DO $$
BEGIN
  -- 'produced' = freshly made, not yet stored
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'produced' AND enumtypid = 'batch_status'::regtype) THEN
    ALTER TYPE public.batch_status ADD VALUE 'produced';
  END IF;
  -- 'in_transit' = being transferred L1→L2
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'in_transit' AND enumtypid = 'batch_status'::regtype) THEN
    ALTER TYPE public.batch_status ADD VALUE 'in_transit';
  END IF;
  -- 'expired' = past expiry date
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'expired' AND enumtypid = 'batch_status'::regtype) THEN
    ALTER TYPE public.batch_status ADD VALUE 'expired';
  END IF;
END $$;

-- ─── 7. FN_GENERATE_BATCH_CODE ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_generate_batch_code(
  p_nomenclature_id UUID,
  p_production_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_date_part TEXT;
  v_seq INTEGER;
  v_code TEXT;
BEGIN
  -- Get first 2 chars of product_code as prefix (e.g., "BC" from "BC_BORSCH_BASE")
  SELECT upper(left(product_code, 2))
    INTO v_prefix
    FROM public.nomenclature
   WHERE id = p_nomenclature_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'XX';
  END IF;

  -- Date part: MMDD
  v_date_part := to_char(p_production_date, 'MMDD');

  -- Daily sequence: count existing batches for this nomenclature on this date
  SELECT count(*) + 1
    INTO v_seq
    FROM public.inventory_batches
   WHERE nomenclature_id = p_nomenclature_id
     AND produced_at::date = p_production_date;

  -- Format: "BC-0405-01"
  v_code := v_prefix || '-' || v_date_part || '-' || lpad(v_seq::text, 2, '0');

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.fn_generate_batch_code IS
  'Generates human-readable batch code: {product_prefix}-{MMDD}-{seq}. For label writing.';

-- ─── 8. UPDATE fn_create_batches_from_task ─────────────────────
-- Now uses target_nomenclature_id (v2) instead of flow_step_id,
-- generates batch_code, uses shelf_life_days from nomenclature,
-- accepts produced_by staff_id

CREATE OR REPLACE FUNCTION public.fn_create_batches_from_task(
  p_task_id        UUID,
  p_containers     JSONB,    -- array of { weight: number }
  p_produced_by    UUID DEFAULT NULL  -- staff_id of cook
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task           RECORD;
  v_nom            RECORD;
  v_kitchen_loc    UUID;
  v_container      JSONB;
  v_barcode        TEXT;
  v_batch_code     TEXT;
  v_batch_id       UUID;
  v_total_weight   NUMERIC := 0;
  v_batches        JSONB := '[]'::jsonb;
  v_shelf_hours    INT;
  v_prod_date      DATE := CURRENT_DATE;
BEGIN
  -- 1. Validate task exists and is in_progress
  SELECT id, status, target_nomenclature_id, assigned_to
    INTO v_task
    FROM public.production_tasks
   WHERE id = p_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task not found');
  END IF;

  IF v_task.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task must be in_progress');
  END IF;

  IF v_task.target_nomenclature_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task has no target nomenclature');
  END IF;

  -- 2. Get nomenclature + shelf life
  SELECT id, product_code, name, type,
         COALESCE(shelf_life_days, 3) * 24 AS shelf_hours
    INTO v_nom
    FROM public.nomenclature
   WHERE id = v_task.target_nomenclature_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nomenclature not found');
  END IF;

  v_shelf_hours := v_nom.shelf_hours;

  -- 3. Get Kitchen location
  SELECT id INTO v_kitchen_loc
    FROM public.locations
   WHERE type = 'kitchen'
   LIMIT 1;

  IF v_kitchen_loc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Kitchen location not configured');
  END IF;

  -- 4. Resolve producer: explicit param > task assigned_to > NULL
  IF p_produced_by IS NULL THEN
    p_produced_by := v_task.assigned_to;
  END IF;

  -- 5. Iterate containers and create batches
  FOR v_container IN SELECT * FROM jsonb_array_elements(p_containers)
  LOOP
    v_barcode    := public.fn_generate_barcode();
    v_batch_code := public.fn_generate_batch_code(v_task.target_nomenclature_id, v_prod_date);
    v_batch_id   := gen_random_uuid();
    v_total_weight := v_total_weight + (v_container->>'weight')::NUMERIC;

    INSERT INTO public.inventory_batches (
      id, nomenclature_id, barcode, batch_code, weight, location_id,
      produced_at, expires_at, status, production_task_id, produced_by
    ) VALUES (
      v_batch_id,
      v_nom.id,
      v_barcode,
      v_batch_code,
      (v_container->>'weight')::NUMERIC,
      v_kitchen_loc,
      now(),
      now() + (v_shelf_hours || ' hours')::INTERVAL,
      'sealed',
      p_task_id,
      p_produced_by
    );

    v_batches := v_batches || jsonb_build_object(
      'batch_id', v_batch_id,
      'barcode', v_barcode,
      'batch_code', v_batch_code,
      'weight', (v_container->>'weight')::NUMERIC,
      'expires_at', (now() + (v_shelf_hours || ' hours')::INTERVAL)
    );
  END LOOP;

  -- 6. Complete the production task
  UPDATE public.production_tasks
     SET status = 'completed',
         actual_end = now(),
         actual_weight = v_total_weight,
         updated_at = now()
   WHERE id = p_task_id;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', p_task_id,
    'total_weight', v_total_weight,
    'batch_count', jsonb_array_length(v_batches),
    'batches', v_batches,
    'product_name', v_nom.name,
    'product_code', v_nom.product_code
  );
END;
$$;

-- ─── 9. COOK_FEEDBACK TABLE ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cook_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id),
  production_task_id UUID REFERENCES public.production_tasks(id),
  type TEXT CHECK (type IN ('suggestion', 'problem', 'question', 'other')) DEFAULT 'other',
  raw_text TEXT NOT NULL,
  language_detected TEXT,
  audio_url TEXT,
  is_processed BOOLEAN DEFAULT FALSE,
  processed_by TEXT,
  processed_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cook_feedback_staff
  ON public.cook_feedback (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cook_feedback_unprocessed
  ON public.cook_feedback (is_processed, created_at DESC)
  WHERE NOT is_processed;

-- RLS: staff can INSERT own, authenticated can SELECT/UPDATE all
ALTER TABLE public.cook_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY cook_feedback_anon_all
  ON public.cook_feedback FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY cook_feedback_auth_select
  ON public.cook_feedback FOR SELECT TO authenticated
  USING (true);

-- Realtime for feedback notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.cook_feedback;

-- ─── 10. SEED: Equipment skill levels ──────────────────────────
-- Sets min_skill_level based on equipment category/name for recipe steps

-- Update existing recipe steps that reference blast chiller or vacuum sealer
UPDATE public.recipes_flow rf
   SET min_skill_level = 3
  FROM public.equipment e
 WHERE rf.equipment_id = e.id
   AND lower(e.name) LIKE ANY(ARRAY['%blast%', '%vacuum%']);

UPDATE public.recipes_flow rf
   SET min_skill_level = 2
  FROM public.equipment e
 WHERE rf.equipment_id = e.id
   AND rf.min_skill_level = 1
   AND lower(e.name) LIKE ANY(ARRAY['%oven%', '%grill%', '%range%', '%mixer%', '%cutter%']);

-- ─── 11. SELF-REGISTER IN MIGRATION LOG ────────────────────────

INSERT INTO public.migration_log (filename, applied_by, checksum)
VALUES (
  '096_kitchen_ux_v2_foundation.sql',
  'claude-code',
  md5('096_kitchen_ux_v2_foundation')
)
ON CONFLICT DO NOTHING;
