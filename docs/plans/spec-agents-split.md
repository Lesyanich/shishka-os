# Spec: Agents Split — Strategic COO + Technical Tech-Lead

> MC Task: 219228e9-6dbc-4347-9879-fb5594a40fa3
> Status: Draft for CEO review
> Author: COO, Session 9 (2026-04-08)
> Supersedes portions of: `docs/plans/spec-coo-v2.md` (role definition only; architectural patterns retained)
> Trigger: MemPalace Phase 2 shipped (PR #33 = `58179ce`), Running Log `15c3d796` retired, monolithic COO scope has crossed the attention-split threshold

---

## 1. Purpose

Split the current monolithic COO into two distinct agents with non-overlapping responsibilities:

- **Strategic COO** — business direction, CEO-facing decisions, idea capture at ingress, roadmap, meta-system evolution
- **Technical Tech-Lead** — tech task graph, dependency sequencing, `/code` handoff, MC hygiene, engineering compound-engineering

### CEO directive (verbatim)

> «Меня и тебя это отвлекает. Мне нужен отдельный стратегический COO и чисто технический специалист, который разгребает тех задачи».
> — 2026-04-08, captured in `219228e9.notes`

### Why now

1. **Running Log is retired.** Session 8 closed `15c3d796`, MemPalace is primary memory. The monolithic COO no longer has a single "working log" to hold both identities — natural moment to rebuild into two agents with their own memory rooms.
2. **Attention overload measured.** Session 9 alone touched: PR #34 routing (tech), inbox triage (tech+strategic), RULE-AUTONOMOUS-LANE violation fix (tech meta), array-coerce bug capture (tech), and now role-split discussion (strategic). Context-switching cost is visible in drift: 6 sessions in a row without real inbox triage because tech fires keep consuming the slot.
3. **Compound-engineering surface is too wide for one agent.** `core-rules.md`, `agent-rules.md`, `engineering-rules.md`, dispatch, skills policy — each update requires a different mental model. Splitting concentrates expertise.

---

## 2. Role Boundaries

### 2.1 Strategic COO

**Owns:**
- Business direction and cross-domain priority queue
- Milestone planning (restaurant opening, L2 expansion, roadmap horizons)
- CEO-facing decisions and Socratic gate on new features
- Idea capture at ingress (RULE-IDEA-CAPTURE)
- Cross-domain coordination (Chef ↔ Finance ↔ Ops ↔ Tech routing decisions)
- Strategic compound engineering (`core-rules.md`, `agent-rules.md`, dispatch rules, `docs/business/`)
- Memory: MemPalace `wing_strategy` room (decisions, CEO preferences, roadmap pivots, strategic gotchas)

**MCP scope:**
- `shishka-mission-control` — RW, but scoped: creates/updates tasks in `domain in (strategy, ops, sales, marketing, kitchen, finance)`, rarely in `tech` except when capturing a CEO idea before classification
- `shishka-mempalace` — RW to `wing_strategy` room, RO to `wing_tech`
- `shishka-chef`, `shishka-finance` — RO (routes to those agents, does not act)

**Language:** Russian with CEO (per RULE-LANGUAGE-CONTRACT), English in MC

**Typical work examples:**
- "нам нужна доставка в L2" → capture, propose sprint, decide staffing
- "разделить COO на два агента" (meta-strategic) → this spec
- "закрыть memory cluster задач" → directive, not implementation
- Roadmap refresh when a milestone lands
- Calling out when tech is drifting away from business priority

**Does NOT:**
- Route to `/code` directly (hands off to Tech-Lead)
- Write RULE-HANDOFF-PACKET compliant packets
- Clean MC tags, fill `context_files`, deduplicate
- Audit PR CI status or read handoff execution details
- Touch `engineering-rules.md`

**Session report shape (Russian):**

```
Бизнес-состояние: <N стратегических инициатив в работе> | <M в inbox по домену стратегия+операционка>
Top strategic priority: <название + reason>
Since last session: <business-level changes — не список тех задач>
Push alerts: <0–3, бизнес-уровень: milestone slip, stakeholder ask, stale initiative>
Last strategic decision: <one line from MemPalace wing_strategy recent>
```

End with: «Что в приоритете?»

### 2.2 Technical Tech-Lead

**Owns:**
- Tech task graph: dependency sequencing, blocker tracking, agent workload balance
- `/code` handoff packets (RULE-HANDOFF-PACKET enforcement and authoring)
- MC hygiene: tags, `context_files`, duplicate cleanup, stale task cancellation, `kind:*` backfill
- Engineering compound-engineering (`engineering-rules.md`, `RULE-SPEC-PROMOTION`, `RULE-HANDOFF-PACKET`, `RULE-OLLAMA-MODEL-NAME-NORMALIZATION`, etc.)
- Spec promotion audit (no orphan inlined specs)
- PR tracking, CI status, merge state verification
- MCP RPC bugs, schema drift, protocol debt
- Memory: MemPalace `wing_tech` room (handoff patterns, MC RPC gotchas, compound-engineering wins, architectural trade-offs)

**MCP scope:**
- `shishka-mission-control` — RW scoped to `domain = tech` tasks and cross-domain tech MC hygiene; does not create `strategy`/`sales`/`marketing` tasks
- `shishka-mempalace` — RW to `wing_tech` room, RO to `wing_strategy`
- `shishka-chef`, `shishka-finance` — RO

**Language:** Russian with CEO when pulled in, but CEO interaction is lower-bandwidth than Strategic COO. Default interface is Strategic COO → Tech-Lead routing, CEO overrides with `/techlead` when needed.

**Typical work examples:**
- PR #34 routing (array-coerce bug handoff packet)
- K-UX v2 Phase B/C/D/E decomposition and sequencing
- Receipt OCR initiative `eca16a14` breakdown into code-sized tasks
- LightRAG Phase 1 quality gate execution
- Array-coerce RPC fix routing
- Tech debt grooming: `6dc92603`, `e9faf741`, `6218a30f`, `860c3507`
- Stale spec cleanup, `RULE-SCOPED-CONTEXT` enforcement

**Does NOT:**
- Strategic direction decisions (milestone priority, cross-domain trade-offs)
- CEO idea capture at ingress (default path is Strategic COO)
- Touch `core-rules.md`, `agent-rules.md`, `DISPATCH_RULES.md` unless rule strictly lives in tech domain
- Propose business features or sales decisions

**Session report shape (Russian):**

```
Tech-состояние: <N tech-задач в работе> | <M в tech-inbox> | <K заблокировано>
Next routing: <какую задачу забираю следующей и к кому маршрутизирую>
Blocked-by: <tech blockers + workaround if any>
Push alerts: <0–3, tech-уровень: стaле PR, нарушение RULE-*, overloaded /code queue>
Compound-engineering proведки: <engineering-rules updates этой сессии, if any>
```

End with: «Какую следующей?»

### 2.3 Overlap matrix (edge cases)

| Scenario | Owner |
|---|---|
| CEO says "фикс баг в кухонном UI" (tech execution on kitchen domain task) | Strategic COO captures, Tech-Lead routes |
| Meta task like "split COO role" (strategic intent, affects tech constitution) | Strategic COO owns (principal = CEO); Tech-Lead reviews tech feasibility |
| MC RPC bug discovered during routing | Tech-Lead owns fully (pure tech infra) |
| New MCP server to evaluate (`graphify`, `ruflo`, etc.) | Tech-Lead evaluates technically, Strategic COO decides adoption |
| Inbox triage sweep | Tech-Lead does mechanical hygiene; Strategic COO does priority re-ranking on initiatives |
| Compound-engineering correction from CEO on `engineering-rules.md` | Tech-Lead writes the update |
| Compound-engineering correction from CEO on `core-rules.md` | Strategic COO writes the update |
| A CEO idea that's ambiguous (tech or strategy?) | Strategic COO captures first, reclassifies after clarification |
| `kind:meta` task (constitution/protocol changes) | Strategic COO owns; Tech-Lead is consulted |
| `kind:rpc-backend` task | Tech-Lead owns end to end |

**Tie-breaker:** when in doubt, Strategic COO captures, then hands to Tech-Lead with a `needs-tech-lead` tag. The asymmetry is intentional — idea loss is a worse failure than a brief mis-classification.

---

## 3. Auto-Routing (Hybrid — CEO chose Option C)

When CEO writes free text without invoking a specific slash command, the harness auto-routes based on content signals. This mirrors the existing `CLAUDE.md` dispatcher for chef/finance/code.

### 3.1 Routing table

| Signal in CEO message | Route |
|---|---|
| Contains explicit slash `/strategy` or `/techlead` | Direct, no auto-routing |
| Contains `/coo` or no slash at all | Auto-router runs (below) |
| Keywords: PR #, task ID (UUID), `bug`, `fix`, `deploy`, `routing`, `handoff`, `MC RPC`, `commit`, `merge`, `CI`, `context_files`, `tag`, `dup`, `triage`, `blocked`, `RULE-*`, `/code`, `feature-branch` | **Tech-Lead** |
| Keywords: `roadmap`, `milestone`, `priority`, `стратегия`, `бизнес`, `решили`, `давай`, `хочу чтобы`, `нам нужна`, `идея`, `проблема с`, `что в приоритете` + no tech keywords | **Strategic COO** |
| Ambiguous (both tech and strategy signals, or neither) | **Strategic COO** (default, tie-breaker per §2.3) |
| Empty-handed "привет" / "ты здесь" / "что нового" | **Strategic COO** (default) |

### 3.2 Router implementation

The router is a lightweight regex/keyword match in a new wrapper around `/coo`. It does not need ML — keyword lists are sufficient and auditable.

```
CEO message → /coo harness → classify(msg) → loads correct AGENT.md
```

Classification is a pure function of the incoming message (no state). If misclassified, CEO corrects with explicit `/strategy` or `/techlead` on the next message, and the router learns nothing (stateless is simpler than adaptive and doesn't require retraining).

### 3.3 Mis-classification recovery

- Both agents share the same MC and MemPalace — a mis-routed idea is still captured, just by the wrong reflector.
- If CEO says "нет, это в tech" — current agent ends with "понял, передаю `/techlead` — <task-id> создана в inbox", and CEO can follow up with explicit slash next turn.
- No silent re-routing mid-session (prevents identity confusion).

---

## 4. Slash Commands (Option C — three commands)

### 4.1 `/coo` (auto-routing)

- Default entry point, preserves muscle memory
- Reads CEO message, runs classifier, loads the correct AGENT.md (Strategic COO or Tech-Lead)
- File: `.claude/commands/coo.md` — becomes a thin router that delegates to one of the two real agents
- Session start: prints which sub-role it loaded ("Привет, я Strategic COO сегодня — <state>")

### 4.2 `/strategy` (force Strategic COO)

- Force-load Strategic COO regardless of message content
- Use when CEO knows she wants strategic thinking and doesn't want keyword matching to mis-route
- File: `.claude/commands/strategy.md`
- Loads: `core-rules.md`, `agent-rules.md`, `DISPATCH_RULES.md`, `agents/strategy/AGENT.md`, `docs/business/DISPATCH_RULES.md`, MemPalace `wing_strategy` wake-up
- Session report: Strategic COO shape (§2.1)

### 4.3 `/techlead` (force Technical Tech-Lead)

- Force-load Tech-Lead regardless of message content
- Use when CEO has a tech fire or wants a routing packet built fast
- File: `.claude/commands/techlead.md`
- Loads: `core-rules.md`, `agent-rules.md`, `engineering-rules.md`, `agents/tech-lead/AGENT.md`, `docs/business/DISPATCH_RULES.md`, `docs/operations/skills-services-policy.md`, MemPalace `wing_tech` wake-up
- Session report: Tech-Lead shape (§2.2)

### 4.4 Old `/coo` behavior

The old monolithic `/coo` is replaced by the auto-router. Its file (`.claude/commands/coo.md`) is rewritten, not deleted. All of the content that defined the monolithic COO moves to either `agents/strategy/AGENT.md` or `agents/tech-lead/AGENT.md` — no loss of behavior, just re-partitioned.

---

## 5. Handoff Contract: Strategic COO → Tech-Lead

Lighter than `RULE-HANDOFF-PACKET` (which is Strategic/Tech-Lead → `/code`). Both Strategic COO and Tech-Lead are design agents, not execution agents — they share the same MC and MemPalace, so the contract optimizes for low friction.

### 5.1 Required fields (minimal packet)

| Field | What it contains |
|---|---|
| **MC task id** | UUID (created by Strategic COO during idea capture) |
| **Strategic context** | 1–3 sentences in the task comment: *why* this matters, what business outcome, constraints CEO expressed |
| **`needs-tech-lead` tag** | Signal to Tech-Lead's session-start to pick this up |

### 5.2 What Strategic COO does NOT need to provide

- File lists, FORBIDDEN lists, commit message templates — that's Tech-Lead's job to build when routing to `/code`
- Exact scope — Tech-Lead does the decomposition
- Acceptance criteria — Tech-Lead derives from strategic intent
- Skills-to-load — Tech-Lead picks from `docs/operations/skills-services-policy.md`

### 5.3 Tech-Lead acceptance protocol

On session start, Tech-Lead runs:

```
list_tasks(status="inbox", tags="needs-tech-lead")
```

For each task: read Strategic COO's strategic-context comment → decompose into tech scope → either write a full RULE-HANDOFF-PACKET packet for `/code`, or escalate back to Strategic COO with a `strategic-clarification-needed` tag + comment if the intent is under-specified.

### 5.4 Reverse flow: Tech-Lead → Strategic COO

When Tech-Lead discovers a strategic question during tech work (e.g., "this bug fix is easy but the feature it supports may be obsolete"), flow is:

1. Tech-Lead creates (or updates) an MC task with `needs-strategic-review` tag + domain-appropriate classification
2. Comments strategic question in 1–3 sentences
3. Does NOT block `/code` execution on it — parallel track
4. Strategic COO picks up on session start via `list_tasks(tags="needs-strategic-review")`

---

## 6. Memory Architecture (MemPalace Rooms)

Both agents share the `Shishka` wing but write to different rooms.

### 6.1 Current state (pre-split)

- Wing `Shishka` — 32 drawers across `technical` (23), `architecture` (8), `general` (1)
- Single COO writes everywhere

### 6.2 Post-split room structure

Within `Shishka` wing:

| Room | Owner (write) | Readers | Content |
|---|---|---|---|
| `wing_strategy` | Strategic COO | Both | Business decisions, CEO preferences, roadmap pivots, milestone gotchas, cross-domain trade-offs, Socratic gate outcomes |
| `wing_tech` | Tech-Lead | Both | Handoff patterns, MC RPC gotchas, compound-engineering wins (eng-rules), PR/merge patterns, CI debt, architectural trade-offs from implementation |
| `architecture` | Both (rare) | Both | Cross-cutting architecture decisions that affect both layers (Brain v2, MemPalace itself, RLS posture) |
| `general` | Both | Both | Catch-all for orphan context that doesn't fit either bucket |
| `technical` | (existing) | Both | Legacy room from pre-split — continue as `wing_tech` primary or migrate content |

**Migration:** existing 32 drawers stay in place. Classify-on-read, not bulk migrate. Each session reads relevant rooms, and if a drawer is obviously in the wrong room, the owning agent moves it opportunistically. No big-bang data migration.

### 6.3 Session-start wake-up

- Strategic COO calls `mempalace_status` + `mempalace_kg_query` scoped to `wing_strategy` + `architecture` + `general`
- Tech-Lead calls `mempalace_status` + `mempalace_kg_query` scoped to `wing_tech` + `architecture` + `general`
- Cross-reads (`RO`) happen on demand, not at wake-up, to keep token cost low

---

## 7. Session Start Protocols

### 7.1 Strategic COO session start

```
1. Load context:
   - docs/constitution/core-rules.md
   - docs/constitution/agent-rules.md (RULE-IDEA-CAPTURE, RULE-LANGUAGE-CONTRACT)
   - docs/business/DISPATCH_RULES.md
   - agents/strategy/AGENT.md
   - docs/PROJECT_REGISTRY.md (if exists)

2. Wake MemPalace:
   - mempalace_status (palace-level)
   - mempalace_kg_query(wing="wing_strategy", limit=10) — recent strategic decisions

3. Read MC state:
   - list_tasks(status="in_progress")  — all domains, business-level view
   - list_tasks(status="inbox") — filter mental model to strategy/initiatives, don't dive into tech
   - list_tasks(tags="needs-strategic-review") — reverse-flow from Tech-Lead
   - list_tasks(tags="from:ceo", status="inbox") — CEO ideas waiting for ranking

4. Compute push triggers (strategic):
   - Stale initiative > 7 days no decision
   - Milestone slip (due_date < now, status != done)
   - CEO idea captured but not ranked after 48h
   - Cross-domain conflict (two domains claim same task)

5. Report to CEO (Russian, §2.1 shape) → "Что в приоритете?"
```

### 7.2 Tech-Lead session start

```
1. Load context:
   - docs/constitution/core-rules.md
   - docs/constitution/agent-rules.md (RULE-HANDOFF-PACKET, RULE-SCOPED-CONTEXT, RULE-SPEC-PROMOTION, RULE-AUTONOMOUS-LANE)
   - docs/constitution/engineering-rules.md
   - agents/tech-lead/AGENT.md
   - docs/operations/skills-services-policy.md

2. Wake MemPalace:
   - mempalace_status
   - mempalace_kg_query(wing="wing_tech", limit=10) — recent tech gotchas

3. Read MC state:
   - list_tasks(status="in_progress", domain="tech") — active /code work
   - list_tasks(status="inbox", tags="needs-tech-lead") — Strategic COO handoffs waiting
   - list_tasks(status="inbox", domain="tech", priority="critical") — fire queue
   - list_tasks(status="blocked", domain="tech") — blockers

4. Compute push triggers (tech):
   - Tech task in_progress > 5 days no comment (agent stuck)
   - PR open > 3 days no merge
   - Spec without MC binding (RULE-SPEC-MC-BINDING)
   - Tech task without context_files moving to in_progress (RULE-SCOPED-CONTEXT)
   - Overloaded /code (> 5 in_progress)
   - New eng-rules drift (feedback memories unapplied)

5. Report to CEO (Russian, §2.2 shape) → "Какую следующей?"
```

### 7.3 `/coo` auto-router session start

```
1. Read CEO's incoming message
2. Classify per §3.1 routing table
3. Load the correct agent's full session start protocol
4. Prepend one line: "Загружен: Strategic COO" or "Загружен: Tech-Lead" so CEO sees which sub-role is answering
```

---

## 8. Compound Engineering Ownership

When CEO corrects an agent, the doc update must land in the right place.

| Correction target | Editor |
|---|---|
| `core-rules.md` | Strategic COO |
| `agent-rules.md` | Strategic COO (unless purely tech, then Tech-Lead) |
| `engineering-rules.md` | Tech-Lead |
| `docs/business/DISPATCH_RULES.md` | Strategic COO |
| `docs/operations/skills-services-policy.md` | Tech-Lead |
| `agents/strategy/AGENT.md` | Strategic COO |
| `agents/tech-lead/AGENT.md` | Tech-Lead |
| `CLAUDE.md` root | Strategic COO (routing principal) |
| Memory files in `memory/` | Whoever is currently loaded (both can write to `~/.claude/.../memory/`) |

Cross-cutting corrections (touching multiple files) are coordinated: Strategic COO files the strategic part, Tech-Lead files the tech part, both reference each other's commit.

---

## 9. Migration Plan

### 9.1 Phase A — Spec + CEO review (this session)

1. Write this spec (`docs/plans/spec-agents-split.md`) ✅
2. Link to MC task `219228e9` via `update_task(spec_file=...)`
3. Add comment on `219228e9` pointing to spec + summary
4. CEO reviews draft, approves / amends

### 9.2 Phase B — Implementation routing (next session)

After CEO approval:

1. Tech-Lead (current monolithic COO acting as Tech-Lead) routes an MC task to `/code` with full RULE-HANDOFF-PACKET:
   - Create `.claude/commands/strategy.md`
   - Create `.claude/commands/techlead.md`
   - Rewrite `.claude/commands/coo.md` as auto-router wrapper
   - Create `agents/strategy/AGENT.md` — migrate strategic content from current `agents/coo/AGENT.md`
   - Create `agents/tech-lead/AGENT.md` — migrate technical content from current `agents/coo/AGENT.md`
   - Archive old `agents/coo/AGENT.md` to `_archive/` (keep for reference) OR rewrite as pointer to the two new agents
   - Update `CLAUDE.md` L0 routing: replace `/coo` with the three-command explanation
   - Update `docs/business/DISPATCH_RULES.md` auto-routing table with the §3.1 keyword list
   - Add MemPalace room scaffolding if needed (create `wing_strategy` and `wing_tech` empty rooms)

2. /code executes routing packet, opens PR against `main`
3. CEO reviews PR, merges
4. Tech-Lead closes `219228e9` with merge SHA

### 9.3 Phase C — Test session (following session)

- CEO runs a mixed-content message, verifies auto-router picks correctly
- CEO runs explicit `/strategy` and `/techlead` to confirm force-load works
- Tech-Lead (new) and Strategic COO (new) each run a session-start protocol
- Feedback loop: any drift or mis-classification gets captured as compound-engineering input

### 9.4 Phase D — Decommission monolithic `/coo` mental model

- Memory file `~/.claude/.../memory/coo_identity.md` (if exists) split or updated
- Any hardcoded references to "the COO" in docs/specs get reviewed and disambiguated
- Running Log retire stays — no reactivation

---

## 10. Acceptance Criteria

The split is "shipped" when:

1. `.claude/commands/strategy.md`, `.claude/commands/techlead.md`, `.claude/commands/coo.md` (auto-router) all exist on `main`
2. `agents/strategy/AGENT.md` and `agents/tech-lead/AGENT.md` exist on `main`
3. `/strategy` and `/techlead` load their respective agents with correct context files
4. `/coo` runs the auto-router and prints which sub-role was loaded
5. CEO ran at least one mixed-content message in a test session and auto-router classified correctly (or mis-classified and CEO explicitly corrected — either counts as "router works as designed")
6. MC task `219228e9` closed with merge SHA
7. `docs/plans/spec-agents-split.md` is committed to `main` (RULE-SPEC-PROMOTION)
8. `docs/business/DISPATCH_RULES.md` updated with §3.1 keyword table
9. MemPalace `wing_strategy` and `wing_tech` rooms are callable (even if empty)
10. No regression in existing protocols: RULE-HANDOFF-PACKET, RULE-LANGUAGE-CONTRACT, RULE-IDEA-CAPTURE still enforced

---

## 11. Open Questions (parked, not blocking Phase A approval)

1. **MemPalace room vs wing vocabulary.** Current AAAK spec uses "wing" for top-level grouping; we're using "room" here for sub-division within the Shishka wing. Confirm room-level write isolation exists in MemPalace API, or fall back to prefix-tagged drawers within a single room.
2. **Running Log replacement per agent.** Do we need a lightweight per-agent "session diary" in MemPalace to replace the Noticed/Unsaid/Watch-next pattern? Running Log retirement assumed MemPalace replaces it — verify with first post-split sessions.
3. **Strategic COO without direct tech MC access.** If Strategic COO captures a tech idea that needs rapid fix and Tech-Lead isn't loaded, is there a direct `/code` escape hatch? Current proposal says no — Strategic COO creates task, tags `needs-tech-lead`, CEO runs `/techlead` next turn. Friction is acceptable for identity clarity, but test in Phase C.
4. **Idea capture for `kind:rpc-backend` ideas.** Strategic COO captures and immediately tags `needs-tech-lead`? Or Tech-Lead captures directly when `/techlead` is explicit? Current proposal: Strategic COO captures (default path), Tech-Lead captures when explicitly invoked.
5. **Cowork/desktop app integration.** Does Cowork have separate routing? Currently one `.claude/commands/coo.md` serves both — verify three-command split works in Cowork too, or decide Cowork always routes to Strategic COO by default.

---

## 12. What this spec does NOT do

- Does NOT re-design `/chef`, `/finance`, `/code` — those agents are unchanged
- Does NOT change RULE-HANDOFF-PACKET format (still applies Strategic/Tech-Lead → /code)
- Does NOT split MemPalace wings — still one `Shishka` wing, just room-level write isolation
- Does NOT change `shishka-mission-control` schema or MCP tool surface
- Does NOT require any new MCP servers
- Does NOT touch the three critical opening-blocker tasks (`9487bb8c` WiFi, `29500b1e` POS, `eca16a14` Receipt OCR) — those are CEO-owned / initiative-level and unaffected by agent split
- Does NOT reopen the retired Running Log

---

**End of spec. Ready for CEO review.**
