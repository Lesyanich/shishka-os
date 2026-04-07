# Skills & MCP Services Policy — Shishka OS

> Author: COO
> Date: 2026-04-07
> MC Task: 61d0f554-3688-4fb2-b353-55af87e44679
> Audience: CEO (executive summary in Russian) + agents (technical sections in English)

---

## Executive Summary (для CEO, по-русски)

### Что мы имеем

**13 скиллов** (прикладные инструкции-плейбуки) и **8 MCP-серверов** (наборы инструментов для работы с БД и внешними системами).

### Что нужно оставить и почему

**Документные скиллы — `xlsx`, `pdf`, `pptx`, `docx`** — оставляем. Это реальная польза: ты сама их используешь для отчётов и презентаций, Finance агент для обработки PDF-квитанций, Chef для Excel-выгрузок BOM. Ничего переделывать не надо.

**Инфраструктурные скиллы — `schedule`, `skill-creator`** — оставляем, но пока не используем активно. `schedule` нужен, когда мы решим включить утренний push от COO (отложено на v2.1). `skill-creator` — стратегический: когда мы захотим упаковать наши собственные плейбуки (например, "парсинг чеков по Makro"), будем использовать его.

**Cowork плагины (`create-cowork-plugin`, `cowork-plugin-customizer`)** — пока **не нужны**, но интересны на будущее. Если Shishka OS будет продаваться другим кухням как плагин — тогда пригодятся. Можно держать включёнными, они не мешают.

### Что нужно отключить и почему

**`shishka-mission-control:morning-triage`** → **SUPERSEDED**. Этот скилл на 85% повторяет новый Session Start Protocol COO v2, плюс ссылается на устаревший `p0-rules.md`. Если оставить — агенты будут получать противоречивые инструкции. Решение: не загружать этот скилл в COO. Если когда-нибудь захотим восстановить — обновить под `core-rules.md`.

**`shishka-mission-control:agent-tracking`** → **SUPERSEDED**. Дублирует новый `agent-rules.md` (Tier 1/Tier 2 протокол). Не загружать.

**`shishka-mission-control:task-dispatch`** → **EVALUATE**. Возможно полезен как плейбук для маршрутизации задач между доменами, но требует проверки. Пока не загружать автоматически, включать по запросу.

**`shishka-mission-control:session-handoff`** → **KEEP**. Редко используется, но нужен когда переключаешься между Cowork и Claude Code. Не мешает.

### Ответ на твой вопрос про scheduled-tasks

Ты спрашивала: "когда вызывать командой, когда отключать". Конкретно про **scheduled-tasks** (возможность настроить расписание, например "каждое утро в 8:00 COO проверяет inbox и оставляет комментарий в Running Log"):

**Моя рекомендация — подождать 2 недели.** Сначала посмотрим, как ты сама работаешь с COO v2: если ты регулярно начинаешь утро с `/coo` — расписание не нужно. Если забываешь — включим утренний ping с простым сообщением "в inbox N новых задач". Не будем запускать автоматическую COO-сессию — она требует контекста, который можно получить только в живом разговоре с тобой.

### Новый "гардероб" для каждого агента

| Агент | Что грузится автоматически | MCP серверы |
|---|---|---|
| **COO** | core-rules, agent-rules, DISPATCH_RULES, AGENT.md | mission-control (write), chef+finance (read), cowork, mcp-registry, plugins |
| **Chef** | core-rules, agent-rules, chef AGENT.md + `xlsx` скилл | shishka-chef (write), mission-control (для закрытия задач) |
| **Finance** | core-rules, agent-rules, finance AGENT.md + `xlsx`, `pdf` скиллы | shishka-finance (write), mission-control (для закрытия задач) |
| **Code (в Claude Code)** | core-rules, engineering-rules, frontend-rules | mission-control (только для закрытия задач) |
| **Ты (в Cowork напрямую)** | — | всё доступно через slash commands `/coo`, `/chef`, `/finance` |

### Что делать тебе прямо сейчас

Ничего. Эта policy — для агентов. Ты продолжаешь работать как обычно: пишешь в `/coo`, я капчу идеи, триажу, подсказываю. Policy начнёт действовать для агентов автоматически после того, как `CLAUDE.md` routing подтянет эти правила (часть задачи 4fc9618c для Code).

---

## Technical Sections (for agents, English)

### Skills Inventory & Classification

| Skill | Category | Status | Primary User | Rationale |
|---|---|---|---|---|
| `xlsx` | Document | **KEEP** | Finance, Chef, CEO | BOM exports, supplier price lists, financial reports — recurring real usage |
| `pdf` | Document | **KEEP** | Finance | Receipt OCR fallback, supplier invoices, legal docs |
| `pptx` | Document | **KEEP** | CEO, COO | Board decks, partner presentations — on-demand |
| `docx` | Document | **KEEP** | COO, CEO, HR (future) | HR contracts, supplier agreements, policy docs |
| `schedule` | Infra | **EVALUATE** | COO (potential) | Reserved for COO v2.1 morning push; no current user |
| `skill-creator` | Infra | **KEEP** | COO (design time) | Strategic — enables custom Shishka skills creation |
| `cowork-plugin-management:create-cowork-plugin` | Meta | **EVALUATE** | COO (future) | Only relevant if Shishka OS ships as a plugin |
| `cowork-plugin-management:cowork-plugin-customizer` | Meta | **EVALUATE** | COO (future) | Paired with `create-cowork-plugin` |
| `shishka-mission-control:morning-triage` | Workflow | **SUPERSEDED** | — | Overlaps 85% with COO v2 Session Start Protocol. References legacy `p0-rules.md`. Do not load. |
| `shishka-mission-control:agent-tracking` | Workflow | **SUPERSEDED** | — | Duplicates new `agent-rules.md` Tier 1/Tier 2 protocol. Do not load. |
| `shishka-mission-control:task-dispatch` | Workflow | **EVALUATE** | COO | May be useful as a dispatch playbook, needs read-through; do not auto-load |
| `shishka-mission-control:session-handoff` | Workflow | **KEEP** | All agents | Useful for Cowork ↔ Claude Code transitions |

