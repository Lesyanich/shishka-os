---
title: CapEx Flow
type: pointer
tags: [equipment, capex, finance]
date: 2026-07-18
status: pointer
related:
  - "[[Equipment/]]"
  - "[[Finance/Classification]]"
  - "[[Finance/Ledger]]"
---

# CapEx Flow

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** `services/supabase/migrations/164_approve_receipt_auto_capex_assets.sql` + `docs/business/domains/finance.md`

- How an approved receipt with a CapEx line item lands on the books when `fn_approve_receipt` runs.
- ⚠️ `fn_approve_receipt` auto-creates a `capex_assets` row (linked back via `expense_id`), **not** an `equipment` row; the ledger table is `expense_ledger` (there is no `financial_transactions` table).

_See also:_ [[Finance/Classification]], [[Equipment/Inventory]]
