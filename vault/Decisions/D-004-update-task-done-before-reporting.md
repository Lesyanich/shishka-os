---
title: D-004 — Update MC task to done before reporting to user
type: decision
id: D-004
tags: [decision, ops]
date: 2026-04-28
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Admin Panel]]"
  - "[[Projects/Multi-Agent Coordination v2]]"
aliases: []
---

# D-004 — Update MC task to done before reporting to user

> [!decision] Decided 2026-04-28 by lesia
> Always call `update_task(status='done')` in Mission Control before reporting completion to the user.

## Context

When agents reported a task complete in chat without flipping the MC status, parallel sessions could not tell the work was finished, and the audit trail diverged from reality. CEO had to re-ask "did you actually close it?" each time.

## Decision

Closing the MC task with `update_task(status='done')` is the last action before the completion message — never after, never skipped.

## Rationale

MC status is the only coordination signal that other agent windows trust. Keeping chat and MC in sync prevents duplicate work and gives the CEO a single source of truth for what is actually done.

## See Also

- [[Decisions/D-018-claim-task-first-action]]
- [[Projects/Multi-Agent Coordination v2]]
