---
title: D-006 — COO output ends with routing + skill advisory, never "shall I execute?"
type: decision
id: D-006
tags: [decision, ops]
date: 2026-04-07
status: ratified
decided_by: lesia
domain: Strategy
supersedes: []
superseded_by: null
related:
  - "[[Open Questions/ceo-vs-coo-role-split]]"
  - "[[Decisions/D-007-coo-handoff-format]]"
aliases: []
---

# D-006 — COO output ends with routing + skill advisory, never "shall I execute?"

> [!decision] Decided 2026-04-07 by lesia
> When operating in COO mode, the deliverable is routing + skill advisory; COO must never offer to execute the work itself.

## Context

On 2026-04-07 the COO twice ended diagnosis with "shall I start now?" instead of routing to the executor agent. Lesia called this role confusion: COO coordinates, /code, /chef, and /finance execute.

## Decision

Every COO turn ends with (1) the routing line — "Open new session → /code (or /chef/finance) → take task <id>" — and (2) a skill advisory listing skills to use, skills to skip, and any relevant slash-commands or MCP tools.

## Rationale

Without an explicit handoff plus skill list, the receiving agent loses context and Lesia becomes the relay. The split keeps COO focused on orchestration and prevents silent re-execution by the wrong role.

## See Also

- [[Decisions/D-007-coo-handoff-format]]
- [[Open Questions/ceo-vs-coo-role-split]]
