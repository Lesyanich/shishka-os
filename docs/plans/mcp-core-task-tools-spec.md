# ТЗ: MCP-Core — Task Management Tools

**MC задача:** a3192b59 (из Desktop чата)
**Приоритет:** critical
**Домен:** tech

---

## 0. Зачем

Сейчас агенты (Chef, COO) могут **создавать** задачи через `emit_business_task` в mcp-chef.
Но **читать** и **обновлять** задачи могут только люди через admin-panel UI (`/mission`).

Claude Code в терминале не имеет доступа к Mission Control. Чтобы он мог самостоятельно
брать задачи из очереди, нужны MCP-тулы для чтения и обновления.

---

## 1. Архитектурное решение

### Вариант: добавить в mcp-chef (рекомендуется)

Пока у нас один MCP-сервер (`services/mcp-chef`), добавляем тулы туда.
Когда появится второй агент — выносим task-тулы в отдельный `mcp-core`.

**Причина:** не плодить инфраструктуру ради 3 тулов. mcp-chef уже подключен к Supabase,
уже имеет `emit_business_task`, логично держать весь task management рядом.

---

## 2. Новые тулы (3 штуки)

### 2.1 `list_tasks` — поиск задач с фильтрами

```typescript
server.tool(
  "list_tasks",
  "List business tasks from Mission Control with filters. Use to find tasks by domain, status, priority.",
  {
    domain: z.enum([
      "kitchen", "procurement", "finance", "marketing",
      "ops", "sales", "strategy", "tech"
    ]).optional().describe("Filter by domain"),
    status: z.enum([
      "inbox", "backlog", "in_progress", "blocked", "done", "cancelled"
    ]).optional().describe("Filter by status (default: shows all non-done)"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional()
      .describe("Filter by priority"),
    created_by: z.string().optional().describe("Filter by creator (e.g. 'chef-agent')"),
    limit: z.number().min(1).max(50).default(20).describe("Max results"),
    include_done: z.boolean().default(false)
      .describe("Include done/cancelled tasks (excluded by default)"),
  },
  async (args) => jsonResult(await listTasks(args))
);
```

**Логика обработчика `src/tools/list-tasks.ts`:**

```typescript
export async function listTasks(args: ListTasksArgs) {
  const sb = getSupabase();

  let query = sb
    .from("business_tasks")
    .select("id, title, description, domain, status, priority, source, created_by, due_date, tags, related_ids, created_at, updated_at")
    .order("priority_order", { ascending: true })  // см. примечание ниже
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 20);

  if (args.domain) query = query.eq("domain", args.domain);
  if (args.status) query = query.eq("status", args.status);
  if (args.priority) query = query.eq("priority", args.priority);
  if (args.created_by) query = query.eq("created_by", args.created_by);

  if (!args.include_done) {
    query = query.not("status", "in", '("done","cancelled")');
  }

  const { data, error } = await query;

  if (error) return { error: `DB error: ${error.message}` };

  return {
    count: data?.length ?? 0,
    tasks: data?.map(t => ({
      id: t.id,
      title: t.title,
      domain: t.domain,
      status: t.status,
      priority: t.priority,
      created_by: t.created_by,
      due_date: t.due_date,
      tags: t.tags,
      spec_file: t.related_ids?.spec_file ?? null,
      created_at: t.created_at,
    })),
  };
}
```

**Примечание о сортировке по приоритету:**
Supabase сортирует text alphabetically. Для правильного порядка (critical > high > medium > low)
есть два пути:
- **Вариант A:** Добавить computed column `priority_order` через миграцию (CASE WHEN)
- **Вариант B:** Сортировать в JS после fetch

Рекомендую Вариант B (сортировка в JS) — проще, не требует миграции:
```typescript
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
data.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
```

---

### 2.2 `get_task` — получить одну задачу по ID

```typescript
server.tool(
  "get_task",
  "Get full details of a specific business task by ID.",
  {
    task_id: z.string().uuid().describe("UUID of the task"),
  },
  async (args) => jsonResult(await getTask(args))
);
```

**Обработчик `src/tools/get-task.ts`:**

```typescript
export async function getTask(args: { task_id: string }) {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("business_tasks")
    .select("*")
    .eq("id", args.task_id)
    .single();

  if (error) return { error: `Task not found: ${args.task_id}` };

  // Если есть initiative_id — подтянуть название
  let initiative = null;
  if (data.initiative_id) {
    const { data: init } = await sb
      .from("business_initiatives")
      .select("id, title, status")
      .eq("id", data.initiative_id)
      .single();
    initiative = init;
  }

  // Если есть parent_task_id — подтянуть название
  let parent_task = null;
  if (data.parent_task_id) {
    const { data: parent } = await sb
      .from("business_tasks")
      .select("id, title, status")
      .eq("id", data.parent_task_id)
      .single();
    parent_task = parent;
  }

  return {
    task: data,
    initiative,
    parent_task,
  };
}
```

