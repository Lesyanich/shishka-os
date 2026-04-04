# Handoff: MC Agile Sprint-1 — DB + MCP

> **MC Tasks:** `5b042acf` (DB schema) + `a2d9e83a` (MCP tools)
> **Parent Epic:** `471162b8` (MC v2: Agile-трансформация)
> **Author:** COO (Cowork) | **Date:** 2026-04-04
> **For:** Admin Panel Dev (Claude Code)
> **Branch:** `feature/shared/mc-agile-sprint1`

---

## 0. TL;DR

Добавить спринты и комментарии в Mission Control. Две миграции + 6 новых MCP tools + расширение 2 существующих. Код по паттерну существующего mcp-mission-control (4 tools, Zod, jsonResult).

---

## 1. Текущее состояние

```
services/mcp-mission-control/
├── src/
│   ├── index.ts               — 4 tools зарегистрированы
│   ├── lib/supabase.ts        — singleton Supabase client (Service Role Key)
│   └── tools/
│       ├── emit-business-task.ts
│       ├── get-task.ts
│       ├── list-tasks.ts
│       └── update-task.ts
├── dist/                      — compiled output
├── package.json               — MCP SDK 1.12, supabase-js 2.49, zod 4.3
└── tsconfig.json              — ES2022, strict

DB (migration 091):
├── business_initiatives      — EXISTS (id, title, description, status, domains[], budget, deadline)
├── business_tasks            — EXISTS (id, title, domain, status, priority, initiative_id FK, parent_task_id FK, tags[], related_ids JSONB, notes)
└── Triggers: fn_update_timestamp, fn_task_completed_at
```

---

## 2. Миграция 093: sprints + task_comments

**Файл:** `services/supabase/migrations/093_mc_agile.sql`

```sql
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
```

---

## 3. Новые MCP tools

### Паттерн (повторить из существующих)

```typescript
// В каждом handler-файле:
import { getSupabase } from "../lib/supabase.js";

export async function toolName(args: ToolArgs) {
  const sb = getSupabase();
  // ... logic ...
  return { success: true, ... };
}

// В index.ts:
import { toolName } from "./tools/tool-name.js";
server.tool("tool_name", "Description", { /* Zod schema */ }, async (args) => jsonResult(await toolName(args)));
```

### 3.1 `create_sprint`

**Файл:** `src/tools/create-sprint.ts`

```typescript
interface CreateSprintArgs {
  name: string;        // required — "Sprint 2026-W15"
  goal?: string;       // optional
  start_date: string;  // required — YYYY-MM-DD
  end_date: string;    // required — YYYY-MM-DD
}
```

Логика:
1. Validate dates (end > start)
2. Insert into `sprints` table
3. Return sprint object

### 3.2 `list_sprints`

**Файл:** `src/tools/list-sprints.ts`

```typescript
interface ListSprintsArgs {
  status?: 'planning' | 'active' | 'review' | 'closed';
  limit?: number; // default 10
}
```

Логика:
1. Query sprints with optional status filter
2. Order by start_date DESC
3. For each sprint: count tasks by status (subquery or separate query)
4. Return sprints with task_counts: `{ inbox: N, in_progress: M, done: K, total: T }`

### 3.3 `update_sprint`

**Файл:** `src/tools/update-sprint.ts`

```typescript
interface UpdateSprintArgs {
  sprint_id: string;   // required
  status?: 'planning' | 'active' | 'review' | 'closed';
  goal?: string;
  name?: string;
  end_date?: string;
}
```

Логика:
1. Validate sprint exists
2. If setting status='active' — check no other active sprint exists
3. If setting status='closed' — optionally set completed_at? (нет, нет такого поля — просто updated_at обновится через trigger)
4. Update and return

### 3.4 `assign_to_sprint`

**Файл:** `src/tools/assign-to-sprint.ts`

```typescript
interface AssignToSprintArgs {
  task_id: string;     // required
  sprint_id: string;   // required (UUID). Pass null-string to unassign.
}
```

Логика:
1. Validate task exists
2. Validate sprint exists (if not unassigning)
3. Update `business_tasks.sprint_id`
4. Return updated task

### 3.5 `add_comment`

**Файл:** `src/tools/add-comment.ts`

```typescript
interface AddCommentArgs {
  task_id: string;   // required
  author: string;    // required — 'coo', 'finance-agent', 'chef-agent', 'lesia'
  body: string;      // required — comment text
}
```

Логика:
1. Validate task exists
2. Insert into `task_comments`
3. Return comment object

### 3.6 `list_comments`

**Файл:** `src/tools/list-comments.ts`

```typescript
interface ListCommentsArgs {
  task_id: string;    // required
  limit?: number;     // default 20
}
```

Логика:
1. Query task_comments WHERE task_id, ORDER BY created_at ASC
2. Return comments array

---

## 4. Расширение существующих tools

### 4.1 `list_tasks` — добавить sprint_id фильтр

**Файл:** `src/tools/list-tasks.ts`

Добавить в args:
```typescript
sprint_id?: string;   // optional — filter by sprint
```

В query добавить:
```typescript
if (args.sprint_id) query = query.eq('sprint_id', args.sprint_id);
```

В Zod schema в index.ts добавить:
```typescript
sprint_id: z.string().optional().describe("Filter by sprint UUID"),
```

### 4.2 `get_task` — включить комментарии

**Файл:** `src/tools/get-task.ts`

После получения task и initiative/parent_task, добавить:
```typescript
const { data: comments } = await sb
  .from('task_comments')
  .select('*')
  .eq('task_id', args.task_id)
  .order('created_at', { ascending: true })
  .limit(10);

return { task, initiative, parent_task, comments: comments ?? [] };
```

---

## 5. Registration в index.ts

Добавить imports:
```typescript
import { createSprint } from "./tools/create-sprint.js";
import { listSprints } from "./tools/list-sprints.js";
import { updateSprint } from "./tools/update-sprint.js";
import { assignToSprint } from "./tools/assign-to-sprint.js";
import { addComment } from "./tools/add-comment.js";
import { listComments } from "./tools/list-comments.js";
```

Зарегистрировать 6 новых tools + обновить count: `Tools: 4 → 10`.

---

## 6. Порядок выполнения

```
1. git checkout -b feature/shared/mc-agile-sprint1
2. Создать миграцию 093_mc_agile.sql
3. Применить миграцию (supabase db push или SQL Editor)
4. Создать 6 handler-файлов в src/tools/
5. Обновить list-tasks.ts — добавить sprint_id фильтр
6. Обновить get-task.ts — добавить comments в ответ
7. Обновить index.ts — imports + 6 tool registrations + update count
8. npm run build — 0 ошибок
9. Тест: перезапустить MCP → create_sprint → assign_to_sprint → add_comment → list_comments
10. Коммит + PR
```

---

## 7. Приёмка

- [ ] Миграция 093 применена без ошибок
- [ ] `create_sprint` создаёт спринт, `list_sprints` возвращает его
- [ ] `update_sprint(status="active")` работает, второй active спринт блокируется unique index
- [ ] `assign_to_sprint` привязывает задачу к спринту, `list_tasks(sprint_id=X)` фильтрует
- [ ] `add_comment` добавляет комментарий, `list_comments` возвращает thread
- [ ] `get_task` включает последние 10 комментариев
- [ ] `npm run build` — 0 ошибок
- [ ] MCP сервер стартует с `Tools: 10`

---

## 8. Не в scope

- Admin Panel UI (Sprint Board, Task Detail) — это Sprint-2
- Agent protocol update — Sprint-2
- n8n automation — Sprint-3
- Velocity/burndown tracking — Sprint-3+
