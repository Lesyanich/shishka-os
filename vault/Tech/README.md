---
title: Tech
type: entity
tags: [tech, infra, agents]
date: 2026-04-29
status: active
related:
  - "[[Database/]]"
  - "[[Operations/KDS]]"
---

# Tech

The infrastructure substrate Shishka runs on — stack, MCP servers, agent system, deployment, hooks, secrets. This folder is the **engineering map** of the project: what's where, who runs it, how it ships.

> [!info] One-line definition
> Tech is the SRE-flavored view of Shishka — Vite/React 19 admin panel + Supabase Postgres + 4 MCP servers + 8 AI agents + Vercel deploy + GitHub-anchored Husky/AI-TDD pipeline.

## Sub-pages

- [[Tech/Architecture]] — high-level system architecture (moved from `Architecture/`)
- [[Tech/Stack]] — Vite/React/Tailwind + Supabase + AI SDKs (versions, packages)
- [[Tech/Agent System]] — multi-agent coordination, claim-gate, session IDs, MC-as-coordinator
- [[Tech/MCP Servers]] — `mcp-mission-control`, `mcp-finance`, `mcp-chef`

## Where things live

| Asset | Location |
|---|---|
| Top-level repo map | `PROJECT_MAP.md` |
| Tech-stack ledger | `TECH_STACK.md` |
| Constitution rules | `docs/constitution/core-rules.md` |
| Husky pre-commit | `.husky/pre-commit` |
| Husky post-commit | `.husky/post-commit` |
| Claim-gate hook | `.claude/hooks/claim-gate-pretool.sh` |
| Sessions | `.claude/.session-id` (per-machine) |
| MCP config | `.claude/.mcp.json` |
| GitHub workflows | `.github/workflows/` |
| Vercel project | `shishka-os` (auto-deploys `main`) |

## Adjacent entities

- [[Database/]] — the data layer Tech orchestrates
- [[Operations/KDS]] — one of the surfaces Tech delivers
- [[Brand/Visual System]] — design tokens consumed by the admin panel

## Constitution rules touching Tech

- **`RULE-LANGUAGE-CONTRACT`** — English in storage (DB, MC, code, commits, vault); local language in conversation only
- **`RULE-NO-DIRECT-DB-EDITS`** — only via SQL migrations
- **`RULE-VAULT-WRITE-ON-CLOSURE`** — agents append/update vault notes when closing MC tasks
- **`RULE-IN-PROGRESS-GATE`** — first action on any MC task is `update_task(in_progress)`
- **`RULE-CLAIM-GATE`** — branch + task ownership enforced by `.claude/hooks/claim-gate-pretool.sh`

## Recent decisions / milestones

- 2026-04-12 — LightRAG decommissioned; Graphify is the new code+docs graph
- 2026-04-22 — Graphify MCP wired into agents (MC `600bd37a`)
- 2026-04-28 — Multi-agent coordination v2 — unique session IDs, claim-gate, heartbeat (PR #147)
- 2026-04-29 — Brain consolidation — single `spec-brain-system.md` replaces 7 prior specs (PR #155)

See `vault/Milestones/` and `vault/Decisions/` for the full history (currently sparse — the dual write-path will fill these over time).

## See Also

- `PROJECT_MAP.md` — top-level entry point for any LLM or new developer
- `TECH_STACK.md` — version-by-version breakdown
- `docs/constitution/` — system rules
- Auto Memory: `project_admin_panel_stack.md`, `project_multi_agent_coordination_v2.md`
