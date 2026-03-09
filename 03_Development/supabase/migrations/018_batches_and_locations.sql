-- ============================================================
-- Migration 018: Batch Tracking, Locations & Barcodes
-- Phase 3.5: Enterprise Batch Tracking
-- ============================================================

-- ─── ENUMS ──────────────────────────────────────────────────

CREATE TYPE public.location_type AS ENUM ('kitchen', 'assembly', 'storage', 'delivery');
CREATE TYPE public.batch_status  AS ENUM ('sealed', 'opened', 'depleted', 'wasted');

-- ─── LOCATIONS ──────────────────────────────────────────────

CREATE TABLE public.locations (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type public.location_type NOT NULL
);

-- Seed default locations
INSERT INTO public.locations (name, type) VALUES
  ('Kitchen',  'kitchen'),
  ('Assembly', 'assembly'),
  ('Storage',  'storage');

-- ─── INVENTORY BATCHES ──────────────────────────────────────

CREATE TABLE public.inventory_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id  UUID NOT NULL REFERENCES public.nomenclature(id),
  barcode          TEXT NOT NULL UNIQUE,
  weight           NUMERIC NOT NULL CHECK (weight > 0),
  location_id      UUID NOT NULL REFERENCES public.locations(id),
  produced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  opened_at        TIMESTAMPTZ,
  status           public.batch_status NOT NULL DEFAULT 'sealed',
  production_task_id UUID REFERENCES public.production_tasks(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_batches_barcode     ON public.inventory_batches (barcode);
CREATE INDEX idx_batches_location    ON public.inventory_batches (location_id, status);
CREATE INDEX idx_batches_nomenclature ON public.inventory_batches (nomenclature_id, status);
CREATE INDEX idx_batches_expires     ON public.inventory_batches (expires_at) WHERE status IN ('sealed', 'opened');
CREATE INDEX idx_batches_task        ON public.inventory_batches (production_task_id);

-- ─── STOCK TRANSFERS ────────────────────────────────────────

CREATE TABLE public.stock_transfers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID NOT NULL REFERENCES public.inventory_batches(id),
  from_location UUID NOT NULL REFERENCES public.locations(id),
  to_location   UUID NOT NULL REFERENCES public.locations(id),
  transferred_by UUID,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_different_locations CHECK (from_location <> to_location)
);

CREATE INDEX idx_transfers_batch ON public.stock_transfers (batch_id);

