-- ============================================================
-- Migration 093: Mission Control Agile — sprints & comments
-- ============================================================

-- 1. Sprints table
CREATE TABLE public.sprints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,              -- "Sprint 2026-W15"
  goal        TEXT,                       -- Sprint goal (what we want to achieve)
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning', 'active', 'review', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active sprint at a time
CREATE UNIQUE INDEX idx_sprints_single_active
  ON sprints (status) WHERE status = 'active';

-- Auto-update timestamp
CREATE TRIGGER trg_sprints_updated
  BEFORE UPDATE ON sprints
  FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- 2. Task comments table
CREATE TABLE public.task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES business_tasks(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,              -- 'coo', 'finance-agent', 'chef-agent', 'lesia'
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);

-- 3. Extend business_tasks with sprint link + story points
ALTER TABLE business_tasks
  ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS story_points SMALLINT;

CREATE INDEX idx_tasks_sprint_id ON business_tasks(sprint_id)
  WHERE sprint_id IS NOT NULL;

-- 4. RLS policies (match existing admin_full pattern from 091)
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_full ON sprints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY admin_full ON task_comments FOR ALL USING (true) WITH CHECK (true);

-- 5. Grants
GRANT ALL ON sprints TO authenticated, anon;
GRANT ALL ON task_comments TO authenticated, anon;
