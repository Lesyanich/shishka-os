-- Migration 305 — Unified cook-facing task tracker
-- Builds on staff_tasks (264a). Additive + idempotent.
--   • station tag (L1 / L2 / general) → filter chips on the kitchen board
--   • photo_urls[] → optional photo reports (camera capture), public bucket
--   • linked_route / linked_label(_th) → deep-link a task to a relevant tab
--     (e.g. a dish recipe, the stock sheet, labels station)
--   • fn_materialize_recurring_tasks extended so recurring instances inherit
--     station + deep-link from their template (photos intentionally NOT copied)
-- RLS unchanged: staff_tasks already grants authenticated ALL, and cooks hold a
-- real authenticated session (name+PIN → synthetic-email signInWithPassword),
-- so cooks can already create/assign/complete tasks.

BEGIN;

-- 1. New columns ------------------------------------------------------------
ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS station         TEXT NOT NULL DEFAULT 'general'
    CHECK (station IN ('L1','L2','general')),
  ADD COLUMN IF NOT EXISTS photo_urls      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_route    TEXT,
  ADD COLUMN IF NOT EXISTS linked_label    TEXT,
  ADD COLUMN IF NOT EXISTS linked_label_th TEXT;

-- 2. Index — station chips are a primary query path (concrete tasks only) ----
CREATE INDEX IF NOT EXISTS idx_staff_tasks_station
  ON public.staff_tasks(station) WHERE is_template = false;

-- 3. Extend the materialize fn so instances inherit station + deep-link. ------
--    photo_urls stays at its '{}' default (each instance starts with no report).
CREATE OR REPLACE FUNCTION public.fn_materialize_recurring_tasks(p_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  inserted INTEGER := 0;
  dow INTEGER := EXTRACT(DOW FROM p_date);
BEGIN
  INSERT INTO public.staff_tasks (
    title, title_th, description, description_th, assigned_to, created_by,
    category, priority, status, due_date, due_time, reminder_offset_min,
    recurrence, is_template, template_id,
    station, linked_route, linked_label, linked_label_th
  )
  SELECT
    t.title, t.title_th, t.description, t.description_th, t.assigned_to, t.created_by,
    t.category, t.priority, 'todo', p_date, t.due_time, t.reminder_offset_min,
    'none', false, t.id,
    t.station, t.linked_route, t.linked_label, t.linked_label_th
  FROM public.staff_tasks t
  WHERE t.is_template = true
    AND t.status <> 'cancelled'
    AND (
      t.recurrence = 'daily'
      OR (t.recurrence = 'weekly' AND dow = ANY(COALESCE(t.recurrence_days, ARRAY[]::INT[])))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_tasks i
      WHERE i.template_id = t.id AND i.due_date = p_date
    );
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted > 0 THEN
    RAISE LOG '[staff_tasks] Materialized % recurring task(s) for %', inserted, p_date;
  END IF;
  RETURN inserted;
END;
$function$;

-- 4. task-photos storage bucket (public read), policies cloned from
--    nomenclature-photos: public SELECT, authenticated write. -----------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('task-photos', 'task-photos', true, 15728640,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS task_photos_select ON storage.objects;
CREATE POLICY task_photos_select ON storage.objects
  FOR SELECT USING (bucket_id = 'task-photos');

DROP POLICY IF EXISTS task_photos_insert ON storage.objects;
CREATE POLICY task_photos_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'task-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS task_photos_update ON storage.objects;
CREATE POLICY task_photos_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'task-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS task_photos_delete ON storage.objects;
CREATE POLICY task_photos_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'task-photos' AND auth.role() = 'authenticated');

-- 5. Ledger -----------------------------------------------------------------
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('305_unified_staff_task_tracker.sql', 'claude-code',
  'Unified cook task tracker: station tag (L1/L2/general), photo_urls[], deep-link cols (linked_route/label/label_th), materialize fn extension, task-photos bucket + policies.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
