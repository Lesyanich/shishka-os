---
title: Procurement & Receiving Architecture
tags:
  - architecture
  - shishka-os
  - procurement
  - receiving
  - phase-11
date: 2026-03-14
status: planned
aliases:
  - PO Architecture
  - Receiving Flow
---

# Procurement & Receiving Architecture

> [!info] Phase 11-16
> Procurement & Receiving module covering two paths: receipt-based (existing) and PO-based (new). Designed for minimal cognitive load on kitchen staff.

## Two Procurement Paths

```mermaid
flowchart TD
    subgraph PathA["Path A: Physical Purchase"]
        A1[Photo of receipt] --> A2[MagicDropzone + AI OCR]
        A2 --> A3[StagingArea review]
        A3 --> A4["fn_approve_receipt v11"]
        A4 --> A5[expense_ledger + purchase_logs]
        A4 --> A6[sku_balances + WAC]
        A4 --> A7["receiving_records (audit)"]
    end

    subgraph PathB["Path B: Supplier Order"]
        B1["Create PO (Admin)"] --> B2["Submit to Supplier"]
        B2 --> B3["Receive Goods (Admin/Cook)"]
        B3 --> B4{"All received?"}
        B4 -->|Yes| B5[status: received]
        B4 -->|No| B6[status: partially_received]
        B6 --> B3
        B5 --> B7["Reconcile (Owner)"]
        B7 --> B8["fn_approve_po"]
        B8 --> B9[expense_ledger + purchase_logs]
        B8 --> B10[sku_balances + WAC]
    end
```

## User Roles

| Role | Person | Access |
|------|--------|--------|
| **Admin** | Operations | Creates POs, communicates with suppliers, physical receiving, inventory counts |
| **Cook** | Kitchen | Substitutes admin on receiving (/receive). Simplest UI, **NO financial data** |
| **Controller** | Owner (Lesia) | Financial reconciliation only. Only role that can Approve -> money + inventory |

## PO Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> submitted : Send to supplier
    submitted --> confirmed : Supplier confirms
    confirmed --> shipped : In transit
    submitted --> shipped : Direct ship
    shipped --> partially_received : Partial delivery
    shipped --> received : Full delivery
    partially_received --> partially_received : More items arrive
    partially_received --> received : All items received
    received --> reconciled : Owner approves
    draft --> cancelled : Cancel
    submitted --> cancelled : Cancel
```

## Database Schema

### New Tables

```mermaid
erDiagram
    purchase_orders {
        UUID id PK
        TEXT po_number "UNIQUE PO-0001"
        UUID supplier_id FK
        po_status status
        DATE expected_date
        NUMERIC subtotal
        NUMERIC grand_total
        UUID source_plan_id FK
        UUID expense_id FK
        UUID created_by
    }

    po_lines {
        UUID id PK
        UUID po_id FK
        UUID nomenclature_id FK
        UUID sku_id FK
        NUMERIC qty_ordered
        TEXT unit
        NUMERIC unit_price_expected
        NUMERIC total_expected "GENERATED"
    }

    receiving_records {
        UUID id PK
        UUID po_id FK
        UUID expense_id FK
        receiving_source source
        UUID received_by
        TIMESTAMPTZ received_at
        TEXT status
    }

    receiving_lines {
        UUID id PK
        UUID receiving_id FK
        UUID po_line_id FK
        UUID nomenclature_id FK
        UUID sku_id FK
        NUMERIC qty_expected
        NUMERIC qty_received
        NUMERIC qty_rejected
        reject_reason reject_reason
    }

    purchase_orders ||--o{ po_lines : "po_id"
    purchase_orders ||--o{ receiving_records : "po_id"
    receiving_records ||--o{ receiving_lines : "receiving_id"
    po_lines ||--o{ receiving_lines : "po_line_id"
    suppliers ||--o{ purchase_orders : "supplier_id"
    nomenclature ||--o{ po_lines : "nomenclature_id"
    sku ||--o{ po_lines : "sku_id"
```

### New ENUMs

| Enum | Values |
|------|--------|
| `po_status` | draft, submitted, confirmed, shipped, partially_received, received, reconciled, cancelled |
| `receiving_source` | purchase_order, receipt |
| `reject_reason` | short_delivery, damaged, wrong_item, quality_reject, expired |

## Key RPCs

| Function | Role | Purpose |
|----------|------|---------|
| `fn_create_purchase_order(JSONB)` | Admin | Creates PO + lines, auto-populates prices from supplier_catalog |
| `fn_receive_goods(JSONB)` | Admin/Cook | Physical receiving. NO inventory update. Sets partially_received or received |
| `fn_approve_po(JSONB)` | Controller | Financial reconciliation. Creates expense_ledger + purchase_logs + sku_balances + WAC |
| `fn_pending_deliveries()` | Admin/Cook | Returns pending POs for /receive screen. NO prices |
| `fn_approve_receipt v11` | Controller | Enhanced: now also creates receiving_records for audit trail |

## Receiving UX Design

> [!important] Zero Cognitive Load
> The /receive screen is designed for "dirty hands, no time". No prices, no typing, maximum touch targets.

- **Barcode scanner**: one scan = +1 qty_received (auto-OK when qty matches)
- **Two buttons per item**: OK (full qty) or Issue (stepper + reason)
- **Accept All Remaining**: one tap for unchecked items
- **sessionStorage**: progress persists through page reloads

## Integration Points

- [[Database Schema]] -- All tables documented here
- [[Receipt Routing Architecture]] -- Path A receipt flow
- [[Shishka OS Architecture]] -- System overview
- [[Financial Ledger]] -- expense_ledger hub + spokes
- [[Phase 10 SKU Layer]] -- SKU resolution chain reused by fn_approve_po

## Implementation Phases

| Phase | Priority | Scope |
|-------|----------|-------|
| 11: DB Schema | P0 | ENUMs + 4 tables + links + migrations 060-063 |
| 12: RPCs | P0 | 5 RPCs + fn_approve_receipt v11 (migrations 064-065) |
| 13: Receiving Station | P1 | Mobile-first /receive page for kitchen |
| 14: PO Management | P2 | Create/edit/list POs on /procurement |
| 15: Reconciliation | P2 | Visual diff + approve on /procurement |
| 16: MRP Integration | P3 | MRP shortages -> auto-create PO |
