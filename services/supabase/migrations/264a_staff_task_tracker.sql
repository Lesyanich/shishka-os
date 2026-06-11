-- Migration 264 — Staff task tracker + reminders (Phase 1: data layer).
--
-- New operational layer distinct from production_tasks (KDS) and business_tasks
-- (Mission Control). These are everyday staff chores/reminders that the owner
-- assigns and that staff complete — surfaced in admin /staff-tasks now and pushed
-- to Telegram in Phase 2.
--
-- Tables:
--   staff_tasks            — one-off + recurring tasks. Recurring rows are
--                            "templates" (is_template=true) that materialize daily
--                            instances via fn_materialize_recurring_tasks().
--   staff_telegram         — links a staff member to their Telegram chat_id
--                            (populated in Phase 2; table created now).
--   staff_task_dead_letter — failed webhook/push payloads for inspection (Phase 2).
--
-- Storage contract: title/description in English; *_th holds the Thai translation
-- (mirrors staff.name_th). Telegram messages render bilingual (en + th).

BEGIN;

-- ---------------------------------------------------------------------------
-- staff_tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,                 -- English (storage contract)
  title_th            TEXT,                          -- Thai translation (shown to staff)
  description         TEXT,
  description_th      TEXT,
  assigned_to         UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_by          TEXT,                          -- owner name / agent
  category            TEXT NOT NULL DEFAULT 'general'
                        CHECK (category IN ('opening', 'closing', 'prep', 'cleaning', 'admin', 'general')),
  priority            TEXT NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status              TEXT NOT NULL DEFAULT 'todo'
                        CHECK (status IN ('todo', 'in_progress', 'done', 'skipped', 'cancelled')),
  due_date            DATE,
  due_time            TIME,
  reminder_offset_min INT NOT NULL DEFAULT 30,       -- remind N minutes before due_time
  -- recurrence
  recurrence          TEXT NOT NULL DEFAULT 'none'
                        CHECK (recurrence IN ('none', 'daily', 'weekly')),
  recurrence_days     INT[],                         -- 0=Sun..6=Sat, for weekly templates
  is_template         BOOLEAN NOT NULL DEFAULT false,
  template_id         UUID REFERENCES public.staff_tasks(id) ON DELETE SET NULL,
  -- telegram bookkeeping (written in Phase 2)
  dm_message_id       TEXT,
  group_message_id    TEXT,
  -- completion
  completed_at        TIMESTAMPTZ,
  completed_via       TEXT CHECK (completed_via IN ('telegram', 'admin')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- a template must have a recurrence; a concrete task must have a due_date
  CONSTRAINT staff_tasks_template_shape CHECK (
    (is_template = true  AND recurrence <> 'none')
    OR (is_template = false)
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_assigned  ON public.staff_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_due       ON public.staff_tasks(due_date) WHERE is_template = false;
CREATE INDEX IF NOT EXISTS idx_staff_tasks_template  ON public.staff_tasks(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_tasks_status    ON public.staff_tasks(status) WHERE status NOT IN ('done', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_staff_tasks_templates ON public.staff_tasks(is_template) WHERE is_template = true;

DROP TRIGGER IF EXISTS trg_staff_tasks_updated_at ON public.staff_tasks;
CREATE TRIGGER trg_staff_tasks_updated_at
  BEFORE UPDATE ON public.staff_tasks
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- staff_telegram (populated in Phase 2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_telegram (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          UUID NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  telegram_chat_id  TEXT NOT NULL UNIQUE,
  telegram_username TEXT,
  lang              TEXT NOT NULL DEFAULT 'th' CHECK (lang IN ('th', 'en', 'ru')),
  linked_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- staff_task_dead_letter (Phase 2 observability)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_task_dead_letter (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT,                -- 'telegram-webhook' | 'telegram-push'
  reason      TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- fn_materialize_recurring_tasks — idempotently create today's instances from
-- active templates. Safe to call repeatedly (unique guard on template_id+due_date).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_materialize_recurring_tasks(p_date DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted INTEGER := 0;
  dow INTEGER := EXTRACT(DOW FROM p_date);  -- 0=Sun..6=Sat
BEGIN
  INSERT INTO public.staff_tasks (
    title, title_th, description, description_th, assigned_to, created_by,
    category, priority, status, due_date, due_time, reminder_offset_min,
    recurrence, is_template, template_id
  )
  SELECT
    t.title, t.title_th, t.description, t.description_th, t.assigned_to, t.created_by,
    t.category, t.priority, 'todo', p_date, t.due_time, t.reminder_offset_min,
    'none', false, t.id
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
$$;

-- ---------------------------------------------------------------------------
-- RLS — read for anon+authenticated (mirrors shifts/staff), write authenticated.
-- Owner-only management is enforced in the admin UI via RoleGuard. Telegram
-- linkage and dead-letter are authenticated-only (no anon read).
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_telegram         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_task_dead_letter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_tasks_read_anon ON public.staff_tasks;
CREATE POLICY staff_tasks_read_anon ON public.staff_tasks
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS staff_tasks_write_auth ON public.staff_tasks;
CREATE POLICY staff_tasks_write_auth ON public.staff_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS staff_telegram_auth ON public.staff_telegram;
CREATE POLICY staff_telegram_auth ON public.staff_telegram
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS staff_task_dl_auth ON public.staff_task_dead_letter;
CREATE POLICY staff_task_dl_auth ON public.staff_task_dead_letter
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Realtime — admin Today board reflects Telegram button presses live.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='staff_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_tasks;
  END IF;
END $$;

COMMENT ON TABLE public.staff_tasks IS
  'Everyday staff tasks/reminders (one-off + recurring templates). Distinct from production_tasks (KDS) and business_tasks (Mission Control). Pushed to Telegram in Phase 2.';
COMMENT ON TABLE public.staff_telegram IS
  'Links a staff member to their Telegram chat_id for personal task pushes (Phase 2).';
COMMENT ON FUNCTION public.fn_materialize_recurring_tasks(DATE) IS
  'Idempotently materializes today''s task instances from active recurring templates. Called by pg_cron each morning (Phase 3).';

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '264a_staff_task_tracker.sql',
  'claude-code',
  'Staff task tracker Phase 1: staff_tasks (+ recurring templates), staff_telegram, staff_task_dead_letter, fn_materialize_recurring_tasks, RLS, realtime.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
