---
title: D-018 — First action on any task is update_task(in_progress)
type: decision
id: D-018
tags: [decision, ops]
date: 2026-04-12
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Projects/Multi-Agent Coordination v2]]"
  - "[[Decisions/D-004-update-task-done-before-reporting]]"
aliases: []
---

# D-018 — First action on any task is update_task(in_progress)

> [!decision] Decided 2026-04-12 by lesia
> Immediately after `get_task()` confirms a task, call `update_task(status="in_progress")` — before reading files, before running commands.

## Context

CEO runs multiple agent windows simultaneously against the same MC backend. If a task stays in `inbox` while being worked on, another window may pick it up and duplicate the work or cause merge conflicts. The MC status field is the only coordination signal between concurrent sessions.

## Decision

The very next tool call after `get_task()` is `update_task(status="in_progress")`. It is never deferred to "after I understand the task better" or "after I've read the spec".

## Rationale

Claiming early prevents collisions; claiming late guarantees them. The cost of an update_task call is negligible; the cost of two agents shipping competing PRs for the same task is high.

## See Also

- [[Projects/Multi-Agent Coordination v2]]
- [[Decisions/D-004-update-task-done-before-reporting]]
