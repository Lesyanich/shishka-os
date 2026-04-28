---
title: 2026-04-22 — Graphify MCP wired to agents
type: milestone
tags:
  - milestone
  - release
  - tech
date: 2026-04-22
status: closed
kind: release
domain: "[[Domains/Admin Panel]]"
related:
  - "[[Projects/Graphify Pipeline]]"
  - "[[Projects/Shishka Brain v2]]"
aliases: []
---

# 2026-04-22 — Graphify MCP wired to agents

> [!success] Milestone
> Graphify MCP mode connected — all agents now have Brain L2 + L3 access.

## What Happened

MC task `600bd37a` wired Graphify's MCP server into the agent runtime, giving every agent read access to Brain L2 (corpus, code, images, PDFs) and L3 (graph relations). Tracked against `docs/plans/spec-graphify-phase3.md`.

## Drivers

Direct continuation of the [[2026-04-12-lightrag-decommissioned]] cleanup — Graphify needed a stable agent-facing interface to fully replace LightRAG's role.

## Impact

- Code: Graphify MCP server + agent client wiring
- Process: agents query Graphify instead of grepping files for prior knowledge
- Data: graph + corpus indexed across code, docs, images, PDFs
- People: every agent shares the same retrieval surface

## See Also

- Project: [[Projects/Graphify Pipeline]], [[Projects/Shishka Brain v2]]
- Sibling: [[2026-04-12-lightrag-decommissioned]]
- Spec: `docs/plans/spec-graphify-phase3.md`
