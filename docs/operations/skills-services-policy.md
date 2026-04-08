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

## Task-Kind Taxonomy (for Code Agent routing)

**Problem this solves:** Code agent has 200+ skills available. When picking up an MC task, it cannot reliably guess which skills are mandatory vs. optional vs. forbidden. Result: skills get skipped (TDD violations, missing systematic-debugging) or wrong ones loaded (frontend-design on a backend task).

**Solution:** Every tech task in MC carries a `kind:*` tag. Code agent reads the tag, looks up this table, loads exactly that skill set.

### Kind enumeration

| Tag | What it means | When COO assigns it |
|---|---|---|
| `kind:install` | Install / configure deps, services, env, runtimes | Setup task, "fix broken install", new tooling onboarding |
| `kind:migration` | Supabase SQL migration (schema, RLS, RPC, seed) | Anything touching `services/supabase/migrations/` |
| `kind:rpc-backend` | Supabase RPC, edge function, MCP server tool | Backend logic without UI |
| `kind:ui-component` | React component / page in admin-panel, web, app | Frontend work, new screen, redesign |
| `kind:bug-fix` | Reproduce + fix a defect | Triggered by error report, failing test, regression |
| `kind:feature` | New end-to-end functionality (UI + backend) | Any "build X" with non-trivial scope |
| `kind:refactor` | Restructure without behavior change | Tech debt, code review follow-up, simplification |
| `kind:research` | Explore codebase, gather info, no edits | "How does X work", "where is Y used", audit prep |
| `kind:test` | Write or fix tests, increase coverage | Test backfill, TDD red phase prep |
| `kind:doc` | Markdown / docs only, no code | New rule, AGENT.md update, spec writing |
| `kind:integration` | Third-party service wiring (Vercel, supplier API, OAuth) | New external dependency |
| `kind:security` | Security audit, RLS, vulnerability fix, secret rotation | Anything in attack surface |
| `kind:data-fix` | One-off SQL patch on existing rows, no schema change | Data correction, dedup, backfill |
| `kind:cleanup` | Delete dead code / files / config | Post-deprecation, after audit findings |
| `kind:meta` | Coordination / umbrella / tracking task — no direct implementation | Initiatives, running logs, audit umbrellas, decision-only tasks |

**Rule:** Every tech-domain MC task MUST carry exactly one `kind:*` tag. COO enforces this on task creation. Code agent rejects (asks for clarification) any tech task without one.

### Kind → Skills mapping

Format: **REQUIRED** = must load before starting; **RECOMMENDED** = load if relevant; **FORBIDDEN** = do not load even if Code agent thinks it applies.

#### kind:install
- **REQUIRED:** `superpowers:verification-before-completion`
- **RECOMMENDED:** `superpowers:systematic-debugging` (if install is failing)
- **FORBIDDEN:** `superpowers:test-driven-development` (no behavior to test), `frontend-design`

#### kind:migration
- **REQUIRED:** `sparc:supabase-admin`, `superpowers:verification-before-completion`
- **RECOMMENDED:** `superpowers:writing-plans` (for schema changes touching >2 tables)
- **FORBIDDEN:** auto-apply migrations without CEO approval; `frontend-design`
- **Special rule:** check for existing migration with same number; never edit applied migrations.

#### kind:rpc-backend
- **REQUIRED:** `sparc:supabase-admin`, `superpowers:verification-before-completion`, `security-review`
- **RECOMMENDED:** `superpowers:test-driven-development`
- **FORBIDDEN:** `frontend-design`, `vercel:shadcn`

