# ТЗ: MCP-тул `emit_business_task` + Миграция 091

> Для терминального агента. Контекст: agents/chef/AGENT.md, docs/constitution/agent-tracking.md

---

## 0. Предпосылки

Сейчас `src/lib/emit-task.ts` — внутренний хелпер, вызываемый из `createProduct` как side-effect.
Агенты не могут напрямую создавать задачи в Mission Control.
Нужно: **публичный MCP-тул**, доступный любому агенту через stdio.

---

## 1. Применить миграцию 091

**Файл:** `services/supabase/migrations/091_business_tasks.sql`
**Статус:** написана, НЕ применена

### Действия

1. Открыть Supabase Dashboard → SQL Editor
2. Вставить содержимое `091_business_tasks.sql` целиком
3. Выполнить (Run)
4. Проверить:
   ```sql
   SELECT count(*) FROM business_tasks;       -- должен вернуть 0
   SELECT count(*) FROM business_initiatives;  -- должен вернуть 0
   ```
5. Проверить RLS:
   ```sql
   SELECT tablename, policyname FROM pg_policies
   WHERE tablename IN ('business_tasks', 'business_initiatives');
   -- Должны быть: business_tasks_admin_full, business_initiatives_admin_full
   ```
6. Проверить триггеры:
   ```sql
   SELECT tgname FROM pg_trigger
   WHERE tgname LIKE 'trg_business_%';
   -- Должны быть: trg_business_tasks_updated, trg_business_initiatives_updated, trg_business_tasks_completed
   ```

> **Внимание:** Supabase CLI не привязан (см. tech-debt.md Phase 6.6). Применять только через Dashboard SQL Editor.

---

## 2. Новый MCP-тул: `emit_business_task`

### 2.1 Регистрация в `src/index.ts`

**Когда вызывать:** Только если задача проходит Decision Tree из `agent-tracking.md`:
1. Есть бизнес-результат, понятный Лесе? → НЕТ → Tier 2 (session-log.md)
2. Это завершённая единица работы? → НЕТ → Tier 2
3. ДА на оба → emit_business_task

Следовать паттерну Zod-inline (как `search_products`, `create_product`):

```typescript
import { emitBusinessTask } from "./tools/emit-business-task.js";

// В секции "// === Write tools ==="
server.tool(
  "emit_business_task",
  "Create a business task in Mission Control (Supabase business_tasks). " +
  "Use for completed business outcomes, discoveries, or blockers — NOT for technical sub-steps.",
  {
    title: z.string().min(5).max(200).describe(
      "Task title. Concise, business-readable. Example: 'New dish created: SALE-PUMPKIN-SOUP (margin 68%)'"
    ),
    description: z.string().max(1000).optional().describe(
      "Optional details. Price, quantities, what was found, why it's blocked."
    ),
    domain: z.enum([
      "kitchen", "procurement", "finance", "marketing",
      "ops", "sales", "strategy", "tech"
    ]).describe("Business domain. See DISPATCH_RULES.md for scope of each domain."),
    status: z.enum(["inbox", "done"]).default("inbox").describe(
      "'inbox' = needs Lesia's triage (default). 'done' = work already completed, just logging."
    ),
    priority: z.enum(["critical", "high", "medium", "low"]).default("medium").describe(
      "Follow DISPATCH_RULES.md priority algorithm. Default: medium."
    ),
    source: z.enum([
      "agent_discovery", "owner", "chef_idea",
      "customer_review", "seasonal", "market_intel"
    ]).default("agent_discovery").describe(
      "How the task was discovered. Agents use 'agent_discovery'."
    ),
    created_by: z.string().regex(/^[a-z]+-agent$|^dispatcher$|^lesia$/).describe(
      "Who created: 'chef-agent', 'finance-agent', 'dispatcher', 'lesia'"
    ),
    tags: z.array(z.string()).optional().describe(
      "Freeform tags for filtering. Example: ['product', 'sale', 'audit']"
    ),
    related_ids: z.record(z.union([z.string(), z.number(), z.boolean()])).describe(
      "MUST include at least one entity ID. Keys: snake_case. " +
      "Standard keys: nomenclature_id, expense_id, inbox_id, agent_session, batch_count, batch_total_thb, git_branch, pr_number"
    ),
    initiative_id: z.string().uuid().optional().describe(
      "Link to a business_initiative if this task is part of a cross-domain project."
    ),
    parent_task_id: z.string().uuid().optional().describe(
      "Link to parent task for subtasks (e.g. cascade domain tasks from Dispatcher)."
    ),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(
      "Due date in YYYY-MM-DD format."
    ),
    notes: z.string().max(500).optional().describe(
      "Free-text notes for human triagers. Agents rarely need this — use description instead."
    ),
  },
  async (args) => jsonResult(await emitBusinessTask(args))
);
```

