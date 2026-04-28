---
title: YYYY-MM-DD — <short milestone name>
type: milestone
tags:
  - milestone
  - <kind>
date: YYYY-MM-DD            # when it happened
status: closed              # closed (always — milestones are historical)
kind: release               # release | pivot | incident | launch | decommission
domain: "[[Domains/<name>]]"
related:
  - "[[Projects/<name>]]"
  - "[[Decisions/D-NNN-...]]"
aliases: []
---

# YYYY-MM-DD — <short milestone name>

> [!success] Milestone
> One-line summary: what changed in the business on this date?

## What Happened

Two to four sentences. Concrete event, not narrative. Include who shipped it, the PR numbers, the version tag if any.

## Drivers

What pushed this milestone — a [[Decisions/D-NNN-...]], a [[Projects/<name>]] phase completion, an external constraint, an incident response.

## Impact

What changed downstream:
- Code: <files/services touched>
- Process: <new rule, retired rule>
- Data: <schema migration, retired tables>
- People: <new responsibility, freed capacity>

## See Also

- Project: [[Projects/<name>]]
- Decisions: [[Decisions/D-NNN-...]]
- PRs: #142, #147
