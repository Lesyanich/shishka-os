# Database Architecture v1 — Shishka Healthy Kitchen
**Автор:** Lead Backend Developer  
**Дата:** 2026-03-07  
**Версия:** 1.0  
**Проект Supabase:** `qcqgtcsjoacuktcewpvo`

---

## 📖 Содержание

1. [Bottleneck Management — Управление узкими местами](#1-bottleneck-management)
2. [Maintenance Integration — Техническое обслуживание](#2-maintenance-integration)
3. [SYRVE Integration — Синхронизация номенклатуры](#3-syrve-integration)
4. [CapEx Link — Связь расходов с оборудованием](#4-capex-link)
5. [Полная ERD схема связей](#5-erd-схема)

---

## 1. Bottleneck Management

### Концепция

Каждая единица оборудования имеет `capacity_value` — максимальную нагрузку в одновременных единицах (напр., 10 GN-лотков в конвектомате). Система должна **в реальном времени** не допускать превышения этого лимита.

### Модель данных

```
equipment
├── code          TEXT  UNIQUE         ← человекочитаемый ID ('convecat_1')
├── syrve_uuid    UUID  NULLABLE       ← UUID для синхронизации с SYRVE
├── name          TEXT                 ← 'Конвектомат Roller Grill'
├── capacity_value NUMERIC            ← 10 (единиц одновременно)
├── capacity_unit  TEXT               ← 'gn_tray' | 'kg' | 'liter' | 'slot'
├── daily_availability_min INTEGER    ← 480 (8ч * 60мин)
├── is_bottleneck  BOOLEAN            ← true если узкое место схемы
└── status         TEXT               ← 'available' | 'maintenance' | 'offline'
```

```
production_tasks
├── id              UUID  PK
├── equipment_id    TEXT  FK→equipment.code
├── capacity_used   NUMERIC             ← сколько capacity_value занимает эта задача
├── status          TEXT                ← 'pending'|'in_progress'|'completed'|'blocked'
└── depends_on_task_id UUID FK→self    ← DAG зависимостей задач
```

### Логика Real-Time Constraint

```sql
-- Функция: проверить, не превысит ли новая задача capacity оборудования
CREATE OR REPLACE FUNCTION check_equipment_capacity(
  p_equipment_code TEXT,
  p_time_start     TIMESTAMPTZ,
  p_time_end       TIMESTAMPTZ,
  p_capacity_needed NUMERIC
) RETURNS BOOLEAN AS $$
DECLARE
  v_max_capacity  NUMERIC;
  v_used_capacity NUMERIC;
BEGIN
  SELECT capacity_value INTO v_max_capacity 
  FROM equipment WHERE code = p_equipment_code;

  SELECT COALESCE(SUM(capacity_used), 0) INTO v_used_capacity
  FROM production_tasks
  WHERE equipment_id = p_equipment_code
    AND status IN ('pending', 'in_progress')
    AND actual_start < p_time_end
    AND (actual_end IS NULL OR actual_end > p_time_start);

  RETURN (v_used_capacity + p_capacity_needed) <= v_max_capacity;
END;
$$ LANGUAGE plpgsql;
```

### Поток данных (KDS Real-Time)

```
Telegram Bot / TWA App
        │
        ▼
   set_request_context()  ← устанавливает app.tg_user_id
        │
        ▼
production_tasks (Supabase Realtime)
  ├── INSERT → проверка capacity через trigger
  ├── UPDATE status → уведомление через Realtime channel
  └── SELECT → отфильтровано по station/equipment
        │
        ▼
Суpabase Realtime → KDS Display (Telegram Mini App)
```

### Правило Bottleneck Блокировки

Если `is_bottleneck = true` для `equipment`, то:
1. При создании `production_task.status` = `'pending'` (не 'in_progress')
2. Планировщик проверяет свободную `capacity_value` через `check_equipment_capacity()`
3. Если capacity превышена → task.status = `'blocked'`, создаётся запись в `warnings`

---

## 2. Maintenance Integration

### Требования из CapEx данных

CapEx-файл содержит оборудование с расписанием обслуживания:
- **Ежедневно:** промывка, протирка контактных поверхностей
- **Еженедельно:** глубокая чистка, смазка механизмов
- **Ежемесячно:** технический осмотр, замена фильтров
- **Квартально / Годично:** сервис от поставщика

### Новые Таблицы (Migration 003)

#### `maintenance_schedules`
```sql
CREATE TABLE maintenance_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_code  TEXT NOT NULL REFERENCES equipment(code),
  task_type       TEXT NOT NULL,  -- 'cleaning' | 'lubrication' | 'inspection' | 'vendor_service'
  frequency       TEXT NOT NULL,  -- 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  interval_days   INTEGER,        -- альтернатива frequency для произвольного интервала
  estimated_min   INTEGER,        -- ожидаемое время на обслуживание
  instructions    TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `maintenance_logs`
```sql
CREATE TABLE maintenance_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     UUID REFERENCES maintenance_schedules(id),
  equipment_code  TEXT NOT NULL REFERENCES equipment(code),
  task_type       TEXT NOT NULL,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by    BIGINT,         -- tg_user_id исполнителя
  duration_min    INTEGER,
  result          TEXT NOT NULL,  -- 'done' | 'skipped' | 'issue_found'
  notes           TEXT,
  next_due_at     TIMESTAMPTZ GENERATED ALWAYS AS (
    performed_at + (interval_days || ' days')::interval
  ) STORED                        -- автовычисление следующей даты
);
```

### Интеграция с production_tasks

Технические задачи по обслуживанию создаются в `production_tasks` с особым типом:

```sql
-- В production_tasks добавить поле:
ALTER TABLE production_tasks 
  ADD COLUMN task_category TEXT DEFAULT 'production' 
  CHECK (task_category IN ('production', 'maintenance', 'cleaning'));

ALTER TABLE production_tasks
  ADD COLUMN maintenance_log_id UUID REFERENCES maintenance_logs(id);
```

Так KDS отображает **и производственные, и технические задачи** в одном потоке.

### Логика Автогенерации Задач обслуживания

```
Cron Job (pg_cron / Edge Function, запуск 06:00 каждый день):
1. SELECT schedules, где next_due_at <= today
2. INSERT в production_tasks (task_category = 'maintenance')
3. Уведомление ответственному через Telegram Bot
```

---

## 3. SYRVE Integration

### Принцип

SYRVE — **единственный источник правды** для номенклатуры. Supabase хранит **локальную копию** + расширенные поля (инструкции, фото, flow).

### Правило UUID (P0 из gemini.md)

```
❌ ЗАПРЕЩЕНО: products.syrve_id = NULL и работа только с code
✅ ОБЯЗАТЕЛЬНО: products.syrve_id = UUID из SYRVE API
✅ ОБЯЗАТЕЛЬНО: nomenclature_groups.id = UUID из SYRVE
✅ ОБЯЗАТЕЛЬНО: nomenclature_categories.id = UUID из SYRVE
```

### Новые Таблицы (Migration 002)

#### `nomenclature_groups`
```sql
CREATE TABLE nomenclature_groups (
  id              UUID PRIMARY KEY,           -- UUID из SYRVE (parentGroup)
  code            TEXT,                       -- SKU из SYRVE
  name            TEXT NOT NULL,
  parent_group_id UUID REFERENCES nomenclature_groups(id),  -- иерархия
  is_included_in_menu BOOLEAN NOT NULL DEFAULT false,
  is_group_modifier   BOOLEAN NOT NULL DEFAULT false,
  is_deleted      BOOLEAN NOT NULL DEFAULT false,
  order_priority  INTEGER DEFAULT 0,
  synced_at       TIMESTAMPTZ,               -- последняя синхронизация с SYRVE
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `nomenclature_categories`
```sql
CREATE TABLE nomenclature_categories (
  id          UUID PRIMARY KEY,              -- UUID из SYRVE (productCategoryId)
  name        TEXT NOT NULL,
  is_deleted  BOOLEAN NOT NULL DEFAULT false,
  synced_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `nomenclature_products` (заменяет/расширяет `products`)

```sql
-- Стратегия: НЕ удаляем products, создаём nomenclature_products как мастер-таблицу
CREATE TABLE nomenclature_products (
  id                  UUID PRIMARY KEY,     -- syrve_id = теперь настоящий PK
  code                TEXT UNIQUE,          -- SKU ('SOUP-01') — для совместимости
  name                TEXT NOT NULL,
  group_id            UUID REFERENCES nomenclature_groups(id),
  category_id         UUID REFERENCES nomenclature_categories(id),
  type                TEXT NOT NULL DEFAULT 'good'
                      CHECK (type IN ('good','dish','modifier','modifier_group','service')),
  measure_unit        TEXT,                 -- 'kg' | 'liter' | 'piece'
  fat_per_100g        NUMERIC,
  protein_per_100g    NUMERIC,
  carbs_per_100g      NUMERIC,
  energy_per_100g     NUMERIC,
  weight              NUMERIC,
  is_deleted          BOOLEAN NOT NULL DEFAULT false,  -- SOFT DELETE
  splittable          BOOLEAN NOT NULL DEFAULT false,
  image_links         TEXT[],               -- массив URL
  synced_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `nomenclature_sizes`
```sql
CREATE TABLE nomenclature_sizes (
  id          UUID PRIMARY KEY,             -- UUID из SYRVE
  name        TEXT,
  priority    INTEGER,
  is_default  BOOLEAN NOT NULL DEFAULT false
);
```

#### `nomenclature_prices`
```sql
CREATE TABLE nomenclature_prices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES nomenclature_products(id),
  size_id             UUID REFERENCES nomenclature_sizes(id),
  current_price       NUMERIC NOT NULL,
  is_included_in_menu BOOLEAN NOT NULL DEFAULT false,
  next_price          NUMERIC,               -- запланированная цена
  next_date_price     TIMESTAMPTZ,           -- дата вступления в силу
  synced_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Поток SYRVE Синхронизации

```
SYRVE Cloud API /api/1/nomenclature
       │  (POST, organizationId)
       ▼
Edge Function: sync-nomenclature
  1. Fetch groups[] → UPSERT nomenclature_groups (by UUID)
  2. Fetch categories[] → UPSERT nomenclature_categories (by UUID)
  3. Fetch products[] → UPSERT nomenclature_products (by UUID)
  4. Fetch sizes[] & prices[] → UPSERT nomenclature_sizes, nomenclature_prices
  5. Soft-delete: SET is_deleted=true для UUID, которых нет в ответе API
  6. Log: INSERT в maintenance_logs (type='syrve_sync')
      │
      ▼
Supabase (Single Source of Engagement)
  nomenclature_products → FK→ products (через products.syrve_id JOIN)
```

---

## 4. CapEx Link

### Концепция

Каждая единица оборудования в `equipment` должна иметь **финансовый паспорт** с историей расходов. Это позволяет считать ROI: стоимость актива vs. доход, который он генерирует.

### Новые Таблицы (Migration 004)

#### `capex_assets`
```sql
CREATE TABLE capex_assets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_code      TEXT UNIQUE REFERENCES equipment(code),  -- 1:1 связь
  asset_name          TEXT NOT NULL,
  vendor              TEXT,
  purchase_date       DATE NOT NULL,
  purchase_price_thb  NUMERIC NOT NULL,    -- цена в батах
  warranty_until      DATE,
  depreciation_years  INTEGER DEFAULT 5,   -- срок амортизации
  residual_value_thb  NUMERIC DEFAULT 0,
  capex_category      TEXT,               -- 'kitchen_equipment' | 'furniture' | 'it'
  is_active           BOOLEAN NOT NULL DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `capex_transactions`
```sql
CREATE TABLE capex_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      TEXT UNIQUE NOT NULL,  -- Transaction_ID из CapEx.csv (исходный ID)
  asset_id            UUID REFERENCES capex_assets(id),
  transaction_date    DATE NOT NULL,
  amount_thb          NUMERIC NOT NULL,
  transaction_type    TEXT NOT NULL 
                      CHECK (transaction_type IN ('purchase','repair','maintenance_cost','upgrade')),
  vendor              TEXT,
  invoice_number      TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `capex_roi_snapshots`
```sql
CREATE TABLE capex_roi_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID NOT NULL REFERENCES capex_assets(id),
  snapshot_month  DATE NOT NULL,           -- первый день месяца (2026-03-01)
  total_cost_thb  NUMERIC NOT NULL,        -- накопленные расходы на дату
  revenue_attr_thb NUMERIC DEFAULT 0,      -- условный доход (ручной ввод или расчёт)
  roi_percent     NUMERIC GENERATED ALWAYS AS (
    CASE WHEN total_cost_thb > 0 
    THEN ((revenue_attr_thb - total_cost_thb) / total_cost_thb * 100)
    ELSE 0 END
  ) STORED,
  depreciation_thb NUMERIC,               -- месячная амортизация
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, snapshot_month)
);
```

### Поток CapEx Данных

```
Capex.csv / Google Sheet
     │  (ручной/автоматический импорт)
     ▼
Edge Function: import-capex-transactions
  1. Валидация Transaction_ID (уникальность)
  2. Матчинг на equipment через asset_name/vendor
  3. UPSERT capex_transactions
  4. Обновление capex_assets (накопленная стоимость)
     │
     ▼
Scheduled Function (1-е число каждого месяца):
  → INSERT capex_roi_snapshots (по каждому активу)
     │
     ▼
Dashboard (Supabase + Next.js/Retool):
  → ROI по единицам оборудования
  → Суммарный CapEx vs. Выручка
```

### Связь Transaction_ID с equipment

```sql
-- Запрос ROI по конкретному оборудованию:
SELECT 
  e.code AS equipment_code,
  e.name AS equipment_name,
  ca.purchase_price_thb,
  SUM(ct.amount_thb) AS total_maintenance_cost,
  cr.roi_percent,
  cr.snapshot_month
FROM equipment e
JOIN capex_assets ca ON ca.equipment_code = e.code
LEFT JOIN capex_transactions ct ON ct.asset_id = ca.id
LEFT JOIN capex_roi_snapshots cr ON cr.asset_id = ca.id
WHERE cr.snapshot_month = date_trunc('month', now())
GROUP BY e.code, e.name, ca.purchase_price_thb, cr.roi_percent, cr.snapshot_month;
```

---

## 5. ERD Схема

```
                    SYRVE Cloud API
                          │
              ┌───────────▼───────────┐
              │   nomenclature_        │
              │   groups               │
              │   categories           │
              │   products  ◄──────────┼─── nomenclature_sizes
              │   prices               │         │
              └───────────┬───────────┘    nomenclature_prices
                          │ syrve_id
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SUPABASE (публичная схема)                   │
│                                                                  │
│   products ◄─────────────── daily_plan ◄──── production_tasks   │
│   (code TEXT, syrve_id UUID)     │                │              │
│                                  │                │              │
│   recipes_flow ──────────────────┘                │              │
│   (production steps)                              │              │
│                                                   │              │
│   equipment ◄─────────────────────────────────────┘              │
│   (code TEXT, syrve_uuid UUID)                    │              │
│        │                                          │              │
│        │ 1:1                                      │              │
│        ▼                                     warnings            │
│   capex_assets                                                   │
│        │                                                         │
│        ├── capex_transactions (Transaction_ID)                   │
│        └── capex_roi_snapshots (monthly)                         │
│                                                                  │
│   maintenance_schedules ──► maintenance_logs                     │
│        │                         │                               │
│        └── equipment             └── production_tasks            │
│                                      (task_category='maintenance')│
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Ключевые Правила (Summary)

| Правило | Описание |
|---------|----------|
| UUID FIRST | Все `id` из SYRVE хранятся как `uuid`. `equipment.code` — TEXT только для UX |
| SOFT DELETE | `is_deleted = true`, никогда не `DELETE` для SYRVE-данных |
| SYRVE MASTER | При конфликте данных — SYRVE выигрывает. Supabase только расширяет |
| CAPACITY LOCK | Задача не переходит в `in_progress`, если capacity equipment превышена |
| MAINTENANCE FIRST | Задачи обслуживания имеют приоритет над производственными на KDS |
| TRANSACTION LINK | Каждый capex_transaction привязан к `equipment.code` через `capex_assets` |

---
*Документ создан автоматически. Следующая версия: `Database_Architecture_v2.md` после утверждения миграций.*