### 2.2 Файл обработчика: `src/tools/emit-business-task.ts`

```typescript
import { getSupabase } from "../lib/supabase.js";

interface EmitBusinessTaskArgs {
  title: string;
  description?: string;
  domain: string;
  status?: string;
  priority?: string;
  source?: string;
  created_by: string;
  tags?: string[];
  related_ids: Record<string, string | number | boolean>;
  initiative_id?: string;
  parent_task_id?: string;
  due_date?: string;
  notes?: string;
}

export async function emitBusinessTask(args: EmitBusinessTaskArgs) {
  const sb = getSupabase();

  // ── Validation ──────────────────────────────────────────

  // 1. related_ids must have at least one key
  if (!args.related_ids || Object.keys(args.related_ids).length === 0) {
    return {
      error: "related_ids must include at least one entity ID. " +
             "Standard keys: nomenclature_id, expense_id, inbox_id, agent_session"
    };
  }

  // 2. related_ids values must be primitives (no nested objects)
  for (const [key, val] of Object.entries(args.related_ids)) {
    if (val !== null && typeof val === "object") {
      return {
        error: `related_ids.${key} must be a primitive (string, number, boolean), got object`
      };
    }
  }

  // 3. If initiative_id provided, verify it exists
  if (args.initiative_id) {
    const { data: initiative } = await sb
      .from("business_initiatives")
      .select("id, title")
      .eq("id", args.initiative_id)
      .single();
    if (!initiative) {
      return { error: `Initiative not found: ${args.initiative_id}` };
    }
  }

  // 4. If parent_task_id provided, verify it exists
  if (args.parent_task_id) {
    const { data: parent } = await sb
      .from("business_tasks")
      .select("id, title")
      .eq("id", args.parent_task_id)
      .single();
    if (!parent) {
      return { error: `Parent task not found: ${args.parent_task_id}` };
    }
  }

  // 5. Agents cannot assign work (assigned_to always null)
  //    — enforced by NOT accepting assigned_to in the schema at all

  // ── Insert ──────────────────────────────────────────────

  const row = {
    title:          args.title,
    description:    args.description ?? null,
    domain:         args.domain,
    status:         args.status ?? "inbox",
    priority:       args.priority ?? "medium",
    source:         args.source ?? "agent_discovery",
    created_by:     args.created_by,
    assigned_to:    null,              // agents NEVER assign
    tags:           args.tags ?? [],
    related_ids:    args.related_ids,
    initiative_id:  args.initiative_id ?? null,
    parent_task_id: args.parent_task_id ?? null,
    due_date:       args.due_date ?? null,
    notes:          args.notes ?? null,
  };

  const { data, error } = await sb
    .from("business_tasks")
    .insert(row)
    .select("id, title, domain, status, priority, created_at")
    .single();

  if (error) {
    return { error: `DB error: ${error.message}` };
  }

  // ── Response ────────────────────────────────────────────

  return {
    success: true,
    task: {
      id:         data.id,
      title:      data.title,
      domain:     data.domain,
      status:     data.status,
      priority:   data.priority,
      created_at: data.created_at,
    },
    message: `Task created in Mission Control: [${data.domain}] ${data.priority} — "${data.title}"`,
  };
}
```

### 2.3 Обновить существующий `src/lib/emit-task.ts`

Старый файл `src/lib/emit-task.ts` используется как side-effect внутри `createProduct`.
**Два варианта** (выбрать один):

**Вариант A (рекомендуется):** Переписать `lib/emit-task.ts` → импортировать новый `tools/emit-business-task.ts`:
```typescript
// src/lib/emit-task.ts
import { emitBusinessTask } from "../tools/emit-business-task.js";
export { emitBusinessTask };
```

**Вариант B:** Оставить оба файла, в `createProduct` переключить импорт на новый.

> Вариант A лучше — единая точка правды, одна функция, два способа вызова (MCP-тул + internal import).

---

## 3. Валидация — сводная таблица

