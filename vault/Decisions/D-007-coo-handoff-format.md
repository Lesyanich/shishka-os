---
title: D-007 — COO handoff to /code is "/code <task-id>" only
type: decision
id: D-007
tags: [decision, ops]
date: 2026-04-08
status: ratified
decided_by: lesia
domain: Strategy
supersedes: []
superseded_by: null
related:
  - "[[Decisions/D-006-coo-ends-with-routing]]"
  - "[[Decisions/D-008-coo-no-chat-packets]]"
aliases: []
---

# D-007 — COO handoff to /code is "/code <task-id>" only

> [!decision] Decided 2026-04-08 by lesia
> Handoff prompts that the CEO relays must be the slash-command and a task ID, optionally one sentence — never a full packet pasted in chat.

## Context

Session 6 (2026-04-08): COO pasted a 100-line handoff packet in chat. CEO had to scroll, copy, and paste it; meanwhile /code's session-start reads MC, not chat history, so the packet was effectively invisible to the executor anyway.

## Decision

Use `emit_business_task` to create the task, `update_task` to set `context_files`, and put scope, commit message, acceptance gate, and FORBIDDEN list as MC comments. The CEO's relay prompt is `/code <task-id>` plus at most one sentence of context.

## Rationale

CEO is the relay, not the switchboard. Every character of packet text she has to copy-paste is cognitive load on the wrong person. MC is the executor's source of truth; chat is conversation.

## See Also

- [[Decisions/D-006-coo-ends-with-routing]]
- [[Decisions/D-008-coo-no-chat-packets]]
