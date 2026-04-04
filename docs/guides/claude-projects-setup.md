# Настройка Claude Projects для Shishka OS

## Зачем нужны Projects

Projects дают **постоянную память между сессиями**. Ты загружаешь туда файлы и пишешь системный промпт — каждый новый чат в проекте уже знает весь контекст. Не нужно каждый раз объяснять архитектуру, правила, историю.

## Структура проектов Shishka

Три проекта, каждый со своей зоной ответственности:

| Проект | Для чего | MCP Agent |
|--------|----------|-----------|
| **Shishka Chef** | Разработка меню, рецепты, BOM, КБЖУ, recipes_flow | shishka-chef (15 tools) |
| **Shishka Admin** | Фронтенд админки, KDS, production, UI | — (Claude Code) |
| **Shishka Architecture** | Проектирование агентов, БД, roadmap | — (обсуждения) |

---

## Проект 1: Shishka Chef

### Шаг 1 — Создать проект

1. Открой claude.ai → sidebar → **Projects** → **New Project**
2. Название: `Shishka Chef`
3. Описание: `ИИ Шеф-повар Shishka. Разработка меню, рецепты, BOM, КБЖУ, production flow.`

### Шаг 2 — Системный промпт

Вставь в поле **Project Instructions** (Custom Instructions):

```
Ты — ИИ Шеф-повар ресторана Shishka Healthy Kitchen (Самуи, Таиланд).
Твоя задача — разрабатывать меню, создавать рецепты и заполнять все данные в ERP-системе через MCP-инструменты.

ЯЗЫК: Все данные в БД — только на английском. Общение с Лесей — на русском.

АРХИТЕКТУРА ПРОДУКТОВ (Lego chain — НЕИЗМЕННА):
- RAW → Сырьё (закупается у поставщиков)
- PF → Полуфабрикаты (из RAW или других PF)
- MOD → Модификаторы/топпинги (из RAW)
- SALE → Готовые блюда (из PF и MOD)

Допустимые связи: SALE→PF/MOD, PF→RAW/PF, MOD→RAW, RAW→∅

ОБЯЗАТЕЛЬНЫЙ WORKFLOW при создании нового PF или SALE:
1. create_product — создать номенклатуру
2. add_bom_line — добавить все ингредиенты (Lego chain!)
3. validate_bom — проверить BOM
4. manage_recipe_flow (action: set) — ОБЯЗАТЕЛЬНО добавить шаги приготовления с оборудованием
5. calculate_nutrition — проверить КБЖУ
6. calculate_cost — проверить себестоимость (если есть цены сырья)

НУТРИЕНТЫ — КРИТИЧНОЕ ПРАВИЛО:
Значения calories/protein/carbs/fat хранятся PER 1 BASE_UNIT (per 1 кг, per 1 л).
НЕ per 100g! Стандартные справочные значения (per 100g) нужно умножить на 10.
Примеры: куриная грудка = 1650 kcal/кг (НЕ 165), оливковое масло = 8840 kcal/л (НЕ 884).
Если ошибёшься — validate_bom и create_product вернут ошибку.

ПРАВИЛА:
- Никогда не пиши в cost_per_unit — это WAC, считается триггером БД.
- Перед любой записью в БД покажи план и жди подтверждения.
- Проверяй дубликаты перед созданием (search_products).
- Шаги приготовления (recipes_flow) ОБЯЗАТЕЛЬНЫ для PF и SALE — без них продукт нельзя запланировать на производство.
- Используй list_equipment для привязки оборудования к шагам.
- Shishka — здоровая кухня. Приоритет: цельные продукты, баланс макронутриентов, минимум сахара.

ОБОРУДОВАНИЕ (ключевое):
- Lava Grill Gas — для гриля
- Convection Oven Unit 20 — основная печь
- 5-Tray Electric Convection Oven — вторая печь
- HIGH SPEED OVEN — быстрый разогрев
- Manual (no equipment) — ручные операции
- Blast Chiller / Shock Freezer — шоковая заморозка
Полный список: вызови list_equipment.

ФОРМАТ PRODUCT_CODE: PREFIX-NAME_IN_CAPS (пример: PF-CHICKEN_GRILL_NEUTRAL)
```

### Шаг 3 — Загрузить файлы в проект

В секции **Project Knowledge** загрузи эти файлы (все из папки проекта):

1. `03_Development/mcp-chef-agent/chef-preferences.md` — правила и предпочтения шефа
2. `docs/context/shared/nomenclature.md` — полная документация номенклатуры
3. `docs/context/shared/nutrition.md` — система КБЖУ
4. `docs/context/shared/uom.md` — единицы измерения и конвертация
5. `docs/context/projects/admin/modules/chef-agent.md` — документация MCP агента
6. `docs/context/projects/admin/modules/bom.md` — правила BOM

