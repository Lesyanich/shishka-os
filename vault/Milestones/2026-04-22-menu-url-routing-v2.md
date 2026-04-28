---
title: 2026-04-22 — Menu URL routing v2
type: milestone
tags:
  - milestone
  - release
  - menu
date: 2026-04-22
status: closed
kind: release
domain: "[[Domains/Menu]]"
related:
  - "[[Projects/Menu Control Page]]"
aliases: []
---

# 2026-04-22 — Menu URL routing v2

> [!success] Milestone
> Shareable dish links and persistent tab state restored to the Menu page.

## What Happened

MC task `c425fd5e` shipped a regression fix and feature pass for Menu page routing: dish detail URLs are now stable and shareable, and the active tab persists across navigation and reloads. Fixes a regression introduced earlier in the Menu Control Page rollout.

## Drivers

Driven by [[Projects/Menu Control Page]] usability work — owners and the future website both rely on deep-linking individual dishes.

## Impact

- Code: Menu page route definitions + tab state persistence
- Process: dish links are now safe to paste in Telegram and tasks
- Data: no schema changes
- People: CEO can share dish drafts directly

## See Also

- Project: [[Projects/Menu Control Page]]
- Domain: [[Domains/Menu]]
- Sibling: [[2026-04-21-menu-page-brand-tokens]]
