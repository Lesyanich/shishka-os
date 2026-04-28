---
title: <Project Name>
type: project
tags:
  - project
  - <domain>
date: YYYY-MM-DD            # project start
status: active              # active | paused | done | cancelled
domain: "[[Domains/<name>]]"
mc_task: <UUID or null>
spec: docs/plans/spec-<name>.md
branch: feature/<area>/<name>
pr_numbers: []              # [142, 147, ...]
start: YYYY-MM-DD
end: null                   # YYYY-MM-DD when status=done
related:
  - "[[Decisions/D-NNN-...]]"
aliases: []
---

# <Project Name>

> [!info] Project
> One-line objective: what does this project deliver, for whom?

## Objective

Two to four sentences. What is being built? Why does it matter? Link to the driving [[Domains/<name>]] and any [[Decisions/D-NNN-...]] that justify it.

## Current State

- **Phase:** <current phase or "planning">
- **Owner:** [[People/<name>]]
- **Spec:** `docs/plans/spec-<name>.md`
- **Branch:** `feature/<area>/<name>`
- **PRs:** #142, #147

## Recent Outcomes

- YYYY-MM-DD — <what shipped or was decided>
- YYYY-MM-DD — <what shipped or was decided>

## Risks & Open Questions

- [[Open Questions/<slug>]] — short summary
- <risk> — short summary

## See Also

- Spec: `docs/plans/spec-<name>.md`
- Domain: [[Domains/<name>]]
- Decisions: [[Decisions/D-NNN-...]]
