# Spec: Mission Control v2 — Agile-трансформация

> **MC Epic:** `471162b8` | Priority: HIGH
> **Author:** COO (Cowork) | **Date:** 2026-04-04
> **For:** Admin Panel Dev (Claude Code) + COO (process design)

---

## 0. Vision

Mission Control превращается из плоской таблицы задач в полноценную Agile-систему управления проектами. Supabase остаётся SSoT. Агенты — полноправные участники спринтов: видят scope, логируют прогресс как комментарии, получают задачи из sprint backlog.

COO = Product Owner (приоритизация, sprint planning, triage).
Леся = CEO (strategic decisions, approve/reject на ключевых milestone).

---

## 1. Текущее состояние

```
business_tasks          — плоская таблица, status/priority/domain/tags
business_initiatives    — таблица существует, поле initiative_id в tasks
mcp-mission-control     — 4 tools: emit, list, get, update
Admin Panel             — нет MC UI (только отдельные модули)
Agent tracking          — Tier 1 (MC tasks) + Tier 2 (session-log.md файлы)
```

**Проблемы:**
- Нет спринтов — невозможно планировать итерации
- Нет комментариев — агенты не могут обсуждать задачи
- Нет группировки по проектам — все задачи в одном потоке
- session-log.md теряется и не привязан к задачам
- Нет Sprint Board UI — вся координация через текстовые отчёты

---

## 2. Target Architecture

```
Supabase (SSoT)
├── business_tasks         ← EXISTS, add: sprint_id FK, story_points
├── business_initiatives   ← EXISTS, verify/extend
├── sprints                ← NEW
├── task_comments          ← NEW
└── (task_attachments)     ← FUTURE

MCP: mcp-mission-control (extend from 4 → ~10 tools)
├── emit_business_task     ← exists
├── list_tasks             ← exists, add: sprint_id filter
├── get_task               ← exists, include: comments
├── update_task            ← exists
├── create_sprint          ← NEW
├── list_sprints           ← NEW
├── update_sprint          ← NEW
├── add_comment            ← NEW
├── list_comments          ← NEW
└── assign_to_sprint       ← NEW

Admin Panel
├── Sprint Board (Kanban)          ← NEW page
├── Backlog (filterable list)      ← NEW page
├── Task Detail + Comments thread  ← NEW page/modal
├── Sprint Planning                ← NEW view
└── Initiative Overview            ← NEW page
```

---

## 3. Задачи (Sprint-1: Schema + MCP)

### 3.1 DB Migration: sprints table

```sql
CREATE TABLE public.sprints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,              -- "Sprint 2026-W15"
  goal        TEXT,                       -- Sprint goal
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning', 'active', 'review', 'closed')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Only one active sprint at a time
CREATE UNIQUE INDEX idx_sprints_active
  ON sprints (status) WHERE status = 'active';
```

### 3.2 DB Migration: task_comments table

```sql
CREATE TABLE public.task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES business_tasks(id) ON DELETE CASCADE,
  author      TEXT NOT NULL,              -- 'coo', 'finance-agent', 'lesia', 'chef-agent'
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);
```

### 3.3 DB Migration: extend business_tasks

```sql
ALTER TABLE business_tasks
  ADD COLUMN IF NOT EXISTS sprint_id UUID REFERENCES sprints(id),
  ADD COLUMN IF NOT EXISTS story_points SMALLINT;

CREATE INDEX idx_tasks_sprint ON business_tasks(sprint_id)
  WHERE sprint_id IS NOT NULL;
```

### 3.4 MCP Tools (mcp-mission-control)

**Sprint tools:**

| Tool | Params | Returns |
|------|--------|---------|
| `create_sprint` | name, goal?, start_date, end_date | sprint object |
| `list_sprints` | status? (planning/active/review/closed) | sprint[] |
| `update_sprint` | sprint_id, status?, goal?, end_date? | sprint object |
| `assign_to_sprint` | task_id, sprint_id | updated task |

**Comment tools:**

| Tool | Params | Returns |
|------|--------|---------|
| `add_comment` | task_id, author, body | comment object |
| `list_comments` | task_id, limit? | comment[] |

**Extend existing:**
- `list_tasks` — add optional `sprint_id` filter
- `get_task` — include last 5 comments in response

---

## 4. Задачи (Sprint-2: UI + Protocol)

### 4.1 Sprint Board Page

Kanban с колонками: inbox → backlog → in_progress → blocked → done.
Фильтр по спринту (dropdown). Каждая карточка: title, domain badge, priority dot, assignee avatar placeholder, story points.

### 4.2 Backlog Page

Таблица всех задач без sprint_id. Фильтры: domain, priority, created_by, tags.
Bulk action: "Assign to sprint" — выбрать задачи → добавить в спринт.

### 4.3 Task Detail

Полная карточка задачи. Секции:
- Header: title, status, priority, domain badge
- Description + notes
- Related IDs (clickable links to entities)
- Comments thread (chronological, автор + timestamp)
- Input для нового комментария
- Actions: change status, assign sprint, edit priority

### 4.4 Agent Protocol Update

`docs/constitution/agent-rules.md` обновить:

**Было (Tier 2):** агент пишет в `agents/{name}/session-log.md`
**Стало (Tier 2):** агент пишет `add_comment(task_id, body)` к текущей задаче

Это привязывает технический прогресс к бизнес-задаче. Session-log.md остаётся как fallback для работы без MC.

При старте сессии агент:
1. `list_sprints(status="active")` → получает текущий спринт
2. `list_tasks(sprint_id=current, domain=my_domain, status="in_progress")` → свой scope
3. Работает по задачам из спринта

---

## 5. Sprint Cadence (Process)

| Event | When | Who | Duration |
|-------|------|-----|----------|
| Sprint Planning | Monday morning | COO + CEO | 15 min |
| Daily Triage | Every morning | COO (auto) | 5 min |
| Sprint Review | Friday | COO + CEO | 10 min |
| Retrospective | Friday (after review) | COO | 5 min |

Sprint length: **1 week** (пока команда маленькая, короткие итерации).

---

## 6. n8n — когда подключать

**Не сейчас.** n8n стоит добавить когда MC v2 работает и нужна автоматизация:
- Daily triage reminder → Telegram
- Sprint end → auto-generate review report
- Stale task detection → alert
- Agent session completion → auto-update task status

Это Sprint-3+.

---

## 7. Порядок реализации

```
Sprint-1 (эта неделя):
  1. DB migrations (sprints, task_comments, alter business_tasks)
  2. MCP tools (6 новых + 2 расширения в mcp-mission-control)
  3. Test: COO создаёт спринт, добавляет задачи, агенты комментируют

Sprint-2 (следующая неделя):
  1. Admin Panel: Sprint Board page
  2. Admin Panel: Backlog page
  3. Admin Panel: Task Detail + Comments
  4. Protocol update: agent-rules.md v2

Sprint-3 (по мере необходимости):
  1. n8n automation layer
  2. Sprint velocity tracking
  3. Burndown charts
  4. Cross-initiative dependency view
```

---

## 8. Linked Tasks

| ID | Title | Priority | Sprint |
|----|-------|----------|--------|
| `5b042acf` | DB schema — sprints, comments, initiatives | high | Sprint-1 |
| `a2d9e83a` | MCP tools — sprint CRUD, add_comment | high | Sprint-1 |
| `03fd8cea` | Admin Panel — Sprint Board + Task Detail | medium | Sprint-2 |
| `459df9ad` | Agent Protocol — sprint-aware tracking | medium | Sprint-2 |
