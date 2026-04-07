# Spec: mcp-mission-control — Shared Mission Control MCP

> **Author:** COO (Cowork)
> **Date:** 2026-04-04
> **For:** Admin Panel Dev (Claude Code)
> **Priority:** HIGH — без этого агенты не могут создавать и читать задачи MC

---

## 1. Проблема

`emit_business_task`, `list_tasks`, `get_task`, `update_task` живут в `services/mcp-chef/`.
Это означает:
- Finance Agent не может создавать задачи в Mission Control
- COO вынужден подключать Chef MCP (получая ненужные кухонные тулы)
- Будущие агенты (Procurement, Marketing) тоже будут без MC доступа
- Нарушается принцип: Mission Control = общий для всех

## 2. Решение

Создать `services/mcp-mission-control/` — отдельный MCP-сервер с 4 тулами для работы с `business_tasks` и `business_initiatives`.

Каждый Cowork-проект и Claude Code подключает его **наряду** со своим доменным MCP:
- COO → mcp-mission-control (только)
- Chef → mcp-chef + mcp-mission-control
- Finance → mcp-finance + mcp-mission-control
- Admin Panel Dev → mcp-mission-control (+ другие по необходимости)

## 3. Извлекаемые tools (из mcp-chef)

| Tool | Source file | Описание |
|------|------------|----------|
| `emit_business_task` | `tools/emit-business-task.ts` | Создать задачу в MC |
| `list_tasks` | `tools/list-tasks.ts` | Список задач с фильтрами |
| `get_task` | `tools/get-task.ts` | Полная задача + initiative + parent |
| `update_task` | `tools/update-task.ts` | Частичное обновление задачи |

**Зависимости:** `@supabase/supabase-js`, `zod`, `@modelcontextprotocol/sdk`
**ENV:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
**DB tables:** `business_tasks`, `business_initiatives` (read-only для initiatives)

## 4. Структура нового сервера

```
services/mcp-mission-control/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              — MCP server registration
│   ├── lib/
│   │   └── supabase.ts       — Supabase client (copy from mcp-chef)
│   └── tools/
│       ├── emit-business-task.ts
│       ├── list-tasks.ts
│       ├── get-task.ts
│       └── update-task.ts
```

## 5. Порядок работы

### Шаг 1: Extract
1. Скопировать 4 tool-файла из `mcp-chef/src/tools/`
2. Скопировать `lib/supabase.ts`
3. Создать `index.ts` — зарегистрировать 4 тула
4. Создать `package.json` с зависимостями

### Шаг 2: Remove from mcp-chef
1. Удалить 4 tool-файла из `mcp-chef/src/tools/`
2. Удалить `lib/emit-task.ts` (re-export)
3. Убрать импорты и регистрацию из `mcp-chef/src/index.ts`
4. Убедиться что `npm run build` проходит

### Шаг 3: Configure
1. Добавить mcp-mission-control в конфиг всех Cowork-проектов
2. Добавить в Claude Code конфиг (`.claude/settings.json` или аналог)
3. Проверить что ENV-переменные доступны

### Шаг 4: Verify
1. `emit_business_task` — создать тестовую задачу
2. `list_tasks` — найти её
3. `update_task` — обновить статус
4. `get_task` — получить полные детали
5. Удалить тестовую задачу

## 6. Конфигурация MCP для проектов

После создания, добавить в MCP config каждого проекта:

```json
{
  "mcpServers": {
    "shishka-mission-control": {
      "command": "node",
      "args": ["services/mcp-mission-control/dist/index.js"],
      "env": {
        "SUPABASE_URL": "...",
        "SUPABASE_SERVICE_ROLE_KEY": "..."
      }
    }
  }
}
```

## 7. Обновление документации

После деплоя обновить:
- `STATUS.md` — добавить mcp-mission-control в Mission Control секцию
- `docs/PROJECT_REGISTRY.md` — указать что MC tools теперь отдельный MCP
- `agents/chef/AGENT.md` — убрать MC tools из Capabilities, добавить ссылку на mcp-mission-control
- `agents/finance/AGENT.md` — обновить Capabilities секцию
- `docs/constitution/agent-rules.md` — уточнить что emit_business_task из mcp-mission-control

## 8. Приёмка

- [ ] `services/mcp-mission-control/` работает как standalone MCP
- [ ] `mcp-chef` работает без MC tools (build + runtime)
- [ ] COO Cowork может создавать задачи через mcp-mission-control
- [ ] Finance Agent может создавать задачи через mcp-mission-control
- [ ] Chef Agent может создавать задачи через mcp-mission-control (вместо встроенных)

## 9. Не в scope

- Новые тулы (delete_task, bulk operations) — в будущем
- Initiatives CRUD — пока read-only при get_task
- Webhooks/notifications — в будущем
