# Spec: AI-Native Operations Modernization

> **MC Initiative:** a27e85db-5a7f-4bcd-a149-ef6c3b62ce0b
> **Phase A:** f98a3b5d-b75e-4e0c-9484-7d26500942d9 (critical)
> **Phase B:** eae7bdd9-68e4-4dd0-99d5-683d269ac5ef (high)
> **Phase C:** 00f7e84f-be6d-4975-8f02-b2a9080658e5 (high)
> **Phase D:** 9ae802d7-8fd5-4c85-a702-3ad085405c0f (medium)
> **Author:** COO
> **Status:** approved-by-ceo
> **Created:** 2026-04-06
> **Domains:** tech (primary), ops (cascade)

## Problem Statement

Система Shishka OS спроектирована как «AI-assisted» (человек в центре, AI помогает), но нуждается в переходе к «AI-native» (AI автономен, человек утверждает). Пять системных проблем блокируют масштабирование:

1. **Ручная синхронизация состояния** — STATUS.md и CURRENT.md обновляются руками, рассинхронизируются с реальностью
2. **Плоская иерархия документации** — 26 спеков в одной папке загружают агентам нерелевантный контекст
3. **Риск бункеров (Silos)** — изолированные агенты могут сломать общую БД, не зная контекста соседей
4. **Нет автоматической обратной связи** — отсутствуют pre-commit hooks, CI, обязательные тесты
5. **Усталость контекста COO** — накопление истории ведёт к галлюцинациям и путанице версий

## Hard Constraints (CEO-approved)

> Эти три ограничения — не рекомендации, а жёсткие правила для всех фаз.

### HC-1: Reactive Status (post-commit auto-generation)
`generate_status` вызывается на `post-commit` git hook. Агент НЕ думает об обновлении статуса — он коммитит код, статус обновляется автоматически. Ручное обновление STATUS.md ЗАПРЕЩЕНО.

### HC-2: Contracts in Code, Not in Text
Границы доменов enforced на уровне кода (ESLint `no-restricted-imports`, Supabase RLS policies, TypeScript module boundaries). Нарушение домена НЕ компилируется. `db-contracts.md` — справочник для людей, а не enforcement для агентов.

### HC-3: AI-TDD (Tests Before Logic)
Юнит-тесты пишутся ДО реализации фичи. Verification layer проверяет: если коммит содержит новый файл в `src/`, он ДОЛЖЕН содержать соответствующий файл в `__tests__/` или `*.test.*`. Pre-commit hook блокирует коммит без тестов.

## Architecture

### Layer Model

```
┌─────────────────────────────────────┐
│         CEO (Леся)                  │  Утверждает, тестирует, решает
├─────────────────────────────────────┤
│         COO (Cowork)                │  Проектирует, координирует
├─────────────────────────────────────┤
│     Mission Control (Supabase)      │  SSoT для состояния (tasks, sprints)
├──────────┬──────────┬───────────────┤
│ Guard    │ Computed │ Scoped        │  Три новых подсистемы
│ Rails    │ State    │ Context       │
├──────────┴──────────┴───────────────┤
│     Code Agents (Claude Code)       │  Исполняют задачи
├─────────────────────────────────────┤
│     Ruflo (claude-flow)             │  Координирует подзадачи
├─────────────────────────────────────┤
│     Supabase + Git                  │  Хранилище данных и кода
└─────────────────────────────────────┘
```

### Subsystem 1: Guard Rails

**Цель:** Ошибка не компилируется, не коммитится, не деплоится.

Компоненты:
- **Git pre-commit hook** (Husky):
  - `tsc --noEmit` — TypeScript strict check
  - `eslint --max-warnings 0` — lint + domain boundaries (no-restricted-imports)
  - Migration lint: проверка self-register INSERT в migration_log
  - AI-TDD gate: новый src/ файл → требует *.test.* файл в том же коммите
- **Git post-commit hook:**
  - Вызов `generate_status` MCP → обновляет STATUS.md из Supabase + git state (HC-1)
- **ESLint domain rules** (HC-2):
  - `apps/admin-panel/` НЕ импортирует из `services/mcp-*/` напрямую
  - `services/mcp-finance/` НЕ импортирует из `services/mcp-chef/`
  - Shared types — через `services/supabase/types/` (единственный разрешённый cross-import)
