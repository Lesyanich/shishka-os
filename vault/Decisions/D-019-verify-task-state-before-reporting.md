---
title: D-019 — Update MC notes after every state-changing action
type: decision
id: D-019
tags: [decision, ops]
date: 2026-04-12
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Decisions/D-004-update-task-done-before-reporting]]"
  - "[[Decisions/D-018-claim-task-first-action]]"
aliases: []
---

# D-019 — Update MC notes after every state-changing action

> [!decision] Decided 2026-04-12 by lesia
> After any CEO-gated action (migration apply, deploy, feature enable), `/code` must update_task notes immediately so closure notes reflect the FINAL state, not an intermediate snapshot.

## Context

RLS audit task `287f3cee`: `/code` applied migration 109 after CEO approval but left task notes saying "Migration needs manual apply via psql". Tech-Lead later read the stale notes and reported the migration as unapplied. The task-lifecycle skill had no explicit step for post-action note refresh.

## Decision

After any state-changing action completes, call `update_task(notes=...)` with the result before closing. Closure notes always describe the final state. Tech-Lead reviewers still verify current state independently, but the primary fix is upstream — `/code` must not leave stale notes behind.

## Rationale

MC notes are the durable record other agents read first. If they lag the live system, downstream sessions plan against fiction and waste cycles re-confirming reality.

## See Also

- [[Decisions/D-004-update-task-done-before-reporting]]
- [[Decisions/D-018-claim-task-first-action]]
