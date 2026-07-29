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
- ⚠️ **The folder and prod can disagree.** As of 2026-07-29 prod's head is `387_po_delete_draft_and_archive.sql`, while `main` carries only up to 384 — 385/386 ride unmerged branches, and 375–383 drifted (MC `9c51c5ed`). Check `SELECT filename FROM migration_log ORDER BY substring(filename from '^[0-9]+')::int DESC LIMIT 5` before claiming a number, not just `ls | tail -1`.

_See also:_ [[Database/Schema]] · [[Database/RPC Catalog]] · [[Database/RLS Policies]]
