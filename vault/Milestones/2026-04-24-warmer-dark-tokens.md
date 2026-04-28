---
title: 2026-04-24 — Warmer-dark tokens promoted
type: milestone
tags:
  - milestone
  - release
  - menu
date: 2026-04-24
status: closed
kind: release
domain: "[[Domains/Admin Panel]]"
related:
  - "[[Projects/Menu Control Page]]"
aliases: []
---

# 2026-04-24 — Warmer-dark tokens promoted

> [!success] Milestone
> Warmer-dark surface tokens promoted into the admin-panel global `@theme`.

## What Happened

MC task `deab9ec5` lifted the warmer-dark surface tokens out of per-page overrides and into the admin-panel's global `@theme` block, sourced from `agents/designer/brand-tokens.md`. Every page now inherits the same warmer-dark palette by default.

## Drivers

Continuation of [[2026-04-21-menu-page-brand-tokens]] — once Menu page validated the tokens, they were promoted globally to keep the admin panel consistent.

## Impact

- Code: admin-panel global `@theme` updated; per-page overrides removed
- Process: new pages inherit warmer-dark by default
- Data: no schema change
- People: design consistency across all admin-panel surfaces

## See Also

- Project: [[Projects/Menu Control Page]]
- Domain: [[Domains/Admin Panel]]
- Sibling: [[2026-04-21-menu-page-brand-tokens]]
