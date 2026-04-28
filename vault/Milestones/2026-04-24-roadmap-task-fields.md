---
title: 2026-04-24 — Roadmap task fields
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

# 2026-04-24 — Roadmap task fields

> [!success] Milestone
> Added `is_critical_path` and `owner` enum to `business_tasks` for roadmap surfacing.

## What Happened

MC tasks `4b3adb59` and `94721aa8` migrated the `business_tasks` table to add an `is_critical_path` boolean and an `owner` enum. These fields power the Before-Recipe-Lock must-do list and the owner chips on the new opening roadmap dashboard.

## Drivers

Prerequisite for [[2026-04-24-opening-roadmap-dashboard]] — the dashboard needs structured fields to render critical-path filtering and owner chips.

## Impact

- Code: migration + types regen + MC tool surface
- Process: tasks now declare ownership and critical-path status explicitly
- Data: schema change on `business_tasks`
- People: owner field clarifies who is on the hook for each task

## See Also

- Project: [[Projects/ERP Consolidation]]
- Sibling: [[Milestones/2026-04-24-opening-roadmap-dashboard]]
