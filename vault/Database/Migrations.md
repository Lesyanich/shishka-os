---
title: Database Migrations
type: pointer
tags: [database, migrations]
date: 2026-07-18
status: pointer
related:
  - "[[Database/]]"
  - "[[Database/Schema]]"
---

# Database Migrations

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** `services/supabase/migrations/` (the append-only folder IS the ledger)

- The numbered SQL files there are the only allowed way to change the schema; `ls | sort | tail -1` shows the current head.
- ⚠️ Lettered sub-migrations (`352a`, `353b`, …) DO exist, so the "strictly sequential, no letters" rule this page once claimed is false.
- ⚠️ **The folder and prod can disagree, and two branches can claim the same number.** As of 2026-07-29 `migration_log` runs to **392**, and **390 is registered twice** — `390_rls_role_gating_mc_tables` and `390_mango_canonicalization_and_peanut_removal`, from two in-flight branches. `main`'s folder ends at 389. Always check `SELECT filename FROM migration_log WHERE filename ~ '^[0-9]{3}' ORDER BY substring(filename from '^[0-9]+')::int DESC LIMIT 5` immediately before claiming a number — not `ls | tail -1`, and not a number quoted in a handoff packet written hours ago. Older drift (375–386) is tracked in MC `9c51c5ed`.

_See also:_ [[Database/Schema]] · [[Database/RPC Catalog]] · [[Database/RLS Policies]]
