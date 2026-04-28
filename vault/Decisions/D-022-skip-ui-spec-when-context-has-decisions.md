---
title: D-022 — Skip UI-SPEC gate when CONTEXT.md already has visual decisions
type: decision
id: D-022
tags: [decision, ops]
date: 2026-04-14
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Decisions/D-021-check-all-branches-before-claiming-missing]]"
  - "[[Domains/Admin Panel]]"
aliases: []
---

# D-022 — Skip UI-SPEC gate when CONTEXT.md already has visual decisions

> [!decision] Decided 2026-04-14 by lesia
> If CONTEXT.md already contains visual decisions (D-xx covering layout, color codes, badges, empty states), skip the UI-SPEC gate silently.

## Context

Phase 1 CONTEXT.md already had D-02 through D-10 covering all visual and UI decisions. The agent re-asked about UI-SPEC anyway, breaking flow and re-litigating decisions Lesia had already made in discuss-phase.

## Decision

When CONTEXT.md exists and covers visual decisions, proceed to plan/execute without raising the UI-SPEC gate. Only ask about UI-SPEC for phases with complex new UI not addressed in CONTEXT.md.

## Rationale

Gates that re-litigate already-made decisions are noise. The discuss-phase output is the contract; subsequent phases should consume it, not interrogate it.

## See Also

- [[Decisions/D-021-check-all-branches-before-claiming-missing]]
- [[Projects/Menu Control Page]]