-- ─── BARCODE GENERATOR FUNCTION ─────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_generate_barcode()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8-char uppercase alphanumeric barcode
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    SELECT EXISTS(
      SELECT 1 FROM public.inventory_batches WHERE barcode = v_code
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

-- ─── RPC: CREATE BATCHES FROM PRODUCTION TASK ───────────────

CREATE OR REPLACE FUNCTION public.fn_create_batches_from_task(
  p_task_id        UUID,
  p_containers     JSONB    -- array of { weight: number }
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
  v_batch_id       UUID;
  v_total_weight   NUMERIC := 0;
  v_barcodes       JSONB := '[]'::jsonb;
  v_shelf_life_h   INT := 72;  -- default shelf life: 72 hours for PF
BEGIN
  -- 1. Validate task exists and is in_progress
  SELECT pt.id, pt.flow_step_id, pt.status
    INTO v_task
    FROM public.production_tasks pt
   WHERE pt.id = p_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task not found');
  END IF;

  IF v_task.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Task must be in_progress');
  END IF;

  -- 2. Resolve nomenclature from flow_step_id → recipes_flow → nomenclature
  SELECT n.id, n.type
    INTO v_nom
    FROM public.recipes_flow rf
    JOIN public.nomenclature n ON n.product_code = rf.product_code
   WHERE rf.id = v_task.flow_step_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot resolve nomenclature from task');
  END IF;

  -- 3. Get Kitchen location
  SELECT id INTO v_kitchen_loc
    FROM public.locations
   WHERE type = 'kitchen'
   LIMIT 1;

  IF v_kitchen_loc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Kitchen location not configured');
  END IF;

  -- 4. Iterate containers and create batches
  FOR v_container IN SELECT * FROM jsonb_array_elements(p_containers)
  LOOP
    v_barcode  := public.fn_generate_barcode();
    v_batch_id := gen_random_uuid();
    v_total_weight := v_total_weight + (v_container->>'weight')::NUMERIC;

    INSERT INTO public.inventory_batches (
      id, nomenclature_id, barcode, weight, location_id,
      produced_at, expires_at, status, production_task_id
    ) VALUES (
      v_batch_id,
      v_nom.id,
      v_barcode,
      (v_container->>'weight')::NUMERIC,
      v_kitchen_loc,
      now(),
      now() + (v_shelf_life_h || ' hours')::INTERVAL,
      'sealed',
      p_task_id
    );

    v_barcodes := v_barcodes || jsonb_build_object(
      'batch_id', v_batch_id,
      'barcode', v_barcode,
      'weight', (v_container->>'weight')::NUMERIC
    );
  END LOOP;

  -- 5. Complete the production task with total weight
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
    'batch_count', jsonb_array_length(v_barcodes),
    'batches', v_barcodes
  );
END;
$$;

-- ─── RPC: OPEN BATCH ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_open_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch RECORD;
  v_new_expires TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_batch
    FROM public.inventory_batches
   WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Batch not found');
  END IF;

  IF v_batch.status <> 'sealed' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Batch status is ' || v_batch.status || ', expected sealed');
  END IF;

  -- Once opened, shelf life shrinks to 12 hours from now
  v_new_expires := now() + INTERVAL '12 hours';

  -- If original expires_at is sooner, keep it
  IF v_batch.expires_at < v_new_expires THEN
    v_new_expires := v_batch.expires_at;
  END IF;

  UPDATE public.inventory_batches
     SET status = 'opened',
         opened_at = now(),
         expires_at = v_new_expires
   WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'barcode', v_batch.barcode,
    'opened_at', now(),
    'expires_at', v_new_expires
  );
END;
$$;

-- ─── RPC: TRANSFER BATCH ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_transfer_batch(
  p_barcode      TEXT,
  p_to_location  TEXT   -- location name (e.g. 'Assembly')
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch     RECORD;
  v_to_loc    RECORD;
BEGIN
  -- Find batch by barcode
  SELECT * INTO v_batch
    FROM public.inventory_batches
   WHERE barcode = p_barcode
     AND status IN ('sealed', 'opened');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'No active batch with barcode ' || p_barcode);
  END IF;

  -- Find destination location
  SELECT * INTO v_to_loc
    FROM public.locations
   WHERE lower(name) = lower(p_to_location);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Location not found: ' || p_to_location);
  END IF;

  IF v_batch.location_id = v_to_loc.id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Batch already at ' || p_to_location);
  END IF;

  -- Log transfer
  INSERT INTO public.stock_transfers (batch_id, from_location, to_location)
  VALUES (v_batch.id, v_batch.location_id, v_to_loc.id);

  -- Update batch location
  UPDATE public.inventory_batches
     SET location_id = v_to_loc.id
   WHERE id = v_batch.id;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', v_batch.id,
    'barcode', v_batch.barcode,
    'from', (SELECT name FROM public.locations WHERE id = v_batch.location_id),
    'to', v_to_loc.name,
    'weight', v_batch.weight
  );
END;
$$;

-- ─── RLS ────────────────────────────────────────────────────

ALTER TABLE public.locations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers    ENABLE ROW LEVEL SECURITY;

-- anon = full CRUD (internal admin-panel, same pattern as Phase 3)
CREATE POLICY locations_anon_all         ON public.locations         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY inventory_batches_anon_all ON public.inventory_batches FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY stock_transfers_anon_all   ON public.stock_transfers   FOR ALL TO anon USING (true) WITH CHECK (true);

-- authenticated = read-only
CREATE POLICY locations_auth_select         ON public.locations         FOR SELECT TO authenticated USING (true);
CREATE POLICY inventory_batches_auth_select ON public.inventory_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY stock_transfers_auth_select   ON public.stock_transfers   FOR SELECT TO authenticated USING (true);

-- ─── REALTIME ───────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_transfers;
