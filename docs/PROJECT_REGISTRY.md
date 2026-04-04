# Project Registry — Shishka OS
> Единый реестр всех проектов. Куда нести задачу, какой инструмент открыть, какие инструкции.
> Обновлять при создании/удалении проекта.

---

## Быстрый роутер: "У меня задача — куда идти?"

| Тип задачи | Проект | Инструмент |
|-------------|--------|------------|
| Приоритизация, триаж, планирование, координация | **Operating Officer** | Cowork |
| Проектирование агентов, AGENT.md, workflows | **Operating Officer** | Cowork |
| Разработка рецептов, BOM, нутриенты, аудит меню | **Chef R&D** | Cowork |
| Парсинг чеков, финансовый учет, P&L | **Finance Agent** | Cowork |
| Имплементация UI, миграции, баг-фиксы admin panel | **Admin Panel Dev** | Claude Code |
| SOP, отчеты, презентации, Excel-анализ | **Business Docs** | Cowork |
| Сайт доставки (когда начнем) | **Delivery Web** | Claude Code |
| Быстрый вопрос без контекста | **Desktop чат** | Desktop |

---

## 1. Operating Officer (COO Hub)

**ID:** `operating-officer`
**Инструмент:** Cowork
**Статус:** Active
**Папка:** `/Shishka healthy kitchen/` (корень проекта)

### Назначение
Координационный центр всей системы. Стратегия, приоритизация, архитектура процессов, проектирование агентов, триаж inbox, управление эпиками и инициативами.

### Когда открывать
- Утренний триаж: `list_tasks(status="inbox")` → разобрать
- Новая идея → создать задачу через `emit_business_task`
- Планирование спринта / недели
- Проектирование нового агента (AGENT.md)
- Архитектурное решение (БД, интеграции, процессы)
- Ревью прогресса по эпикам
- Обновление STATUS.md, PROJECT_REGISTRY.md

### Ключевые файлы
```
docs/constitution/p0-rules.md          — фундамент (читать каждую сессию)
docs/business/DISPATCH_RULES.md        — маршрутизация задач
docs/business/CEO-OPERATIONS-GUIDE.md  — рабочий процесс CEO
docs/PROJECT_REGISTRY.md               — этот файл
STATUS.md                              — глобальное состояние
agents/_template/AGENT.md              — шаблон агента
docs/constitution/agent-tracking.md    — протокол отчетности
```

### MCP инструменты
`list_tasks`, `get_task`, `update_task`, `emit_business_task` — полный доступ к Mission Control.
`search_products`, `audit_all_dishes` — для обзорного анализа.

### Инструкции проекта
```
Role: COO и координационный центр Shishka OS.

Обязанности:
1. Триаж inbox → backlog/in_progress/отклонить
2. Управление эпиками и инициативами
3. Написание спеков в docs/plans/
4. Проектирование агентов (AGENT.md)
5. Обновление STATUS.md и PROJECT_REGISTRY.md
6. Координация между проектами

Source of Truth:
- p0-rules.md — фундамент
- DISPATCH_RULES.md — маршрутизация
- PROJECT_REGISTRY.md — карта проектов
- STATUS.md — текущее состояние

При старте сессии:
1. Прочитай p0-rules.md
2. Прочитай STATUS.md
3. list_tasks(status="inbox") — что нового?
4. list_tasks(status="in_progress") — что в работе?

Стиль: лаконично, архитектурно. Ты — правая рука CEO (Леси).
НЕ пишешь код. НЕ коммитишь. Проектируешь и координируешь.
```

---

## 2. Chef R&D

**ID:** `chef-rd`
**Инструмент:** Cowork
**Статус:** Active
**Папка:** `/Shishka healthy kitchen/` (корень проекта)

### Назначение
AI-шеф. Работа с номенклатурой, рецептами (BOM), нутриентами, себестоимостью, production flow. R&D новых блюд.

