# 🔖 STATE.md — Agent Save-Game File
**Последнее обновление:** 2026-03-07T12:59 (ICT)  
**Проект Supabase:** `qcqgtcsjoacuktcewpvo` (ap-south-1, ACTIVE_HEALTHY)  
**Передача от:** Antigravity (Lead Backend Developer)  
**Принять:** Любой агент (Claude, Gemini, GPT)

---

## ✅ ЧТО РАЗВЁРНУТО (SINGLE SOURCE OF TRUTH)

### Таблицы в Supabase (public schema)

| Таблица | PK | Строк | Статус | Примечания |
|---|---|---|---|---|
| `nomenclature` | `id` UUID | 39 | ✅ P0 LIVE | Unified source of truth (Products + Sync). Migration 005. |
| `bom_structures` | `id` UUID | 35 | ✅ NEW | Dynamic/Proportional BOM ratios. Migration 007 & 012. |
| `equipment` | `id` UUID | 76 | ✅ Compliant | Refactored to UUID. 69 units synced from Capex.csv |
| `recipes_flow` | `id` UUID | 24 | ✅ Compliant | Transformed to UUID in Migration 006. |
| `daily_plan` | `id` UUID | 8 | ✅ Compliant | Transformed to UUID in Migration 006. |
| `production_tasks` | `id` UUID | 69 | ✅ Compliant | `description` added in Migration 010. |
| `fin_categories` | `code` INT | 18 | ✅ NEW | Standardized financial codes (1000, 2000, etc) |
| `fin_sub_categories`| `sub_code` INT| 28 | ✅ NEW | Sub-categories for fine-grained tracking |
| `capex_assets` | `id` UUID | 72 | ✅ NEW | Linked to `equipment` via UUID FK |
| `capex_transactions`| `id` UUID | 62 | ✅ NEW | Purchase and repair transactions mapped |

### Функции (Supabase public schema)

| Функция | Тип | Статус |
|---|---|---|
| `fn_start_kitchen_task(UUID)` | RPC / JSONB | ✅ LIVE — smoke test passed |
| `sync_equipment_last_service()` | TRIGGER FUNCTION | ✅ LIVE |
| `update_updated_at()` | TRIGGER FUNCTION | ✅ Pre-existing |
| `v_equipment_hourly_cost` | VIEW | ✅ LIVE — ROI calculations verified |

### RLS Политики

| Таблица | Политики |
|---|---|
| `production_tasks` | SELECT (by tg_user_id) + UPDATE (own/unclaimed) |
| `equipment`, `products`, `recipes_flow`, `daily_plan` | SELECT (by tg_user_id) |
| `warnings` | Admin CRUD + anon SELECT |
| `maintenance_logs` | SELECT (by tg_user_id) + Admin CRUD ✅ NEW |
| `nomenclature_sync` | SELECT (by tg_user_id) + Admin CRUD ✅ NEW |

### Файлы миграций (03_Development/database/)

| Файл | Описание |
|---|---|
| `001_initial_schema.sql` | Extends existing tables + creates maintenance_logs, nomenclature_sync |
| `002_kitchen_controller_rpc.sql` | fn_start_kitchen_task() RPC |
| `003_capex_analytics.sql` | CapEx tables, Financial categories, and v_equipment_hourly_cost view |
| `003_capex_inserts.sql` | Data seeding (76 equipment, 72 assets, 62 transactions) |

---

## 🟢 СОСТОЯНИЕ АРХИТЕКТУРЫ (P0 ВЫПОЛНЕНО)

1. **Единая Номенклатура**: Все продукты и ТТК объединены в `nomenclature`.
2. **UUID Compliance**: Все системные таблицы (`daily_plan`, `recipes_flow`, `equipment`) переведены на UUID.
3. **Dynamic BOM**: Веса ингредиентов рассчитываются на лету через `bom_structures`.
4. **Automated Tasks**: RPC `fn_generate_production_order` генерирует задания с реальными весами.

---

