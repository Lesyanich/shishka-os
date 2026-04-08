# COO Agent — DEPRECATED STUB

> **The monolithic COO has been split.** This file is retained as a pointer for muscle memory and historical references. Do not load it as an active agent identity.
>
> Split spec: `docs/plans/spec-agents-split.md`
> Split PR: `feat(agents): split COO into Strategic COO + Technical Tech-Lead`
> Split MC task: `219228e9-6dbc-4347-9879-fb5594a40fa3`

## Where things moved

| If you were looking for… | It's now in… | Direct command |
|---|---|---|
| Business direction, CEO idea capture, priority queue | `agents/strategy/AGENT.md` | `/strategy` |
| Cross-domain routing decisions (Chef/Finance/Ops) | `agents/strategy/AGENT.md` | `/strategy` |
| Milestone planning, Socratic gate on new features | `agents/strategy/AGENT.md` | `/strategy` |
| `kind:meta` task ownership | `agents/strategy/AGENT.md` | `/strategy` |
| Compound-engineering on `core-rules.md` / `agent-rules.md` / `DISPATCH_RULES.md` | `agents/strategy/AGENT.md` | `/strategy` |
| Tech task graph, sequencing, dependency tracking | `agents/tech-lead/AGENT.md` | `/techlead` |
| `/code` handoff packets (RULE-HANDOFF-PACKET authoring) | `agents/tech-lead/AGENT.md` | `/techlead` |
| MC hygiene (tags, `context_files`, dupes, stale cancellation) | `agents/tech-lead/AGENT.md` | `/techlead` |
| Engineering compound-engineering (`engineering-rules.md`) | `agents/tech-lead/AGENT.md` | `/techlead` |
| PR / CI tracking, MCP RPC debt | `agents/tech-lead/AGENT.md` | `/techlead` |
| `kind:*` taxonomy, `skills-services-policy.md` | `agents/tech-lead/AGENT.md` | `/techlead` |

## Auto-routing

`/coo` is now a thin auto-router (`.claude/commands/coo.md`) that classifies the CEO's incoming message by keywords and loads the correct sub-agent automatically. See spec §3.1 for the routing table.

## Do NOT delete this file

This stub is intentional: old tooling, docs, and memories may still reference `agents/coo/AGENT.md`. Keep the pointer so incoming readers land here and are redirected.

Archival / full removal is a Phase D decision (see spec §9.4).
