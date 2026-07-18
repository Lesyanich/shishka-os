---
title: KDS — Kitchen Display System
type: pointer
tags: [operations, kds, kitchen]
date: 2026-07-18
status: pointer
related:
  - "[[Operations/]]"
  - "[[Operations/Staff]]"
  - "[[Database/RLS Policies]]"
---

# KDS — Kitchen Display System

> **Pointer page.** The detail that used to live here was a 2026-04-29 snapshot that drifted out of date. Trust the source of truth below, not a copy. _(Wiki staleness audit, 2026-07-18.)_

**Source of truth:** the dedicated `apps/kds/` app + `apps/admin-panel/src/App.tsx` (kitchen routes)

- The cook-facing order/prep flow: PIN login, dashboard, task pages, HACCP checkpoints, and the admin `/kitchen/*` boards.
- ⚠️ KDS is its own `apps/kds/` app (PIN login, Dashboard/Task pages, HACCP checkpoints), **not** `apps/admin-panel/src/pages/kds/`; a native `cashier` order-intake page now exists, and the POS is Loyverse (not "Vivo POS").

_See also:_ [[Operations/Staff]], [[Operations/Daily Standards]]
