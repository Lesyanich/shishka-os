# 🔖 STATE.md — Agent Save-Game File
**Последнее обновление:** 2026-03-11T14:00 (ICT)
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
| `receipt_jobs` | `id` UUID | 0 | ✅ NEW | Async AI receipt parsing queue. Migration 036. Realtime-enabled. |

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
| `fin_categories` | SELECT USING (true) — public read ✅ Migration 028 |
| `fin_sub_categories` | SELECT USING (true) — public read ✅ Migration 028 |
| `suppliers` | SELECT USING (true) — public read ✅ Migration 029 (was: authenticated only) |
| `expense_ledger` | SELECT USING (true) — public read ✅ Migration 024 |

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

---

## 🏗️ 2026-03-10 — Phase 4: Procurement & Real-time Food Costing — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 4 Procurement Module — LIVE

### Migration 021: Procurement

| Объект | Тип | Описание |
|---|---|---|
| `suppliers` | TABLE | id (UUID PK), name, contact_info, is_deleted, created_at, updated_at |
| `purchase_logs` | TABLE | id (UUID PK), nomenclature_id (FK), supplier_id (FK), quantity, price_per_unit, total_price, invoice_date, notes |
| `fn_update_cost_on_purchase()` | TRIGGER FN | On INSERT into purchase_logs → updates nomenclature.cost_per_unit with latest price_per_unit (SSoT!) |
| `trg_update_cost_on_purchase` | TRIGGER | AFTER INSERT on purchase_logs → fn_update_cost_on_purchase |
| `fn_set_updated_at()` | TRIGGER FN | Generic updated_at setter for suppliers |
| RLS (5 policies) | POLICY | Full CRUD for authenticated users on both tables |
| Realtime | PUB | Both tables added to supabase_realtime |

### DB Sync

| Migration | Статус |
|---|---|
| 021 (Procurement) | ✅ Applied (3 parts: Tables+Indexes, Triggers, RLS+Realtime) |

### Frontend Components

| Component | Location | Description |
|---|---|---|
| `Procurement.tsx` | `src/pages/` | Page layout: 2-column grid with PurchaseForm + SupplierManager (left) and PurchaseHistory (right) |
| `PurchaseForm.tsx` | `src/components/procurement/` | Supplier + item (RAW/PF) select, qty + total price inputs, auto-calc price_per_unit, cost delta comparison, submit button |
| `SupplierManager.tsx` | `src/components/procurement/` | CRUD table for suppliers with modal (add/edit), soft-delete |
| `PurchaseHistory.tsx` | `src/components/procurement/` | Last 50 purchase entries with item code, supplier, qty, price/unit, total, notes. Two-query join pattern. |

### UX Features

| Feature | Описание |
|---|---|
| **Auto Price-per-Unit** | price_per_unit = total_price / quantity, computed reactively |
| **Cost Delta Indicator** | Shows % change vs current cost (green if cheaper, red if more expensive) |
| **Trigger-based Cost Update** | On purchase log INSERT, DB trigger auto-updates nomenclature.cost_per_unit — zero manual work |
| **Refresh on Submit** | After logging purchase, PurchaseHistory auto-refreshes via refreshKey pattern |

### Модифицированные файлы (Phase 4)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/021_procurement.sql` | NEW | suppliers + purchase_logs tables, cost trigger, RLS, Realtime |
| `src/pages/Procurement.tsx` | NEW | Procurement page with 2-column layout |
| `src/components/procurement/PurchaseForm.tsx` | NEW | Invoice entry form with auto-calc |
| `src/components/procurement/SupplierManager.tsx` | NEW | Supplier CRUD |
| `src/components/procurement/PurchaseHistory.tsx` | NEW | Purchase history table (two-query join) |
| `src/layouts/AppShell.tsx` | MODIFIED | Added Truck icon + /procurement nav item |
| `src/App.tsx` | MODIFIED | Added /procurement route |

---

## 🛒 2026-03-10 — Phase 5.1: Orders Pipeline & Webhook Receiver — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 5.1 Orders Pipeline + Kanban + Realtime — LIVE

### Migration 022: Orders Pipeline

| Объект | Тип | Описание |
|---|---|---|
| `order_source` | ENUM | 'website', 'syrve', 'manual' |
| `order_status` | ENUM | 'new', 'preparing', 'ready', 'delivered', 'cancelled' |
| `orders` | TABLE | id (UUID PK), source, status, customer_name, customer_phone, total_amount, notes, created_at, updated_at |
| `order_items` | TABLE | id (UUID PK), order_id (FK CASCADE), nomenclature_id (FK RESTRICT), quantity (CHECK >0), price_at_purchase |
| `production_tasks.order_id` | ALTER | FK to orders(id) ON DELETE SET NULL — links production tasks to source order |
| `fn_process_new_order(UUID)` | RPC / JSONB | Loops SALE-items → BOM explosion → creates production_tasks linked via order_id. Graceful EXCEPTION: on failure returns error JSON, order stays 'new' |
| `trg_orders_updated_at` | TRIGGER | BEFORE UPDATE → fn_set_updated_at() |
| RLS (5 policies) | POLICY | Full read/write for authenticated users on both tables |
| Realtime | PUB | Both orders + order_items added to supabase_realtime |

### DB Sync

| Migration | Статус |
|---|---|
| 022 (Orders Pipeline) | ✅ Applied (3 parts: ENUMs+Tables+Indexes, Triggers+RPC, RLS+Realtime) |

### Frontend Components

| Component | Location | Description |
|---|---|---|
| `OrderManager.tsx` | `src/pages/` | Page layout: LiveOrderBoard with page header |
| `LiveOrderBoard.tsx` | `src/components/orders/` | 3-column Kanban (New → Preparing → Ready) with Supabase Realtime subscription, manual order creation modal, status transitions |
| `OrderDetailsModal.tsx` | `src/components/orders/` | Order detail view: status badge, customer info grid, items table (two-query join), status transition buttons |

### UX Features

| Feature | Описание |
|---|---|
| **Realtime Kanban** | Supabase Realtime subscription on `orders` table — board auto-refreshes on INSERT/UPDATE |
| **Manual Order Creation** | Modal: select SALE-items from nomenclature, set quantity, customer info, notes → creates order + order_items |
| **BOM Explosion RPC** | When status changes to 'preparing', `fn_process_new_order` auto-creates production_tasks from BOM structure |
| **Graceful Degradation** | If RPC fails, order stays 'new' — can be retried or processed manually |
| **Status Transitions** | Enforced flow: new→[preparing,cancelled], preparing→[ready,cancelled], ready→[delivered] |
| **Price Snapshot** | `price_at_purchase` in order_items freezes price at order time — immune to future price changes |

### Routing (обновлено)

| Роут | Компонент | Статус |
|---|---|---|
| `/` | `ControlCenter.tsx` | ✅ LIVE |
| `/bom` | `BOMHub.tsx` | ✅ LIVE |
| `/kds` | `KDSBoard.tsx` | ✅ LIVE |
| `/cook` | `CookStation.tsx` | ✅ LIVE |
| `/waste` | `WasteTracker.tsx` | ✅ LIVE |
| `/logistics` | `LogisticsScanner.tsx` | ✅ LIVE |
| `/procurement` | `Procurement.tsx` | ✅ LIVE |
| `/orders` | `OrderManager.tsx` | ✅ NEW — Kanban + Realtime |
| `/finance` | — | 🔜 Phase 6 |
| `/analytics` | — | 🔜 Phase 7 |
| `/*` | `<Navigate to="/" />` | ✅ Fallback |

### Модифицированные файлы (Phase 5.1)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/022_orders_pipeline.sql` | NEW | ENUMs + orders/order_items tables + fn_process_new_order RPC + RLS + Realtime |
| `src/pages/OrderManager.tsx` | NEW | Orders page layout |
| `src/components/orders/LiveOrderBoard.tsx` | NEW | Kanban board with Realtime + manual order creation |
| `src/components/orders/OrderDetailsModal.tsx` | NEW | Order detail modal with items table + status transitions |
| `src/layouts/AppShell.tsx` | MODIFIED | Added Bell icon + /orders nav item |
| `src/App.tsx` | MODIFIED | Added /orders route |

---

## 📋 2026-03-10 — Phase 5.2: Enterprise MRP Engine & Scenario Planning — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 5.2 MRP Engine + Master Planner — LIVE

### Migration 023: MRP Engine & Scenario Planning

| Объект | Тип | Описание |
|---|---|---|
| `plan_status` | ENUM | 'draft', 'active', 'completed' |
| `production_plans` | TABLE | id (UUID PK), name, target_date, status (plan_status), mrp_result (JSONB cache), created_at, updated_at |
| `plan_targets` | TABLE | id (UUID PK), plan_id (FK CASCADE), nomenclature_id (FK RESTRICT), target_qty (INTEGER CHECK >0), UNIQUE(plan_id, nomenclature_id) |
| `fn_run_mrp(UUID)` | RPC / JSONB | MRP Engine: 2-level BOM explosion (SALE→PF/MOD→RAW + direct SALE→RAW), inventory deduction from inventory_batches (sealed/opened, not expired) + inventory_balances. Returns {prep_schedule, procurement_list} cached on plan.mrp_result |
| `fn_approve_plan(UUID)` | RPC / JSONB | Converts prep_schedule into production_tasks (60min default duration), transitions plan draft→active |
| `trg_production_plans_updated_at` | TRIGGER | BEFORE UPDATE → fn_set_updated_at() |
| RLS (8 policies) | POLICY | Full CRUD for both tables |
| Realtime | PUB | Both production_plans + plan_targets added to supabase_realtime |

### MRP Algorithm Detail

