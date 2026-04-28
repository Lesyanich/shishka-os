---
title: 2026-04-24 — Opening Roadmap Dashboard
type: milestone
tags:
  - milestone
  - release
  - strategy
date: 2026-04-24
status: closed
kind: release
domain: "[[Domains/Admin Panel]]"
related:
  - "[[Projects/ERP Consolidation]]"
aliases: []
---

# 2026-04-24 — Opening Roadmap Dashboard

> [!success] Milestone
> Control Center page replaced by a CEO-gated phase-tracker dashboard for the L-1 opening roadmap.

## What Happened

The legacy Control Center was retired in favour of a visual phase tracker that surfaces blockers, owners, and critical-path status for the opening roadmap. Tracked under MC tasks `5e87c9b2` and `7710fe5a`, scoped at critical priority and CEO-gated for release.

## Drivers

Driven by the need for a single visible source of progress for the L-1 opening, paired with [[2026-04-24-roadmap-task-fields]] which added the `is_critical_path` and `owner` fields the dashboard reads.

## Impact

- Code: new dashboard page in admin-panel, replacing Control Center
- Process: opening roadmap reviewed against this page, not MC list views
- Data: surfaces `business_tasks.is_critical_path` and `owner`
- People: CEO + COO operate from the same roadmap view

## See Also

- Project: [[Projects/ERP Consolidation]]
- Sibling: [[Milestones/2026-04-24-roadmap-task-fields]]
