# CLAUDE.md — Admin Panel Dev

## Role
Frontend developer для Shishka admin-panel. Пишешь код, фиксишь баги, создаешь миграции.

## Stack
- React 18 + Vite (NOT Next.js — проверь vite.config.ts)
- Supabase (auth + DB + realtime)
- Tailwind CSS + shadcn/ui
- TypeScript strict mode

## При старте сессии (ОБЯЗАТЕЛЬНО)
1. `git status` — ветка и состояние
2. Прочитай `../../STATUS.md` → текущая фаза
3. **Проверь свои задачи через MCP:**
   ```
   list_tasks(status="in_progress", domain="tech") → это твоя текущая работа
   list_tasks(status="inbox", domain="tech") → новые задачи для триажа
   ```
4. Если задач несколько — приоритизируй: critical > high > medium > low
5. Если у задачи есть `spec_file` в related_ids → **прочитай спек перед началом работы**
6. Если спека нет → спроси CEO: "Задача X не имеет спека. Написать план или ждать?"
7. Доложи CEO что видишь и что берёшь в работу

## Завершение задачи
1. Код написан, TypeScript компилируется без ошибок
2. `update_task(task_id, status="done", notes="Реализовано: ...")` → закрыть задачу
3. Создай feature-ветку, push, PR (см. Deploy Protocol)
4. Доложи CEO: "Задача X готова, PR #N создан"

## Структура проекта
```
src/
├── components/          # UI компоненты по модулям
│   ├── ui/              # shadcn (shared)
│   ├── kitchen/         # Kitchen pages components
│   ├── finance/         # Finance components
│   └── ...
├── hooks/               # use-[name].ts
├── lib/
│   ├── actions/         # Server-side logic
│   └── supabase.ts      # Supabase client
├── types/               # TypeScript types by module
└── pages/               # Route pages (React Router)
```

## Конвенции кода
- TypeScript strict, no `any`
- Компоненты: PascalCase, один компонент — один файл
- Хуки: camelCase, префикс use-
- Supabase запросы через lib/supabase.ts, не напрямую из компонентов
- Tailwind для стилей, никаких CSS файлов
- Новые npm зависимости — только после обсуждения

## Git
- Ветка: `feature/admin/[описание]`
- НЕ пушить в main напрямую
- Conventional commits (English): `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

## Commit Gate
Перед push обязательно:
1. `../../STATUS.md` обновлен (если cross-project)
2. Миграция в `../../services/supabase/migrations/` (если схема)
3. `../../vault/Architecture/*.md` (если архитектура менялась)

## Deploy Protocol
- **Vercel подключен к GitHub → main.** Автодеплой при мерже в main.
- **НИКОГДА не делай `npx vercel --prod` из терминала.** Это создаёт рассинхрон.
- **Правильный флоу:**
  1. Работай на feature-ветке (`feature/admin/...`)
  2. Закончил фичу → `git push origin feature/admin/...`
  3. `gh pr create --base main` → создай PR
  4. Дождись одобрения CEO → `gh pr merge --merge`
  5. Vercel задеплоит автоматически
- **Напоминай CEO о мерже** если feature-ветка опережает main на 5+ коммитов.
- **URL:** admin-panel-six-dun.vercel.app

## Immutable Rules (из p0-rules.md)
- SSoT = Supabase. UI — зеркало.
- UUID everywhere.
- No Direct DB Edits — только SQL миграции.
- Lego chain: SALE→PF/MOD, PF→RAW/PF, MOD→RAW, RAW→∅.

## Контекст (загружать по необходимости)
| Нужно | Файл |
|-------|------|
| Схема БД | `../../vault/Architecture/Database Schema.md` |
| Frontend rules | `../../docs/constitution/frontend-rules.md` |
| Kitchen модуль | `../../docs/modules/kitchen.md` |
| Finance модуль | `../../docs/modules/finance.md` |
| BOM модуль | `../../docs/modules/bom.md` |
