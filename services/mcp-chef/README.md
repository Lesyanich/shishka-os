# Shishka Chef Agent — MCP Server

MCP-сервер для подключения Claude Desktop / Cowork к Supabase-бэкенду Shishka OS.
Предоставляет инструменты для управления меню, рецептами (BOM), нутриентами (КБЖУ), себестоимостью и кухонными операциями.

> **Agent instructions (Brains):** `agents/chef/AGENT.md`
> Этот файл — техническая документация Рук (MCP-сервера).

## Быстрый старт

### 1. Установка и сборка

```bash
cd services/mcp-chef
npm install
npm run build    # tsc → dist/
```

### 2. Переменные окружения

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
```

### 3. Настройка Claude Desktop

Config path:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "shishka-chef": {
      "command": "node",
      "args": ["/ПОЛНЫЙ/ПУТЬ/К/services/mcp-chef/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJ...your-service-role-key"
      }
    }
  }
}
```

Перезапустите Claude Desktop после сохранения.

## Tech Stack

- Runtime: Node.js (ES2022 modules)
- Language: TypeScript (strict)
- MCP SDK: `@modelcontextprotocol/sdk` v1.12+
- Transport: stdio (Claude Desktop ↔ Node process)
- DB: `@supabase/supabase-js` v2 (service_role key, bypasses RLS)
- Validation: Zod (for MCP tool schemas)

## Architecture

```
src/
├── index.ts            # Точка входа MCP-сервера
├── lib/
│   ├── supabase.ts     # Singleton Supabase-клиент
│   ├── bom-walker.ts   # Рекурсивный обход BOM-дерева
│   └── validators.ts   # Валидация (Lego, циклы, КБЖУ)
├── tools/              # 19 MCP-инструментов
├── resources/          # Статические справочники
└── prompts/            # Шаблоны воркфлоу
```

## Core Libraries

### bom-walker.ts
Рекурсивный обход BOM-дерева:
- `getBomTree(productId)` — строит дерево из `bom_structures` + `nomenclature`
- `calculateTreeCost(tree)` — себестоимость от листьев вверх (WAC × lossFactor)
- `calculateTreeNutrition(tree)` — каскад КБЖУ БЕЗ lossFactor (нутриенты не теряются с водой)
- `formatBomTree(node)` — текстовое представление дерева
- Защита от циклов через `visited` Set

### validators.ts
- `validateProductCode(code)` — формат PREFIX-NAME
- `validateBaseUnit(unit)` — kg/g/L/ml/pcs
- `validateLegoChain(parent, child)` — SALE→PF/MOD, PF→RAW/PF, MOD→RAW
- `checkCircularRef(parentId, ingredientId)` — BFS вверх по дереву
- `validateNutrition(values, baseUnit)` — неотрицательность + защита от per-100g ошибки
- `checkCodeUnique(code)` — уникальность в БД
- `findSimilarProducts(name, code)` — fuzzy поиск дубликатов
- `checkSupplierAvailability(name, id?)` — проверка в supplier_catalog

## Tools (19)

### Read-only (9)
| # | Tool | Описание |
|---|------|----------|
| 1 | `search_products` | Поиск по product_code/name, фильтр по типу |
| 2 | `get_bom_tree` | Полное дерево с cost + nutrition + margin |
| 3 | `calculate_cost` | Себестоимость + breakdown по прямым children |
| 4 | `calculate_nutrition` | КБЖУ каскад + missing data warnings |
| 5 | `suggest_price` | Рекомендация цены по маржинальным тирам (60-75%) |
| 6 | `validate_bom` | Проверка Lego rules, yield, cost, nutrition |
| 7 | `audit_all_dishes` | Аудит всех SALE позиций с issue summary |
| 8 | `list_equipment` | Каталог оборудования (76 единиц, enriched schema) |
| 9 | `check_inventory` | Остатки через v_inventory_by_nomenclature + low_stock alerts |

### Write (6)
| # | Tool | Описание |
|---|------|----------|
| 10 | `create_product` | Создание с валидацией (дубликаты, supplier, nutrition units) |
| 11 | `update_product` | Обновление nutrition/allergens/name/price/availability |
| 12 | `add_bom_line` | Добавление ингредиента (Lego + circular + yield_loss_pct) |
| 13 | `remove_bom_line` | Удаление по ID или parent+ingredient |
| 14 | `manage_recipe_flow` | CRUD для шагов приготовления (list/add/remove/set) |
| 15 | `emit_business_task` | Создание бизнес-задачи в Mission Control (business_tasks) |

### Task Management (3)
| # | Tool | Описание |
|---|------|----------|
| 16 | `list_tasks` | Список задач MC с фильтрами (domain, status, priority, created_by) |
| 17 | `get_task` | Полная информация о задаче по UUID (+ initiative, parent_task) |
| 18 | `update_task` | Обновление статуса, приоритета, описания, notes, due_date, tags |

### Knowledge (1)
| # | Tool | Описание |
|---|------|----------|
| 19 | `search_knowledge` | Поиск по 193 кулинарным книгам (1478 карточек) |

## Resources (3)

- `nomenclature-types` — Lego правила, форматы, единицы, production flow
- `bom-rules` — Правила BOM, yield_loss_pct, расчёт cost (с lossFactor) и nutrition (без lossFactor)
- `nutrition-reference` — КБЖУ система (per 1 base_unit!), аллергены, healthy kitchen

## Prompts (4)

- `create-dish` — Пошаговый воркфлоу создания блюда
- `audit-menu` — Полный аудит с рекомендациями
- `daily-prep` — Ежедневный prep list по inventory
- `production-review` — Анализ эффективности и оптимизация

## DB Tables Used

| Table | Описание |
|-------|----------|
| `nomenclature` | Каталог продуктов (RAW/PF/MOD/SALE) |
| `bom_structures` | Связи parent→ingredient (quantity_per_unit, yield_loss_pct) |
| `recipes_flow` | Шаги приготовления (operation, equipment, duration, instruction) |
| `v_inventory_by_nomenclature` | View остатков (из sku_balances) |
| `equipment` | Кухонное оборудование (76 единиц, enriched post-migration 070) |
| `supplier_catalog` | Каталог поставщиков |
| `business_tasks` | Бизнес-задачи Mission Control (Kanban) |
| `business_initiatives` | Кросс-доменные бизнес-инициативы |

## Critical Rules

- **NEVER write to `cost_per_unit`** — WAC, рассчитывается триггером `fn_update_cost_on_purchase`
- **Lego chain is IMMUTABLE** — SALE→PF/MOD, PF→RAW/PF, MOD→RAW, RAW→∅
- **Nutrition per 1 base_unit** — НЕ per 100g! Для кг/л: умножить справочные значения на 10
- **service_role key required** — обходит RLS для полного доступа к данным

## Key Fixes (2026-03-31)

- Migration 072: Нутриенты RAW ×10 (были per-100g, стали per base_unit)
- bom-walker: lossFactor убран из nutrition (нутриенты не испаряются)
- search_knowledge: defensive checks на массивы (cards, ingredients, tags)
- create_product: валидация per-100g ошибки (calories < 500 при kg → error)
- Новые tools: update_product, manage_recipe_flow
