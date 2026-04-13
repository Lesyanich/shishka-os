-- Migration 121: Waste tracking for KDS task completion
-- Records gross/net weight and waste classification per production task

BEGIN;

CREATE TABLE IF NOT EXISTS public.waste_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_task_id UUID NOT NULL REFERENCES public.production_tasks(id),
  waste_type TEXT NOT NULL CHECK (waste_type IN ('prep_waste','spoilage','human_error','rework')),
  gross_weight NUMERIC NOT NULL CHECK (gross_weight > 0),
  net_weight NUMERIC NOT NULL CHECK (net_weight >= 0),
  waste_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN gross_weight > 0
      THEN ROUND(((gross_weight - net_weight) / gross_weight) * 100, 2)
      ELSE 0
    END
  ) STORED,
  norm_waste_pct NUMERIC,
  variance_flag BOOLEAN GENERATED ALWAYS AS (
    CASE
      WHEN norm_waste_pct IS NOT NULL AND gross_weight > 0
      THEN ((gross_weight - net_weight) / gross_weight * 100) > (norm_waste_pct + 5)
      ELSE false
    END
  ) STORED,
  recorded_by UUID NOT NULL REFERENCES public.staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waste_task ON public.waste_entries(production_task_id);
CREATE INDEX IF NOT EXISTS idx_waste_flag ON public.waste_entries(variance_flag) WHERE variance_flag = true;

COMMENT ON TABLE public.waste_entries IS 'Waste tracking per production task. waste_pct and variance_flag are computed.';

-- RLS
ALTER TABLE public.waste_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waste_entries_select" ON public.waste_entries
  FOR SELECT TO public USING (true);

CREATE POLICY "waste_entries_insert" ON public.waste_entries
  FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "waste_entries_update" ON public.waste_entries
  FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Self-register
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '121_waste_entries.sql',
  'Waste tracking table with computed waste_pct and variance_flag for KDS task completion',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
