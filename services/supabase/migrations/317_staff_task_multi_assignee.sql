-- 317_staff_task_multi_assignee.sql
-- Allow a task to be assigned to MULTIPLE people. New source of truth is the
-- join table staff_task_assignees; staff_tasks.assigned_to is kept as a synced
-- "primary" (the earliest assignee) by a trigger, so every existing
-- single-assignee read (admin filters, telegram-push, displays) keeps working.

CREATE TABLE IF NOT EXISTS public.staff_task_assignees (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.staff_tasks(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, staff_id)
);
CREATE INDEX IF NOT EXISTS idx_sta_task ON public.staff_task_assignees (task_id);
CREATE INDEX IF NOT EXISTS idx_sta_staff ON public.staff_task_assignees (staff_id);

ALTER TABLE public.staff_task_assignees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sta_read ON public.staff_task_assignees;
CREATE POLICY sta_read ON public.staff_task_assignees FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sta_write ON public.staff_task_assignees;
CREATE POLICY sta_write ON public.staff_task_assignees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Backfill from the existing single assignee.
INSERT INTO public.staff_task_assignees (task_id, staff_id)
SELECT id, assigned_to FROM public.staff_tasks WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, staff_id) DO NOTHING;

-- Keep staff_tasks.assigned_to = earliest assignee (or NULL) whenever the join
-- table changes — backward-compat for code that still reads assigned_to.
CREATE OR REPLACE FUNCTION public.fn_sync_primary_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task uuid := COALESCE(NEW.task_id, OLD.task_id);
BEGIN
  UPDATE public.staff_tasks t
  SET assigned_to = (
    SELECT a.staff_id FROM public.staff_task_assignees a
    WHERE a.task_id = v_task
    ORDER BY a.created_at ASC, a.id ASC
    LIMIT 1
  )
  WHERE t.id = v_task;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_assignee ON public.staff_task_assignees;
CREATE TRIGGER trg_sync_primary_assignee
  AFTER INSERT OR DELETE ON public.staff_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_primary_assignee();

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '317_staff_task_multi_assignee.sql',
  'claude-code',
  NULL,
  'Multi-assignee: staff_task_assignees join table + backfill + trigger syncing staff_tasks.assigned_to as the primary assignee'
)
ON CONFLICT DO NOTHING;
