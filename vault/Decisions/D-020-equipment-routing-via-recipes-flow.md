---
title: D-020 — Equipment routing lives in recipes_flow, not in equipment table
type: decision
id: D-020
tags: [decision, kitchen]
date: 2026-04-13
status: ratified
decided_by: lesia
domain: Kitchen
supersedes: []
superseded_by: null
related:
  - "[[Domains/Kitchen]]"
  - "[[Domains/KDS]]"
aliases: []
---

# D-020 — Equipment routing lives in recipes_flow, not in equipment table

> [!decision] Decided 2026-04-13 by lesia
> Equipment-to-equipment routing belongs in `recipes_flow.target_equipment_category_id`, never in the equipment table as `downstream_equipment_id`.

## Context

A combi oven does not know if granola goes to ambient cooling or roast beef goes to a blast chiller — the recipe determines the next step and which equipment type is needed. Adding a `downstream_equipment_id` column to equipment encodes a false invariant.

## Decision

Routing for each step lives in `recipes_flow`: `target_equipment_category_id` (which equipment type is needed) plus `transition_time_max` (max allowed delay between steps for food safety). The equipment table never carries routing fields.

## Rationale

The recipe is the source of truth for what is being cooked and where it goes next. Equipment is a resource type, not a graph node. Keeping routing in the recipe lets the same physical oven serve any recipe without schema changes.

## See Also

- [[Domains/Kitchen]]
- [[Domains/KDS]]
