---
title: Database Domain Contracts
type: pointer
tags: [database, contracts, ownership]
date: 2026-07-18
status: pointer
related:
  - "[[Database/]]"
  - "[[Database/RLS Policies]]"
  - "[[Tech/MCP Servers]]"
---

# Database Domain Contracts

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** `docs/domain/db-contracts.md`

- Defines each table's single domain owner (chef / finance / mission-control) and the cross-domain read-only access rules the MCP servers honour.
- ⚠️ The finance ledger table is `expense_ledger` — the `financial_transactions` table this page listed **never existed**. The live DB has ~153 tables; this page enumerated ~19.

_See also:_ [[Database/RLS Policies]] · [[Tech/MCP Servers]]