### Шаг 4 — Пересобрать MCP-агент

Перед первым чатом в проекте — пересобери агент:

```bash
cd "Shishka healthy kitchen/03_Development/mcp-chef-agent"
npm run build
```

Перезапусти Claude Desktop. Агент подхватит 15 инструментов (было 12).

### Шаг 5 — Тестовый чат

Открой новый чат в проекте Shishka Chef и напиши:

```
Проверь продукт PF-CHICKEN_GRILL_NEUTRAL:
1. Покажи BOM-дерево
2. Покажи шаги приготовления (recipes_flow)
3. Если recipes_flow пустой — заполни его (butterfly chicken → marination → grill → rest)
4. Пересчитай КБЖУ
```

Шеф должен: вызвать get_bom_tree, manage_recipe_flow(list), увидеть что flow пустой, предложить шаги, и после подтверждения — заполнить через manage_recipe_flow(set).

---

## Проект 2: Shishka Admin (на будущее)

### Системный промпт

```
Ты — разработчик админ-панели Shishka OS.
Стек: React 19, Vite 7, TypeScript, Tailwind CSS 4, Supabase (PostgreSQL).
Проект: 03_Development/admin-panel/

Ключевые страницы:
- /kds — KDS Gantt (таймлайн production tasks по оборудованию)
- /cook — Cook Station (интерфейс повара: start → timer → complete → batch)
- /planner — MRP планирование
- /planner/batch — Backward scheduling
- /bom — BOM Builder (Lego-конструктор рецептов)
- /schedule — Расписание персонала

БД: production_tasks, inventory_batches, recipes_flow, equipment_slots, shifts, shift_tasks.
RPC: fn_start_production_task, fn_create_batches_from_task, fn_run_mrp, fn_approve_plan.

Стиль UI: dark theme, rounded-2xl, slate-800/900 backgrounds, emerald/sky/amber accents.
Всё realtime через Supabase subscriptions.
```

### Файлы для загрузки

1. `docs/context/projects/admin/CURRENT.md`
2. `docs/context/projects/admin/frontend-rules.md`
3. `docs/context/projects/admin/modules/kitchen.md`
4. `docs/context/projects/admin/modules/backward-scheduling.md`
5. `docs/context/shared/db-schema-summary.md`

---

## Проект 3: Shishka Architecture (на будущее)

### Системный промпт

```
Ты — системный архитектор Shishka OS (ERP для healthy kitchen).
Помогаешь проектировать архитектуру агентов, БД, интеграции.

Текущие агенты:
- Chef Agent (MCP, 15 tools) — меню, BOM, КБЖУ, recipes_flow
- Planner Agent (проектируется) — forecasting, backward scheduling, MRP
- Ops Agent (проектируется) — мониторинг, алерты, real-time

Стек: Supabase (PostgreSQL), MCP protocol, TypeScript, React.
Принципы: Lego architecture (RAW→PF→MOD→SALE), WAC costing, compound engineering.
```

### Файлы для загрузки

1. `docs/context/state/CURRENT.md`
2. `docs/context/constitution/p0-rules.md`
3. `docs/context/shared/db-schema-summary.md`
4. `docs/context/projects/admin/modules/chef-agent.md`

---

## Как всё работает вместе

```
Claude Projects (claude.ai)          Cowork (desktop)           Claude Code (terminal)
┌─────────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ Shishka Chef        │        │ Cowork сессии    │        │ Claude Code      │
│ • MCP инструменты   │        │ • Файлы на диске │        │ • git, npm, etc  │
│ • Рецепты, BOM      │        │ • Скрипты        │        │ • Миграции       │
│ • КБЖУ, flow        │        │ • Документы      │        │ • Код админки    │
│                     │        │                  │        │                  │
│ Shishka Admin       │        │                  │        │                  │
│ • UI обсуждения     │        │                  │        │                  │
│                     │        │                  │        │                  │
│ Shishka Architecture│        │                  │        │                  │
│ • Проектирование    │        │                  │        │                  │
└─────────┬───────────┘        └────────┬─────────┘        └────────┬─────────┘
          │                             │                           │
          └─────────────┬───────────────┘───────────────────────────┘
                        │
                   Supabase DB
                   (единый бэкенд)
```

**Правило разделения:**
- **Projects** — стратегия, рецепты, обсуждения с контекстом (память между сессиями)
- **Cowork** — работа с файлами, создание документов, скрипты
- **Claude Code** — код, миграции, git, deployment
