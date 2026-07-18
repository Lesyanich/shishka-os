---
title: Procurement
type: pointer
tags: [procurement, suppliers, purchasing]
date: 2026-07-18
status: pointer
assets:
  - label: "Receipts archive (Drive)"
    path: "Drive: 01_Business/Receipts/"
    url: "https://drive.google.com/drive/folders/14OGn_hOSlOB0TNotMHD9_geKojVYlYAt"
related:
  - "[[Recipes/]]"
  - "[[Equipment/CapEx Flow]]"
  - "[[Procurement/Suppliers]]"
---

# Procurement

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** `docs/business/domains/procurement.md` + `docs/modules/procurement.md`

- Suppliers, the `supplier_catalog` SSoT, purchase logs, receiving, and the procurement admin surfaces.
- ⚠️ Procurement is no longer receipt-only: it now includes a PO/receiving path (`purchase_orders`, `po_lines`, `fn_approve_po`, ReceivingStation) plus a Price Book (mig 318).

_See also:_ [[Procurement/Suppliers]], [[Procurement/Purchase Logs]]
