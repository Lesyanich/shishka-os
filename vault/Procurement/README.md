---
title: Procurement
type: entity
tags: [procurement, suppliers, purchasing]
date: 2026-04-29
status: active
assets:
  - label: "Receipts archive (Drive)"
    path: "Drive: 01_Business/Receipts/"
    url: "https://drive.google.com/drive/folders/14OGn_hOSlOB0TNotMHD9_geKojVYlYAt"
related:
  - "[[Recipes/]]"
  - "[[Finance/Receipt Routing]]"
  - "[[Equipment/CapEx Flow]]"
---

# Procurement

The supplier side of the business — sourcing, comparing, purchasing, and recording. Every RAW ingredient and every piece of [[Equipment/]] traces back through this folder. Backed by the **`supplier_catalog` SSoT** for "what can we buy and from whom".

> [!info] One-line definition
> Procurement turns a recipe's RAW shopping list into actual ingredients on the L1 shelf — through suppliers, with logged purchases, with comparable pricing, with a Procurement Agent that does the comparison work before owner approval.

## Sub-pages

- [[Procurement/Suppliers]] — the supplier catalog (`supplier_catalog`) — what we can buy, from whom, at what price (WAC)
- [[Procurement/Purchase Logs]] — the `purchase_logs` table — what we actually bought, when
- [[Procurement/Receiving]] — the receiving station SOP (moved from `Architecture/`)

## Where things live

| Asset | Location |
|---|---|
| Supplier catalog SSoT | `supplier_catalog` table (DB) |
| Purchase log | `purchase_logs` table (DB) |
| Receiving records | `receiving_records` + `receiving_lines` tables |
| Suppliers list | `suppliers` table |
| Procurement Agent | `agents/procurement/AGENT.md` + `.claude/skills/procurement/SKILL.md` |
| Makro parser tool | `tools/makro-parser/` |
| Receipt scans (after parse) | `Drive: 01_Business/Finance/Receipts/<YYYY-MM>/` |

## Key suppliers (Phase 1)

| Name | Type | Notes |
|---|---|---|
| **Makro** | Wholesale | Parsed via `tools/makro-parser/` (auto-extracts line items from receipts) |
| **Local markets** | Market | Manual receipt entry; cash receipts in [[Operations/]] |
| **Online suppliers** | Online | Delivery receipts via WhatsApp / email |

The supplier-domain conventions live in [`docs/domain/supplier-domain.md`](../../docs/domain/supplier-domain.md).

## How a purchase becomes a record

```
Owner / cook buys at Makro
   ↓
Receipt photo / PDF arrives in inbox
   ↓
agents/finance / mcp-finance OCRs + parses lines
   ↓
Each line classified into RAW (chef-domain) or CAPEX/OPEX (finance-domain)
   ↓
Owner approves
   ↓
fn_approve_receipt:
  • RAW → updates purchase_logs (and supplier_catalog WAC)
  • CAPEX → creates capex_assets + equipment row (see [[Equipment/CapEx Flow]])
  • OPEX → ledger entry only
```

## Adjacent entities

- [[Recipes/]] — RAW ingredients procurement feeds into
- [[Finance/Receipt Routing]] — the parser side of the same flow
- [[Finance/Ledger]] — where every purchase posts
- [[Equipment/CapEx Flow]] — equipment side of procurement
- [[Database/Schema]] — `supplier_catalog`, `purchase_logs`, `receiving_*` tables

## Recent decisions

- 2026-04-24 — `/procurement` skill + AGENT.md + routing shipped (MC `14b5bd82`)
- See [[Milestones/2026-04-24-procurement-agent-v1]] (will be created in next decision sweep)

## See Also

- `agents/procurement/AGENT.md` — the agent
- `docs/domain/supplier-domain.md` — domain conventions
- `tools/makro-parser/README.md` — Makro receipt parser
