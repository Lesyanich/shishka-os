---
title: D-008 — Handoff packets always live on an MC task, never in chat
type: decision
id: D-008
tags: [decision, ops]
date: 2026-04-08
status: ratified
decided_by: lesia
domain: Strategy
supersedes: []
superseded_by: null
related:
  - "[[Decisions/D-007-coo-handoff-format]]"
  - "[[Open Questions/ceo-vs-coo-role-split]]"
aliases: []
---

# D-008 — Handoff packets always live on an MC task, never in chat

> [!decision] Decided 2026-04-08 by lesia
> If COO cannot create a new MC task, the handoff packet goes as a comment on the closest existing task — never as chat text.

## Context

Session 9 (2026-04-08): when `emit_business_task` failed, COO fell back to pasting the full packet in chat. CEO corrected: «снова неверно! ты дал мне простыню». There is always an existing task that can host the packet — sibling bug, parent triage task, last-active tech task in the same domain.

## Decision

Post the full packet as a comment on the closest related existing task and tell CEO `/code <task-id>` plus one sentence. If the comment exceeds the cap, split into `(1/2)` + `(2/2)` on the same task. The "emergency exception to RULE-HANDOFF-PACKET" is a trap — refuse it.

## Rationale

Chat is conversation, MC is work. The receiving agent reads MC and never scrapes chat history. Routing the packet through MC preserves the audit trail and keeps the CEO out of the courier role.

## See Also

- [[Decisions/D-007-coo-handoff-format]]
- [[Decisions/D-006-coo-ends-with-routing]]