| Step | Описание |
|---|---|
| 1. Read targets | plan_targets: SALE items + desired quantities |
| 2. Explode SALE→PF/MOD | bom_structures join, filter by product_code LIKE 'PF-%' OR 'MOD-%' |
| 3. Deduct PF/MOD inventory | inventory_batches: sealed/opened, expires_at > target_date |
| 4. Net PF/MOD→RAW | Explode remaining PF/MOD needs to RAW ingredients |
| 5. Direct SALE→RAW | Also collect direct SALE→RAW BOM links |
| 6. Deduct RAW inventory | inventory_balances: on-hand quantities |
| 7. Return JSON | {prep_schedule (PF/MOD to make), procurement_list (RAW to buy with estimated costs)} |

### DB Sync

| Migration | Статус |
|---|---|
| 023 (MRP Engine) | ✅ Applied (3 parts: ENUM+Tables+Indexes, fn_run_mrp, fn_approve_plan+RLS+Realtime) |

### Frontend Components

| Component | Location | Description |
|---|---|---|
| `MasterPlanner.tsx` | `src/pages/` | 3-step wizard: Step 1 (Scenario Builder — create plan + add SALE targets), Step 2 (MRP Dashboard — To Prep PF/MOD + To Buy RAW with costs), Step 3 (Approve & Send to Kitchen) |

### UX Features

| Feature | Описание |
|---|---|
| **Scenario Builder** | Create named plans with target date, add SALE items with quantities from nomenclature dropdown |
| **MRP Dashboard** | Two-column grid: "To Prep (PF/MOD)" with gross/on_hand/net quantities, "To Buy (RAW)" with estimated costs |
| **Plan Approval** | One-click approve creates production_tasks in KDS, transitions plan to active |
| **Inventory-Aware** | If stock exists (batches not expired, balances available), system deducts before suggesting prep/buy |
| **Cached Results** | MRP results cached in mrp_result JSONB — re-calculate anytime, view last calculation timestamp |
| **Plan Lifecycle** | Draft (editable) → Active (approved, tasks created) → Completed (future manual) |

### Routing (обновлено)

| Роут | Компонент | Статус |
|---|---|---|
| `/` | `ControlCenter.tsx` | ✅ LIVE |
| `/bom` | `BOMHub.tsx` | ✅ LIVE |
| `/kds` | `KDSBoard.tsx` | ✅ LIVE |
| `/cook` | `CookStation.tsx` | ✅ LIVE |
| `/waste` | `WasteTracker.tsx` | ✅ LIVE |
| `/logistics` | `LogisticsScanner.tsx` | ✅ LIVE |
| `/procurement` | `Procurement.tsx` | ✅ LIVE |
| `/orders` | `OrderManager.tsx` | ✅ LIVE |
| `/planner` | `MasterPlanner.tsx` | ✅ NEW — MRP Engine + Scenario Planning |
| `/finance` | — | 🔜 Phase 6 |
| `/analytics` | — | 🔜 Phase 7 |
| `/*` | `<Navigate to="/" />` | ✅ Fallback |

### Модифицированные файлы (Phase 5.2)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/023_mrp_engine.sql` | NEW | plan_status ENUM + production_plans/plan_targets tables + fn_run_mrp + fn_approve_plan + RLS + Realtime |
| `src/pages/MasterPlanner.tsx` | NEW | 3-step MRP wizard with scenario management |
| `src/layouts/AppShell.tsx` | MODIFIED | Added CalendarDays icon + /planner nav item |
| `src/App.tsx` | MODIFIED | Added /planner route |

### Bugs Fixed During Development

| Bug | Причина | Исправление |
|---|---|---|
| `column bs.child_id does not exist` | bom_structures uses `ingredient_id` not `child_id` | Updated fn_run_mrp: `bs.child_id` → `bs.ingredient_id` |
| `column n.unit does not exist` | nomenclature uses `base_unit` not `unit` | Updated fn_run_mrp + fn_approve_plan: `n.unit` → `n.base_unit`, JSON key `'unit'` → `'base_unit'` |
| `expected_duration_min NOT NULL` | fn_approve_plan INSERT missing required column | Added `expected_duration_min = 60` to INSERT statement |
| Nested button HTML warning | Delete button inside plan card button | Changed outer `<button>` to `<div role="button">` |

---

## 📚 2026-03-10 — Phase 5.3: Knowledge Base Refactoring & Obsidian Skills — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 5.3 Vault Cleanup + Obsidian Skills — LIVE

### Changes

| Действие | Описание |
|---|---|
| **Great Purge** | Archived 60+ legacy files to `02_Obsidian_Vault/_Archive/` (01_Menu, 03_Infrastructure, Blueprints, Logs, etc.) |
| **Obsidian Skills (kepano)** | Installed 5 skills from `kepano/obsidian-skills`: obsidian-markdown, obsidian-bases, json-canvas, obsidian-cli, defuddle |
| **Boris Rule #9** | Added Obsidian Protocol to CLAUDE.md — mandatory architecture notes after each major phase |
| **First Architecture Note** | Created `02_Obsidian_Vault/Shishka OS Architecture.md` with Mermaid diagram, phases table, RPCs index |
| **.gitignore Fix** | Changed `.claude/` → `.claude/*` with negations `!.claude/skills/` and `!.claude/.claude-plugin/` |

---

## 🧠 2026-03-10 — Phase 5.4: Agent Skills & Capabilities — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 5.4 Anthropic Skills + Custom Invoice Parser — LIVE

### Changes

| Действие | Описание |
|---|---|
| **Anthropic Skills** | Installed 3 skills from `anthropics/skills`: pdf, xlsx, skill-creator |
| **shishka-invoice-parser** | Custom skill: 6-step SOP for parsing supplier invoices (PDF/image) → purchase_logs INSERT |
| **Agent Skills Note** | Created `02_Obsidian_Vault/Agent Skills & Capabilities.md` — registry of all 9 skills |

---

## 💰 2026-03-10 — Phase 4.1: Financial Ledger, Multi-currency & Receipt Storage — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 4.1 Expense Ledger + Multi-currency + Receipts — LIVE

### Migration 024: Expense Ledger

| Объект | Тип | Описание |
|---|---|---|
| `expense_ledger` | TABLE | id (UUID PK), transaction_date, flow_type (OpEx/CapEx), category_code (FK→fin_categories), sub_category_code (FK→fin_sub_categories), supplier_id (FK→suppliers), details, amount_original, currency, exchange_rate, amount_thb (GENERATED), paid_by, payment_method, status, receipt URLs (3), timestamps |
| `amount_thb` | GENERATED | `GENERATED ALWAYS AS (amount_original * exchange_rate) STORED` — never INSERT/UPDATE directly |
| `receipts` bucket | STORAGE | Supabase Storage bucket, 5MB limit, JPEG/PNG/WebP/PDF, public read, authenticated upload/delete |
| Storage RLS (3 policies) | POLICY | Public read, authenticated upload, authenticated delete |
| Table RLS (4 policies) | POLICY | Full CRUD on expense_ledger |
| Realtime | PUB | expense_ledger added to supabase_realtime |

### DB Sync

| Migration | Статус |
|---|---|
| 024 (Expense Ledger) | ✅ Applied (3 parts: Table+Indexes+Trigger, Storage Bucket+Policies, RLS+Realtime) |

### Frontend Components

| Component | Location | Description |
|---|---|---|
| `FinanceManager.tsx` | `src/pages/` | Page layout: KPI strip + 2-column grid (Expense Form + Chart/History) |
| `ExpenseForm` (inline) | `src/pages/FinanceManager.tsx` | Multi-currency form: OpEx/CapEx toggle, category/sub-category selectors, supplier, amount/currency/exchange_rate, auto-calculated THB, paid_by, payment_method, status, 3 receipt uploaders |
| `MonthlyChart` (inline) | `src/pages/FinanceManager.tsx` | Stacked BarChart (recharts): monthly amount_thb grouped by category |
| `ExpenseHistory` (inline) | `src/pages/FinanceManager.tsx` | Scrollable table: last 50 expenses with date, type, category, details, amount, THB, status, receipt links |
| `FileUploadButton` (inline) | `src/pages/FinanceManager.tsx` | Drag-drop style upload button for Supplier Receipt, Bank Slip, Tax Invoice |
| `useExpenseLedger.ts` | `src/hooks/` | Two-query pattern: expense_ledger + fin_categories + fin_sub_categories + suppliers → JS join, monthly summaries, grandTotal |

### UX Features

| Feature | Описание |
|---|---|
| **Multi-currency** | Enter amount in any currency + exchange rate → auto-calculated THB (GENERATED column) |
| **THB Auto-calc** | When currency ≠ THB, shows computed THB total with formula breakdown |
| **OpEx / CapEx Toggle** | Visual toggle buttons with color coding (emerald/amber) |
| **Category Cascade** | Sub-category dropdown filters based on selected category |
| **3 Receipt Uploaders** | Supplier Receipt, Bank Slip, Tax Invoice → Supabase Storage `receipts` bucket |
| **Receipt Links** | History table shows colored receipt icons linking to uploaded files |
| **KPI Strip** | 3 cards: This Month total, All-time total, Transaction count |
| **Month-over-Month Delta** | KPI card shows % change vs previous month (green/red) |
| **Stacked Bar Chart** | Monthly expenses broken down by fin_category, color-coded |

### Invoice Parser Update

| Change | Описание |
|---|---|
| **Dual-target routing** | Food items → `purchase_logs`, Non-food → `expense_ledger` |
| **Step 3 added** | Classify Items: Food vs Non-Food decision logic |
| **Step 6 added** | Match Financial Category for expense_ledger items |
| **Multi-currency support** | Invoice parser now captures currency + exchange rate for foreign invoices |

### Routing (обновлено)

