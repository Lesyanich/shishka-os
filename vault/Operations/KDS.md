---
title: KDS — Kitchen Display System
type: page
tags: [operations, kds, kitchen]
date: 2026-04-29
status: active
related:
  - "[[Operations/]]"
  - "[[Operations/Staff]]"
  - "[[Database/RLS Policies]]"
---

# KDS — Kitchen Display System

The digital order-flow layer that connects the cashier at L2 to the cooks at L1 (and the assembly station at L2). Replaces paper tickets, slip printers, and shouting across the kitchen.

## Surfaces

| Route | Component | Used by |
|---|---|---|
| `/kitchen/schedule` | `KDSBoard` | Cooks viewing the production queue |
| `/kitchen/tasks` | `CookStation` | Cook claiming + completing prep tasks |
| `/kitchen/waste` | `WasteTracker` | Cook logging waste (feeds `waste_log`) |

Source code: [`apps/admin-panel/src/pages/kds/`](../../apps/admin-panel/src/pages/kds/), components in `apps/admin-panel/src/components/scheduling/`.

## Auth model

> Auth hardening — MC `f73da9fa` (KDS auth hardening: use `staff.auth_user_id` + revoke anon RLS policies)

- Every cook has an `auth.users` row + a `staff.auth_user_id` link
- KDS routes are gated by `RoleGuard minRole="cook"`
- Anon RLS policies on KDS tables were revoked — every read/write requires an authenticated session
- Owner / Bas can also see KDS (role hierarchy: owner ≥ cook)

The kitchen tablet is **shared** — multiple cooks use one device. Each cook logs in at shift start; per-action attribution is captured by `staff_id` on every completion event. See [[Operations/Staff]] §Kitchen-shared-tablet.

## Data model

| Table | Role |
|---|---|
| `production_orders` | Each batch / dish to make in a window |
| `production_plans` | Daily planning (which batches when) |
| `recipes_flow` | The steps each order travels through (see [[Recipes/Production Routing]]) |
| `equipment` | Units the steps reference |
| `staff` | Who's logged in / who completed which step |
| `waste_log` | Off-spec batches, reasons |

## Order flow

```
Cashier at L2 prints receipt
    ↓
production_orders row inserted (or "build-from-bar" assembly logged)
    ↓
KDS displays on cook's screen at L2 assembly OR at L1 (if hot batch)
    ↓
Cook taps "Start" → step status → "In progress"
    ↓
Cook taps "Complete" → step.completed_at + staff_id
    ↓
Next step in recipes_flow becomes ready
    ↓
Last step complete → order ready for handoff
```

## L2-side service tickets

For salad-bar assembly (the algorithm bowl), the cashier UI captures:

- Base / protein / topping / sauce per slot
- Modifiers (`MOD-*`)
- Customer-specific notes

The `production_orders` row for an algorithm bowl is short-lived — assembled in <2 min, no L1 routing needed.

## L1-side production tickets

For hot batches that go through Cook-Chill:

- Long-running production orders (sometimes spanning the 90-min Blast Chiller cycle)
- Multiple `recipes_flow` steps per order
- Equipment occupancy tracked — if `L1-BL-FRZ-790-66` is full, new hot batches are queued

## Offline behavior

KDS today **requires Supabase connectivity**. If the L1 internet drops:

- Cooks fall back to printed prep sheets
- Completed steps are reconciled when connectivity returns
- Owner monitors via the realtime channel

Future improvement: local-first PWA cache with sync resolution. Out of scope for Phase 1.

## Mobile vs tablet

- Cooks use **tablet** (shared, fixed-position at the kitchen pass) — best for glanceable batch view
- Owner uses **laptop** (admin panel full surface) — for planning, exceptions, reports
- Cashier at L2 uses **separate POS terminal** (Phase 1: Vivo POS or similar; Shishka KDS just listens)

## See Also

- [[Operations/Staff]] — auth model details
- [[Operations/Daily Standards]] — when KDS is in use
- [[Recipes/Production Routing]] — what KDS displays
- [[Database/RLS Policies]] — security model
- MC `f73da9fa` — KDS auth hardening task
