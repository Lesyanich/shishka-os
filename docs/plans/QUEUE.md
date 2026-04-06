# Task Queue — Shishka OS

> Очередь задач для Claude Code. Читай при старте сессии.
> Бери верхнюю задачу со статусом `ready`. После выполнения — поставь `done` и дату.
>
> **Формат:** `[status] [priority] title — spec_path (MC task id)`
> **Статусы:** `ready` → `in_progress` → `done` | `blocked`
>
> **SSoT для задач — Mission Control** (`list_tasks` MCP).
> Этот файл — execution queue для Code-сессий.
>
> **Приоритизация от 2026-04-05.** Критерий: "приближает ли к открытию?"

---

## Tier 1: CRITICAL — Блокирует открытие

- [ ] `in_progress` **CRITICAL** Chef Agent: BOM data entry — `agents/chef/AGENT.md` (`fa01b2d4`)
  - Агент заполняет BOM для меню. Без BOM нет food cost, нет production flow.
  - Зависимость: все kitchen/procurement задачи.

- [x] `done` 2026-04-05 **CRITICAL** Receipt Inbox Management UI — `docs/plans/spec-receipt-inbox-ui.md` (`68af7dc1`)
  - Реализовано на feature/admin/receipt-review-recovery. Follow-up: валидация + confirm dialog.

- [ ] `in_progress` **CRITICAL** UX Audit: Kitchen Pages — `docs/projects/app/plans/spec-kitchen-ux-v2.md` (`26a8ec5b`)
  - Phase A (Foundation) done: Dashboard, MyTasks, CookLogin, KitchenLive, Schedule fix, migration 096.
  - Next: apply migration, test, then Phase B (Planner + Assignment).

---

## Tier 2: HIGH — Нужно до/сразу после открытия

- [ ] `ready` **HIGH** Kitchen Production System initiative — (`9563ea4e`)
  - 5-task chain: BOM→Planner→KitchenOS→Batch→Feedback. Основа операционки.
  - Частично зависит от BOM (Tier 1 #1).

- [ ] `ready` **HIGH** HR & Payroll System — (`4c029fc0`)
  - Расчёт зарплат, расписание персонала. Нужно для найма перед открытием.

---

## Tier 3: MEDIUM — Важно, но не блокирует открытие

- [ ] `ready` **MEDIUM** Миграция: executor_type + role visibility — `docs/plans/spec-executor-type.md` (`573f8a24`)
  - Новое поле executor_type (human/code/agent), UI фильтры по ролям, "Мои задачи"
  - Нужно для командной работы (Bas, шеф видят свои задачи)

- [ ] `ready` **MEDIUM** MC UI: Filter/Sort/Search — (`7b52314e`)
  - Фильтрация задач в Mission Control. Удобство, не блокер.

- [ ] `blocked` **MEDIUM** POS Barcode Integration — (`a4c76318`)
  - Зависит от физического сканера. Заблокировано hardware.

- [ ] `blocked` **MEDIUM** Barcode Label Printer — (`04a67a19`)
  - Зависит от принтера. Заблокировано hardware.

---

## Tier 4: LOW — После открытия / когда появится ресурс

Knowledge Hub (5 фаз):
- `b2c93d14` Knowledge Hub Phase 1: DB + Seed
- `26e6e4a5` Knowledge Hub Phase 2: Read-only Wiki
- `d0cf48c3` Knowledge Hub Phase 3: Editor
- `75ebcbf3` Knowledge Hub Phase 4: Field Notes + Search
- `5997ec22` Knowledge Hub Phase 5: MCP + Agent Integration

Mission Control & Process:
- `11fd307b` field_notes table (Supabase)
- `7e8fa72e` MC Agile: Sprints & Velocity
- `f7cb3f59` Plugin: shishka-claude-code
- `9cb7b267` GDrive Archive → Supabase

Operations & Analytics:
- `5ccf0780` Equipment Depreciation Tracking
- `85ced549` Supplier Analytics Dashboard
- `7ddc5c89` Sales Forecast Module
- `3c3eceb6` Security Hardening & RLS Audit

Tech & Infrastructure:
- `d4bd8ab1` MC UI: Sprint Board
- (другие задачи по мере появления)

---

## Done (Archive)

- [x] `done` 2026-04-04 — Add list_tasks + get_task + update_task MCP tools — `docs/plans/mcp-core-task-tools-spec.md` (`a3192b59`)
- [x] `done` 2026-04-03 — emit_business_task MCP tool — `docs/plans/emit-business-task-spec.md` (`e4446bf9`)
- [x] `done` 2026-04-03 — Mission Control UI — already exists (`e98257c4`)

---

## Protocol

### Для Claude Code (терминал):
1. При старте: `cat docs/plans/QUEUE.md` → найти верхнюю `ready` задачу в Tier 1
2. Прочитать спеку по указанному пути
3. Поменять статус на `in_progress` в этом файле
4. Выполнить работу по спеке
5. Поменять статус на `done` + добавить дату
6. Обновить статус задачи в MC через `update_task`
7. **Не прыгать через Tier** — сначала все CRITICAL, потом HIGH.

### Для COO (Cowork):
1. Создать спеку в `docs/plans/` (shared) или `docs/projects/{project}/plans/` (project-specific)
2. Создать задачу в Mission Control через `emit_business_task`
3. Добавить строку в QUEUE.md со ссылкой на спеку и MC task id
4. Пересматривать приоритеты еженедельно
5. Критерий приоритизации: **приближает ли к открытию?**

### Для Леси:
- Просмотреть QUEUE.md → утвердить приоритеты
- Можно переставить порядок или добавить `blocked`
- Claude Code НЕ берёт задачи сам — только по твоей команде