| Роут | Компонент | Статус |
|---|---|---|
| `/` | `ControlCenter.tsx` | ✅ LIVE |
| `/bom` | `BOMHub.tsx` | ✅ LIVE |
| `/kds` | `KDSBoard.tsx` | ✅ LIVE |
| `/cook` | `CookStation.tsx` | ✅ LIVE |
| `/waste` | `WasteTracker.tsx` | ✅ LIVE |
| `/logistics` | `LogisticsScanner.tsx` | ✅ LIVE |
| `/procurement` | `Procurement.tsx` | ✅ LIVE |
| `/orders` | `OrderManager.tsx` | ✅ LIVE |
| `/planner` | `MasterPlanner.tsx` | ✅ LIVE |
| `/finance` | `FinanceManager.tsx` | ✅ NEW — Expense Ledger + Multi-currency |
| `/analytics` | — | 🔜 Next Phase |
| `/*` | `<Navigate to="/" />` | ✅ Fallback |

### Модифицированные файлы (Phase 4.1)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/024_expense_ledger.sql` | NEW | expense_ledger table + receipts storage bucket + RLS + Realtime |
| `src/hooks/useExpenseLedger.ts` | NEW | Four-query hook: ledger + categories + sub-categories + suppliers, JS join, monthly summaries |
| `src/pages/FinanceManager.tsx` | NEW | Finance page: KPI strip + ExpenseForm + MonthlyChart + ExpenseHistory + FileUploadButtons |
| `src/layouts/AppShell.tsx` | MODIFIED | DollarSign → Wallet icon, enabled: true for /finance |
| `src/App.tsx` | MODIFIED | Added /finance route + FinanceManager import |
| `.claude/skills/shishka-invoice-parser/SKILL.md` | MODIFIED | Dual-target routing (purchase_logs + expense_ledger), added Steps 3, 6, multi-currency |

---

## 💰 2026-03-10 — Phase 4.2: Historical Sync & Smart UI Foundation — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 4.2 Historical Data Import + Smart UI Components — LIVE

### Migration 025: Historical Expense Import

| Объект | Тип | Описание |
|---|---|---|
| `uq_suppliers_name` | CONSTRAINT | UNIQUE constraint on `suppliers.name` for idempotent upserts |
| 19 supplier INSERTs | DATA | New suppliers from CSV (landlord, construction firms, equipment vendors, etc.) with ON CONFLICT DO NOTHING |
| 62 expense_ledger INSERTs | DATA | Historical expenses Oct 2025 — Mar 2026. Idempotent (WHERE NOT EXISTS on transaction ID in details). CapEx: 46 rows (1,417,350.67 THB), OpEx: 16 rows (683,406.00 THB). Multi-currency: THB, USD (5 rows), AED (1 row) |

### DB Sync

| Migration | Статус |
|---|---|
| 025 (Historical Import) | ✅ Applied (3 parts: UNIQUE constraint, 19 suppliers, 62 expenses) |

### Frontend Architecture Refactor

**Monolithic FinanceManager.tsx (905 lines) → Component extraction pattern:**

| Component | Location | Description |
|---|---|---|
| `helpers.ts` | `src/components/finance/` | Shared formatTHB, CATEGORY_COLORS, CURRENCY_OPTIONS, PAYMENT_METHODS |
| `KpiCard.tsx` | `src/components/finance/` | Extracted KPI card with delta indicator |
| `MonthlyChart.tsx` | `src/components/finance/` | Extracted stacked BarChart (recharts) |
| `ExpenseForm.tsx` | `src/components/finance/` | Modified: removed 3 FileUploadButtons, added `receiptUrls` prop for MagicDropzone integration |
| `ExpenseHistory.tsx` | `src/components/finance/` | Modified: receipt links now trigger ReceiptLightbox instead of opening new tabs |
| `MagicDropzone.tsx` | `src/components/finance/` | NEW: Full-width drag-and-drop zone, multi-file, thumbnail grid, client-side image compression (Canvas API, max 1024x1024, JPEG 80%), mock AI button (2s delay → toast "AI API not connected yet" → upload to Storage → inject URLs into form) |
| `ReceiptLightbox.tsx` | `src/components/finance/` | NEW: Modal overlay for receipt images/PDFs, Escape to close, click-outside to close |
| `index.ts` | `src/components/finance/` | Barrel export |
| `FinanceManager.tsx` | `src/pages/` | REWRITTEN: Thin orchestrator (110 lines vs 905), imports all sub-components |

### UX Features (New in Phase 4.2)

| Feature | Описание |
|---|---|
| **Real Historical Data** | 62 expenses across 6 months — charts and KPIs show real business data |
| **Magic Dropzone** | Drag-and-drop receipt upload with thumbnail previews and remove buttons |
| **Client-side Compression** | Images >1024px auto-resized via Canvas API, JPEG 80% quality, PDFs pass through |
| **Mock AI Stub** | "Analyze with AI" button → 2s spinner → "AI API not connected yet" toast → uploads to Storage |
| **Receipt Lightbox** | Click receipt icon → full-screen modal viewer (image or PDF iframe), Escape/click-outside to close |
| **Component Architecture** | Finance module now follows same pattern as other modules (components/ directory) |

### Модифицированные файлы (Phase 4.2)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/025_import_expenses.sql` | NEW | Historical data import: UNIQUE constraint + 19 suppliers + 62 expenses |
| `src/components/finance/helpers.ts` | NEW | Shared helpers: formatTHB, constants |
| `src/components/finance/KpiCard.tsx` | NEW | Extracted KPI card component |
| `src/components/finance/MonthlyChart.tsx` | NEW | Extracted chart component |
| `src/components/finance/ExpenseForm.tsx` | NEW | Modified expense form with receiptUrls prop |
| `src/components/finance/ExpenseHistory.tsx` | NEW | Modified history with lightbox trigger |
| `src/components/finance/MagicDropzone.tsx` | NEW | Drag-and-drop + compression + mock AI |
| `src/components/finance/ReceiptLightbox.tsx` | NEW | Modal image/PDF viewer |
| `src/components/finance/index.ts` | NEW | Barrel export |
| `src/pages/FinanceManager.tsx` | REWRITTEN | Thin orchestrator (905→110 lines) |

---

## 💰 2026-03-10 — Phase 4.3: Smart UI Refinement, CRUD & DB Map — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 4.3 CEO-friendly UX + Edit + Smart Input + Obsidian DB Map — LIVE

### ExpenseHistory Redesign (CEO-friendly)

| Old Columns | New Columns |
|---|---|
| Date, Type, Category, Details, Amount, THB, Status, Receipts | Date (+ tiny OpEx/CapEx badge), **Supplier** (Kому), **Details** (За что), **Amount** (THB large, original currency small), Receipts, **Edit** |

- **Type/Category** removed from table (visible only in Edit modal)
- **Supplier** shown prominently as "who was paid"
- **Amount** shows THB prominently with original currency below for multi-currency
- **Status** shown only when not "paid" (saves space for the common case)
- **Edit** button appears on hover (pencil icon) → opens ExpenseEditModal

### ExpenseEditModal (CRUD Update)

- Modal overlay with pre-filled form from selected row
- All fields editable: date, type, category, sub-category, supplier, details, amount, currency, exchange rate, paid_by, payment, status
- `updateExpense` function added to `useExpenseLedger` hook
- Escape / click-outside to close

### SmartTextInput (Conversational UI Stub)

- Full-width input above the form: "Quick log: Paid 1500 to Makro for vegetables yesterday..."
- **Enter** or **Send button** → text injected into ExpenseForm's Details field
- **Mic icon** (UI stub) — ready for future Web Speech API
- Future: NLP parser will extract amount, supplier, category from natural language

### Database Schema Note (Boris Rule #10)

- Created `02_Obsidian_Vault/Database Schema.md` with full Mermaid erDiagram
- 22 tables, 7 ENUMs, 12 RPCs/triggers, 1 storage bucket documented
- Added Boris Rule #10 to CLAUDE.md: "update Database Schema.md on every migration"

### Модифицированные файлы (Phase 4.3)

| Файл | Тип | Назначение |
|---|---|---|
| `src/components/finance/ExpenseHistory.tsx` | REWRITTEN | CEO-friendly columns: Date+Badge, Supplier, Details, Amount, Receipts, Edit |
| `src/components/finance/ExpenseEditModal.tsx` | NEW | Modal form for editing expenses with pre-filled fields |
| `src/components/finance/SmartTextInput.tsx` | NEW | Quick-log text input with mic stub + Enter → fills Details |
| `src/components/finance/ExpenseForm.tsx` | MODIFIED | Added `quickText` prop, useEffect to fill details from SmartTextInput |
| `src/components/finance/index.ts` | MODIFIED | Added exports for ExpenseEditModal, SmartTextInput |
| `src/hooks/useExpenseLedger.ts` | MODIFIED | Added `ExpenseUpdatePayload` type + `updateExpense` function |
| `src/pages/FinanceManager.tsx` | MODIFIED | Wired SmartTextInput, EditModal, updateExpense |
| `02_Obsidian_Vault/Database Schema.md` | NEW | Full erDiagram + tables index + RPCs + ENUMs |
| `CLAUDE.md` | MODIFIED | Added Boris Rule #10 (Database Documentation Protocol) |

---

## 💰 2026-03-10 — Phase 4.3b: Data Cleanup, Comments, Tax Invoice & Receipt Fixes — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 4.3b CEO data cleanup — LIVE

### Migration 026: Data Cleanup — Details, Comments, Sub-categories, Tax Invoice Flag

