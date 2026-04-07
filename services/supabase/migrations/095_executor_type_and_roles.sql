-- 095_executor_type_and_roles.sql
-- Добавить executor_type (human/code/agent) в business_tasks
-- для различения задач по типу исполнителя

-- 1. Добавить executor_type
ALTER TABLE business_tasks
  ADD COLUMN IF NOT EXISTS executor_type text NOT NULL DEFAULT 'human'
  CHECK (executor_type IN ('human', 'code', 'agent'));

-- 2. Обновить существующие задачи агентов
UPDATE business_tasks
  SET executor_type = 'code'
  WHERE created_by IN ('chef-agent', 'finance-agent', 'dispatcher', 'coo')
    AND executor_type = 'human';

-- 3. Индексы для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_business_tasks_executor_type
  ON business_tasks(executor_type);

CREATE INDEX IF NOT EXISTS idx_business_tasks_assigned_to
  ON business_tasks(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- ─── SELF-REGISTER IN MIGRATION LOG ────────────────────────────
-- engineering-rules.md #16: every migration must self-register.
-- Retrofitted after CI lint found this file missing the INSERT
-- (production already has this migration applied).
INSERT INTO public.migration_log (filename, applied_by, checksum)
VALUES (
  '095_executor_type_and_roles.sql',
  'claude-code',
  md5('095_executor_type_and_roles')
)
ON CONFLICT DO NOTHING;