### MCP Servers Inventory & Scope

| MCP Server | Status | Primary Users | Access Level |
|---|---|---|---|
| `cowork` | **KEEP** | All Cowork sessions | Foundational |
| `mcp-registry` | **KEEP** | COO | Design-time tool discovery |
| `plugins` | **KEEP** | COO | Design-time plugin discovery |
| `scheduled-tasks` | **EVALUATE** | COO (v2.1), Finance (future) | Parked until morning-push decision |
| `session_info` | **KEEP** | COO only | "What did we discuss" lookups — privacy sensitive, COO-only |
| `shishka-chef` | **KEEP** | Chef (write), COO (read-only) | Domain-scoped |
| `shishka-finance` | **KEEP** | Finance (write), COO (read-only) | Domain-scoped |
| `shishka-mission-control` | **KEEP** | All agents | Core tracking layer |

### Per-Agent Default Context

Each agent's bootstrap should load this exact set by default. Anything else is opt-in per task.

#### COO Agent
```
Constitution: core-rules.md, agent-rules.md
Routing: DISPATCH_RULES.md, PROJECT_REGISTRY.md, agents/coo/AGENT.md
Skills: session-handoff, skill-creator (design-time only)
MCPs (write): shishka-mission-control
MCPs (read-only): shishka-chef, shishka-finance, session_info, mcp-registry, plugins
```

#### Chef Agent
```
Constitution: core-rules.md, agent-rules.md
Domain: agents/chef/AGENT.md, docs/modules/{bom,kitchen}.md, docs/bible/INDEX.md
Skills: xlsx, session-handoff
MCPs (write): shishka-chef, shishka-mission-control (task closure only)
```

#### Finance Agent
```
Constitution: core-rules.md, agent-rules.md
Domain: agents/finance/AGENT.md, docs/modules/{finance,receipts}.md
Skills: xlsx, pdf, session-handoff
MCPs (write): shishka-finance, shishka-mission-control (task closure only)
```

#### Code Agent (Claude Code in repo)
```
Constitution: core-rules.md, engineering-rules.md, frontend-rules.md
Routing: CLAUDE.md L0 → task context_files → L1/L2 fallback
Skills: session-handoff, task-lifecycle (existing local skill)
MCPs (write): shishka-mission-control (task closure only)
MCPs forbidden: shishka-chef, shishka-finance (domain agents only)
```

### Scheduled-Tasks: Morning Push Decision

**Question:** Should `scheduled-tasks` MCP create a daily 08:00 job that runs COO Session Start Protocol and posts to COO Running Log?

**Analysis:**

Pros:
- Proactive overnight inbox briefing ready when CEO wakes up
- Enforces Session Start Protocol even on days CEO doesn't invoke `/coo`
- Closes the "I forgot to check inbox this morning" gap

Cons:
- Scheduled execution needs a headless context (Cowork must be open, or external runner)
- Running Log comments follow a `Noticed / Unsaid / Watch-next` format that only makes sense after a real session — a cron-generated comment would be hollow
- Risk of noise: if CEO skips a day, the log accumulates empty briefings

**Decision: WAIT (2 weeks).**

1. Deploy COO v2 without scheduled push
2. For 2 weeks, observe: does CEO consistently start day with `/coo`?
3. If yes → no schedule needed
4. If no → implement a **minimal** morning ping:
   - Job: 08:00 daily
   - Action: `list_tasks(status="inbox")` + `list_tasks(status="blocked")`
   - Output: one-line notification "Morning: N new inbox / K blocked" — **not** a Running Log comment
   - Delivery: via notification channel, not via MC
5. Re-evaluate: if CEO starts engaging with the notification, graduate to full Running Log integration in v2.2

### Deprecation Actions (to be executed by Code)

These skills should be excluded from auto-loading in any agent's bootstrap:

- `shishka-mission-control:morning-triage`
- `shishka-mission-control:agent-tracking`

Removal path: update `CLAUDE.md` skill-loading section (if exists) or agent AGENT.md files to explicitly exclude. Do not delete the skills themselves — other parts of the system may reference them until the sed pass completes.

### Open Questions (parked)

- Should COO have a read-only probe into `session_info` to recall past conversations with CEO? Privacy-sensitive. Park until CEO decides.
- `task-dispatch` skill needs a read-through to decide KEEP vs. SUPERSEDED — do in next COO session.
- Should we commission a new custom skill `shishka:receipt-parser` via `skill-creator`? Would package the Makro/Lotus/Big-C parsing patterns we've accumulated. Track as separate evaluate task.

---

## Review & Revision

This policy should be revisited:
- After 2 weeks (scheduled-tasks decision point)
- When any new skill or MCP server becomes available
- When agent usage patterns shift (measured via MC task `created_by` distribution)

The CEO should read only the Executive Summary. Agents should read the Technical Sections relevant to their role.