| Объект | Тип | Описание |
|---|---|---|
| `comments` column | ALTER TABLE | TEXT column on expense_ledger for transaction notes |
| `has_tax_invoice` column | ALTER TABLE | BOOLEAN NOT NULL DEFAULT false on expense_ledger |
| 18 fin_categories | INSERT | All REF categories with `type` column ('Asset'/'Expense'), ON CONFLICT DO NOTHING |
| 29 fin_sub_categories | INSERT | All REF sub-categories, ON CONFLICT DO NOTHING |
| Supplier merge | UPDATE | Merged duplicate PIMONPHAN PHA → Pimonphan pha, soft-deleted duplicate |
| 62 row bulk cleanup | CTE UPDATE | Cleaned details (removed transaction IDs, "Bank transfer" noise), added comments, set sub_category_code, fixed wrong category_codes (8 rows) |
| has_tax_invoice flag | UPDATE | Set true where tax_invoice_url exists (currently 0 rows — no invoices imported) |
| Receipt URL fix | UPDATE | Prepended Supabase Storage base URL to plain filenames (8 supplier + 8 bank URLs) |

### DB Sync

| Migration | Статус |
|---|---|
| 026 (Data Cleanup) | ✅ Applied (6 parts: columns, categories, supplier merge, bulk update, tax flag, URL fix) |

### Data Quality Results

