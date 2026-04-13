-- Migration 112: Scheduling core tables
-- Creates production_targets, schedule_runs, equipment_bookings

-- ─── 1. production_targets ───
CREATE TABLE IF NOT EXISTS public.production_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  nomenclature_id UUID NOT NULL REFERENCES public.nomenclature(id),
  channel TEXT NOT NULL CHECK (channel IN ('dine_in','delivery','retail_L2','catering')),
  target_qty NUMERIC NOT NULL CHECK (target_qty > 0),
  deadline_at TIMESTAMPTZ NOT NULL,
  location_id UUID REFERENCES public.locations(id),
  created_by UUID REFERENCES public.staff(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','scheduled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pt_date ON public.production_targets(date);
CREATE INDEX idx_pt_status ON public.production_targets(status);

COMMENT ON TABLE public.production_targets IS 'Su-chef daily planning: what to produce, how much, by when';

-- ─── 2. schedule_runs ───
CREATE TABLE IF NOT EXISTS public.schedule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES public.staff(id),
  config_snapshot JSONB,
  task_count INT DEFAULT 0,
  conflict_count INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.schedule_runs IS 'History of schedule generation runs';

-- ─── 3. equipment_bookings ───
CREATE TABLE IF NOT EXISTS public.equipment_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id),
  production_task_id UUID REFERENCES public.production_tasks(id),
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  capacity_used INT NOT NULL DEFAULT 1,
  product_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_slot CHECK (slot_end > slot_start)
);

CREATE INDEX idx_eb_equipment_slot ON public.equipment_bookings(equipment_id, slot_start, slot_end);
CREATE INDEX idx_eb_task ON public.equipment_bookings(production_task_id);

COMMENT ON TABLE public.equipment_bookings IS 'Equipment time-slot reservations with capacity tracking';

-- ─── 4. Enable Realtime ───
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_targets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_bookings;

-- ─── 5. RLS ───
ALTER TABLE public.production_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read production_targets"
  ON public.production_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert production_targets"
  ON public.production_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update production_targets"
  ON public.production_targets FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read schedule_runs"
  ON public.schedule_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert schedule_runs"
  ON public.schedule_runs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read equipment_bookings"
  ON public.equipment_bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage equipment_bookings"
  ON public.equipment_bookings FOR ALL TO authenticated USING (true);

-- ─── 6. Self-register in migration_log ───
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '112_scheduling_tables.sql',
  'Create scheduling core tables: production_targets, schedule_runs, equipment_bookings with RLS and realtime support',
  NULL
)
ON CONFLICT (filename) DO NOTHING;
