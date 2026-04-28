---
title: Data Health Self-Learning Loop
type: project
tags: [project, data-health, learning, foundation]
date: 2026-04-24
status: active
domain: "[[Domains/Admin Panel]]"
mc_task: null
spec: null
branch: feature/shared/data-health-loop
pr_numbers: [126]
start: 2026-04-24
end: null
related: []
aliases: [Data Health Loop]
---

# Data Health Self-Learning Loop

> [!info] Project
> Every cleanup task feeds a rule registry + decision log so the system gets smarter with each pass.

## Objective

Replace one-off cleanup migrations with a backward-looking learning loop. `data_health_rules` is a declarative registry — each rule has `detect_sql`, `fix_strategy`, `confidence`, `severity`, `auto_apply`, `trigger_count`. `data_health_decisions` is an append-only log: every rename/fix writes (run_id, rule_id, entity_id, field, old→new, decision_source). `v_data_health_items` is rule-driven (legacy 8 metrics + `fn_data_health_rules_items()`). Adding a metric is now an INSERT, not a migration.

## Current State

- **Phase:** infrastructure live; rule library growing with each cleanup task
- **Owner:** [[People/Lesia]]
- **Migrations:** 154-156
- **PRs:** #126
- **Tooling:** `tools/data-health/run_rules.py` (preview / apply / summary modes, psycopg3, Keychain DB url)

## Recent Outcomes

- 2026-04-24 — CEO directive: every cleanup task must extend the loop, not just do one-off fixes
- 2026-04-24 — registry + log + view + runner shipped in PR #126

## Risks & Open Questions

- Boundary with `correction_rules` (forward-looking, [[Projects/Adaptive Receipt Learning]]) must be respected — they are intentionally separate
- `auto_apply=TRUE` promotion needs N consistent CEO approvals — threshold not yet codified

## See Also

- Related: [[Projects/Adaptive Receipt Learning]], [[Projects/Phase 7.1 DB Architecture]]
- Domain: [[Domains/Admin Panel]]