### Когда открывать
- Создание нового блюда/полуфабриката/сырья
- Калькуляция себестоимости
- Аудит меню (маржа, КБЖУ, missing data)
- Поиск кулинарных знаний
- Заполнение BOM и production flow

### Ключевые файлы
```
agents/chef/AGENT.md                        — полные инструкции (260 строк)
agents/chef/domain/chef-preferences.md      — правила от Леси
agents/chef/domain/culinary-knowledge.md    — кулинарная база
agents/chef/domain/nomenclature.md          — Lego chain
agents/chef/domain/bom.md                   — структуры BOM
agents/chef/domain/nutrition.md             — КБЖУ правила
agents/chef/session-log.md                  — Tier 2 лог
```

### MCP инструменты
Все 15 инструментов shishka-chef. Чтение — свободно. Запись — только после подтверждения CEO.

### Инструкции проекта
Полные инструкции: `agents/chef/AGENT.md` (скопировать в Project Instructions).

---

## 3. Finance Agent

**ID:** `finance-agent`
**Инструмент:** Cowork
**Статус:** Active
**Папка:** `/Shishka healthy kitchen/` (корень проекта)

### Назначение
Финансовый агент. Парсинг чеков, расходы, поставщики, капитальные активы, финансовая отчётность. Обнаружение аномалий и маршрутизация задач через Mission Control.

### Когда открывать
- Пришли новые чеки (фото) → "обработай чеки"
- Нужен финансовый анализ (P&L, food cost, expense summary)
- Задачи от других агентов в domain=finance
- Управление поставщиками

### Ключевые файлы
```
agents/finance/AGENT.md                 — полные инструкции (полный рефакторинг 2026-04-04)
agents/finance/guidelines/              — 8 guidelines для парсинга чеков
agents/finance/examples/                — примеры payload (COGS, CapEx)
agents/finance/session-log.md           — Tier 2 лог
docs/modules/finance.md                 — модуль финансов
docs/domain/financial-codes.md          — коды и категории
```

### MCP серверы
1. **shishka-finance** (17 tools): `check_inbox`, `update_inbox`, `read_guideline`, `search_nomenclature`, `search_suppliers`, `check_duplicate`, `approve_receipt`, `expense_summary`, `search_expenses`, `manage_suppliers`, `manage_capex_assets`, `upload_receipt`, `update_expense`, `verify_expense`, `create_inbox`, `search_categories`
2. **shishka-mission-control** (4 tools): `emit_business_task`, `list_tasks`, `get_task`, `update_task`

### Инструкции проекта
Полные инструкции: `agents/finance/AGENT.md` (скопировать в Project Instructions).

---

## 4. Admin Panel Dev

**ID:** `admin-panel-dev`
**Инструмент:** Claude Code (терминал)
**Статус:** Active
**Папка:** `/Shishka healthy kitchen/` (корень проекта, работа в `apps/admin-panel/`)
**Инструкции:** `apps/admin-panel/CLAUDE.md` (Claude Code читает автоматически)

### Назначение
Разработка и поддержка admin panel. React/Next.js UI, Supabase интеграция, миграции, баг-фиксы.

### Когда открывать
- Реализация UI-компонента по спеку
- Баг-фикс в admin panel
- SQL миграция
- Code review
- Тестирование

### Ключевые файлы
```
apps/admin-panel/                           — исходники
docs/constitution/frontend-rules.md         — правила фронтенда
docs/plans/QUEUE.md                         — очередь задач (legacy)
docs/domain/db-schema-summary.md            — схема БД
services/supabase/migrations/               — SQL миграции
STATUS.md                                   — текущая фаза
```