---

### 2.3 `update_task` — обновить статус и поля задачи

```typescript
server.tool(
  "update_task",
  "Update a business task's status, priority, or other fields. Use to move tasks through the workflow.",
  {
    task_id: z.string().uuid().describe("UUID of the task to update"),
    status: z.enum([
      "inbox", "backlog", "in_progress", "blocked", "done", "cancelled"
    ]).optional().describe("New status"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional()
      .describe("New priority"),
    description: z.string().max(1000).optional()
      .describe("Update description (e.g. add result summary)"),
    notes: z.string().max(500).optional()
      .describe("Add notes (e.g. why blocked, what was done)"),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe("Set or update due date (YYYY-MM-DD)"),
    tags: z.array(z.string()).optional()
      .describe("Replace tags array"),
  },
  async (args) => jsonResult(await updateTask(args))
);
```

**Обработчик `src/tools/update-task.ts`:**

```typescript
export async function updateTask(args: UpdateTaskArgs) {
  const sb = getSupabase();

  // 1. Fetch current task
  const { data: current, error: fetchErr } = await sb
    .from("business_tasks")
    .select("id, title, status, priority")
    .eq("id", args.task_id)
    .single();

  if (fetchErr || !current) {
    return { error: `Task not found: ${args.task_id}` };
  }

  // 2. Build update object (only provided fields)
  const update: Record<string, any> = {};
  if (args.status) update.status = args.status;
  if (args.priority) update.priority = args.priority;
  if (args.description !== undefined) update.description = args.description;
  if (args.notes !== undefined) update.notes = args.notes;
  if (args.due_date !== undefined) update.due_date = args.due_date;
  if (args.tags !== undefined) update.tags = args.tags;

  if (Object.keys(update).length === 0) {
    return { error: "No fields to update. Provide at least one field." };
  }

  // 3. Update
  const { data, error } = await sb
    .from("business_tasks")
    .update(update)
    .eq("id", args.task_id)
    .select("id, title, status, priority, updated_at")
    .single();

  if (error) return { error: `DB error: ${error.message}` };

  return {
    success: true,
    task: data,
    change: `${current.status} → ${data.status}`,
    message: `Updated task: "${data.title}" [${data.status}]`,
  };
}
```

---

## 3. Конвенция `spec_file` в related_ids

Чтобы Code мог найти спеку задачи автоматически, COO при создании задачи должен
включать путь к файлу спеки в `related_ids`:

```json
{
  "spec_file": "docs/plans/mission-control-ui-spec.md",
  "agent_session": "2026-04-03T00:00:00"
}
```

Code читает `spec_file` из задачи и загружает файл. Не нужен QUEUE.md — задачи хранятся в БД.

---

## 4. Workflow для Claude Code после реализации

```
Леся: "возьми следующую tech-задачу"

Code:
  1. list_tasks(domain: "tech", status: "inbox", limit: 1)
  2. → получает задачу с highest priority
  3. update_task(task_id, status: "in_progress")
  4. Если related_ids.spec_file → cat {spec_file} → читает спеку
  5. Выполняет работу
  6. update_task(task_id, status: "done", notes: "Реализовано: ...")
```

---

## 5. Файлы для изменения

- [ ] `src/tools/list-tasks.ts` — новый файл
- [ ] `src/tools/get-task.ts` — новый файл
- [ ] `src/tools/update-task.ts` — новый файл
- [ ] `src/index.ts` — добавить 3 регистрации + imports
- [ ] `README.md` — обновить список тулов (16 → 19)

---

## 6. Тестирование

### Smoke test list_tasks:
```json
{ "tool": "list_tasks", "arguments": { "domain": "tech", "status": "inbox" } }
```
Ожидание: вернёт 2+ задачи (session handoff protocol, MC UI).

### Smoke test get_task:
```json
{ "tool": "get_task", "arguments": { "task_id": "e98257c4-3711-4b5e-a150-abb67a2f86c4" } }
```
Ожидание: вернёт полную задачу "Mission Control UI needed".

### Smoke test update_task:
```json
{
  "tool": "update_task",
  "arguments": {
    "task_id": "e98257c4-3711-4b5e-a150-abb67a2f86c4",
    "status": "done",
    "notes": "UI already exists at /mission page"
  }
}
```
Ожидание: статус изменён на done, updated_at обновлён.

---

## 7. Критические правила

1. **list_tasks по умолчанию НЕ показывает done/cancelled** — чтобы не засорять контекст.
2. **update_task не позволяет менять title, domain, source, created_by** — это иммутабельные поля.
3. **Нет delete** — задачи не удаляются, только cancelled.
4. **assigned_to не поддерживается** — пока нет назначения задач (агенты не назначают).
