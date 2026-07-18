---
title: Finance Classification
type: pointer
tags: [finance, classification, tax]
date: 2026-07-18
status: pointer
related:
  - "[[Finance/]]"
  - "[[Finance/Ledger]]"
  - "[[Equipment/CapEx Flow]]"
---

# Finance Classification

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** the `fin_categories` (18 codes) + `fin_sub_categories` (28 sub-codes) tables, plus admin finance (`docs/modules/finance.md`)

- How each expense line is classified and where it posts.
- ⚠️ Sub-codes are numeric (e.g. 2301-style), not string codes like `ingredient.raw`; every posting lands in `expense_ledger` (+ its spokes), not a `financial_transactions` table.

_See also:_ [[Finance/Ledger]], [[Finance/]]
