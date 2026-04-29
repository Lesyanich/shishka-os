---
title: Staff
type: page
tags: [operations, staff, team]
date: 2026-04-29
status: active
related:
  - "[[Operations/]]"
  - "[[Operations/KDS]]"
---

# Staff

Phase 1 team. Source: Auto Memory `project_staff_roster.md` + [`docs/bible/operations.md`](../../docs/bible/operations.md). DB row source: `staff` table.

> [!warning] No fakes
> Earlier seed data referenced fake staff (Noi, Som, Lek). The real Phase 1 roster is below. Do not re-introduce placeholder names.

## Real roster

| Name | Role | Notes |
|---|---|---|
| **Lesia** | Owner / CEO | Conversation in Russian; direct user of admin panel; current `auth_user_id` is the source-of-truth owner |
| **Bas** | Co-owner | Operations side; pairs with Lesia on launch |
| **Alex** | Cook | L1 kitchen prep + production batches |
| **Hein** | Cook | L1 kitchen prep + production batches |

Plus — to come, hiring:

- 1 cashier / admin at L2 (planned name: An — see `docs/bible/operations.md`)
- 2 Burmese prep staff (interviews pending)
- Prep-chef or consultant for recipes — one-time, contracted

Total Phase 1 headcount: **4–6** (per [[Finance/Targets & KPIs]]).

## Roles & app access

| Role | App access |
|---|---|
| `owner` | Full admin panel (every route) — Lesia + Bas |
| `cook` | KDS only (`/kitchen/schedule`, `/kitchen/tasks`) — Alex, Hein |
| `cashier` *(planned)* | Limited POS view at L2 |

Authorization is enforced via `staff.app_role` checked in `RoleGuard` (`apps/admin-panel/src/components/RoleGuard.tsx`) and Supabase RLS. See [[Database/RLS Policies]].

## Auth pattern

- Each staff member has a Supabase auth user (`auth.users` row)
- `staff.auth_user_id` foreign-keys to that user
- The `app_role` (owner / cook / cashier) is stored on the `staff` row
- **No anon access for KDS** — KDS auth hardening MC `f73da9fa` revoked anon RLS policies and now requires authenticated `staff.auth_user_id`

## Kitchen — shared tablet

L1 has **one shared tablet** at the kitchen pass:

- Cooks log in to KDS as themselves at shift start
- All cooks see the same `production_orders` / KDS board
- Per-action attribution is captured via `staff_id` on each completion event

This pattern (one device, multiple identities) is normal for restaurant kitchens but required custom auth handling — see MC `f73da9fa` and the future migration to per-cook badge taps.

## Training (Phase 1)

- **1 week** on checklists / HACCP — covered by Lesia + prep-chef consultant
- Ongoing — daily checklist review, weekly retro

The exact checklist content lives in [[Operations/Daily Standards]].

## Hiring pipeline

- **Cashier** — sourced via local network, target hire 2 weeks before Phase 1 launch
- **Prep staff** — 2 Burmese candidates in interview; need work-permit support
- **General manager** — planned for Phase 3 (yoga + 3rd-floor seating)

## Safety net for owner

The system explicitly does **not** push CEO chores (WiFi setup, POS install, equipment buying) into automated reports — that's a deliberate role-separation per `feedback_coo_no_ceo_chores.md` in Auto Memory. See [[Open Questions/ceo-vs-coo-role-split]] when written.

## See Also

- [[Operations/]]
- [[Operations/KDS]] — the system staff use day-to-day
- [[Database/RLS Policies]] — how staff roles get enforced
- Auto Memory: `project_staff_roster.md`, `feedback_coo_no_ceo_chores.md`
