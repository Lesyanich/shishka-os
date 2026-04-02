# Shishka Chef Agent — MCP Server

MCP-сервер для подключения Claude Desktop к Supabase-бэкенду Shishka OS.
Предоставляет инструменты для управления меню, рецептами (BOM), нутриентами (КБЖУ), себестоимостью и кухонными операциями.

## Быстрый старт

### 1. Установка зависимостей

```bash
cd 03_Development/mcp-chef-agent
npm install
```

### 2. Сборка

```bash
npm run build
```

### 3. Настройка переменных окружения

Создайте файл `.env` в корне проекта (он в `.gitignore`):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
```

### 4. Настройка Claude Desktop

Откройте файл конфигурации Claude Desktop:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Добавьте конфигурацию сервера:

```json
{
  "mcpServers": {
    "shishka-chef": {
      "command": "node",
      "args": ["/ПОЛНЫЙ/ПУТЬ/К/03_Development/mcp-chef-agent/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJ...your-service-role-key"
      }
    }
  }
}
```

### 5. Перезапустите Claude Desktop

После сохранения конфига перезапустите Claude Desktop. В новом чате появится иконка MCP-инструментов.

## Инструменты (12)

### Read-only (Phase 1)
| Tool | Описание |
|------|----------|
| `search_products` | Поиск по каталогу номенклатуры |
| `get_bom_tree` | Полное дерево рецепта с себестоимостью и КБЖУ |
| `calculate_cost` | Расчёт себестоимости с разбивкой по ингредиентам |
| `calculate_nutrition` | Каскадный расчёт КБЖУ и аллергенов |
| `suggest_price` | Рекомендация цены по целевой марже |
| `validate_bom` | Проверка BOM на ошибки и полноту |
| `audit_all_dishes` | Аудит всех SALE-позиций меню |
| `list_equipment` | Список кухонного оборудования |
| `check_inventory` | Проверка остатков и дефицитов |

### Write (Phase 2)
| Tool | Описание |
|------|----------|
| `create_product` | Создание новой позиции номенклатуры |
| `add_bom_line` | Добавление ингредиента в рецепт |
| `remove_bom_line` | Удаление ингредиента из рецепта |

## Ресурсы (3)

- `nomenclature-types` — Lego-архитектура (RAW→PF→MOD→SALE)
- `bom-rules` — Правила структуры BOM
- `nutrition-reference` — Справка по КБЖУ

## Промпты (4)

- `create-dish` — Пошаговое создание нового блюда
- `audit-menu` — Полный аудит всего меню
- `daily-prep` — Список задач на ежедневную подготовку
- `production-review` — Обзор эффективности производства

## Архитектура

```
src/
├── index.ts            # Точка входа MCP-сервера
├── lib/
│   ├── supabase.ts     # Singleton Supabase-клиент
│   ├── bom-walker.ts   # Рекурсивный обход BOM-дерева
│   └── validators.ts   # Валидация (Lego, циклы, КБЖУ)
├── tools/              # 12 MCP-инструментов
├── resources/          # Статические справочники
└── prompts/            # Шаблоны воркфлоу
```
