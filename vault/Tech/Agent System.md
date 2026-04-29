---
title: Agent System
type: page
tags: [tech, agents, coordination]
date: 2026-04-29
status: active
related:
  - "[[Tech/]]"
  - "[[Tech/MCP Servers]]"
  - "[[Database/RLS Policies]]"
---

# Agent System

How multiple AI agents coordinate on Shishka without stepping on each other. Source: Auto Memory `project_multi_agent_coordination_v2.md`, MC `3f41841d`, PR #147.

## Agents

| Agent | Brains (instructions) | Hands (DB write access) |
|---|---|---|
| **Chef** | `agents/chef/AGENT.md` | `services/mcp-chef/` (writes `nomenclature`, `bom_structures`, `recipes_flow`, `equipment`, `supplier_catalog`) |
| **Finance** | `agents/finance/AGENT.md` | `services/mcp-finance/` (writes `financial_transactions`, `receipt_jobs`, `capex_assets`) |
| **COO** | `agents/coo/AGENT.md` | Mostly read-only; uses MC for emit-task |
| **Strategy** | `agents/strategy/AGENT.md` | MC writes only |
| **Designer** | `agents/designer/AGENT.md` | Reads brand assets; produces design files (no DB writes) |
| **Procurement** | `agents/procurement/AGENT.md` | Read-only DB; uses MC to emit purchase tasks |
| **Tech-Lead** | `agents/tech-lead/AGENT.md` | Reviews code; no DB writes |
| **Invoice Parser** | `agents/invoice-parser/` | Via Finance MCP only |
| **Dispatcher** *(planned)* | `docs/business/DISPATCH_RULES.md` | Will live as `services/mcp-dispatcher/` |

Each agent has an English `AGENT.md` (instructions), domain-specific files, and (for write-access agents) a paired MCP server.

## Mission Control as coordinator

MC (`business_tasks` + `business_initiatives` + `sprints`) is **the** central nervous system across agents. Every action becomes — or starts from — an MC task.

- Agents emit tasks via `mcp-mission-control.emit_business_task`
- Agents claim tasks via `update_task(status=in_progress, …)`
- Agents close tasks via `update_task(status=done, notes='...')` AND must update vault per `RULE-VAULT-WRITE-ON-CLOSURE`

## Multi-session coordination — v2 (PR #147)

When **multiple Claude Code sessions** run in parallel (e.g. owner has terminal + a parallel `/finance` session + a remote agent in another worktree), they coordinate through the DB.

### Session ID

Each Claude Code session gets a unique ID at startup, written to `.claude/.session-id`:

```
claude-{model}-session-{suffix}
```

where `suffix` is the first 8 chars of Claude Code's `session_id` (preferred) or a fallback `MMDD-HHMM-rand4`. **Read** the ID from `.claude/.session-id`; never construct it inline.

### Claim gate (hard, enforced)

The `.claude/hooks/claim-gate-pretool.sh` PreToolUse hook checks: when an agent tries `update_task(status='in_progress')` on a task already claimed by another session, the hook **denies** the call.

```
own session_id == related_ids.claimed_by   →  allowed (resume)
others, claimed_at < 2h ago                →  blocked (active)
others, claimed_at > 2h ago, no commits    →  CEO must approve takeover
```

### Heartbeat — `updated_at`

Every action on an in-progress task touches `updated_at`. The session-start hook surfaces tasks owned by other sessions and warns the agent — preventing accidental concurrent edits to the same branch.

### Branch exclusivity

One git branch = one agent at a time. If two sessions both try to claim tasks pointing to the same `git_branch`, the second is blocked.

## Phases (machine-readable handoff)

The `related_ids.phase` field on every in-progress task tells other agents where you are without interrupting:

```
context-loading  →  setting up, reading spec
implementation   →  writing code / files
testing          →  running build, lint, tests
review           →  PR created, awaiting merge
done             →  task completed
```

## Vault writes on closure

When an agent closes an MC task (`update_task(status=done)`), it must append/update the relevant vault note(s):

- Decision was made → `Decisions/D-NNN-<slug>.md`
- Project advanced → update `Projects/<name>.md` status (if Projects/ folder exists in your ontology)
- New open question discovered → `Open Questions/<slug>.md`
- Domain knowledge surfaced → update relevant entity page (`<Domain>/<page>.md`)

Skip only when the task is purely operational (cleanup, retry, no new knowledge). Source: `RULE-VAULT-WRITE-ON-CLOSURE` in `docs/constitution/agent-rules.md`.

## Conversation language vs storage language

Per `RULE-LANGUAGE-CONTRACT`:

- **Conversation** — the human's language (CEO ↔ agent in Russian; partner ↔ in their language)
- **Storage** (DB rows, MC tasks, code, commits, specs, vault) — **English only, no exceptions**

This is non-negotiable — multilingual storage breaks search, breaks agent retrieval, breaks consistency.

## Agent personas

Each agent has a distinct **persona** captured in its `AGENT.md`:

- **COO** — terse, ends with routing advisory ("/code 7fcaec5d"), no chat packets
- **Chef** — sensory + technical, applies kitchen philosophy red lines
- **Finance** — number-first, conservative, classifies before commenting
- **Procurement** — comparison-driven, posts comparison tables on tasks

Persona drift is corrected via Auto Memory feedback loops (`feedback_coo_*` files).

## See Also

- [[Tech/MCP Servers]] — the MCPs each agent calls
- [[Database/Domain Contracts]] — what each agent's MCP can write
- `agents/*/AGENT.md` — individual agent instructions
- Auto Memory: `project_multi_agent_coordination_v2.md`, `feedback_in_progress_gate.md`, `feedback_parallel_session_branch_switch.md`
- `docs/plans/spec-multi-agent-coordination.md` — the v2 design rationale
