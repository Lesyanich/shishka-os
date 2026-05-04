---
title: Suppliers
type: page
tags: [procurement, suppliers, catalog]
date: 2026-04-29
status: active
related:
  - "[[Procurement/]]"
  - "[[Procurement/Purchase Logs]]"
  - "[[Recipes/BOM Structure]]"
---

# Suppliers

The "what can we buy and where" SSoT. Source: [`docs/domain/supplier-domain.md`](../../docs/domain/supplier-domain.md). Owner: Chef domain (`mcp-chef`); read access for Finance.

## Two layers

| Layer | Table | Purpose |
|---|---|---|
| **Supplier** | `suppliers` | The vendor (name, type, contact, payment terms) |
| **Catalog** | `supplier_catalog` | What that supplier sells — links a supplier to a RAW product |

A `supplier_catalog` row stores: `supplier_sku`, `pack_size`, `pack_unit`, `price_per_pack`, plus a derived **WAC** (Weighted Average Cost) that updates as new purchase events come in.

## Why WAC matters

Prices fluctuate (Phuket markets vs. Makro vs. online). A single `price_per_pack` snapshot is misleading. WAC averages across actual purchase events:

```
WAC = Σ (purchase_qty × purchase_price) / Σ purchase_qty
```

WAC is what flows into the BOM cost rollup ([[Recipes/BOM Structure]]) and ultimately into the `food_cost%` color zones on the [[Menu/]] owner table.

## Supplier types

```
suppliers.supplier_type  ∈  {wholesale, market, online, farm}
```

| Type | Examples | Notes |
|---|---|---|
| `wholesale` | Makro Phuket | Bulk pricing, monthly invoice; parsed via `tools/makro-parser/` |
| `market` | Rawai morning market | Cash, no receipts; manual entry |
| `online` | WhatsApp veg suppliers, ginger guy | Mixed — sometimes delivery note, sometimes nothing |
| `farm` | Direct from local growers | Often the freshest / best price; relationship-based |

## SKU layer

Each RAW product can have **multiple supplier SKUs** — same ingredient, different vendors, different pack sizes:

```
RAW-FRESH_CARROT
├── supplier_catalog row 1   Makro, "CARROT 1KG BAG", ฿35/pack
├── supplier_catalog row 2   Rawai market, "CARROT BUNCH", ฿25/bunch
└── supplier_catalog row 3   Farm direct, "CARROT 5KG", ฿140/pack
```

Barcodes are stored in `sku_barcodes` for receiving-station scanning (`apps/admin-panel/src/pages/.../ReceivingStation.tsx`).

## How a new supplier gets added

1. Owner makes a purchase from a new vendor
2. Receipt arrives; finance parses lines
3. For unrecognized line items, parser surfaces them as "needs supplier mapping"
4. Owner (or Chef Agent via `mcp-chef.create_supplier_catalog_entry`) maps line items to RAW products
5. Subsequent purchases automatically match the SKU → update WAC

## Adaptive learning

The receipt-parser pipeline includes adaptive modules (PRs #118–#124, see [[Milestones/]]):

- **Aliases** — same RAW from different vendors using different names ("CARROT 1KG", "Морковь свежая", "หัวผักกาดสด") all link to `RAW-FRESH_CARROT`
- **Category overrides** — if the auto-classifier mis-files something, owner correction is remembered and applied to future receipts from the same supplier
- **GS1 barcode** — when a barcode appears, it gets bound to the SKU automatically
- **Diff engine** — flags price spikes / pack-size changes for owner review

## See Also

- [[Procurement/Purchase Logs]] — the actual purchase history that feeds WAC
- [[Procurement/Receiving]] — the receiving SOP that records arrivals
- [[Recipes/BOM Structure]] — where WAC flows into food cost
- `docs/domain/supplier-domain.md`
- Adaptive Receipt Learning project — see Auto Memory `project_adaptive_receipt_learning.md`
