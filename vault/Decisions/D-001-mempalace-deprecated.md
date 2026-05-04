---
title: D-001 — MemPalace deprecated
type: decision
id: D-001
tags: [decision, brain, mempalace, archive]
date: 2026-04-29
status: ratified
ratified_by: lesia
related:
  - "[[Tech/]]"
  - "[[Milestones/2026-04-29-brain-consolidation]]"
aliases: [mempalace-deprecated]
---

# D-001 — MemPalace deprecated

> [!info] Decision
> Archive MemPalace (`services/mempalace/`) as the L1 conversation memory layer. Do not wire MCP. Do not invest further until cross-session conversation memory becomes a real pain again.

## Context

MemPalace was specced in 2026-04 (`spec-mempalace-phase2.md`) as the L1 conversation memory store: ChromaDB + SQLite + 19 MCP tools, FileVault-backed local storage with `age`-encrypted backups.

The code was written. The MCP server was never registered in `.claude/.mcp.json`. No agent ever queried MemPalace in production. Twelve months later, the practical problem MemPalace was meant to solve — cross-session context loss — is covered by:

- **`~/.claude/projects/.../memory/`** (Auto Memory): Claude-private patterns, user profile, feedback rules
- **`.claude/skills/session-diary/`**: structured git-log-based handover written at session end
- **MC task `notes` and `related_ids.phase`**: machine-readable in-flight state for any task

CEO confirmed 2026-04-29: this skill is already part of the new Claude harness. Keeping a separate ChromaDB instance in the stack is overhead without a corresponding pain.

## Decision

1. Move `services/mempalace/` → `_archive/services/mempalace/` (separate small task, not blocking).
2. Remove the `/brain/memory` admin route (separate small task).
3. Do not register the MemPalace MCP server in `.claude/.mcp.json`.
4. Keep `services/mempalace/age-recipient.txt` and backup scripts in archive in case L1 conversation memory becomes necessary later.

## Consequences

- One fewer service to maintain
- No semantic search across past agent conversations — accepted, agents use Auto Memory + session-diary
- If L1 conversation memory becomes a real pain again, revive from archive or pick a fresher tool

## See Also

- Spec (consolidated): `docs/plans/spec-brain-system.md` §6
- Spec (archived): `docs/plans/_archive/spec-mempalace-phase2.md`
- Audit task: `a180ff33-c1b5-49d2-b2c8-98c2f49b94ac`
