# Spec: AI-Native Ops Verification Audit

> MC Task: `58d77460-55f8-42a2-9a27-022010386baf`
> Priority: CRITICAL
> Related Initiative: `a27e85db` (AI-Native Operations Modernization)
> Branch: `main` (audit only, no code changes)

## Context

Phases A-D были закоммичены и смержены (commits cea4287, 1c56b5c, af49b57, d12ea24).
Warp-инцидент 2026-04-06 показал: агент работал без контекста, без протокола, без
коммитов — ни один guard rail не остановил его.

**Цель**: определить что реально enforce-ится в коде, а что — только на бумаге.

## Audit Checklist

### Phase A: Guard Rails

| # | Компонент | Проверка | Результат |
|---|-----------|----------|-----------|
| A1 | Husky installed | `ls .husky/` — директория существует? `cat .husky/pre-commit` | ✅ `.husky/` exists, pre-commit + post-commit executable |
| A2 | tsc pre-commit | Сделать ошибку в .ts файле, попробовать `git commit` — блокирует? | ✅ Blocks TS errors in admin-panel. Verified by WIP commit (466d3e7) |
| A3 | ESLint domain rules | `grep "no-restricted-imports" .eslintrc*` — правила прописаны? Тест: добавить `import` из `mcp-chef` в `mcp-finance`, запустить `npm run lint` | ❌ admin-panel has rule, but MCP-to-MCP cross-imports NOT enforced. → MC task c81ed879 |
| A4 | AI-TDD gate | `ls scripts/check-test-pair.sh` — скрипт существует? Тест: добавить `src/foo.ts` без `foo.test.ts`, попробовать commit | ✅ Script works, pre-commit fires it |
| A5 | Dead-zone headers | `head -3 services/gas/ReceiptParser.gs` — есть `# DEPRECATED`? | ✅ DEPRECATED header present |
| A6 | db-contracts.md | `ls docs/domain/db-contracts.md` — файл существует? | ✅ File exists |

### Phase B: Computed State

| # | Компонент | Проверка | Результат |
|---|-----------|----------|-----------|
| B1 | generate_status MCP | Вызвать `generate_status` — tool существует в shishka-mission-control? | ✅ Called successfully, wrote STATUS.md |
| B2 | Post-commit hook | `cat .husky/post-commit` — вызывает generate_status? | ⚠️ Hook fires generate-status.sh but SKIPS without SUPABASE env vars locally. → MC task 00f34cad |
| B3 | context_files column | `get_task` любой задачи — поле context_files в ответе? (ДА, уже проверено) | ✅ Confirmed in get_task response |
| B4 | get_project_state | Вызвать `get_project_state("admin")` — tool существует? | ✅ Called successfully, returns full state |
| B5 | P0 Rule #5 updated | `grep "generate_status" docs/constitution/p0-rules.md` — переформулировка есть? | ✅ Referenced in rule #5 |

### Phase C: Scoped Context

| # | Компонент | Проверка | Результат |
|---|-----------|----------|-----------|
| C1 | CLAUDE.md L2 rule | `grep "context_files" CLAUDE.md` — task-scoped override прописан? (ДА) | ✅ Task-scoped override in CLAUDE.md |
| C2 | Project dirs | `ls docs/projects/admin/plans/` — существует? | ✅ Directory exists |
| C3 | Existing tasks have context_files | `list_tasks(status="inbox")` — сколько задач имеют непустой context_files? | ⚠️ 6/12 inbox tasks (50%) have context_files. → MC task e1f6963c |

### Phase D: Full Loop

| # | Компонент | Проверка | Результат |
|---|-----------|----------|-----------|
| D1 | CI workflow | `ls .github/workflows/ci.yml` — файл существует? | ✅ 5 jobs: admin tsc+lint, 3 MCP builds, migration lint |
| D2 | Auto-pruning | Есть скрипт/schedule для TTL agent-memories? | ❌ Script exists (`prune-memories.sh`) but NO scheduled trigger. → MC task 0ea9fe25 |
| D3 | Migration canary | `supabase db push --dry-run` — настроен в hook/CI? | ✅ Pre-commit calls `migration-canary.sh` for staged .sql files |
| D4 | LightRAG search_knowledge | MCP tool существует? (research done, implementation = future) | ⚠️ `search_knowledge` exists but uses JSON keyword search, not LightRAG. Expected — future phase |

## Deliverable

1. Заполненная таблица ✅/❌
2. Для каждого ❌ — новый MC task на реальную имплементацию
3. Обновление инициативы a27e85db: реальный % выполнения

## Audit Summary (2026-04-06)

**Score: 11 ✅ / 4 ⚠️ / 2 ❌** out of 17 checks.

Real enforcement rate: ~65%. Guard rails (Phase A) are strongest. Computed state (Phase B) and scoped context (Phase C) are functional but fragile. Full loop (Phase D) has CI but lacks automation scheduling.

### MC Tasks Created

| Audit Item | MC Task | Priority |
|------------|---------|----------|
| A3: ESLint cross-MCP | `c81ed879` | medium |
| B2: generate_status local resilience | `00f34cad` | medium |
| C3: Fill context_files gaps | `e1f6963c` | low |
| D2: Schedule prune-memories | `0ea9fe25` | low |

### Initiative Status

Initiative `a27e85db` (AI-Native Operations Modernization): **~65% real enforcement**.
Core infrastructure is in place. Gaps are in cross-service lint rules, local dev resilience, and automation scheduling. NOT ready to close — 4 follow-up tasks needed.

## After Audit

1. ~~Merge `feature/shared/lightrag-research` → main~~ DONE (already merged, commit 88d234e)
2. ~~Clean dirty tree~~ DONE (commit 466d3e7)
3. Fix ❌ items (new branch `feature/shared/ai-native-ops-fixes`)
4. Update initiative when fixes are deployed