#### kind:ui-component
- **REQUIRED:** `vercel:react-best-practices`
- **RECOMMENDED:** `vercel:shadcn` (admin-panel uses shadcn), `frontend-design` (new screens / distinctive UI), `vercel:nextjs` (web/app projects only — admin-panel is Vite/React 18, NOT Next.js)
- **FORBIDDEN:** `sparc:supabase-admin` (use existing client, don't write SQL inline)

#### kind:bug-fix
- **REQUIRED:** `superpowers:systematic-debugging`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`
- **RECOMMENDED:** `simplify` (if fix reveals deeper smell)
- **FORBIDDEN:** shipping a fix without a regression test

#### kind:feature
- **REQUIRED:** `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:executing-plans`, `superpowers:verification-before-completion`
- **RECOMMENDED:** `superpowers:requesting-code-review` after implementation
- Sub-routing: if feature is UI → also load kind:ui-component skills; if backend → kind:rpc-backend skills

#### kind:refactor
- **REQUIRED:** `simplify`, `codereview`
- **RECOMMENDED:** existing test coverage check before starting
- **FORBIDDEN:** behavior changes (refactor ≠ feature); skipping codereview

#### kind:research
- **REQUIRED:** Agent tool with `subagent_type=Explore` for non-trivial searches
- **RECOMMENDED:** `defuddle` for external docs
- **FORBIDDEN:** Edit / Write tools (research is read-only); creating new files

#### kind:test
- **REQUIRED:** `superpowers:test-driven-development`
- **RECOMMENDED:** read existing test patterns first

#### kind:doc
- **REQUIRED:** none beyond core-rules (RULE-LANGUAGE-CONTRACT)
- **FORBIDDEN:** code edits in same task

#### kind:integration
- **REQUIRED:** `vercel:env-vars` (if env vars added), `superpowers:verification-before-completion`
- **RECOMMENDED:** `vercel:vercel-functions` (Vercel functions), `vercel:ai-sdk` (LLM providers), `vercel:marketplace` (third-party services)
- **Special rule:** never commit secrets; verify via `vercel env pull` before push

#### kind:security
- **REQUIRED:** `security-review`, `superpowers:verification-before-completion`
- **RECOMMENDED:** `security-architect` agent for design-level threats
- **FORBIDDEN:** silent security fixes — every change needs an MC task and audit trail

#### kind:data-fix
- **REQUIRED:** `sparc:supabase-admin`, `superpowers:verification-before-completion`
- **RECOMMENDED:** dry-run with `SELECT` before any `UPDATE` / `DELETE`
- **FORBIDDEN:** schema changes (those are kind:migration)

#### kind:cleanup
- **REQUIRED:** `superpowers:verification-before-completion` (grep before delete)
- **RECOMMENDED:** `simplify`
- **FORBIDDEN:** deleting anything referenced in MC tasks, AGENT.md, or active spec files without checking first

#### kind:meta
- **REQUIRED:** none — meta tasks are coordination artifacts, not implementation
- **RECOMMENDED:** COO updates via `add_comment` on the meta task as substate evolves; child tasks linked via `related_ids`
- **FORBIDDEN:** writing implementation code under a `kind:meta` task — if you find yourself editing files, you are working on the wrong task. Spawn or pick up a child task with the appropriate kind instead.
- **Special rule:** Code agent should NOT pick up `kind:meta` tasks. Only COO works on these. If a `kind:meta` task surfaces in Code agent's queue, it is a routing error — comment and skip.

### Globally forbidden for Code agent

Regardless of `kind:*`, Code agent must NOT auto-load:
- `shishka-mission-control:morning-triage` — superseded by COO Session Start Protocol
- `shishka-mission-control:agent-tracking` — superseded by `agent-rules.md`
- Any `gsd:*` planning commands — those are workflow orchestration, not implementation skills
- `cowork-plugin-management:*` — only relevant if shipping Shishka OS as a plugin

### COO enforcement

When COO creates or triages a tech task:
1. Pick exactly one `kind:*` tag from the enum above
2. If unclear → ask CEO before creation; never default-pick
3. If kind shifts mid-task (e.g. research turned into feature) → close original, open new with correct kind, link via `related_ids`

### Code agent bootstrap (proposed CLAUDE.md L0 addition)

```
3a. After loading task context_files, read tags. If a `kind:*` tag exists:
    - Open docs/operations/skills-services-policy.md
    - Find the matching subsection under "Kind → Skills mapping"
    - Load all REQUIRED skills BEFORE first edit
    - Treat FORBIDDEN as hard constraint, RECOMMENDED as judgment call
3b. If no `kind:*` tag on a tech task → STOP, ask CEO via comment, do not guess
```

Wiring this into actual `CLAUDE.md` is a separate code task (see follow-up in MC).

---

## Review & Revision

This policy should be revisited:
- After 2 weeks (scheduled-tasks decision point)
- When any new skill or MCP server becomes available
- When agent usage patterns shift (measured via MC task `created_by` distribution)
- When a `kind:*` is repeatedly insufficient (signal to add a new kind or split existing one)

The CEO should read only the Executive Summary. Agents should read the Technical Sections relevant to their role. Code agent should treat the Task-Kind Taxonomy as a hard contract.
