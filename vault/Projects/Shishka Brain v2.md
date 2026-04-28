---
title: Shishka Brain v2
type: project
tags: [project, brain, memory, architecture]
date: 2026-04-08
status: active
domain: "[[Domains/Admin Panel]]"
mc_task: null
spec: docs/plans/spec-shishka-brain.md
branch: feature/shared/shishka-brain
pr_numbers: []
start: 2026-04-08
end: null
related:
  - "[[Milestones/2026-04-12-lightrag-decommissioned]]"
aliases: [Brain v2, Three-Layer Memory]
---

# Shishka Brain v2

> [!info] Project
> Three-layer memory architecture so AI agents stop losing context between sessions.

## Objective

Stack three orthogonal memory layers — verbatim conversations (MemPalace), unified knowledge graph (Graphify over code+docs+bible+images), and the action ledger (MC tasks) — so any agent can recover context without CEO re-explaining. Each layer answers a different kind of question; none replaces another.

## Current State

- **Phase:** partial — L2+L3 (Graphify) live, L1 (MemPalace) MCP unwired, LightRAG removed
- **Owner:** [[People/Lesia]]
- **Spec:** `docs/plans/spec-shishka-brain.md` (needs post-LightRAG rewrite)
- **Branch:** `feature/shared/shishka-brain` (umbrella)

## Recent Outcomes

- 2026-04-12 — LightRAG decommissioned, GCP VM stopped, Phase 1 layer removed (see [[Milestones/2026-04-12-lightrag-decommissioned]])
- 2026-04-12 — Graphify installed locally, covers L2+L3 in a single graph (1,750 nodes / 1,906 edges)
- 2026-04-28 — MemPalace status downgraded to paused; spec needs rewrite to reflect LightRAG removal

## Risks & Open Questions

- [[Open Questions/mempalace-fate]] — wire MemPalace MCP into `.mcp.json` or deprecate to git-diary-only
- [[Open Questions/lightrag-supabase-cleanup]] — `LIGHTRAG_*` Supabase tables in 30-day grace, then DROP

## See Also

- Spec: `docs/plans/spec-shishka-brain.md`
- Related: [[Projects/Graphify Pipeline]], [[Projects/MemPalace]], [[Projects/Knowledge Vault Bootstrap]]
- Domain: [[Domains/Admin Panel]]