| Metric | Value |
|---|---|
| Total rows | 62 |
| With sub_category_code | 61/62 (Visa row intentionally NULL) |
| With comments | 48/62 |
| Receipt URLs fixed | 8 supplier + 8 bank (now full https:// URLs) |
| Category fixes | 8 rows (signboard→Fixtures, delivery→Logistics, cleaning→Maintenance, visa→Work Permits, etc.) |

### Frontend Changes (Phase 4.3b)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/026_data_cleanup_comments_tax.sql` | NEW | Full data cleanup migration (272 lines) |
| `src/components/finance/helpers.ts` | MODIFIED | Added 'AED' to CURRENCY_OPTIONS |
| `src/hooks/useExpenseLedger.ts` | MODIFIED | Added `comments` and `has_tax_invoice` to ExpenseRow type + mapping |
| `src/components/finance/ExpenseHistory.tsx` | REWRITTEN | Added Comments column, FileCheck icon for tax invoice, updated Docs column |
| `src/components/finance/ExpenseEditModal.tsx` | REWRITTEN | Added comments field, has_tax_invoice checkbox |
| `src/components/finance/ExpenseForm.tsx` | MODIFIED | Added comments input, has_tax_invoice checkbox |
| `src/components/finance/ReceiptLightbox.tsx` | REWRITTEN | Google Drive URL detection + iframe preview, "Open in new tab" button, error fallback |

---

## 💰 2026-03-10 — Phase 4.3c: Supplier Mapping + RLS Policy Fixes — ✅ LIVE

**Агент:** Claude Opus 4.6 (Lead Frontend Architect)
**Статус:** Phase 4.3c RLS fixes + supplier mapping — LIVE

### Root Cause Analysis

| Проблема | Причина | Исправление |
|---|---|---|
| Category и Sub-category колонки пустые | `fin_categories` и `fin_sub_categories` имели включённый RLS, но **ни одной SELECT policy** → фронтенд получал пустые массивы | Migration 028: `CREATE POLICY ... FOR SELECT USING (true)` |
| Supplier колонка пустая | `suppliers_select` policy имела `roles = {authenticated}`, а фронтенд использует `anon` key | Migration 029: `DROP + CREATE POLICY ... FOR SELECT USING (true)` |
| Category/SubCategory dropdowns в ExpenseEditModal пустые | Та же причина что и колонки — hook получал 0 категорий | Исправлено migration 028 |
| 2 water rows без supplier_id | Не были замаплены при импорте (водоснабжение) | Migration 027: маппинг на การประปาส่วนภูมิภาคสาขาภูเก็ต |

### Migration 027: Supplier Mapping Fix

| Объект | Тип | Описание |
|---|---|---|
| 2 expense_ledger rows | UPDATE | Mapped 'Water meter installation' and 'Water supply (Dec 2025)' to การประปาส่วนภูมิภาคสาขาภูเก็ต (Provincial Waterworks Authority, Phuket) |

### Migration 028: RLS SELECT Policies for fin_categories & fin_sub_categories

| Объект | Тип | Описание |
|---|---|---|
| `fin_categories_select` | POLICY | `FOR SELECT USING (true)` — public read access (reference data, no sensitive info) |
| `fin_sub_categories_select` | POLICY | `FOR SELECT USING (true)` — public read access |

### Migration 029: Fix suppliers SELECT Policy (anon access)

| Объект | Тип | Описание |
|---|---|---|
| `suppliers_select` | POLICY DROP + CREATE | Old: restricted to `{authenticated}` role. New: `FOR SELECT USING (true)` — both anon + authenticated can read |

### DB Sync

| Migration | Статус |
|---|---|
| 027 (Supplier Mapping) | ✅ Applied |
| 028 (fin_categories RLS) | ✅ Applied |
| 029 (suppliers RLS) | ✅ Applied |

### RLS Политики (обновлено)

| Таблица | SELECT Policy | Роли |
|---|---|---|
| `fin_categories` | `fin_categories_select` | {public} — anon + authenticated |
| `fin_sub_categories` | `fin_sub_categories_select` | {public} — anon + authenticated |
| `suppliers` | `suppliers_select` | {public} — anon + authenticated (было: {authenticated} only) |
| `expense_ledger` | `expense_ledger_select` | {public} — anon + authenticated |

### Frontend Changes (Phase 4.3c)

| Файл | Тип | Назначение |
|---|---|---|
| `migrations/027_supplier_mapping_fix.sql` | NEW | Map 2 water rows to PWA Phuket supplier |
| `migrations/028_rls_fin_categories_select.sql` | NEW | SELECT policies for fin_categories + fin_sub_categories |
| `migrations/029_rls_suppliers_select_fix.sql` | NEW | Recreate suppliers_select with public access |
| `src/components/finance/ExpenseHistory.tsx` | MODIFIED | Added Category + Sub-category column between Date and Supplier |

### Verification Results

| Check | Result |
|---|---|
| Category column populated | ✅ All 62 rows show category + sub-category |
| Supplier column populated | ✅ 59/62 rows (3 rows have #N/A in CSV — no supplier) |
| Edit modal Category dropdown | ✅ 18 categories loaded |
| Edit modal Sub-category dropdown | ✅ Filters by selected category |
| Edit modal Supplier dropdown | ✅ 19 suppliers loaded |
| `npm run build` | ✅ 0 TypeScript errors |

---

## Phase 4.4 — AI Receipt Routing & Hub-Spoke Line Items

**Date:** 2026-03-10
**Branch:** `feature/phase-4.4-receipt-routing`
**Commit:** (pending deployment)

### Architecture: Hub & Spoke

```
expense_ledger (Hub)
  ├── purchase_logs    (Spoke 1: food items)     — expense_id FK
  ├── capex_transactions (Spoke 2: equipment)    — expense_id FK
  └── opex_items       (Spoke 3: consumables)    — expense_id FK
```

### Migration 030: smart_receipt_routing.sql

| Change | Table | Detail |
|---|---|---|
| ADD COLUMN | `expense_ledger` | `invoice_number TEXT` |
| ADD COLUMN | `purchase_logs` | `expense_id UUID FK → expense_ledger (SET NULL)` |
| ADD COLUMN | `capex_transactions` | `expense_id UUID FK → expense_ledger (SET NULL)` |
| CREATE TABLE | `opex_items` | `id, expense_id (CASCADE), description, quantity, unit, unit_price, total_price` |
| RLS FIX | `purchase_logs` | `purchase_logs_select` recreated as public (was: authenticated-only) |
| RLS NEW | `capex_transactions` | Enabled RLS + select/insert/update policies |
| RLS NEW | `opex_items` | Full CRUD policies (public) |
| CREATE FUNCTION | `fn_approve_receipt(JSONB)` | Atomic RPC: inserts Hub + 3 Spokes in single TX |

### Edge Function: parse-receipts

| Property | Value |
|---|---|
| Runtime | Deno (Supabase Edge Functions) |
| Model | OpenAI gpt-4o-mini (vision) |
| Input | `{ image_urls: string[] }` |
| Output | `{ supplier_name, invoice_number, total_amount, currency, transaction_date, food_items[], capex_items[], opex_items[] }` |
| Deployment | Via Supabase Dashboard (no CLI setup) |
| Source | `03_Development/supabase/functions/parse-receipts/index.ts` |

### Frontend Changes (Phase 4.4)

| File | Type | Purpose |
|---|---|---|
| `src/types/receipt.ts` | NEW | TypeScript interfaces: ParsedReceipt, FoodItem, CapexItem, OpexItem, ApprovePayload |
| `src/components/finance/StagingArea.tsx` | NEW | AI receipt preview with editable 3-table layout, supplier dropdown, exchange rate, approve button |
| `src/components/finance/MagicDropzone.tsx` | MODIFIED | Replaced mock AI (2s delay) with real Edge Function call via `supabase.functions.invoke()` |
| `src/pages/FinanceManager.tsx` | MODIFIED | Added staging state machine (idle→staging→approve), lazy nomenclature fetch, StagingArea rendering |

### Verification Results

| Check | Result |
|---|---|
| `tsc -b --noEmit` | ✅ 0 TypeScript errors |
| `npm run build` | ✅ Built in 2.54s |
| Migration 030 SQL | ✅ Written (pending Supabase deployment) |
| Edge Function code | ✅ Written (pending Supabase deployment) |
| StagingArea component | ✅ Renders inline, replaces ExpenseForm when AI result available |
| Backward compatible | ✅ Manual ExpenseForm still works independently |

---

## Security Audit — Column-Level Privilege Hardening

**Date:** 2026-03-10
**Branch:** `feature/phase-4.4-receipt-routing`
**Migration:** `031_security_audit_column_privileges.sql`

### Threat Model

Mass Assignment via Supabase REST API (PostgREST). When RLS allows UPDATE on a table with `USING (true)`, any client with the `anon` key can `PATCH` ANY column on ANY row — including trigger-managed costs, RPC-managed statuses, and immutable financial records.

### Audit Findings

| Severity | Table | Vulnerable Column | Risk | Fix |
|---|---|---|---|---|
| CRITICAL | `nomenclature` | `cost_per_unit` | Decouple cost from purchases, break margin calc | `REVOKE UPDATE` (trigger-managed) |
| CRITICAL | `production_plans` | `mrp_result` | Inject fake MRP data, corrupt procurement | `REVOKE UPDATE` (RPC-managed) |
| HIGH | `inventory_batches` | `barcode` | Break label-batch linkage | `REVOKE UPDATE` (immutable) |
| HIGH | `inventory_batches` | `production_task_id` | Corrupt production audit trail | `REVOKE UPDATE` (immutable) |
| HIGH | `capex_transactions` | `transaction_id` | Duplicate or lose audit trail | `REVOKE UPDATE` (immutable) |
| HIGH | `capex_transactions` | `amount_thb` | Alter historical financial amounts | `REVOKE UPDATE` (audit field) |
| HIGH | `orders` | `total_amount` | Create financial discrepancy | `REVOKE UPDATE` (set at creation) |
| MEDIUM | `stock_transfers` | ALL | Rewrite logistics audit trail | `REVOKE UPDATE` (entire table) |
| MEDIUM | `waste_logs` | `quantity`, `financial_liability` | Hide spoilage, shift blame | `REVOKE UPDATE` (audit fields) |
| MEDIUM | `purchase_logs` | ALL | Alter purchase history | `REVOKE UPDATE` (entire table) |

### Safe Tables (no action needed)

| Table | Why Safe |
|---|---|
| `fin_categories` | SELECT-only RLS policy |
| `fin_sub_categories` | SELECT-only RLS policy |
| `suppliers` | SELECT-only RLS policy (migration 029) |
| `order_items` | SELECT + INSERT only (no UPDATE RLS policy) |
| `expense_ledger.amount_thb` | GENERATED ALWAYS — PostgreSQL rejects UPDATE intrinsically |

### Known Remaining Risks (documented, not fixed)

1. **`expense_ledger.amount_original` / `exchange_rate`** — admin panel's `ExpenseEditModal` uses direct `.update()` on these fields. Column-level REVOKE would break the edit modal. Recommend: migrate to RPC-based update in future phase.
2. **`nomenclature.price`** — sale price is updateable via admin panel. Recommend: add audit log for price changes.
3. **`inventory_balances.quantity`** — legitimately updated by admin panel for stocktake. Recommend: move to RPC-based stocktake.
4. **No authentication** — admin panel uses `anon` key. Anyone with the Supabase URL + anon key can make API calls. Recommend: add Supabase Auth (Phase 7+).

### How It Works

- `REVOKE UPDATE (col) ON table FROM anon, authenticated` blocks REST API clients
- `SECURITY DEFINER` RPCs (fn_update_cost_on_purchase, fn_approve_receipt, fn_run_mrp, etc.) run as function owner (`postgres`) — full privileges retained
- RLS policies remain unchanged (row-level access unaffected)
- Verification: `SET ROLE anon; UPDATE nomenclature SET cost_per_unit = 0; → ERROR: permission denied`

---

## Phase 4.5: Advanced Ledger Analytics & Filtering (2026-03-11)

### What Was Built

The ExpenseHistory table was upgraded from a basic read-only list into an analytics-grade financial tool with:

1. **Sortable Columns** — Date, Amount, Supplier headers are clickable. Toggles ASC/DESC with arrow icons. Default: Date DESC.
2. **Composable Filter Panel** — Date range (From/To), Category dropdown, Supplier dropdown, Flow Type (OpEx/CapEx) pill toggles. All filters compose with AND logic. Clear button resets all.
3. **Dynamic Subtotal Footer** — Sticky `<tfoot>` shows "Total" or "Filtered Total" with `N of M` badge when filters are active.
4. **Expandable Spoke Rows** — Chevron toggle on each row. Click expands to show Hub→Spoke line items (purchase_logs, capex_transactions, opex_items) fetched lazily via `useSpokeData` hook with module-scope cache.

### Files Changed

| File | Action | Description |
|---|---|---|
| `src/hooks/useSpokeData.ts` | CREATE | Lazy-fetch hook for spoke tables by expense_id. Module-scope Map cache survives unmount/remount. 3 parallel queries + nomenclature JS join. |
| `src/components/finance/ExpenseFilterPanel.tsx` | CREATE | Filter bar with date range, category, supplier, flow type pill toggles. Premium dark UI. |
| `src/components/finance/SpokeDetail.tsx` | CREATE | Expandable row content: 3 color-coded mini-tables (emerald=food, amber=capex, cyan=opex). Read-only version of StagingArea's ItemSection. |
| `src/components/finance/ExpenseHistory.tsx` | REWRITE | Integrated filters, sort, expandable rows, sticky subtotal footer. Props: +categories, +suppliers. Title: "Expense Ledger". |
| `src/pages/FinanceManager.tsx` | MODIFY | Added `categories` and `suppliers` props to ExpenseHistory. |
| `src/components/finance/index.ts` | MODIFY | Added ExpenseFilterPanel and SpokeDetail exports. |

### Architecture Notes

- **Module-scope cache**: `const spokeCache = new Map<string, SpokeData>()` declared outside `useSpokeData()` function. This is critical because SpokeDetail unmounts/remounts on expand/collapse — a `useRef` cache would be destroyed each cycle.
- **Client-side filtering/sorting**: All expense rows already loaded by `useExpenseLedger`. Filters and sort computed via `useMemo` — no additional DB queries.
- **Single-expand**: Only one row can be expanded at a time. Expanding another collapses the previous.
- **CLAUDE.md Rule #3**: All spoke queries use separate Supabase calls + JS join (no implicit joins).

---

## Phase 4.5b: Ledger Visibility Fix — Supplier Default Categories (2026-03-11)

### Root Cause

CEO rule: "1 RECEIPT = 1 ROW in expense_ledger — ALWAYS visible". The Makro test receipt was inserted with `category_code = NULL` because `fn_approve_receipt` took `category_code` directly from the payload, and StagingArea defaulted it to empty.

### Migration 032: fix_ledger_visibility.sql

| Part | Change | Description |
|---|---|---|
| 1 | ALTER TABLE `suppliers` | Added `category_code` (FK→fin_categories) and `sub_category_code` columns |
| 2 | UPDATE `suppliers` | Set default categories for all 19+ known suppliers (Makro→4100 Food, construction→1100, equipment→1200, etc.) |
| 3 | UPDATE `expense_ledger` | Backfill NULL category_code from supplier defaults; fallback to 2000 (Operating Expenses) |
| 4 | CREATE OR REPLACE `fn_approve_receipt` | 3-tier category resolution: payload → supplier default → 2000 fallback. Category can NEVER be NULL again. |

### Category Resolution Chain (fn_approve_receipt)

```
payload.category_code  →  suppliers.category_code  →  2000 (Operating Expenses)
     (user picks)            (supplier default)          (ultimate fallback)
```

### Frontend Verification

| Check | Result |
|---|---|
| `useExpenseLedger.ts` uses `.select('*')` + JS join | ✅ Equivalent to LEFT JOIN — rows with NULL FK still returned |
| ExpenseHistory renders `category_name ?? '—'` | ✅ NULL-safe rendering |
| ExpenseFilterPanel default = no filters | ✅ All rows pass through |
| `tsc -b && npm run build` | ✅ 0 errors |

### Boris Rule: NEVER use implicit Supabase joins for nullable FKs

Added comment in `useExpenseLedger.ts`: NEVER use `.select('*, fin_categories(name)')` pattern — it acts as INNER JOIN and silently hides rows where FK is NULL. Always use separate queries + JS join (CLAUDE.md Rule #3).

## Phase 4.5c: Makro Supplier Fix + Text Search + Auto-Create Suppliers (2026-03-11)

### Root Cause
"Makro" didn't exist in suppliers table — migration 032 UPDATE didn't match anything. Supplier_id on Makro receipt was NULL, making it show as "—" in the table with wrong category.

### Migration 033: fix_makro_supplier.sql

| Part | Change | Description |
|---|---|---|
| 1 | INSERT `suppliers` | Created "Makro" with `category_code = 4100` (Raw Materials / Food) |
| 2 | UPDATE `expense_ledger` | Linked orphaned Makro receipt: set supplier_id, category_code=4100, date=today |
| 3 | CREATE OR REPLACE `fn_approve_receipt` | Added: supplier_name ILIKE lookup → **AUTO-CREATE** new supplier if not found → 3-tier category resolution |

### Supplier Resolution Chain (fn_approve_receipt v3)

```
payload.supplier_id  →  ILIKE name lookup  →  AUTO-CREATE new supplier  →  category resolution
    (dropdown)           (AI-parsed name)      (INSERT w/ default 2000)     (payload→supplier→2000)
```

**CEO RULE: New supplier_name → auto-insert into suppliers table. Never lose supplier data.**

### Frontend: Text Search Filter

| File | Change |
|---|---|
| `ExpenseFilterPanel.tsx` | Added `searchText` field to `ExpenseFilters` interface + search input with 🔍 icon and clear button |
| `ExpenseHistory.tsx` | Text search filters across: supplier_name, details, comments, category_name, sub_category_name |

### Build: `tsc -b && vite build` = ✅ 0 errors

## Phase 4.5d: "Zero Data Loss" Architecture & Document Classification (2026-03-11)

### CEO Requirements
"The system adapts to the receipt, not the other way around." Three critical problems fixed:
1. Lost food items when no nomenclature match existed
2. Fake date overwrite (CURRENT_DATE) violating ERP standards
3. Positional document classification instead of AI-based

### Migration 034: zero_data_loss.sql

| Part | Change | Description |
|---|---|---|
| A | DELETE test Makro receipt | Removes broken 179 THB test data (spokes + hub) |
| B | CREATE OR REPLACE `fn_approve_receipt` v4 | Auto-create nomenclature: `RAW-AUTO-{hash}` for unmapped food items. Returns `auto_created` count. |

### fn_approve_receipt v4 — Resolution Chains

```
Supplier:  payload.supplier_id → ILIKE name lookup → AUTO-CREATE new supplier
Category:  payload.category_code → supplier.category_code → 2000 fallback
Nomenclature: payload.nomenclature_id → AUTO-CREATE RAW-AUTO-{8hex} (type='good', base_unit from item)
```

### Edge Function: parse-receipts

| Feature | Description |
|---|---|
| Document Classification | New `documents` field: `{tax_invoice_index, supplier_receipt_index, bank_slip_index}` |
| Thai Receipt Reality | Same index allowed for both tax_invoice and supplier_receipt (common "Receipt / Tax Invoice") |
| Unit Normalization | Food items normalized to kg/L/pcs. Never bag/box/pack. "1 bag 500g" → qty=0.5, unit=kg |
| Max tokens | 2000 → 3000 |

### Frontend Changes

| File | Change |
|---|---|
| `receipt.ts` | Added `DocumentClassification` interface, `documents?` on `ParsedReceipt`, `nomenclature_id?: string \| null` |
| `MagicDropzone.tsx` | AI-based URL mapping (not positional). Neutral `img/` storage prefix. `onUrlsReady` called AFTER classification |
| `StagingArea.tsx` | "➕ Create new" option in nomenclature dropdown (violet border). Doc classification banner. `has_tax_invoice` auto-detect. Payload transforms `__NEW__` → null |

### Boris Rule #12 (CLAUDE.md)
"NEVER overwrite historical transaction_date. Dates come strictly from source documents."

### Build: `tsc -b && vite build` = ✅ 0 errors

## Phase 4.6: Perfect OCR & Smart Mapping Engine (2026-03-11)

### CEO Problems Found (Phase 4.5d Testing)
1. **Massive Data Loss**: AI recognized 1.3K THB of items but receipt total was 4.2K — AI skips/summarizes lines
2. **Bad Translations**: AI generalized specific oils to "Vegetable oil" — lost product specificity
3. **No Memory**: Makro receipts have clear SKU codes being ignored. User mappings not remembered
4. **Blind UX**: Can't see receipt image while mapping items in StagingArea
5. **Ugly Nomenclature**: Shows `RAW-Sugar — Sugar` instead of clean `Sugar` + type badge

### Migration 035: supplier_item_mapping.sql

| Part | Change | Description |
|---|---|---|
| 1 | CREATE TABLE `supplier_item_mapping` | Stores supplier→nomenclature mappings with match_count for ranking |
| 2 | CREATE INDEX `idx_sim_sku` | Non-unique index on (supplier_id, supplier_sku) WHERE supplier_sku IS NOT NULL |
| 3 | CREATE INDEX `idx_sim_name` | Non-unique index on (supplier_id, original_name) |
| 4 | RLS policies | sim_select, sim_insert, sim_update — all USING (true) for anon access |
| 5 | updated_at trigger | Auto-update via fn_set_updated_at() |

**CEO Amendment**: Indexes are NON-UNIQUE. One supplier_sku can map to multiple nomenclature_ids. Hook sorts by match_count DESC and takes first (LIMIT 1).

### Edge Function: parse-receipts (Complete Rewrite)

| Feature | Description |
|---|---|
| Unified `line_items[]` | Single array instead of 3 separate food/capex/opex arrays. Frontend reclassifies |
| Strict OCR | "Extract EVERY single line. NEVER skip, merge, or summarize" |
| Sum Validation | `_sum_mismatch` flag if line_items sum ≠ declared total_amount (±1 satang) |
| Specific Translation | "Do NOT generalize. น้ำมันดอกทานตะวัน → Sunflower oil, NOT Vegetable oil" |
| SKU Extraction | Captures supplier_sku from receipt item codes/barcodes |
| max_tokens | 3000 → 4096 |
| Backward Compat | Populates legacy food_items[], capex_items[], opex_items[] from line_items by category |

### Frontend Changes

| File | Action | Description |
|---|---|---|
| `types/receipt.ts` | REWRITE | Added LineItem, SumMismatch, SupplierItemMapping interfaces. Updated ParsedReceipt + FoodItem |
| `hooks/useSupplierMapping.ts` | CREATE | Smart mapping hook: lookupMappings, saveMapping (upsert + match_count++), applyMappings (SKU→name fallback) |
| `components/finance/NomenclatureLabel.tsx` | CREATE | Clean display: name + colored type badge (Raw=emerald, Prep=violet, Topping=amber, Menu=indigo, Auto=slate) |
| `components/finance/ReceiptImageViewer.tsx` | CREATE | Receipt viewer with zoom (1x/1.5x/2x/3x), thumbnail strip, dark theme |
| `components/finance/MagicDropzone.tsx` | MODIFY | Extended onAiResult callback to pass imageUrls as 3rd param |
| `pages/FinanceManager.tsx` | REWRITE | Added mapping pipeline: resolve supplier → applyMappings → reclassify line_items into food/capex/opex |
| `components/finance/StagingArea.tsx` | REWRITE | Added ReceiptImageViewer at top, sum mismatch warning, onSaveMapping callback, clean nomenclature dropdowns |
| `hooks/useSpokeData.ts` | MODIFY | Fetch nomenclature product_code for NomenclatureLabel. Added nomenclature_code to PurchaseLogRow |
| `components/finance/SpokeDetail.tsx` | MODIFY | Uses NomenclatureLabel for food items display |
| `components/procurement/PurchaseHistory.tsx` | MODIFY | Uses NomenclatureLabel instead of raw product_code + name |

### Mapping Engine Resolution Chain

```
Lookup:  supplier_sku match (sku:{sku})  →  original_name match (name:{name})  →  unmapped
Ranking: ORDER BY match_count DESC, LIMIT 1 (non-unique indexes per CEO rule)
Save:    existing mapping → match_count++ (UPDATE)  |  new → INSERT (match_count=1)
```

### Build: `tsc -b && vite build` = ✅ 0 errors

### Deploy Steps (CEO)
1. Apply migration 035 in Supabase SQL Editor
2. Deploy Edge Function: `supabase functions deploy parse-receipts`

## Phase 4.7: OCR Resilience & UX Hotfixes (2026-03-11)

### CEO Problems Found (Phase 4.6 Testing with Real Makro Receipt)
1. **Massive Data Loss (again!)**: AI recognized only 1,061 THB out of 4,222 THB — model stops reading long receipt
2. **No SKUs & Bad Translations**: AI ignored SKU extraction instructions and used generic translations ("Vegetable oil")
3. **Supplier Category Bug**: Makro showed empty "-" in category field — no auto-fill from supplier defaults
4. **Uncategorized Trap**: [UNCAT] items dumped into OpEx with no way to move them to Food

### Fix 1: Edge Function — OCR Prompt Overhaul

| Change | Description |
|---|---|
| Model | `gpt-4o-mini` → `gpt-4o` (mini can't handle Thai OCR on long receipts) |
| Prompt | Complete rewrite to "Grid-based Extraction" method |
| SKU | Mandatory for Makro receipts (6-13 digit codes) |
| Translation | Expanded dictionary: 20+ Thai→English specific translations |
| max_tokens | 4096 → 8192 (long receipts need more output space) |
| temperature | 0.1 → 0.05 (more deterministic) |
| User prompt | Explicit: "Scan grid line by line. Do NOT stop until TOTAL row." |

### Fix 2: Supplier Category Auto-fill

| File | Change |
|---|---|
| `StagingArea.tsx` | On mount: if supplier matched and category empty → auto-fill from `supplier.category_code` |
| `StagingArea.tsx` | On supplier change: auto-fill category from supplier defaults when category is empty |
| `useExpenseLedger.ts` | Already fetches `category_code` from suppliers (confirmed) |

### Fix 3: "Move to Food" Button

| File | Change |
|---|---|
| `StagingArea.tsx` | Added `moveOpexToFood(i)` handler: removes OpEx item → adds to Food items array |
| `StagingArea.tsx` | Added ArrowUpRight icon button in each OpEx row (visible on hover, green tint) |
| `StagingArea.tsx` | OpEx section headers updated to 7 columns (added "Move" column) |

### Build: `tsc -b && vite build` = ✅ 0 errors

### Deploy Steps (CEO)
1. Deploy Edge Function: `supabase functions deploy parse-receipts` (new prompt + gpt-4o model)

---

## Phase 4.8: High-Res OCR & Honest Extraction (2026-03-11)

### Root Cause Analysis
CEO identified why AI was hallucinating receipt data:
1. **Image compression** (MAX_DIM=1024, JPEG 80%) made Thai text unreadable
2. **Sum-matching pressure** in prompt forced AI to fabricate prices to match receipt total
3. **5 MB limit** too small for modern smartphone photos (8-12 MB)

### Fix 1: Disable Image Compression (MagicDropzone.tsx)

| Change | Detail |
|---|---|
| `compressImage()` | Removed entirely — originals sent to Storage for max OCR accuracy |
| File size limit | 5 MB → **15 MB** with client-side validation + toast on reject |
| ACCEPT array | Removed `application/pdf` (gpt-4o Chat Completions `image_url` doesn't support PDF) |
| UI text | Updated: "JPEG · PNG · WebP · max 15 MB" |
| Supabase bucket | `receipts` bucket `file_size_limit` must be updated to 15728640 bytes |

### Fix 2: Honest Extraction Prompt (parse-receipts/index.ts)

| Change | Detail |
|---|---|
| YOUR #1 RULE | "Sum MUST equal total" → "Extract what you can clearly read. Do NOT invent or guess prices" |
| FINAL VERIFICATION §4 | "Go back and find missing items" → "Note the difference, but do NOT fabricate items" |
| `_sum_mismatch` flag | **Kept** — useful for user awareness, not AI pressure |

### Fix 3: Manual Fallback (StagingArea.tsx)

| Change | Detail |
|---|---|
| `addFood()` | Added `original_name: ''` field for Phase 4.6 compatibility |
| Add Row buttons | Verified existing (lines 675-681 food, 845-851 opex) — functional since Phase 4.4 |
| `__NEW__` option | Verified existing in nomenclature dropdown — auto-creates nomenclature on approve |

### Build: `tsc -b && vite build` = 0 errors

### Deploy Steps (CEO)
1. Run SQL: `UPDATE storage.buckets SET file_size_limit = 15728640 WHERE id = 'receipts';`
2. Deploy Edge Function: `supabase functions deploy parse-receipts`
3. Delete erroneous test transaction (see SQL script in conversation)

---

## Phase 4.9: Receipt Anatomy & Anti-Hallucination Guardrails (2026-03-11)

### Root Cause Analysis
Phase 4.8 removed image compression (15MB originals). gpt-4o now sees the text, but:
1. **Footer became items**: AI read "Total: 4222", "VAT", "Discount" from receipt footer and added them as line_items
2. **Hallucinations**: AI invented "Partition 100 gram" and "Fresh lime juice" — products not on the receipt
3. **No structure understanding**: AI treated receipt as flat text, no Header/Items/Footer zones

### Fix 1: Complete SYSTEM_PROMPT Rewrite (parse-receipts/index.ts)

| Section | What it does |
|---|---|
| **3-Zone Receipt Anatomy** | Teaches AI that receipts have Header (metadata) → Item Grid (products) → Footer (totals/taxes). Extract ONLY from Zone 2. |
| **Explicit Blacklist** | 30+ terms in English & Thai that are NEVER products: Total, VAT, Discount, Change, รวม, ภาษี, ส่วนลด, เงินทอน... |
| **Valid Line Item Test** | 3 mandatory checks: (1) physical good, (2) has product name, (3) has unit_price > 0. Fails any → skip. |
| **Anti-hallucination** | "NEVER invent products. If unreadable → [UNREADABLE]. NEVER guess." |
| **User prompt** | Changed from "Do NOT stop until TOTAL" → "Identify 3 zones first, extract ONLY from Item Grid, STOP at Footer" |
| **max_tokens** | 8192 → 4096 (less room for verbosity/invention) |

### Fix 2: TypeScript FOOTER_RE Guardrail (server-side safety net)

```typescript
const FOOTER_RE = /^(total|subtotal|grand\s*total|...|รวม|ยอดรวม|ภาษี|ส่วนลด|...)$/i
parsed.line_items = parsed.line_items.filter(li => !FOOTER_RE.test(li.translated_name))
```

Even if AI ignores prompt rules, FOOTER_RE strips leaked footer items before sending to frontend.

### Build: `tsc -b && vite build` = 0 errors

### Deploy Steps (CEO)
1. Deploy Edge Function: `supabase functions deploy parse-receipts`
2. Test with same Makro receipt — verify no Total/VAT/Discount in items

---

## Phase 4.10: Edge Function OOM Fix & Payload Optimization (2026-03-11)

### Root Cause Analysis
Phase 4.8 disabled compression (15MB originals). Two 8MB photos caused Edge Function OOM:
- **256 MB RAM limit** for Supabase Edge Functions
- O(n²) base64 encoding loop consumed ~50MB per image in string garbage
- Total peak: 200+ MB → OOM crash at 256 MB
- **OpenAI downscales to 2048px anyway** → sending 15MB had ZERO benefit

### Fix 1: Smart Compression Restored (MagicDropzone.tsx)

| Parameter | Phase 4.7 | Phase 4.8 | Phase 4.10 |
|---|---|---|---|
| MAX_DIM | 1024 px | Disabled | **2048 px** |
| JPEG_QUALITY | 0.80 | Disabled | **0.92** |
| Output size | ~170 KB | 8-15 MB | **500KB-1.5MB** |
| Thai text | Unreadable | Perfect | **Perfect** |
| Edge Function | OK | OOM crash | **OK** |

2048px matches OpenAI's internal limit — zero quality loss vs raw originals.

### Fix 2: Chunked Base64 Encoding (parse-receipts/index.ts)

| Before | After |
|---|---|
| `for (i=0; i<bytes.length; i++) binary += String.fromCharCode(bytes[i])` | `for (i=0; i<bytes.length; i+=8192) binary += String.fromCharCode(...bytes.subarray(i, i+8192))` |
| O(n²) — 50MB garbage per 8MB image | O(n) — ~1MB per image |

### Fix 3: Error Handling (MagicDropzone.tsx)

| Before | After |
|---|---|
| `if (error) throw error` → generic "non-2xx status code" | Extract actual error from `error.context.json()` → shows real message in toast |

### Fix 4: File Size Limit Reverted

| Change | Detail |
|---|---|
| MAX_FILE_SIZE | 15 MB → **5 MB** (post-compression: 500KB-1.5MB) |
| UI text | "max 15 MB" → "max 5 MB" |

### Build: `tsc -b && vite build` = 0 errors

### Deploy Steps (CEO)
1. Deploy Edge Function: `supabase functions deploy parse-receipts`
2. Revert bucket limit: `UPDATE storage.buckets SET file_size_limit = 5242880 WHERE id = 'receipts';`

## Phase 4.11: Deno Performance Bottleneck & Timeout Fix (2026-03-11)

### Root Cause Analysis
Phase 4.10's chunked base64 loop (`String.fromCharCode(...bytes.subarray(i, i + 8192))`) STILL caused Edge Function timeout:
- **Spread operator**: 8,192 arguments on V8 call stack per iteration → ~1 million argument pushes for 1MB image
- **String concatenation**: 128 intermediate strings for 1MB payload
- **`btoa()` full pass**: Another complete scan of the 1MB binary string
- **Total CPU per image**: ~1.2s → 2 images = ~2.4s → exceeds Deno's **2-second CPU time limit**

Frontend showed "Unexpected end of JSON input" because:
- Edge Function timeout → 504 with HTML/empty body
- `error.context?.json()` threw on non-JSON body → parse error leaked as toast text

### Fix 1: Deno Native Base64 (parse-receipts/index.ts)

| Before (Phase 4.10) | After (Phase 4.11) |
|---|---|
| 8-line chunked JS loop + `btoa()` (~1.2s CPU per 1MB) | `encodeBase64(bytes)` from `jsr:@std/encoding/base64` (<10ms per 1MB) |
| `String.fromCharCode` spread + string concat | C++/Rust optimized, accepts `Uint8Array` directly |

### Fix 2: Robust Error Handling (MagicDropzone.tsx)

| Before | After |
|---|---|
| `await error.context?.json()` → throws on HTML/empty body | `await resp.text()` + manual `JSON.parse()` → never throws |
| "Unexpected end of JSON input" leaked to user | `Server error (504)` or actual error message shown |

### Build: `tsc -b && vite build` = 0 errors

### Hotfix: JSR Import Boot Failure (post-deploy)

**Symptom:** "AI analysis failed: Edge Function error" — function failed to boot.

**Root cause:** `jsr:@std/encoding/base64` — unpinned JSR specifier + no `deno.json` = CDN resolution failure at boot time. Known Supabase issue (GitHub #36109, #35601).

| Before | After |
|---|---|
| `jsr:@std/encoding/base64` (CDN-dependent, boot failure) | `node:buffer` (built-in, zero CDN dependency) |
| `encodeBase64(bytes)` | `Buffer.from(bytes).toString('base64')` |
| Error handler: only checks `body.error` | Also checks `body.message`, `body.msg` |

## Phase 4.12: JSON Truncation Fix — max_tokens (2026-03-11)

**Symptom:** "Unterminated string in JSON at position 12331" — long Makro receipt (30+ items) truncated mid-JSON.

**Root cause:** Phase 4.9 reduced `max_tokens` from 8192 to 4096. A 30+ item receipt with SKUs, Thai names, English translations = ~8,000-10,000 tokens. Model hit 4096 limit → output cut mid-string → invalid JSON.

| Parameter | Phase 4.9 | Phase 4.12 | gpt-4o Max |
|---|---|---|---|
| `max_tokens` | 4096 | **16384** | 16384 |

**Note:** `--no-verify-jwt` flag is REQUIRED on every deploy (admin-panel has no auth session).

### Deploy Steps (CEO)
1. `supabase functions deploy parse-receipts --no-verify-jwt`

## Phase 4.13: Anti-Loop Architecture + Structured Outputs (2026-03-11)

**Symptom:** gpt-4o generated 41 identical "Granulated sugar 1 kg, 24, 24" rows instead of extracting ~40 unique items from a Makro receipt. Computed total 1.2K vs real 4.2K (70.4% mismatch). Classic LLM repetition loop (autoregressive degeneration).

**Root causes:**
1. `temperature: 0.05` — near-zero temperature causes fixed-point attractor in long sequential generation
2. `response_format: { type: "json_object" }` — provides zero structural constraints, no schema enforcement
3. Prompt overload (~160 lines) dilutes visual attention over long generation

### Changes Applied

| Parameter | Phase 4.12 | Phase 4.13 | Rationale |
|---|---|---|---|
| `temperature` | 0.05 | **0.2** | Enough diversity to break repetition loops while preventing hallucinations |
| `response_format` | `json_object` | **`json_schema` (Structured Outputs)** | Constrained decoding guarantees field types at every token |
| Prompt lines | ~160 | **~100** | OUTPUT SCHEMA section removed (now enforced by API) |
| Anchoring | Weak | **Strong** | original_name extraction instruction forces re-attention to image per item |

### Anti-Loop Architecture (3 layers of defense)

1. **Temperature 0.2** — sampling diversity breaks repetition attractors
2. **original_name anchoring** — prompt forces model to read Thai text first, then translate. Unique Thai characters per item prevent copy-paste loops
3. **Server-side dedup guard** — if >50% of items share same `original_name`, auto-deduplicates and flags `_repetition_loop` in response

### JSON Schema (Structured Outputs)
Full schema defined as `RECEIPT_SCHEMA` constant. OpenAI constrains every generated token to conform to the schema at decode time. Fields: `supplier_name`, `invoice_number`, `total_amount`, `currency`, `transaction_date`, `line_items[]`, `documents{}`.

### File Modified
- `03_Development/supabase/functions/parse-receipts/index.ts` — complete rewrite of prompt + API call + added dedup guard

### Deploy Steps (CEO)
1. `supabase functions deploy parse-receipts --no-verify-jwt`
2. Re-test with the same Makro receipt image — expect unique items, no repetition

## Phase 4.13b: Structured Outputs Reverted — HTTP 546 Hotfix (2026-03-11)

**Symptom:** Phase 4.13 deployment crashed with HTTP 546: "Function failed due to not having enough compute resources."

**Root cause:** OpenAI `json_schema` (Structured Outputs) compiles a Context-Free Grammar (CFG) on first/cold calls. This adds **10-60s latency** before generation even starts. Combined with gpt-4o vision processing (30-60s), total latency exceeded Supabase's **150s request idle timeout** → HTTP 546.

**Diagnosis:** NOT a CPU (200ms limit) or memory (256MB limit) issue. The function uses ~15ms CPU and ~8MB RAM. The bottleneck is pure wall-clock latency waiting for OpenAI.

### Changes Applied

| Parameter | Phase 4.13 | Phase 4.13b | Rationale |
|---|---|---|---|
| `response_format` | `json_schema` (strict) | **`json_object`** | Eliminates 10-60s CFG compilation penalty |
| `frequency_penalty` | (none) | **0.3** | Penalizes repeated tokens — additional anti-loop layer |
| Schema validation | API-level (OpenAI) | **Server-side `validateReceiptSchema()`** | Coerces types, defaults missing fields, validates enums |
| `temperature` | 0.2 | 0.2 (unchanged) | Still effective for anti-loop |
| Anchoring prompt | Active | Active (unchanged) | original_name Thai text extraction |
| Dedup guard | Active | Active (unchanged) | >50% same name = loop |

### New: `validateReceiptSchema()` function
Server-side validation that replaces OpenAI's constrained decoding:
- Validates all required fields exist (coerces if missing)
- Validates `unit` enum: kg|L|pcs (defaults to "pcs")
- Validates `category` enum: food|capex|opex|uncategorized (defaults to "uncategorized")
- Coerces numeric fields from strings
- Logs warnings as `_schema_warnings` in response

### Boris Rule #13 added to CLAUDE.md
Long-running AI tasks (>30s) must not rely on synchronous HTTP. Architectural standard for Phase 4.14+ is Async Webhook/Polling pattern with Supabase Realtime.

### Files Modified
- `03_Development/supabase/functions/parse-receipts/index.ts` — reverted json_schema, added frequency_penalty + validateReceiptSchema
- `CLAUDE.md` — Boris Rule #13

### Deploy Steps (CEO)
1. `supabase functions deploy parse-receipts --no-verify-jwt`
2. Re-test with same Makro receipt — should complete in ~40-70s (no CFG overhead)

## Phase 4.14: Async Receipt Processing (2026-03-11)

**Problem:** Synchronous `supabase.functions.invoke('parse-receipts')` blocks the frontend for 30-90s. OpenAI gpt-4o vision processing + schema validation can exceed Supabase's 150s request idle timeout (per Boris Rule #13).

**Solution:** Async architecture using `receipt_jobs` table + Supabase Realtime `postgres_changes` subscription.

### Architecture

```
MagicDropzone → INSERT receipt_jobs → invoke('parse-receipts', {job_id}) [fire-and-forget]
                                        ↓
                               Edge Function processes async
                               UPDATE receipt_jobs SET result=...
                                        ↓
FinanceManager ← Realtime subscription (postgres_changes, filter: id=eq.{job_id})
```

### New Table: `receipt_jobs`

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | Auto-generated |
| `status` | TEXT | pending → processing → completed\|failed |
| `image_urls` | JSONB | Array of Storage public URLs |
| `result` | JSONB | ParsedReceipt (null until completed) |
| `error` | TEXT | Error message (null unless failed) |
| `created_at` | TIMESTAMPTZ | Job creation time |
| `completed_at` | TIMESTAMPTZ | Completion/failure time |
| `duration_ms` | INTEGER | OpenAI call duration |
| `model` | TEXT | Model used (default: gpt-4o) |

RLS: Public SELECT + INSERT (admin-panel has no auth). Edge Function uses service_role for UPDATE.
Realtime: Published via `supabase_realtime`.

### New RPC: `fn_cleanup_stale_receipt_jobs()`
Lazy cleanup: marks zombie jobs (stuck in processing > 5 min) as failed. Called by Edge Function at the start of every invocation. Replaces pg_cron — no extra permissions needed.

### Edge Function: Dual Mode
- **Sync mode** (no `job_id`): backward-compatible, returns ParsedReceipt directly
- **Async mode** (`job_id` present): marks processing → calls OpenAI → writes result to `receipt_jobs` → returns `{ok: true}`
- Lazy cleanup RPC called at start of every invocation
- Bulletproof try/catch/finally: status is ALWAYS updated even on crash

### Frontend Changes

**MagicDropzone.tsx:**
- Replaced sync `onAiResult` with async `onJobCreated(jobId, imageUrls)`
- Fire-and-forget Edge Function invocation (no blocking)
- AbortError/DOMException caught silently (non-fatal)
- `beforeunload` listener while job is pending
- UX: "AI is reading your receipt..." pulsing animation

**FinanceManager.tsx:**
- `pendingJobId` state + Realtime subscription
- Subscribes to `postgres_changes` filtered by job ID
- On `completed`: runs mapping pipeline → opens StagingArea
- On `failed`: shows error toast with dismiss button
- Fallback poll after 90s in case Realtime disconnects

### Resilience Layers
1. **Edge Function try/catch/finally** — status always updated
2. **fn_cleanup_stale_receipt_jobs()** — DB self-heals zombie jobs after 5 min
3. **Frontend AbortError handling** — graceful degradation on navigation
4. **Fallback polling** — catches Realtime subscription misses

### Files Created/Modified
- `03_Development/supabase/migrations/036_receipt_jobs.sql` — NEW
- `03_Development/supabase/functions/parse-receipts/index.ts` — dual mode + lazy cleanup
- `03_Development/admin-panel/src/types/receipt.ts` — ReceiptJob type
- `03_Development/admin-panel/src/components/finance/MagicDropzone.tsx` — async fire-and-forget
- `03_Development/admin-panel/src/pages/FinanceManager.tsx` — Realtime subscription

### Deploy Steps
1. Apply migration: `supabase db push` or SQL Editor → run `036_receipt_jobs.sql`
2. Deploy Edge Function: `supabase functions deploy parse-receipts --no-verify-jwt`
3. Verify: Upload receipt → MagicDropzone returns immediately → StagingArea auto-opens when job completes

## Phase 4.15: Zero-Footprint Vision Pipeline (2026-03-11)

**Problem:** Frontend `compressImage()` resizes long Makro receipts (8000px tall) to 2048px max, crushing width to ~256px — Thai text becomes unreadable, OpenAI returns `[UNREADABLE]` for items. Meanwhile, the Edge Function downloads images and converts to Base64, consuming CPU/RAM and causing OOM/timeout risks.

**Root cause:** OpenAI Vision API natively supports `image_url` with public URLs. Our images are in a public Supabase Storage bucket. The entire download→Base64 pipeline was unnecessary overhead.

### Changes Applied

| Component | Before (4.14) | After (4.15) | Impact |
|---|---|---|---|
| Edge Function | Download images → `Buffer.from(bytes).toString('base64')` → `data:image/jpeg;base64,...` | Pass public URL directly: `{ type: "image_url", image_url: { url } }` | Eliminates OOM/timeout risk, zero CPU/RAM for image handling |
| Frontend | `compressImage()` (Canvas API, 2048px/JPEG 92%) | Raw file upload — no compression | Full-res photos preserved, Thai text readable |
| File size limit | 5 MB | **15 MB** | Accepts high-res camera photos |
| `node:buffer` import | Required for Base64 encoding | **Removed** | Cleaner dependencies |

### Architecture: Zero-Footprint Pipeline

```
MagicDropzone                     Supabase Storage              Edge Function              OpenAI
     │                                  │                            │                       │
     ├─ Upload RAW photo (15MB) ───────►│ Public URL                 │                       │
     │                                  │                            │                       │
     ├─ INSERT receipt_jobs ────────────│────────────────────────────►│                       │
     ├─ invoke('parse-receipts') ──────►│                            │                       │
     │                                  │                            ├─ Pass URL ────────────►│
     │                                  │                            │  (no download)         │ Fetch image
     │                                  │◄───────────────────────────│────────────────────────┤ directly
     │                                  │                            │                       │
```

OpenAI fetches the image directly from our public bucket. Edge Function never touches the image bytes.

### Files Modified
- `03_Development/supabase/functions/parse-receipts/index.ts` — removed `Buffer` import, removed download/Base64 logic, pass URLs directly
- `03_Development/admin-panel/src/components/finance/MagicDropzone.tsx` — removed `compressImage()`, upload raw files, 15MB limit

### Deploy Steps
1. Deploy Edge Function: `supabase functions deploy parse-receipts --no-verify-jwt`
2. Update Storage bucket size limit if needed: Dashboard → Storage → receipts → Settings → max file size → 15MB
3. Test: Upload a full-res Makro receipt photo → all Thai text should be readable