- **Supabase RLS policies** (HC-2):
  - Каждый MCP-сервер использует свой service role key с ограниченными permissions
  - Finance MCP: read/write `receipt_inbox`, `expense_ledger`, `suppliers` — read-only на `nomenclature`
  - Chef MCP: read/write `nomenclature`, `bom_*`, `recipes` — no access к `receipt_inbox`
  - MC MCP: read/write `business_tasks`, `business_initiatives`, `sprints`
- **Ruflo PostToolUse verification:**
  - После каждого Write/Edit: `npm run build` (если apps/)
  - После каждого SQL migration: `supabase db lint` (если доступен)

### Subsystem 2: Computed State

**Цель:** Состояние вычисляется, а не пишется руками.

Компоненты:
- **MCP tool `generate_status`** (в shishka-mission-control):
  - Input: none (всё берёт из Supabase + git)
  - Queries: `list_tasks` по статусам, `SELECT max(version) FROM migration_log`, `git branch`, `git log --oneline -5`
  - Output: markdown → пишет в STATUS.md
  - Триггер: post-commit hook (HC-1) + manual вызов из morning triage
- **MCP tool `get_project_state(project)`** (в shishka-mission-control):
  - Input: project name (admin/web/app)
  - Queries: MC tasks filtered by domain + tags, git log for `feature/{project}/*` branches, migration_log for project-tagged migrations
  - Output: structured JSON (не файл, а ответ агенту)
  - Заменяет ручное чтение CURRENT.md
- **P0 Rule #5 (переформулировка):**
  - БЫЛО: «Always read STATUS.md before starting a task and update it after completion»
  - СТАЛО: «Always call `generate_status` at session start. STATUS.md is auto-generated on commit — never edit it manually. If MC tasks don't reflect reality, update them via `update_task`.»
