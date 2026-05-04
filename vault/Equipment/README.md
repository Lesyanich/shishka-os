---
title: Equipment
type: entity
tags: [equipment, kitchen, capex]
date: 2026-04-29
status: active
assets:
  - label: "Equipment folder (Drive)"
    path: "Drive: 01_Business/Equipment/"
    url: "https://drive.google.com/drive/folders/18FgX46HOdG4JiAGWas_aSB0bcrEVHuHv"
  - label: "Equipment manuals (Drive)"
    path: "Drive: 01_Business/Equipment_Manuals/"
    url: "https://drive.google.com/drive/folders/1752rOM1M0BrBdUA0PAgvzdVoz7UgmWkD"
related:
  - "[[Recipes/Production Routing]]"
  - "[[Finance/Ledger]]"
  - "[[Operations/Daily Standards]]"
---

# Equipment

The physical units in the L1 kitchen — every piece of gear has an ID, a zone, and a role in the production flow. Source registry: `equipment` table; canonical inventory: [`docs/bible/equipment.md`](../../docs/bible/equipment.md).

> [!info] One-line definition
> Equipment is the hardware substrate of the kitchen — capex assets that participate in production routing, drive shelf-life and food-cost economics, and have ID, zone, and maintenance lifecycle.

> [!warning] Process bottleneck
> Unit `L1-BL-FRZ-790-66` (Blast Chiller) is **the** kitchen bottleneck. If it's full, no new hot batch can start. Logistics L1 → L2 only possible after the full Cook → Shock → Vacuum → Label cycle. Scheduling in [[Operations/Daily Standards]] wraps around this constraint.

## Sub-pages

- [[Equipment/Inventory]] — current units by zone (Logistics, Cold Prep, Hot Production, Cook-Chill Hub, Auxiliary, Future CapEx)
- [[Equipment/Routing]] — how recipes use equipment (lives in `recipes_flow`, NOT here — D-020)
- [[Equipment/CapEx Flow]] — how new equipment is acquired: receipt → `fn_approve_receipt` → auto-create `capex_assets` + `capex_transactions`

## Where things live

| Asset | Location |
|---|---|
| Equipment registry | `equipment` table (DB) |
| Routing references | `recipes_flow` table |
| CapEx ledger | `capex_assets` + `capex_transactions` tables |
| Auto-creation flow | `fn_approve_receipt` SQL function (mig 164) |
| Bible source | `docs/bible/equipment.md` |
| Photo / spec library | `Drive: 01_Business/Equipment/` (per-unit photos and PDFs) |

## Naming convention

`<location>-<type>-<size>-<seq>` — e.g. `L1-BL-FRZ-790-66`:

| Segment | Meaning | Example |
|---|---|---|
| `L1` | Location | L1 = Kitchen, L2 = Sales Point |
| `BL-FRZ` | Type code | Blast Freezer / Chiller |
| `790` | Size / capacity | 790L |
| `66` | Sequence | 66th item registered |

The zone designation (e.g. `L1-Cold-W2`, `L1-Hot-W3`) is a **location within L1** describing wall/area and is stored on the unit row in the table.

## Adjacent entities

- [[Recipes/Production Routing]] — `recipes_flow` references `equipment_id` to define which unit performs which step
- [[Finance/Ledger]] — every unit is a capex asset on the books
- [[Procurement/]] — equipment purchases trace back to a supplier and a receipt
- [[Operations/Daily Standards]] — equipment availability drives the daily prep schedule

## Recent decisions

- **D-020 (Auto Memory)** — equipment routing lives in `recipes_flow`, not the `equipment` table itself. The unit knows what it *is*; the recipe knows what it *does* with that unit.

## See Also

- `docs/bible/equipment.md` — full unit-by-unit specs
- `agents/chef/AGENT.md` — Chef Agent owns this domain (`mcp-chef.update_equipment` tool)
- MC tasks: `884fcdcc`, `b4fa35d7`, `7f3f6559` — equipment enrichment work
