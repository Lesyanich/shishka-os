---
title: Database RLS Policies
type: pointer
tags: [database, rls, security]
date: 2026-07-18
status: pointer
related:
  - "[[Database/]]"
  - "[[Database/Domain Contracts]]"
  - "[[Tech/Agent System]]"
---

# Database RLS Policies

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** live `get_advisors` (security) audit via the Supabase MCP + `docs/domain/rls-audit-2026-04-06.md`

- The real, current set of Row-Level Security policies — query the live DB (`pg_policies` / Supabase advisors) for the authoritative state; the April doc is the point-in-time baseline only.
- ⚠️ ~247 policies are live (this page listed ~13), and DB-level RBAC is still an OPEN gap — most tables remain writable by any authenticated user. It was never "done", only ever "planned".

_See also:_ [[Database/Domain Contracts]] · [[Tech/Agent System]]
