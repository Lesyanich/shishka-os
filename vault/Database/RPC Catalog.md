---
title: Database RPC Catalog
type: pointer
tags: [database, rpc, functions]
date: 2026-07-18
status: pointer
related:
  - "[[Database/]]"
  - "[[Tech/MCP Servers]]"
---

# Database RPC Catalog

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** the defining migrations in `services/supabase/migrations/` + live `pg_proc` (query the DB, e.g. via the Supabase MCP)

- The Postgres functions exposed over Supabase RPC and wrapped by the MCP servers — the live catalog is whatever `pg_proc` in the `public` schema currently holds.
- ⚠️ Of the 14 functions this page listed, only `fn_approve_receipt` actually exists; the live DB has ~319 functions, so treat the old hand-written list as fiction.

_See also:_ [[Database/Migrations]] · [[Tech/MCP Servers]]
