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

**Source of truth:** `apps/admin-panel/src/App.tsx` (kitchen routes: `/kitchen/schedule` board, `/kitchen/my-tasks`, `/kitchen/recipes`, `/kitchen/labels`)

- The cook-facing order/prep flow lives in the admin panel's `/kitchen/*` routes; cooks sign in with their login + PIN on the admin login screen.
- ⚠️ The standalone `apps/kds/` app was **removed on 2026-10-09** (never deployed; it compared a plaintext PIN in the browser). A native `cashier` order-intake page exists, and the POS is Loyverse (not "Vivo POS").

_See also:_ [[Operations/Staff]], [[Operations/Daily Standards]]
