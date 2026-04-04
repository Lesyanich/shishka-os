# Task Queue — Shishka OS

> Очередь задач для Claude Code. Читай при старте сессии.
> Бери верхнюю задачу со статусом `ready`. После выполнения — поставь `done` и дату.
>
> **Формат:** `[status] [priority] title — spec_path (domain)`
> **Статусы:** `ready` → `in_progress` → `done` | `blocked`
>
> **После реализации mcp-core task tools** — этот файл станет backup.
> Основной источник задач — `list_tasks` MCP тул.

---

## Active

- [x] `done` 2026-04-04 — Add list_tasks + get_task + update_task MCP tools — `docs/plans/mcp-core-task-tools-spec.md` (tech/mcp-chef)
  - MC task: `a3192b59` (из Desktop чата)
  - Это самоулучшающая задача: после реализации Code сможет сам читать MC

## Done

- [x] `done` 2026-04-03 — emit_business_task MCP tool — `docs/plans/emit-business-task-spec.md` (tech/mcp-chef)
  - MC task: `e4446bf9-4a76-486b-844d-4feb66f9bfc0`

- [x] `done` 2026-04-03 — Mission Control UI — уже существует в admin-panel `/mission`
  - MC task: `e98257c4-3711-4b5e-a150-abb67a2f86c4` (закрыть как done)
  - Обнаружено COO-агентом: страница MissionControl.tsx + useBusinessTasks hook + KanbanBoard уже реализованы

---

## Protocol

### Для Claude Code (терминал):
1. При старте: `cat docs/plans/QUEUE.md` → найти верхнюю `ready` задачу
2. Прочитать спеку по указанному пути
3. Поменять статус на `in_progress` в этом файле
4. Выполнить работу по спеке
5. Поменять статус на `done` + добавить дату
6. Если есть MCP emit_business_task — обновить статус задачи в MC

### Для COO (Cowork):
1. Создать спеку в `docs/plans/`
2. Создать задачу в Mission Control через `emit_business_task`
3. Добавить строку в QUEUE.md со ссылкой на спеку и MC task id
4. Леся передаёт Code: «возьми следующую задачу из очереди»

### Для Леси:
- Просмотреть QUEUE.md → утвердить приоритеты
- Можно переставить порядок или добавить `blocked`
- Claude Code НЕ берёт задачи сам — только по твоей команде
