# Ответы COO на Socratic Gate — Phase A

> Скопировать в Claude Code как ответ на вопросы

## 1. Scope: Только Phase A

Да, берём только Phase A: Foundation. Остальные фазы — отдельные MC-задачи.

## 2. DB миграции — ИСПОЛЬЗУЙ check_migrations()

**Boris Rule #16 нарушен.** Прежде чем спрашивать CEO "какие колонки существуют" — вызови `check_migrations()` через свой MCP (Mission Control). Этот инструмент у тебя ЕСТЬ. Миграция 094 создала `migration_log` и засеяла все 83+ миграций. Вызови — и увидишь что applied, что pending.

Для текущей схемы — прочитай `vault/Architecture/Database Schema.md` или `docs/domain/db-schema-summary.md`. Не спрашивай CEO о технических деталях БД.

**Миграция:** одна файл **095_kitchen_ux_v2_foundation.sql**. Включает:

```
-- production_tasks additions:
assigned_to UUID REFERENCES staff(id)
actual_start TIMESTAMPTZ
actual_end TIMESTAMPTZ
actual_weight NUMERIC
actual_temperature NUMERIC
notes TEXT

-- staff additions:
pin TEXT
preferred_language TEXT
skill_level INTEGER DEFAULT 1 CHECK (skill_level BETWEEN 1 AND 4)

-- nomenclature addition:
shelf_life_days INTEGER

-- recipes_flow addition:
min_skill_level INTEGER DEFAULT 1 CHECK (min_skill_level BETWEEN 1 AND 4)

-- New table: batches (full schema in spec section 11.4)
-- New table: cook_feedback (spec section 6.1) — создай сразу, пригодится в Phase C

-- New function: fn_generate_batch_code(nomenclature_id UUID, production_date DATE)
-- Returns short code like "BC-0405-01" (first 2 chars of product_code + date + daily sequence)

-- batches extra columns:
photo_url TEXT
photo_skipped_reason TEXT

-- Self-register:
INSERT INTO migration_log (filename, applied_by, checksum) VALUES (...)
```

Проверь через `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` что колонки ещё не добавлены. Некоторые (actual_weight, notes) могли быть добавлены ранее.

## 3. /kitchen page — баг в UI, НЕ в DB

Ошибка `shift_tasks.shift does not exist` — баг в `useKitchenDashboard.ts:72`:
```ts
.select('... shift:shifts!shift_id(staff_id, staff(name, role)) ...')
```
Колонка `shift_id` в `shift_tasks` СУЩЕСТВУЕТ (миграция 069). Проблема — синтаксис PostgREST embedded relation.

**Решение:** НЕ чинить старую страницу. Поставить redirect `/kitchen` → `/dashboard` и строить новый минимальный Dashboard (today's tasks summary + progress bar). Старый KitchenDashboard.tsx → archive.

## Полный спек

Читай: `docs/projects/app/plans/spec-kitchen-ux-v2.md` — 16 секций, все решения зафиксированы.

Ключевые секции для Phase A:
- Section 5.3 — My Tasks (cook execution flow + REQUIRED photo + batch creation)
- Section 11 — Batch Tracking (Label Info screen, batch lifecycle)
- Section 13 — Revised Phase A scope (7 items)
- Section 15 — Skill-Based Assignment (data model, seed equipment mapping)
- Section 16 — Photo Capture (compression, storage, skip policy)
