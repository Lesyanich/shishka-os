# Spec: executor_type + Role Visibility

**MC Task:** TBD
**Priority:** MEDIUM (не блокирует открытие, но нужно для командной работы)
**Domain:** tech

## Контекст

MC используется не только агентами и Code, но и людьми.
Нужно различать задачи для людей, кода и агентов + фильтровать по ролям.

## Миграция 092

```sql
-- 092_executor_type_and_roles.sql

-- 1. Добавить executor_type
ALTER TABLE business_tasks
  ADD COLUMN IF NOT EXISTS executor_type text NOT NULL DEFAULT 'human'
  CHECK (executor_type IN ('human', 'code', 'agent'));

-- 2. Расширить CHECK constraint на assigned_to (drop + recreate)
-- Допустимые значения: любой текст (убрать constraint, слишком жёсткий)
-- assigned_to — свободное текстовое поле, UI сам предложит варианты

-- 3. Обновить существующие задачи
UPDATE business_tasks
  SET executor_type = 'code'
  WHERE created_by IN ('chef-agent', 'finance-agent', 'dispatcher')
    AND executor_type = 'human';

-- 4. Индекс для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_business_tasks_executor_type
  ON business_tasks(executor_type);

CREATE INDEX IF NOT EXISTS idx_business_tasks_assigned_to
  ON business_tasks(assigned_to)
  WHERE assigned_to IS NOT NULL;
```

## MCP: обновить emit_business_task

Добавить параметр `executor_type` (optional, default 'human'):
- Когда COO создаёт задачу для человека → 'human'
- Когда COO создаёт задачу для Code → 'code'
- Когда агент создаёт задачу → 'agent'

Обновить `list_tasks` — добавить фильтр `executor_type`.

## Admin Panel UI

### Фильтр "Мои задачи"
В MC UI (KanbanBoard) добавить dropdown сверху:
- **Все задачи** — без фильтра
- **Мои задачи** — assigned_to = текущий пользователь
- **Для людей** — executor_type = 'human'
- **Для Code/Agents** — executor_type IN ('code', 'agent')

### Фильтр assigned_to
Chips/dropdown с доступными значениями: Lesia, Bas, Chef, Code, Unassigned.
Берутся из SELECT DISTINCT assigned_to FROM business_tasks.

### Заглушка авторизации
Пока нет auth — сохранять выбранную роль в localStorage.
Dropdown в header: "Я — Lesia / Bas / Chef".
Default view меняется в зависимости от роли.

## Матрица видимости (UI-only, не RLS)

| Роль | Default filter | Domains |
|------|---------------|---------|
| Lesia | Все | Все |
| Bas | assigned_to='bas' | Все (можно переключить) |
| Chef | domain IN (kitchen, procurement) | kitchen, procurement |
| Code | executor_type IN (code, agent) | tech |

## Definition of Done
- [ ] Миграция 092 применена
- [ ] MCP emit_business_task принимает executor_type
- [ ] MCP list_tasks фильтрует по executor_type и assigned_to
- [ ] UI: dropdown "Мои задачи" работает
- [ ] UI: фильтр по assigned_to работает
- [ ] Существующие задачи размечены (code vs human)
