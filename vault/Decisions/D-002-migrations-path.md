---
title: D-002 — Canonical migrations path is services/supabase/migrations/
type: decision
id: D-002
tags: [decision, tech]
date: 2026-04-14
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Admin Panel]]"
  - "[[Projects/Phase 7.1 DB Architecture]]"
aliases: []
---

# D-002 — Canonical migrations path is services/supabase/migrations/

> [!decision] Decided 2026-04-14 by lesia
> All new SQL migrations live in `services/supabase/migrations/`; the `03_Development/` path is legacy.

## Context

After the repo reorganization, `03_Development/supabase/migrations/` only exists inside worktrees. A prior memory pointed agents at the stale path, causing migrations to be filed in the wrong folder and missed by deploys.

## Decision

New migrations land at `services/supabase/migrations/NNN_name.sql`. Before picking a number, run `ls services/supabase/migrations/ | sort` — numbering shifts fast because parallel agents reserve slots concurrently.

## Rationale

A single canonical path keeps deploy tooling, Supabase CLI, and reviewers aligned. Parallel agents collide on numbering frequently, so the live directory is the only reliable source for the next free index.

## See Also

- [[Domains/Admin Panel]]
- [[Decisions/D-001-migration-column-existence-check]]
