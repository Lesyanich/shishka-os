# PLAN: Cloud Infrastructure — DB Schema (Shishka Healthy Kitchen)
**Slug:** `cloud-infra-schema`  
**Агент:** Lead Backend Developer  
**Дата:** 2026-03-07  
**Статус:** 🟡 Ожидает подтверждения

---

## Контекст

Суpabase-проект существует и содержит legacy-данные. Необходимо **расширить** схему (не удалять) для трёх модулей:
1. **KDS** (Kitchen Display System) — уже частично реализован
2. **Maintenance** (сервисные циклы оборудования)
3. **CapEx Analytics** (финансовый ROI для активов)

А также исправить нарушения `gemini.md` (DATA INTEGRITY RULES).

---

## 🚨 Критические Проблемы (требуют решения ДО новых таблиц)

| # | Таблица | Проблема | Решение |
|---|---------|----------|---------|
| 1 | `equipment` | `id` = TEXT | Добавить `syrve_uuid` UUID, сохранить `id` как `code` (alias) |
| 2 | `daily_plan` | `id` = INTEGER | Добавить `uuid` поле, мигрировать FK-ссылки |
| 3 | `products` | PK = `code` TEXT | Добавить `id` UUID как новый PK, `code` становится UNIQUE |

> ⚠️ **Стратегия:** НЕ дропаем таблицы. Добавляем поля через `ALTER TABLE`, переводим FK поэтапно.

---

## Предлагаемые Изменения

### Migration 001 — Fix Data Integrity (equipment, products, daily_plan)
```
03_Development/supabase/migrations/001_fix_uuid_compliance.sql
```
- `products`: ADD COLUMN `id uuid DEFAULT gen_random_uuid()`, SET PK
- `equipment`: ADD COLUMN `syrve_uuid uuid`, rename `id` → `code` (TEXT, UNIQUE)
- `daily_plan`: ADD COLUMN `uuid uuid DEFAULT gen_random_uuid()`

### Migration 002 — SYRVE Nomenclature Layer
```
03_Development/supabase/migrations/002_nomenclature.sql
```
Новые таблицы:
- `nomenclature_groups` — группы продуктов из SYRVE (UUID PK)
- `nomenclature_categories` — категории продуктов из SYRVE (UUID PK)
- `nomenclature_sizes` — размеры из SYRVE (UUID PK)
- `nomenclature_prices` — цены (привязаны к size + product)

### Migration 003 — Maintenance Module
```
03_Development/supabase/migrations/003_maintenance.sql
```
Новые таблицы:
- `maintenance_schedules` — плановые сервисные циклы
- `maintenance_logs` — история выполненных сервисов

### Migration 004 — CapEx Analytics Module
```
03_Development/supabase/migrations/004_capex.sql
```
Новые таблицы:
- `capex_assets` — активы (оборудование + стоимость)
- `capex_roi_snapshots` — снапшоты ROI по периодам

---

## Вопросы, требующие ответа до начала работы

1. **Стратегия миграции данных:** Существующие 64 задачи в `production_tasks` ссылаются на `daily_plan.id` (INTEGER). При добавлении UUID-поля нужно ли обновлять FK? Или оставить `INTEGER` как legacy-ключ и добавить UUID как отдельный идентификатор?

2. **CapEx данные:** Файл `Capex Eqiupment - Capex.csv` указан как источник, но на диске он не найден (Google Sheet). Нужно ли ждать экспорта CSV или начать с пустой схемой и заполнить данные позже?

3. **equipment.id:** Текущие значения — это человекочитаемые коды (`oven_1`, `fermentation_tank`). Их нужно сохранить как `code` (для UX) и добавить `syrve_uuid` для SYRVE-синхронизации. Согласны?

---

## План Верификации

### Автоматическая (через Supabase MCP)
После каждой миграции:
```sql
-- Проверить наличие UUID полей
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = '{table}' AND column_name = 'id';

-- Проверить RLS
SELECT * FROM pg_policies WHERE tablename = '{table}';
```

### Ручная
1. Запустить Supabase Studio → убедиться, что данные не удалены
2. Проверить FK-constraints через Table Editor
