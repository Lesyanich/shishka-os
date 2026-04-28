---
title: Graphify Pipeline
type: project
tags: [project, brain, graph, knowledge]
date: 2026-04-12
status: active
domain: "[[Domains/Admin Panel]]"
mc_task: null
spec: docs/plans/spec-graphify-phase3.md
branch: feature/shared/graphify-phase3
pr_numbers: [141, 143]
start: 2026-04-12
end: null
related:
  - "[[Milestones/2026-04-12-lightrag-decommissioned]]"
  - "[[Milestones/2026-04-22-graphify-mcp-wired-to-agents]]"
aliases: [Graphify, L2/L3 Knowledge Graph]
---

# Graphify Pipeline

> [!info] Project
> Local NetworkX + Leiden pipeline that turns the entire repo (code + docs + bible + agents + PDFs + images + vault) into one structural graph powering `/brain/knowledge`.

## Objective

Provide L2+L3 in [[Projects/Shishka Brain v2]] as a single local graph instead of a hosted RAG service. Replaced LightRAG on 2026-04-12 — same corpus plus code, images, and PDFs at 93.5x token reduction. Built-in `--mcp` mode gives every agent direct query access; the admin panel reads `graph.json` + `graph-analytics.json` to render the vis-network view.

## Current State

- **Phase:** in production, incremental re-index via `graphify --update`
- **Owner:** [[People/Lesia]]
- **Spec:** `docs/plans/spec-graphify-phase3.md`
- **Install:** `services/graphify/.venv`, output in `graphify-out/`
- **PRs:** #141, #143 (`.graphifyignore` filters for receipts and tests)

## Recent Outcomes

- 2026-04-12 — installed locally, replaces LightRAG (see [[Milestones/2026-04-12-lightrag-decommissioned]])
- 2026-04-22 — MCP mode wired into all agents (see [[Milestones/2026-04-22-graphify-mcp-wired-to-agents]])
- 2026-04-28 — vault content pending render: needs Phase 3 of [[Projects/Knowledge Vault Bootstrap]] for new categories

## Risks & Open Questions

- Code graph is stale within hours of ingest — accepted, runs nightly via `--update`
- Vault folders not yet matched in `BrainKnowledgePage.tsx` `CATEGORIES` array

## See Also

- Spec: `docs/plans/spec-graphify-phase3.md`
- Related: [[Projects/Shishka Brain v2]], [[Projects/Knowledge Vault Bootstrap]]
- Domain: [[Domains/Admin Panel]]
