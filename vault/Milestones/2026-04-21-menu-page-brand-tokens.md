---
title: 2026-04-21 — Menu page brand tokens
type: milestone
tags:
  - milestone
  - release
  - menu
date: 2026-04-21
status: closed
kind: release
domain: "[[Domains/Menu]]"
related:
  - "[[Projects/Menu Control Page]]"
aliases: []
---

# 2026-04-21 — Menu page brand tokens

> [!success] Milestone
> Menu page components migrated onto the brand token system in two passes.

## What Happened

MC task `cf1acf35` performed the first-pass brand-token migration on shipped Menu page components, and follow-up sweep `ba109556` cleaned up remaining hardcoded values. Both tasks reference `agents/designer/brand-tokens.md` as the source of truth for surface, accent, and text tokens.

## Drivers

Part of [[Projects/Menu Control Page]] design hygiene — keeping the Menu page consistent with the warmer-dark token system rolled out globally.

## Impact

- Code: Menu page components reference token classes only
- Process: future Menu work must use brand tokens, not raw Tailwind colors
- Data: no schema changes
- People: design diffs become readable

## See Also

- Project: [[Projects/Menu Control Page]]
- Domain: [[Domains/Menu]]
- Sibling: [[2026-04-24-warmer-dark-tokens]], [[2026-04-22-menu-url-routing-v2]]