- **Commit Gate (Boris #11, переформулировка):**
  - БЫЛО: «Global STATUS.md updated»
  - СТАЛО: «MC task updated (status, notes). STATUS.md auto-generates on commit.»

### Subsystem 3: Scoped Context

**Цель:** Агент загружает только то, что нужно для текущей задачи.

Компоненты:
- **`context_files` field** в `business_tasks`:
  - JSON array путей относительно корня репозитория
  - COO заполняет при создании задачи
  - Code-агент при старте: `get_task(id)` → читает context_files → загружает только их + p0-rules + AGENT.md
  - Пример: `["docs/projects/app/plans/spec-kitchen-ux-v2.md", "docs/domain/nomenclature.md", "agents/chef/AGENT.md"]`
- **Реструктуризация specs:**
  - Project-specific: `docs/projects/{project}/plans/spec-*.md`
  - Cross-project: остаётся в `docs/plans/spec-*.md`
  - Миграция: при работе со спеком — переносим в правильное место
- **CLAUDE.md L2 update:**
  - Новое правило: «If task has context_files — load ONLY those files. Skip L2 module scan.»
  - Fallback: если context_files пусто — используй текущую L2 маршрутизацию
- **LightRAG integration** (future):
  - MCP tool `search_knowledge(query)` — поиск по docs/bible + docs/domain + docs/constitution
  - Заменяет «загрузи всё, что может быть полезно» на «найди конкретно нужное»

## Implementation Phases

### Phase A: Guard Rails (1 Code-сессия)

**Prerequisite:** None
**Branch:** `feature/shared/guard-rails`

| Step | Задача | Deliverable |
|------|--------|-------------|
| A1 | Установить Husky, настроить pre-commit hook | `.husky/pre-commit` с tsc + eslint |
| A2 | AI-TDD gate: скрипт проверки test-coverage на новые файлы | `scripts/check-test-pair.sh` (HC-3) |
| A3 | ESLint domain boundary rules (no-restricted-imports) | `.eslintrc` update (HC-2) |
| A4 | Post-commit hook: заглушка для generate_status | `.husky/post-commit` (HC-1, заглушка до Phase B) |
| A5 | `# DEPRECATED` headers во все dead-zone файлы | services/gas/*, dead edge functions |
| A6 | `docs/domain/db-contracts.md` — справочник владельцев таблиц | Новый файл |
| A7 | Supabase RLS review: проверить текущие policies, план расширения | Отчёт + MC-задача на RLS migration |

**Definition of Done:** `git commit` в admin-panel без теста → BLOCKED линтером. Import из чужого MCP → BLOCKED ESLint.

### Phase B: Computed State (2 Code-сессии)

**Prerequisite:** Phase A (hooks infrastructure)
**Branch:** `feature/shared/computed-state`

| Step | Задача | Deliverable |
|------|--------|-------------|
| B1 | MCP tool `generate_status` в shishka-mission-control | Новый tool + тесты |
| B2 | MCP tool `get_project_state(project)` | Новый tool + тесты |
| B3 | Post-commit hook: вызов `generate_status` (заменяет заглушку A4) | `.husky/post-commit` update |
| B4 | Обновить p0-rules.md: Rule #5 переформулировка | docs/constitution update |
| B5 | Обновить Commit Gate (Boris #11): от файлов к MC tasks | docs/constitution update |
| B6 | `context_files` column в `business_tasks` | SQL migration |
| B7 | Morning triage skill: использует `generate_status` | Skill update |

**Definition of Done:** После коммита STATUS.md автоматически отражает текущее состояние MC tasks + git. Агенты не трогают STATUS.md руками.

### Phase C: Scoped Context (1 COO + 1 Code)

**Prerequisite:** Phase B (context_files field exists)
**Branch:** `feature/shared/scoped-context`

| Step | Задача | Deliverable |
|------|--------|-------------|
| C1 | COO: создать project-local dirs `docs/projects/{project}/plans/` | Структура папок |
| C2 | COO: перенести project-specific спеки | Файлы перемещены |
| C3 | COO: заполнить context_files для всех in_progress задач | MC tasks updated |
| C4 | Обновить CLAUDE.md: L2 task-scoped context rule | CLAUDE.md update |
| C5 | COO: протокол создания задач — context_files обязателен | docs/constitution update |

**Definition of Done:** Code-агент, получивший MC task, загружает ≤5 файлов контекста вместо всего docs/.

### Phase D: Full Loop (итеративно, после стабилизации A+B+C)

| Step | Задача | Deliverable |
|------|--------|-------------|
| D1 | GitHub Actions CI: tsc + eslint + test на PR | `.github/workflows/ci.yml` |
| D2 | Supabase RLS: per-MCP service keys | Migration + key rotation |
| D3 | LightRAG MCP tool `search_knowledge` | MCP integration |
| D4 | Auto-pruning: project-memories TTL 30 days | Script + schedule |
| D5 | generate_status на ruflo SessionStart hook | .claude/settings.json update |
| D6 | Canary: `supabase db push --dry-run` pre-migration | Hook script |

**Definition of Done:** Полный автономный цикл: агент получает задачу → пишет тест → пишет код → коммитит → статус обновлён → CI зелёный → MC task = done.

## Impact on Existing Rules

| Rule | Изменение |
|------|-----------|
| P0 Rule #5 | «update STATUS.md» → «verify MC tasks» |
| Boris Rule #11 (Commit Gate) | STATUS.md убираем из чек-листа (auto-generated) |
| Boris Rule #15 (MCP Identity) | Усилен ESLint + RLS (HC-2) |
| CLAUDE.md L0 | «Read STATUS.md» остаётся (файл теперь computed) |
| CLAUDE.md L2 | Добавлен task-scoped context override |
| Agent Tracking (Tier 1/2) | Без изменений |
| Backlog First | Без изменений |

## Risks

| Риск | Mitigation |
|------|-----------|
| Post-commit hook замедляет workflow | generate_status — async (background), не блокирует |
| ESLint rules слишком строгие на старте | Начинаем с warn, через 1 неделю переводим в error |
| AI-TDD замедляет delivery | Только для новых файлов, не ретроактивно |
| context_files устаревают | COO ревизия при переводе задачи в in_progress |
| RLS breaks existing MCP servers | Фаза D (после стабилизации), с dry-run тестированием |

## Out of Scope

- Переписывание существующих агентов
- Ретроактивное покрытие тестами (только новый код)
- GitHub Actions (Phase D, не Phase A)
- LightRAG интеграция (Phase D)
