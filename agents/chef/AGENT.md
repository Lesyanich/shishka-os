# Module: Chef Agent (MCP Server)

## Overview
AI Chef Agent — MCP-сервер, подключающий Claude Desktop к Supabase-бэкенду Shishka OS. Позволяет Claude работать с номенклатурой, рецептами (BOM), себестоимостью, нутриентами (КБЖУ), production flow и кухонными операциями.

## Location
`services/mcp-chef/`

## Tech Stack
- Runtime: Node.js (ES2022 modules)
- Language: TypeScript (strict)
- MCP SDK: `@modelcontextprotocol/sdk` v1.12+
- Transport: stdio (Claude Desktop ↔ Node process)
- DB: `@supabase/supabase-js` v2 (service_role key, bypasses RLS)
- Validation: Zod (for MCP tool schemas)

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

## Tools (15)

### Read-only (9)
1. `search_products` — поиск по product_code/name, фильтр по типу
2. `get_bom_tree` — полное дерево с cost + nutrition + margin
3. `calculate_cost` — себестоимость + breakdown по прямым children
4. `calculate_nutrition` — КБЖУ каскад + missing data warnings
5. `suggest_price` — рекомендация цены по маржинальным тирам (60-75%)
6. `validate_bom` — проверка Lego rules, yield, cost, nutrition
7. `audit_all_dishes` — аудит всех SALE позиций с issue summary
8. `list_equipment` — каталог оборудования (76 единиц, enriched schema)
9. `check_inventory` — остатки через v_inventory_by_nomenclature + low_stock alerts

### Write (5)
10. `create_product` — создание с валидацией (дубликаты, supplier, nutrition units)
11. `update_product` — обновление nutrition/allergens/name/price/availability
12. `add_bom_line` — добавление ингредиента (Lego + circular + yield_loss_pct)
13. `remove_bom_line` — удаление по ID или parent+ingredient
14. `manage_recipe_flow` — CRUD для шагов приготовления (list/add/remove/set)

### Knowledge (1)
15. `search_knowledge` — поиск по 193 кулинарным книгам (1478 карточек)

## Resources (3)
- `nomenclature-types` — Lego правила, форматы, единицы, production flow
- `bom-rules` — правила BOM, yield_loss_pct, расчёт cost (с lossFactor) и nutrition (без lossFactor)
- `nutrition-reference` — КБЖУ система (per 1 base_unit!), аллергены, healthy kitchen

## Prompts (4)
- `create-dish` — пошаговый воркфлоу создания блюда
- `audit-menu` — полный аудит с рекомендациями
- `daily-prep` — ежедневный prep list по inventory
- `production-review` — анализ эффективности и оптимизация

## DB Tables Used
- `nomenclature` — каталог продуктов (RAW/PF/MOD/SALE)
- `bom_structures` — связи parent→ingredient (quantity_per_unit, yield_loss_pct)
- `recipes_flow` — шаги приготовления (operation, equipment, duration, instruction)
- `v_inventory_by_nomenclature` — view остатков (из sku_balances)
- `equipment` — кухонное оборудование (76 единиц, enriched post-migration 070)
- `supplier_catalog` — каталог поставщиков

## Critical Rules
- **NEVER write to `cost_per_unit`** — это WAC, рассчитывается триггером `fn_update_cost_on_purchase`
- **Lego chain is IMMUTABLE** — SALE→PF/MOD, PF→RAW/PF, MOD→RAW, RAW→∅
- **Nutrition per 1 base_unit** — НЕ per 100g! Для кг/л: умножить справочные значения на 10
- **recipes_flow ОБЯЗАТЕЛЕН** — после создания PF/SALE с BOM, всегда добавить production steps
- **service_role key required** — обходит RLS для полного доступа к данным

## Key Fixes (2026-03-31)
- Migration 072: Нутриенты RAW ×10 (были per-100g, стали per base_unit)
- bom-walker: lossFactor убран из nutrition (нутриенты не испаряются)
- search_knowledge: defensive checks на массивы (cards, ingredients, tags)
- create_product: валидация per-100g ошибки (calories < 500 при kg → error)
- Новые tools: update_product, manage_recipe_flow

## Configuration
Claude Desktop config path:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Build & Deploy
```bash
cd services/mcp-chef
npm run build    # tsc → dist/
# Перезапустить Claude Desktop для подхвата новой сборки
```
