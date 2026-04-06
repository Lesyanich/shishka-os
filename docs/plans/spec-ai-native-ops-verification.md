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
| A1 | Husky installed | `ls .husky/` — директория существует? `cat .husky/pre-commit` | |
| A2 | tsc pre-commit | Сделать ошибку в .ts файле, попробовать `git commit` — блокирует? | |
| A3 | ESLint domain rules | `grep "no-restricted-imports" .eslintrc*` — правила прописаны? Тест: добавить `import` из `mcp-chef` в `mcp-finance`, запустить `npm run lint` | |
| A4 | AI-TDD gate | `ls scripts/check-test-pair.sh` — скрипт существует? Тест: добавить `src/foo.ts` без `foo.test.ts`, попробовать commit | |
| A5 | Dead-zone headers | `head -3 services/gas/ReceiptParser.gs` — есть `# DEPRECATED`? | |
| A6 | db-contracts.md | `ls docs/domain/db-contracts.md` — файл существует? | |

### Phase B: Computed State

| # | Компонент | Проверка | Результат |
|---|-----------|----------|-----------|
| B1 | generate_status MCP | Вызвать `generate_status` — tool существует в shishka-mission-control? | |
| B2 | Post-commit hook | `cat .husky/post-commit` — вызывает generate_status? | |
| B3 | context_files column | `get_task` любой задачи — поле context_files в ответе? (ДА, уже проверено) | |
| B4 | get_project_state | Вызвать `get_project_state("admin")` — tool существует? | |
| B5 | P0 Rule #5 updated | `grep "generate_status" docs/constitution/p0-rules.md` — переформулировка есть? | |

### Phase C: Scoped Context

| # | Компонент | Проверка | Результат |
|---|-----------|----------|-----------|
| C1 | CLAUDE.md L2 rule | `grep "context_files" CLAUDE.md` — task-scoped override прописан? (ДА) | |
| C2 | Project dirs | `ls docs/projects/admin/plans/` — существует? | |
| C3 | Existing tasks have context_files | `list_tasks(status="inbox")` — сколько задач имеют непустой context_files? | |

### Phase D: Full Loop

| # | Компонент | Проверка | Результат |
|---|-----------|----------|-----------|
| D1 | CI workflow | `ls .github/workflows/ci.yml` — файл существует? | |
| D2 | Auto-pruning | Есть скрипт/schedule для TTL agent-memories? | |
| D3 | Migration canary | `supabase db push --dry-run` — настроен в hook/CI? | |
| D4 | LightRAG search_knowledge | MCP tool существует? (research done, implementation = future) | |

## Deliverable

1. Заполненная таблица ✅/❌
2. Для каждого ❌ — новый MC task на реальную имплементацию
3. Обновление инициативы a27e85db: реальный % выполнения

## After Audit

Порядок работы по результатам:
1. Merge `feature/shared/lightrag-research` → main (pending, dirty tree)
2. Fix ❌ items (new branch `feature/shared/ai-native-ops-fixes`)
3. Закрыть инициативу или обновить план
