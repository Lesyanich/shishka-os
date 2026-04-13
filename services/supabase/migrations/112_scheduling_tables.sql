-- Migration 112: Scheduling core tables
-- Creates production_targets, schedule_runs, equipment_bookings

BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_ptgt_date ON public.production_targets(date);
CREATE INDEX IF NOT EXISTS idx_ptgt_status ON public.production_targets(status);

COMMENT ON TABLE public.production_targets IS 'Su-chef daily planning: what to produce, how much, by when';

CREATE TRIGGER trg_production_targets_updated_at
  BEFORE UPDATE ON public.production_targets
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

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

CREATE INDEX IF NOT EXISTS idx_eb_equipment_slot ON public.equipment_bookings(equipment_id, slot_start, slot_end);
CREATE INDEX IF NOT EXISTS idx_eb_task ON public.equipment_bookings(production_task_id);

COMMENT ON TABLE public.equipment_bookings IS 'Equipment time-slot reservations with capacity tracking';

-- ─── 4. Enable Realtime ───
ALTER PUBLICATION supabase_realtime ADD TABLE public.production_targets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_bookings;

-- Note: schedule_runs intentionally excluded from realtime — generated in background, no live UI updates needed

-- ─── 5. RLS ───
ALTER TABLE public.production_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_targets_auth_full"
  ON public.production_targets FOR ALL TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

CREATE POLICY "schedule_runs_auth_full"
  ON public.schedule_runs FOR ALL TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

CREATE POLICY "equipment_bookings_auth_full"
  ON public.equipment_bookings FOR ALL TO public
  USING (fn_is_authenticated())
  WITH CHECK (fn_is_authenticated());

-- ─── 6. Self-register in migration_log ───
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '112_scheduling_tables.sql',
  'Create scheduling core tables: production_targets, schedule_runs, equipment_bookings with RLS and realtime support',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
