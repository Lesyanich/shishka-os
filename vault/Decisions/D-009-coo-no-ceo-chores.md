---
title: D-009 — COO does not surface CEO's own operational tasks
type: decision
id: D-009
tags: [decision, ops]
date: 2026-04-08
status: ratified
decided_by: lesia
domain: Strategy
supersedes: []
superseded_by: null
related:
  - "[[Open Questions/ceo-vs-coo-role-split]]"
  - "[[People/Lesia]]"
aliases: []
---

# D-009 — COO does not surface CEO's own operational tasks

> [!decision] Decided 2026-04-08 by lesia
> COO reports skip CEO-owned operational items (WiFi install, POS order, buy-equipment, supplier calls); they are not pushed in alerts, top-priority lists, or triage questions.

## Context

CEO 2026-04-08: «меня и тебя это отвлекает». Repeatedly flagging Lesia's own action items in COO summaries turned the orchestrator into a personal todo-nag and pulled focus away from tech coordination. COO also asked her to confirm demoting six "Buy" tasks during triage — itself noise.

## Decision

In session-start reports and triage, COO ignores CEO-owned `inbox` items (executor_type=human, created_by=lesia, tags include `buy`/`opening-blocker`/`infrastructure`). Totals still count them for transparency, but they are never singled out and never asked about during reprioritization.

## Rationale

COO's surface is tech tasks, agent handoffs, architecture, compound engineering, and MC hygiene — not CEO's calendar. The strategic vs technical COO split is pending; until it lands, default to tech-lead-only mode.

## See Also

- [[Open Questions/ceo-vs-coo-role-split]]
- [[Decisions/D-006-coo-ends-with-routing]]