| Поле | Тип | Required | Валидация |
|------|-----|----------|-----------|
| `title` | string | ✅ | min 5, max 200 chars |
| `description` | string | ❌ | max 1000 chars |
| `domain` | enum | ✅ | 8 значений (kitchen, procurement, finance, marketing, ops, sales, strategy, tech) |
| `status` | enum | ❌ | `inbox` (default) или `done`. Агенты НЕ ставят backlog/in_progress/blocked |
| `priority` | enum | ❌ | critical / high / medium (default) / low |
| `source` | enum | ❌ | agent_discovery (default), owner, chef_idea, customer_review, seasonal, market_intel |
| `created_by` | string | ✅ | regex: `^[a-z]+-agent$\|^dispatcher$\|^lesia$` |
| `assigned_to` | — | — | НЕ принимается. Всегда null. Агенты не назначают работу |
| `tags` | string[] | ❌ | freeform |
| `related_ids` | jsonb | ✅ | ≥1 ключ, значения — примитивы, ключи snake_case |
| `initiative_id` | uuid | ❌ | FK → business_initiatives (проверять exists) |
| `parent_task_id` | uuid | ❌ | FK → business_tasks (проверять exists) |
| `due_date` | string | ❌ | YYYY-MM-DD |
| `notes` | string | ❌ | max 500 chars. Для человеческого триажа, агенты обычно используют description |

---

## 4. Интеграция с существующими тулами

После деплоя `emit_business_task` — обновить side-effect вызовы в существующих тулах:

| Тул | Когда эмитит | domain | status |
|-----|-------------|--------|--------|
| `create_product` (PF/SALE) | после успешного создания | `kitchen` | `done` |
| `audit_all_dishes` | если найдены проблемы | `kitchen` | `inbox` |
| `calculate_cost` | если маржа < порога | `kitchen` | `inbox` |

> Это уже частично реализовано в `createProduct` через старый `lib/emit-task.ts`. После рефакторинга (п. 2.3) поведение не изменится.

---

## 5. Тестирование

### 5.1 Локальный smoke-test (после деплоя)

Вызвать через MCP Inspector или через Cowork-сессию Chef Agent:

```json
{
  "tool": "emit_business_task",
  "arguments": {
    "title": "Test task from spec — delete me",
    "domain": "tech",
    "status": "inbox",
    "priority": "low",
    "source": "agent_discovery",
    "created_by": "chef-agent",
    "tags": ["test", "delete-me"],
    "related_ids": {
      "agent_session": "2026-04-03T00:00:00"
    }
  }
}
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "task": {
    "id": "uuid...",
    "title": "Test task from spec — delete me",
    "domain": "tech",
    "status": "inbox",
    "priority": "low",
    "created_at": "2026-04-03T..."
  },
  "message": "Task created in Mission Control: [tech] low — \"Test task from spec — delete me\""
}
```

### 5.2 Проверка в БД

```sql
SELECT id, title, domain, status, priority, source, created_by, related_ids
FROM business_tasks
WHERE tags @> ARRAY['test']::text[];
```

### 5.3 Negative tests

| Тест | Ожидание |
|------|----------|
| `related_ids: {}` | Ошибка: "must include at least one entity ID" |
| `created_by: "bob"` | Zod rejection (regex fail) |
| `status: "in_progress"` | Zod rejection (only inbox/done allowed) |
| `initiative_id: "nonexistent-uuid"` | Ошибка: "Initiative not found" |
| `title: "Hi"` | Zod rejection (min 5 chars) |

### 5.4 Удалить тестовую запись

```sql
DELETE FROM business_tasks WHERE tags @> ARRAY['test']::text[];
```

---

## 6. Файлы для изменения (чеклист)

- [ ] **Supabase Dashboard** — применить `services/supabase/migrations/091_business_tasks.sql`
- [ ] **`src/tools/emit-business-task.ts`** — новый файл (п. 2.2)
- [ ] **`src/index.ts`** — добавить import + `server.tool(...)` регистрацию (п. 2.1)
- [ ] **`src/lib/emit-task.ts`** — рефакторинг → re-export из `tools/` (п. 2.3, вариант A)
- [ ] **`services/mcp-chef/README.md`** — добавить тул #16 в список
- [ ] **`docs/tech-debt.md`** — убрать запись "Chef Agent: emit_business_task MCP tool" после деплоя

---

## 7. Критические правила (не нарушать)

1. **`assigned_to` = null всегда.** Агенты не назначают работу людям.
2. **`status` только `inbox` или `done`.** Промежуточные статусы — ответственность человека.
3. **`related_ids` ≥ 1 ключ.** Пустой related_ids = отказ.
4. **`cost_per_unit` НИКОГДА не писать напрямую.** (Это правило BOM, но на всякий случай.)
5. **RLS:** тул работает через `SUPABASE_SERVICE_ROLE_KEY` — обходит RLS. Валидация — в коде.