**Migration 004: SYRVE Nomenclature & UUID Compliance**
```sql
-- 03_Development/database/004_syrve_uuid_fix.sql
ALTER TABLE products ADD COLUMN id UUID DEFAULT gen_random_uuid();
-- Sync legacy product codes with UUID nomenclature layer
```

**После того — Migration 004: UUID Compliance Fix**
```sql
-- 03_Development/database/004_uuid_compliance.sql
ALTER TABLE products ADD COLUMN id UUID DEFAULT gen_random_uuid();
ALTER TABLE equipment ADD COLUMN uuid UUID DEFAULT gen_random_uuid();
```

---

## 🔑 Ключи и Конфигурация

- **Auth модель:** `app.tg_user_id` (TEXT) + `app.is_admin` (TEXT 'true'/'false') через `set_request_context()`
- **Supabase Project URL:** `https://qcqgtcsjoacuktcewpvo.supabase.co`
- **Region:** ap-south-1 (Mumbai)
- **PostgreSQL:** 17.6

---

## 📁 Ключевые Файлы Проекта

| Файл | Назначение |
|---|---|
| `gemini.md` (root) | Глобальный устав P0 |
| `02_Obsidian_Vault/Blueprints/Database_Architecture_v1.md` | Мастер-архитектурный план |
| `02_Obsidian_Vault/Logs/2026-03-07_db_audit.md` | Аудит существующей БД |
| `docs/PLAN-cloud-infra-schema.md` | Поэтапный план миграций |
| `POSsystem/Syrve/syrve_api_report_all.md` | Полный анализ типов SYRVE API |

---

## 🔍 2026-03-08 — SSoT Audit: SALE-PUMPKIN_SOUP

- **nomenclature:** запись `SALE-PUMPKIN_SOUP` существует (`id = b0f61d43-ea19-487d-a45e-7bf4b589c31a`).
- **bom_structures:** для `SALE-PUMPKIN_SOUP` уже есть связи:
  - `PF-PUMPKIN_COCONUT_BASE` (quantity_per_unit = 0.3)
  - `MOD-COCONUT_YOGURT` (topping)
  - `MOD-ANCIENT_CRUNCH` (topping)
  - `MOD-GREENS` (topping)
- **Вывод:** Sup в БД не сирота; дополнительная миграция `013_*` для создания SALE-узла или линковки к базе не требуется.

## 🧪 Как проверить, что всё работает

```sql
-- Smoke test: Kitchen Controller
SELECT fn_start_kitchen_task(id) FROM production_tasks WHERE status='pending' LIMIT 1;
-- Expected: {"success": true, "message": "Task started successfully."}

-- Check nomenclature_sync
SELECT COUNT(*) FROM nomenclature_sync; -- Expected: 31

-- Check new columns
SELECT id, syrve_uuid, unit_id, last_service_date FROM equipment LIMIT 3;
```

---

## 🧩 2026-03-08 — Vibe-App / SSoT Control Center (Frontend)

