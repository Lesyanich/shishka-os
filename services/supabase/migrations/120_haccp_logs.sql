-- Migration 120: HACCP audit trail for KDS
-- Immutable append-only log of HACCP checkpoint results

BEGIN;

CREATE TABLE IF NOT EXISTS public.haccp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_task_id UUID NOT NULL REFERENCES public.production_tasks(id),
  recipe_flow_id UUID NOT NULL REFERENCES public.recipes_flow(id),
  step_order INTEGER NOT NULL,
  checkpoint_type TEXT NOT NULL CHECK (checkpoint_type IN ('temperature','sanitation','visual','weight')),
  expected_value NUMERIC,
  tolerance NUMERIC,
  actual_value NUMERIC,
  passed BOOLEAN NOT NULL,
  recorded_by UUID NOT NULL REFERENCES public.staff(id),
  photo_url TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_haccp_task ON public.haccp_logs(production_task_id);
CREATE INDEX IF NOT EXISTS idx_haccp_recorded ON public.haccp_logs(recorded_at);

COMMENT ON TABLE public.haccp_logs IS 'Immutable HACCP checkpoint audit trail. Append-only — no UPDATE/DELETE policies.';

-- RLS: read all, insert only, no update/delete (immutable)
ALTER TABLE public.haccp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "haccp_logs_select" ON public.haccp_logs
  FOR SELECT TO public USING (true);

CREATE POLICY "haccp_logs_insert" ON public.haccp_logs
  FOR INSERT TO public WITH CHECK (true);

-- Self-register
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '120_haccp_logs.sql',
  'HACCP audit trail table: immutable checkpoint logs for KDS cook station',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
