---
title: Purchase Logs
type: pointer
tags: [procurement, purchases, ledger]
date: 2026-07-18
status: pointer
related:
  - "[[Procurement/]]"
  - "[[Procurement/Suppliers]]"
  - "[[Finance/]]"
---

# Purchase Logs

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** `docs/modules/procurement.md`

- The `purchase_logs` table (real columns: `quantity`, `price_per_unit`, `total_price`, `invoice_date`, `expense_id`) and how it feeds cost.
- ⚠️ WAC is written to `nomenclature.cost_per_unit` via the `fn_update_cost_on_purchase()` trigger — there is NO `supplier_catalog.wac` column.

_See also:_ [[Procurement/Suppliers]], [[Procurement/]]