- **Путь:** `03_Development/admin-panel/` — новый Vite + React + TypeScript проект.
- **UI-стек:** TailwindCSS v4, lucide-react (иконки), @supabase/supabase-js для прямого доступа к P0-данным.
- **Supabase client:** `src/lib/supabase.ts` — использует `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (добавить в `.env` локально).
- **Базовый экран:** `RecipeBuilder` (`src/components/RecipeBuilder.tsx`) — Lego‑интерфейс:
  - Левая колонка: список блюд из `nomenclature` (`type = 'dish'`) с жёсткими UUID в state.
  - Правая колонка: BOM из `bom_structures` для выбранного `parent_id` (UUID), редактируемые `quantity_per_unit`.
  - Кнопка **Add Ingredient**: дропдаун по `PF-`, `MOD-`, `RAW-` узлам из `nomenclature` (в state и value селектов всегда UUID).
- **Назначение:** визуальный SSoT Control Center для ручной сборки и аудита Lego‑архитектуры (без записи в БД; пока только чтение + локальный state).

## 🚀 2026-03-08 — Phase 5: Control Center & BOM Hub (Frontend) — ✅ LIVE

**Агент:** Claude Sonnet 4.6 (Lead Frontend Architect)
**Статус:** Phase 1 Core Dashboard & BOM Hub — LIVE

### Новые зависимости

| Пакет | Версия | Назначение |
|---|---|---|
| `react-router-dom` | latest | Deep Linking, BrowserRouter (`/`, `/bom`, `/kds`…) |
| `recharts` | latest | BarChart для CapEx-аналитики |

### Routing (react-router-dom)

| Роут | Компонент | Статус |
|---|---|---|
| `/` | `ControlCenter.tsx` | ✅ LIVE |
| `/bom` | `BOMHub.tsx` | ✅ LIVE |
| `/kds` | — | 🔜 Phase 2 (sidebar disabled) |
| `/waste` | — | 🔜 Phase 3 |
| `/finance` | — | 🔜 Phase 4 |
| `/analytics` | — | 🔜 Phase 5 |
| `/*` | `<Navigate to="/" />` | ✅ Fallback |

### Структура файлов (Phase 5)

| Файл | Тип | Назначение |
|---|---|---|
| `src/App.tsx` | Модифицирован | BrowserRouter + Routes (заменил монолитный layout) |
| `src/layouts/AppShell.tsx` | NEW | Sidebar (6 pillars) + TopBar + main content |
| `src/pages/ControlCenter.tsx` | NEW | CEO Dashboard — оркестрирует 5 виджетов |
| `src/pages/BOMHub.tsx` | NEW | Обёртка для RecipeBuilder с заголовком |
| `src/components/control-center/HeroKPIRow.tsx` | NEW | 4 KPI карточки (tasks/capex/equipment/BOM%) |
| `src/components/control-center/KitchenStatusKanban.tsx` | NEW | 3-col Kanban из production_tasks |
| `src/components/control-center/CapExMiniChart.tsx` | NEW | recharts BarChart по fin_categories |
| `src/components/control-center/EquipmentAlerts.tsx` | NEW | Топ-10 equipment + 90-day service alerts |
| `src/components/control-center/BOMHealthBar.tsx` | NEW | BOM coverage % + missing SALE dishes |
| `src/hooks/useKitchenTasks.ts` | NEW | production_tasks → byStatus + counts |
| `src/hooks/useCapEx.ts` | NEW | capex_transactions + fin_categories → monthlyTotal + byCategory |
| `src/hooks/useEquipment.ts` | NEW | equipment → serviceStatus (ok/warning/overdue) |
| `src/hooks/useBOMCoverage.ts` | NEW | nomenclature SALE% → bom coverage + missing list |

### Виджет → Таблица (Data Flow)

| Виджет | Supabase Table(s) | Запрос |
|---|---|---|
| HeroKPIRow (Tasks) | `production_tasks` | `GROUP BY status` |
| HeroKPIRow (CapEx) | `capex_transactions` | `SUM(amount_thb)` текущий месяц |
| HeroKPIRow (Equipment) | `equipment` | `COUNT(*)` |
| HeroKPIRow (BOM%) | `nomenclature` + `bom_structures` | SALE covered / total |
| KitchenStatusKanban | `production_tasks` | `ORDER BY updated_at DESC` |
| CapExMiniChart | `capex_transactions` + `fin_categories` | `SUM GROUP BY category` (2 отдельных запроса, join в JS) |
| EquipmentAlerts | `equipment` | `ORDER BY last_service_date ASC NULLS FIRST` |
| BOMHealthBar | `nomenclature` + `bom_structures` | SALE items без BOM |

### Технический долг (Phase 1)

- **Bundle size warning:** recharts добавляет ~300KB в бандл → решение: `React.lazy()` + `Suspense` для CapExMiniChart
- **~~Нет auto-refresh~~:** ✅ Решено в Phase 2 — Supabase Realtime подключён для `production_tasks`
- **RLS для admin-panel:** Текущие RLS настроены на `anon` full CRUD для `nomenclature` + `bom_structures` (migration 014). Dashboard-виджеты используют `anon` key — безопасно для внутренней сети

---

## 🍳 2026-03-09 — Phase 2: Smart Kitchen & KDS — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 2 KDS + Cook Station — LIVE

### Migration 016: KDS Scheduling

| Изменение | Описание |
|---|---|
| `scheduled_start TIMESTAMPTZ` | CEO-assigned start time |
| `duration_min INTEGER` | Expected duration |
| `equipment_id UUID FK→equipment` | Which station runs the task |
| `theoretical_yield NUMERIC` | Expected output weight |
| `actual_weight NUMERIC` | Cook-entered actual weight |
| `theoretical_bom_snapshot JSONB` | Frozen BOM at task start |

### Новые функции

| Функция | Тип | Статус |
|---|---|---|
| `fn_start_production_task(UUID)` | RPC / JSONB | ✅ NEW — ставит status=in_progress, actual_start=now(), замораживает BOM snapshot |

### Realtime

- `production_tasks` добавлена в `supabase_realtime` publication
- Хуки `useGanttTasks` и `useCookTasks` подписываются через `supabase.channel().on('postgres_changes')`

### Routing (обновлено)

| Роут | Компонент | Статус |
|---|---|---|
| `/` | `ControlCenter.tsx` | ✅ LIVE |
| `/bom` | `BOMHub.tsx` | ✅ LIVE |
| `/kds` | `KDSBoard.tsx` | ✅ NEW — Gantt CEO view |
| `/cook` | `CookStation.tsx` | ✅ NEW — Mobile-first cook UI |
| `/waste` | — | 🔜 Phase 3 |
| `/finance` | — | 🔜 Phase 4 |
| `/analytics` | — | 🔜 Phase 5 |
| `/*` | `<Navigate to="/" />` | ✅ Fallback |

### Новые файлы (Phase 2)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/016_kds_scheduling.sql` | SQL | Schema + RPC + Realtime |
| `src/hooks/useGanttTasks.ts` | NEW | Gantt tasks + conflict detection + Realtime |
| `src/hooks/useEquipmentCategories.ts` | NEW | Equipment list + category filter |
| `src/hooks/useCookTasks.ts` | NEW | Cook tasks + startTask RPC + completeTask |
| `src/pages/KDSBoard.tsx` | NEW | CEO Gantt scheduling view |
| `src/pages/CookStation.tsx` | NEW | Mobile-first cook execution UI |
| `src/components/kds/GanttTimeline.tsx` | NEW | Gantt container with conflict banner |
| `src/components/kds/GanttRow.tsx` | NEW | Equipment row with task bars |
| `src/components/kds/GanttTaskBar.tsx` | NEW | Positioned task bar (CSS %) |
| `src/components/kds/TimeHeader.tsx` | NEW | 24h time ruler |
| `src/components/kds/EquipmentFilter.tsx` | NEW | Category pill filter |
| `src/components/kds/TaskExecutionCard.tsx` | NEW | Cook card: Start/Timer/Complete |
| `src/components/kds/DeviationBadge.tsx` | NEW | Variance badge (≤5% ok, 5-10% warn, >10% alert) |
| `src/components/kds/BOMSnapshotPanel.tsx` | NEW | Modal: frozen BOM ingredients |

### Виджет → Таблица (Data Flow — Phase 2)

| Виджет | Supabase Table(s) | Запрос |
|---|---|---|
| GanttTimeline | `production_tasks` + `equipment` | `WHERE scheduled_start IS NOT NULL` + Realtime |
| EquipmentFilter | `equipment` | `DISTINCT category` |
| TaskExecutionCard | `production_tasks` | RPC `fn_start_production_task` / UPDATE |
| DeviationBadge | computed | `((actual/expected)-1)*100` |
| BOMSnapshotPanel | `production_tasks.theoretical_bom_snapshot` | JSONB display |

---

## 📦 2026-03-09 — Phase 3: Smart Waste & Inventory — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 3 Waste + Inventory + Predictive Procurement — LIVE

### Migration 017: Inventory, Waste & Predictive Procurement

| Изменение | Описание |
|---|---|
| `waste_reason` ENUM | expiration, spillage_damage, quality_reject, rd_testing |
| `financial_liability` ENUM | cafe, employee, supplier |
| `inventory_balances` TABLE | PK=nomenclature_id, quantity, last_counted_at |
| `waste_logs` TABLE | UUID PK, nomenclature_id FK, quantity, reason, financial_liability, comment, CHECK constraint |
| `fn_predictive_procurement(UUID)` RPC | Recursive CTE: walks BOM tree → leaf RAW ingredients → compares vs inventory → returns shortage array |
| RLS | anon=full CRUD, authenticated=SELECT |
| Realtime | Both tables added to `supabase_realtime` publication |

### Новые функции

| Функция | Тип | Статус |
|---|---|---|
| `fn_predictive_procurement(UUID)` | RPC / JSONB | ✅ NEW — Recursive BOM walk, shortage calc |

### Routing (обновлено)

| Роут | Компонент | Статус |
|---|---|---|
| `/` | `ControlCenter.tsx` | ✅ LIVE |
| `/bom` | `BOMHub.tsx` | ✅ LIVE |
| `/kds` | `KDSBoard.tsx` | ✅ LIVE |
| `/cook` | `CookStation.tsx` | ✅ LIVE |
| `/waste` | `WasteTracker.tsx` | ✅ NEW — Waste + Inventory + Procurement |
| `/finance` | — | 🔜 Phase 4 |
| `/analytics` | — | 🔜 Phase 5 |
| `/*` | `<Navigate to="/" />` | ✅ Fallback |

### Новые файлы (Phase 3)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/017_inventory_waste.sql` | SQL | ENUMs + Tables + RPC + RLS + Realtime |
| `src/hooks/useInventory.ts` | NEW | Two-query: nomenclature + inventory_balances, JS join, upsertBalance |
| `src/hooks/useWasteLog.ts` | NEW | Two-query: waste_logs + nomenclature, createWaste + auto-deduct inventory |
| `src/hooks/usePredictivePO.ts` | NEW | RPC call to fn_predictive_procurement, typed POItem[] |
| `src/pages/WasteTracker.tsx` | NEW | Page orchestrating 3 waste components |
| `src/components/waste/ZeroDayStocktake.tsx` | NEW | Inline-edit inventory table with search + per-row Save |
| `src/components/waste/WasteLogForm.tsx` | NEW | Waste log form with financial liability toggle + recent logs table |
| `src/components/waste/PredictivePO.tsx` | NEW | Plan selector + Generate PO → shortage table |

### Виджет → Таблица (Data Flow — Phase 3)

| Виджет | Supabase Table(s) | Запрос |
|---|---|---|
| ZeroDayStocktake | `nomenclature` + `inventory_balances` | Two queries, JS join, UPSERT on save |
| WasteLogForm | `waste_logs` + `nomenclature` + `inventory_balances` | INSERT waste + deduct balance |
| PredictivePO | `daily_plan` + `fn_predictive_procurement` RPC | RPC → recursive BOM walk → shortage array |

---

## 📦 2026-03-09 — Phase 3.5: Batch Tracking & Logistics — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 3.5 Batch Tracking + Locations + Barcodes — LIVE

### Migration 018: Batches, Locations & Stock Transfers

| Изменение | Описание |
|---|---|
| `location_type` ENUM | kitchen, assembly, storage, delivery |
| `batch_status` ENUM | sealed, opened, depleted, wasted |
| `locations` TABLE | UUID PK, name UNIQUE, type. Seeded: Kitchen, Assembly, Storage |
| `inventory_batches` TABLE | UUID PK, nomenclature_id FK, barcode UNIQUE, weight, location_id FK, status, production_task_id FK |
| `stock_transfers` TABLE | UUID PK, batch_id FK, from/to location FKs, CHECK(from≠to) |
| `fn_generate_barcode()` | 8-char uppercase alphanumeric, collision-safe |
| `fn_create_batches_from_task(UUID, JSONB)` RPC | Creates N batches + completes task + returns barcodes |
| `fn_open_batch(UUID)` RPC | Opens batch, shrinks expires_at to +12h |
| `fn_transfer_batch(TEXT, TEXT)` RPC | Moves batch by barcode, logs transfer |
| RLS | anon=full CRUD, authenticated=SELECT |
| Realtime | inventory_batches + stock_transfers |

### Новые функции

| Функция | Тип | Статус |
|---|---|---|
| `fn_generate_barcode()` | UTIL | ✅ NEW |
| `fn_create_batches_from_task(UUID, JSONB)` | RPC / JSONB | ✅ NEW |
| `fn_open_batch(UUID)` | RPC / JSONB | ✅ NEW |
| `fn_transfer_batch(TEXT, TEXT)` | RPC / JSONB | ✅ NEW |

### Routing (обновлено)

| Роут | Компонент | Статус |
|---|---|---|
| `/` | `ControlCenter.tsx` | ✅ LIVE |
| `/bom` | `BOMHub.tsx` | ✅ LIVE |
| `/kds` | `KDSBoard.tsx` | ✅ LIVE |
| `/cook` | `CookStation.tsx` | ✅ MODIFIED — Batch entry on Complete |
| `/waste` | `WasteTracker.tsx` | ✅ LIVE |
| `/logistics` | `LogisticsScanner.tsx` | ✅ NEW — Transfer + Unpack tabs |
| `/finance` | — | 🔜 Phase 4 |
| `/analytics` | — | 🔜 Phase 5 |
| `/tasks` | — | 🔜 Phase 6 (Executive Hub) |
| `/*` | `<Navigate to="/" />` | ✅ Fallback |

### Новые файлы (Phase 3.5)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/018_batches_and_locations.sql` | SQL | ENUMs + 3 Tables + 4 RPCs + RLS + Realtime |
| `src/hooks/useBatches.ts` | NEW | Batches + createBatchesFromTask + openBatch |
| `src/hooks/useLocations.ts` | NEW | Locations list |
| `src/hooks/useStockTransfer.ts` | NEW | transferBatch RPC |
| `src/pages/LogisticsScanner.tsx` | NEW | Mobile-first Transfer + Unpack tabs |
| `src/components/logistics/TransferTab.tsx` | NEW | Barcode scan → transfer |
| `src/components/logistics/UnpackTab.tsx` | NEW | Barcode scan → open → countdown timer |

### Виджет → Таблица (Data Flow — Phase 3.5)

| Виджет | Supabase Table(s) | Запрос |
|---|---|---|
| TaskExecutionCard (batch) | `inventory_batches` + `production_tasks` | RPC `fn_create_batches_from_task` |
| TransferTab | `inventory_batches` + `stock_transfers` | RPC `fn_transfer_batch` |
| UnpackTab | `inventory_batches` | RPC `fn_open_batch` + countdown timer |

---

## 🏗️ 2026-03-09 — Phase 3.6: BOM Hub Editor & Database Sync — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 3.6 BOM Hub CRUD + DB Sync + Cost Validation — LIVE

### Migration 019: Nomenclature Cost & Notes

| Изменение | Описание |
|---|---|
| `cost_per_unit NUMERIC DEFAULT 0` | Unit cost in THB for RAW items; for PF/SALE calculated from BOM |
| `notes TEXT` | Free-text notes per nomenclature item |

### DB Sync (Migrations Applied to Supabase)

| Migration | Статус |
|---|---|
| 016 (KDS Scheduling) | ✅ Applied |
| 017 (Inventory/Waste) | ✅ Applied (ENUMs + Tables + RPC + RLS + Realtime) |
| 018 (Batches/Locations) | ✅ Applied (Tables + 4 RPCs + RLS + Realtime) |
| 019 (Cost/Notes) | ✅ Applied (ALTER TABLE) |

### BOM Hub Improvements

| Feature | Описание |
|---|---|
| **Filter Bugfix** | Sales tab now STRICTLY shows `SALE-%` only. Boris Rule #8 added. |
| **Add Item** | `+ Add Item` button opens modal with product_code, name, type, unit, cost_per_unit, notes |
| **Edit Item** | `Edit` button next to selected item opens same modal in edit mode |
| **Cost Badge** | Amber badge shows calculated BOM cost (SUM of ingredient.cost_per_unit × qty) |
| **Editable BOM Table** | Qty, Yield%, Notes columns are all inline-editable |
| **Per-line Cost** | Each BOM row shows `unitCost × qty` in amber |

### Модифицированные файлы (Phase 3.6)

| Файл | Тип | Назначение |
|---|---|
| `migrations/019_nomenclature_cost_notes.sql` | NEW | Add cost_per_unit + notes to nomenclature |
| `src/components/RecipeBuilder.tsx` | REWRITTEN | Full CRUD: NomenclatureModal, CostBadge, editable Yield/Notes, filter bugfix |
| `claude.md` | MODIFIED | Added Boris Rule #8 (BOM Hub filtering) |

---

## 🏗️ 2026-03-09 — Phase 1.5: Storefront Extension & Pricing Engine — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 1.5 Storefront + Pricing + Nutrition — LIVE

### Migration 020: Storefront & Pricing

| Изменение | Описание |
|---|---|
| `price NUMERIC` | Selling price in THB |
| `image_url TEXT` | Product image URL for storefront |
| `slug TEXT UNIQUE` | URL-friendly identifier (auto-generated from name with Cyrillic transliteration) |
| `is_available BOOLEAN DEFAULT true` | Whether item appears on storefront |
| `display_order INTEGER DEFAULT 0` | Sort order on storefront |
| `is_featured BOOLEAN DEFAULT false` | Featured item flag |
| `calories INTEGER` | КБЖУ: Kilocalories per portion |
| `protein NUMERIC` | КБЖУ: Protein (g) |
| `carbs NUMERIC` | КБЖУ: Carbohydrates (g) |
| `fat NUMERIC` | КБЖУ: Fat (g) |
| `allergens TEXT[]` | Array of allergen labels (e.g. gluten, dairy, nuts) |
| `markup_pct NUMERIC DEFAULT 0` | Markup percentage for pricing engine |

### DB Sync (Migration Applied to Supabase)

| Migration | Статус |
|---|---|
| 020 (Storefront/Pricing) | ✅ Applied (12 columns + 4 indexes + comments) |

### NomenclatureModal — 3-Section Editor

| Section | Fields |
|---|---|
| **Basic & Site** | Product Code, Name, Type, Unit, Slug (auto-gen), Image URL, Display Order, Available, Featured |
| **Pricing Engine** | Cost per Unit (editable), Markup % → Recommended Price (reactive auto-calc), Final Price, Margin indicator (green ≥30%, red <30%), Notes |
| **Nutrition (КБЖУ)** | Calories, Protein, Carbs, Fat, Allergens (comma-separated with tag pills), КБЖУ summary card |

### UX Features

| Feature | Описание |
|---|---|
| **Slug Auto-Generation** | Cyrillic→Latin transliteration + kebab-case from Name field. Editable to override. |
| **Reactive Pricing Calculator** | Change Markup% → instantly see Recommended Price = Cost × (1+Markup/100) |
| **Margin Indicator (Modal)** | (Price − Cost) / Price × 100. Green card if ≥30%, red card with warning if <30% |
| **Margin Badge (Sidebar)** | Each item in left sidebar shows colored margin badge next to cost |
| **КБЖУ Summary Card** | Visual card showing colored Kcal / Protein / Carbs / Fat per portion |
| **Allergen Tag Pills** | Comma-separated input renders as rose-colored tag pills in real-time |

### Модифицированные файлы (Phase 1.5)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/020_storefront_pricing.sql` | NEW | 12 columns + 4 indexes on nomenclature for storefront, nutrition, economics |
| `src/components/RecipeBuilder.tsx` | REWRITTEN | 3-section NomenclatureModal, slug generator, MarginBadge, extended NomItem type, updated queries |
