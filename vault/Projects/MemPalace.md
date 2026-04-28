---
title: MemPalace
type: project
tags: [project, brain, memory, conversation]
date: 2026-04-08
status: paused
domain: "[[Domains/Admin Panel]]"
mc_task: null
spec: docs/plans/spec-mempalace-phase2.md
branch: feature/shared/mempalace-phase2
pr_numbers: []
start: 2026-04-08
end: null
related:
  - "[[Open Questions/mempalace-fate]]"
aliases: [L1 Conversation Memory]
---

# MemPalace

> [!info] Project
> Local L1 conversation-memory service for AI agents — verbatim transcripts in ChromaDB + SQLite with semantic retrieval.

## Objective

Provide the conversation layer of [[Projects/Shishka Brain v2]] so agents answer "what did we decide last time about X" without CEO re-explaining. Stores raw agent↔CEO transcripts under `~/.mempalace/` (FileVault), backs up nightly as `age`-encrypted tarballs to GDrive, and exposes 19 MCP tools for cross-agent queries.

## Current State

- **Phase:** paused — installed and storage-locked, but **MCP currently unwired as of 2026-04-28**
- **Owner:** [[People/Lesia]]
- **Spec:** `docs/plans/spec-mempalace-phase2.md`
- **Branch:** `feature/shared/mempalace-phase2`

## Recent Outcomes

- 2026-04-08 — storage strategy locked (B+ Mac live + age-encrypted GDrive backups, Apple Keychain for keys)
- 2026-04-12 — Phase 2 spike completed; service installs, but MCP server not registered in `.mcp.json`
- 2026-04-28 — labeled paused; agent routing still falls back to MC Running Log + Auto Memory

## Risks & Open Questions

- [[Open Questions/mempalace-fate]] — wire MCP into `.mcp.json` or deprecate to git-diary-only
- Pre-ingest secret filter not yet validated against fixtures
- Author retraction on AAAK compression — integrity flag to monitor

## See Also

- Spec: `docs/plans/spec-mempalace-phase2.md`
- Related: [[Projects/Shishka Brain v2]], [[Projects/Graphify Pipeline]]
- Domain: [[Domains/Admin Panel]]
