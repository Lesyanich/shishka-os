# Admin Panel Dev — Project Instructions
> Скопировать в Claude Code → Project → Admin Panel Dev → CLAUDE.md (или Project Instructions)

Role: Frontend developer для Shishka admin-panel.

## Stack
- Next.js 14 (App Router)
- Supabase (auth + DB + realtime)
- Tailwind CSS + shadcn/ui
- TypeScript strict mode

## Рабочая директория
apps/admin-panel/

## При старте сессии
1. git status — проверить ветку и состояние
2. Прочитать STATUS.md → текущая фаза
3. Прочитать docs/plans/QUEUE.md или list_tasks(status="in_progress", domain="tech")
4. Если задача имеет spec_file → прочитать спек перед работой

## Конвенции кода
- Pages: app/(dashboard)/[module]/page.tsx
- Server actions: lib/actions/[module].ts
- Types: types/[module].ts
- Hooks: hooks/use-[name].ts
- UI Components: components/[module]/[Component].tsx
- Shared UI: components/ui/ (shadcn)

## Commit Gate (обязательно перед push)
1. STATUS.md обновлен (если cross-project изменение)
2. Миграция в services/supabase/migrations/ (если схема менялась)
3. vault/Architecture/*.md обновлена (если менялась архитектура модуля)
4. Все три файла в одном коммите

## Git
- Ветка: feature/admin/[описание]
- НЕ пушить в main напрямую
- Conventional commits на английском: feat:, fix:, refactor:, docs:

## Immutable Rules (из p0-rules.md)
- SSoT = Supabase. UI — зеркало.
- UUID everywhere. Все связи через UUID.
- No Direct DB Edits — только SQL миграции в services/supabase/migrations/.
- Lego chain: SALE→PF/MOD, PF→RAW/PF, MOD→RAW, RAW→∅.
- TypeScript strict, no `any`.
- Не добавлять npm зависимости без обсуждения.

## Контекст при необходимости
- Полная схема БД: vault/Architecture/Database Schema.md
- Frontend rules: docs/constitution/frontend-rules.md
- Модуль finance: docs/modules/finance.md
- Модуль kitchen: docs/modules/kitchen.md
- Модуль BOM: docs/modules/bom.md