### Инструкции проекта
```
Role: Frontend developer для Shishka admin-panel.

Stack:
- Next.js 14 (App Router)
- Supabase (auth + DB + realtime)
- Tailwind CSS + shadcn/ui
- TypeScript strict mode

Рабочая директория: apps/admin-panel/

При старте сессии:
1. git status — проверить ветку и состояние
2. Прочитать STATUS.md → текущая фаза
3. list_tasks(status="in_progress", domain="tech") → что в работе
4. Если есть задача со spec_file → прочитать спек

Конвенции:
- Компоненты: app/(dashboard)/[module]/page.tsx
- Серверные actions: lib/actions/[module].ts
- Типы: types/[module].ts
- Хуки: hooks/use-[name].ts
- Компоненты UI: components/[module]/[Component].tsx

Перед коммитом (Commit Gate):
1. STATUS.md обновлен (если cross-project)
2. Миграция в services/supabase/migrations/ (если схема менялась)
3. vault/Architecture/ обновлена (если менялась архитектура модуля)

Git:
- Ветка: feature/admin/[описание]
- НЕ пушить в main напрямую
- Коммит-месседжи: английский, формат conventional commits

Правила:
- SSoT = Supabase. UI — зеркало.
- UUID everywhere.
- No Direct DB Edits — только миграции.
- Lego chain неизменна: SALE→PF/MOD, PF→RAW/PF.
- TypeScript strict, no any.
- Не создавать новые npm зависимости без обсуждения.
```

---

## 5. Business Docs & Analysis

**ID:** `business-docs`
**Инструмент:** Cowork
**Статус:** To Create
**Папка:** `/Shishka healthy kitchen/` (корень проекта)

### Назначение
Создание бизнес-документов: SOP, отчеты, презентации, Excel-анализ, PDF-меню.

### Когда открывать
- Нужен docx (SOP, отчет, письмо)
- Нужен xlsx (финансовый анализ, сравнение поставщиков, калькулятор)
- Нужен pptx (презентация для партнера, инвестора)
- Нужен pdf (меню, чек-лист, форма для печати)

### Ключевые файлы
```
docs/business/                  — бизнес-документация
docs/business/domains/          — контексты по доменам
docs/business/initiatives/      — инициативы
```

### Cowork Skills
| Скилл | Для чего |
|-------|---------|
| `docx` | SOP, контракты, отчеты, письма |
| `xlsx` | Food cost, P&L, сравнение поставщиков, бюджет |
| `pptx` | Презентации, pitch-декки |
| `pdf` | Меню для печати, формы, чек-листы |

### Инструкции проекта
```
Role: Business analyst и документ-мейкер для Shishka Healthy Kitchen.

Бренд:
- Название: Shishka Healthy Kitchen
- Локация: Пхукет, Раваи, Таиланд
- Фокус: здоровая кухня, Middle Eastern + fusion
- Цвета: зеленый (#4CAF50), белый, темно-серый (#333)

Правила создания документов:
1. ВСЕГДА читай соответствующий SKILL.md перед созданием файла
2. Язык: русский для внутренних, английский для внешних
3. Сохраняй финальные файлы в доступную пользователю папку
4. Используй данные из MCP (search_products, audit_all_dishes,
   calculate_cost) для актуальных цифр

Доступные скиллы: docx, xlsx, pptx, pdf
Доступные MCP: все инструменты shishka-chef (для данных)
```

---

## 6. Delivery Website (будущий)

**ID:** `delivery-web`
**Инструмент:** Claude Code (терминал)
**Статус:** Planned
**Папка:** `/Shishka healthy kitchen/apps/web/`

### Назначение
Клиентский сайт для заказа доставки.

### Когда открывать
После утверждения дизайна и спеков (проект пока не начат).

### Предпосылки
- Утвержден дизайн-макет
- Написан спек в docs/plans/
- Admin panel стабилен
- BOM и меню заполнены через Chef R&D

---

## Как поддерживать реестр

1. **Создала новый проект** → добавь секцию сюда + обнови таблицу роутера
2. **Изменила инструкции** → обнови секцию "Инструкции проекта"
3. **Закрыла проект** → перенеси в секцию Archive (внизу)
4. **Не знаешь куда** → открой Operating Officer, он подскажет

---

## Archive
(пусто)
