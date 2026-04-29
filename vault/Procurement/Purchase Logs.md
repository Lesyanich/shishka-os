---
title: Purchase Logs
type: page
tags: [procurement, purchases, ledger]
date: 2026-04-29
status: active
related:
  - "[[Procurement/]]"
  - "[[Procurement/Suppliers]]"
  - "[[Finance/Receipt Routing]]"
---

# Purchase Logs

`purchase_logs` is the **history layer** — what was bought, when, from whom, at what price. The catalog ([[Procurement/Suppliers]]) describes *what's available*; the log records *what actually happened*. WAC is computed from this table.

## Schema (sketch)

```
purchase_logs
├── id                  uuid PK
├── purchased_at        timestamptz
├── supplier_id         fk → suppliers.id
├── nomenclature_id     fk → nomenclature.id     (the RAW)
├── supplier_sku        text                     (denormalized for traceability)
├── qty                 numeric
├── unit                text
├── unit_price_thb      numeric
├── total_thb           numeric                  (qty × unit_price)
├── receipt_id          fk → receipt_jobs.id     (provenance)
├── source              text                     ('receipt' | 'manual' | 'import')
└── notes               text
```

Migrations: `021_suppliers_purchase_logs.sql` (initial), various enrichments since.

## Purchase sources

```
source = 'receipt'  — auto-created from receipt_jobs after fn_approve_receipt
source = 'manual'   — owner manual entry (cash market purchases)
source = 'import'   — bulk import (e.g. early seed data)
```

## How `purchase_logs` feeds WAC

After every new purchase row, a trigger (or scheduled job — TBD) recomputes `supplier_catalog.wac` for the matching `(supplier_id, nomenclature_id)` pair:

```
new WAC = Σ (qty × unit_price) / Σ qty
         (over a sliding window — typically last N purchases or last 90 days)
```

The window length is a **business choice** (currently last 90 days as default; can be tuned per-product if a supplier has volatile pricing).

## Manual entry (cash markets)

For Rawai morning market purchases, where there's no receipt:

1. Owner takes a phone photo of the bag / produce + handwritten total
2. Uploads via the receipt inbox UI (treated as a "receipt" for pipeline purposes)
3. OR enters directly via the Mission Control manual-entry form — `apps/admin-panel/src/pages/.../QuickExpenseInput.tsx`

Both paths land in `purchase_logs`.

## Reconciliation

Periodically (monthly), finance reconciles `purchase_logs` against:

- Bank statements
- Supplier invoices
- Inventory adjustments (`waste_log`, `inventory_levels`)

Discrepancies become Mission Control tasks for the owner to resolve.

## Frequent queries

- **What did we spend on tomatoes last month?** — `SELECT sum(total_thb) FROM purchase_logs WHERE nomenclature_id = '<RAW-FRESH_TOMATO>' AND purchased_at >= now() - interval '30 days'`
- **Price trend for olive oil** — chart `unit_price_thb` over time, grouped by supplier
- **Compare suppliers for the same RAW** — `SELECT supplier_id, avg(unit_price_thb) FROM purchase_logs WHERE nomenclature_id = '<X>' GROUP BY supplier_id`

These power the analytics views in [[Finance/]] and the supplier comparison tables produced by [`agents/procurement/`](../../agents/procurement/AGENT.md).

## See Also

- [[Procurement/Suppliers]] — the catalog this log feeds
- [[Procurement/Receiving]] — the SOP for ingredients arriving at L1
- [[Finance/Receipt Routing]] — the receipt → log automation
- `docs/domain/supplier-domain.md` — domain conventions
