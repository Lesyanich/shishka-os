# Spec: Dispatcher Agent — единая точка входа для всех агентов

> MC Task: TBD
> Priority: high
> Initiative: `a27e85db` (AI-Native Operations)
> Author: COO
> Status: phase-1-2-3-done

## Problem

Сейчас CEO должна знать КАКОГО агента запустить и КАК ему объяснить задачу. Это требует:
- Знания какие агенты существуют и за что отвечают
- Ручного запуска конкретного скрипта/команды
- Формулировки промпта под конкретного агента

Цель: CEO открывает Claude Code, говорит что хочет — система сама маршрутизирует.

## Architecture

### Два режима работы

**Режим 1 — Меню (SessionStart)**
При запуске Claude Code показывает:
```
=== Shishka OS ===
Branch: main | Last: 2218524 feat(task-lifecycle)

📋 Задачи в MC:
  [1] 🔴 Finance: 3 чека на обработку
  [2] 🔴 Chef: позиция SALE-FALAFEL без нутриентов
  [3] 🟡 Code: PR #22 ждёт мерж

🤖 Агенты:
  /chef     — меню, BOM, рецепты, kitchen tests
  /finance  — чеки, расходы, поставщики
  /code     — разработка, баги, фичи
  /coo      — координация, триаж, архитектура

Что делаем?
```

**Режим 2 — Auto-routing (intent-based)**
CEO просто пишет. Dispatcher определяет домен и маршрутизирует:

```
"обработай новые чеки"       → /finance + list inbox
"добавь фалафель в меню"     → /chef + create_product flow
"почини баг в receipt inbox"  → /code + MC task creation
"что в очереди?"             → MC dashboard
"сколько потратили за неделю" → /finance + expense_summary
```

### Как это работает технически

```
┌──────────────────────────────────────────────┐
│  SessionStart hook (scripts/session-start.sh) │
│  Prints: branch, MC summary, agent menu       │
└──────────────┬───────────────────────────────┘
               │ user types something
               ▼
┌──────────────────────────────────────────────┐
│  CLAUDE.md L0 — Dispatcher Logic              │
│  1. Classify intent (domain + action)         │
│  2. Load agent context (AGENT.md + MCP tools) │
│  3. Check/create MC task for tracking         │
│  4. Execute in agent mode                     │
└──────────────────────────────────────────────┘
```

### Agent Registry

| Command | Agent | Context File | MCP Tools | Domain |
|---------|-------|-------------|-----------|--------|
| `/chef` | Chef Agent | `agents/chef/AGENT.md` | `shishka-chef__*` | kitchen |
| `/finance` | Finance Agent | `agents/finance/AGENT.md` | `shishka-finance__*` | finance |
| `/code` | Code Agent | CLAUDE.md routing | all tools | tech |
| `/coo` | COO Agent | `docs/business/DISPATCH_RULES.md` | `shishka-mission-control__*` | ops |

### Intent Classification Rules

| Сигнал в тексте | Домен | Агент |
|-----------------|-------|-------|
| чек, receipt, invoice, расход, expense, supplier | finance | /finance |
| блюдо, меню, BOM, рецепт, ингредиент, нутриенты, dish, product | kitchen | /chef |
| баг, фича, UI, страница, компонент, deploy, PR, merge | tech | /code |
| очередь, inbox, triaj, координация, приоритет, инициатива | ops | /coo |
| неоднозначно | — | ASK: "Это для Chef, Finance, или Code?" |

## Implementation

### Phase 1: Slash Commands (quick win)

Файлы `.claude/commands/`:

```
.claude/commands/chef.md     — загружает agents/chef/AGENT.md + scope MCP
.claude/commands/finance.md  — загружает agents/finance/AGENT.md + scope MCP
.claude/commands/code.md     — стандартный CLAUDE.md routing
.claude/commands/coo.md      — загружает DISPATCH_RULES + MC-only tools
```

Пользователь пишет `/chef` → Claude Code загружает контекст шефа.

### Phase 2: Smart SessionStart

Обновить `scripts/session-start.sh`:
- Вызывать `list_tasks` через REST API (lightweight, без MCP)
- Группировать задачи по доменам
- Показывать MC inbox summary + agent menu

### Phase 3: Auto-routing

Обновить CLAUDE.md L0 — добавить intent classification:
- Если пользователь не выбрал агента явно
- Классифицировать по ключевым словам
- Загрузить соответствующий AGENT.md
- Создать/подхватить MC task

### Phase 4: Ruflo Multi-Agent

Для задач, требующих нескольких агентов:
```
"посчитай food cost для нового меню"
→ Dispatcher: нужен Chef (BOM) + Finance (costs)
→ Ruflo: запускает Chef sub-agent → результат → Finance sub-agent
→ Ответ CEO: "Food cost нового меню: 32%, target 30%. Проблемные позиции: ..."
```

## Что НЕ входит в эту задачу

- Ruflo multi-agent (Phase 4 — отдельная задача)
- MC UI улучшения (отдельная задача)
- Tool permission isolation (требует .claude/settings.json per-agent)

## Success Criteria

- CEO запускает Claude Code → видит меню агентов + MC summary
- `/chef` → загружает Chef контекст, видит только кухонные MCP tools
- `/finance` → загружает Finance контекст
- Свободный текст → auto-route к правильному агенту
- Каждое действие трекается в MC
