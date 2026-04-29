---
title: Operations
type: entity
tags: [operations, daily-ops]
date: 2026-04-29
status: active
related:
  - "[[Recipes/Production Routing]]"
  - "[[Equipment/]]"
  - "[[Finance/]]"
---

# Operations

Where the brand promise meets reality on the ground — locations, staff, daily standards, food safety, KDS, and the **Drive Map** index.

> [!info] One-line definition
> Operations is the daily playbook — who does what, when, where, with which equipment — that turns recipes and procurement into food on a customer's tray within 2 minutes.

## Sub-pages

- [[Operations/Locations]] — L1 (kitchen, Rawai) + L2 (sales point, Tops Daily) + phased development
- [[Operations/Staff]] — team roster: Lesia, Bas, Alex, Hein
- [[Operations/Daily Standards]] — opening, prep, service, closing — the SOP rhythm
- [[Operations/KDS]] — Kitchen Display System — auth, screens, ticket flow
- **[[Operations/Drive Map]]** — **the Confluence-style index** of where everything lives on Drive (receipts, photos, contracts, payroll, branding, payroll, equipment manuals)

## Where things live

| Asset | Location |
|---|---|
| Operations bible | `docs/bible/operations.md` |
| Locations bible | `docs/bible/locations.md` |
| KDS source | `apps/admin-panel/src/pages/kds/` |
| Staff roster | `staff` table (DB) — see [[Database/Schema]] |
| Production tracking | `production_orders`, `production_plans` tables |
| Daily standards / SOP | `docs/bible/operations.md` + this folder |
| Drive — operational | `Drive: 01_Business/Operations/` |
| Drive — receipts archive | `Drive: 01_Business/Finance/Receipts/<YYYY-MM>/` |
| Drive — photos / brand | `Drive: 01_Business/Branding/`, `Drive: 01_Business/Menu/` |

## Adjacent entities

- [[Recipes/Production Routing]] — the recipe side of the daily flow
- [[Equipment/Inventory]] — the units operations runs on
- [[Procurement/Receiving]] — the SOP for ingredients arriving at L1
- [[Finance/Targets & KPIs]] — the operational KPIs (TTR, batch cycles)
- [[Brand/]] — the customer-facing standard operations must deliver

## Recent decisions

- 2026-04-19 — KDS auth hardening (use `staff.auth_user_id` + revoke anon RLS) — MC `f73da9fa`

## See Also

- `docs/bible/operations.md` — full canonical SOP
- `agents/coo/AGENT.md` — COO Agent that orchestrates daily-ops tasks
- Auto Memory: `project_staff_roster.md`, `project_location.md`
