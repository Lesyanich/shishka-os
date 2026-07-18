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
- ⚠️ Latest is `374_punctuality_ack_gate.sql` (~323 numbered migrations), not 164 — and lettered sub-migrations (`352a`, `353b`, …) DO exist, so the "strictly sequential, no letters" rule this page claimed is false.

_See also:_ [[Database/Schema]] · [[Database/RPC Catalog]] · [[Database/RLS Policies]]
