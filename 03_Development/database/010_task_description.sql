-- Migration 010: Task Description Column
ALTER TABLE public.production_tasks ADD COLUMN description TEXT;

COMMENT ON COLUMN public.production_tasks.description IS 'Dynamic task instructions including scaled ingredient weights.';
