---
title: D-NNN — <short decision title>
type: decision
id: D-NNN
tags:
  - decision
  - <domain>
date: YYYY-MM-DD
status: ratified           # ratified | reversed | superseded
decided_by: lesia
domain: <Menu | Kitchen | Finance | Procurement | KDS | Staff | Tech | Strategy>
supersedes: []             # [[D-XXX-...]]
superseded_by: null        # [[D-YYY-...]]
related:
  - "[[<Project or Domain note>]]"
mc_task: <UUID or null>
aliases: []
---

# D-NNN — <short decision title>

> [!decision] Decided <YYYY-MM-DD> by <decided_by>
> One-line summary of the decision.

## Context

What problem prompted this decision? Two to four sentences. Link to relevant `[[Domains/...]]` or `[[Projects/...]]`.

## Decision

What was chosen. Be specific — this is the load-bearing paragraph.

## Rationale

Why this option won over the alternatives. Include the alternatives considered and why they were rejected.

## Consequences

What this decision implies going forward — code paths to remove, processes to change, follow-up work needed.

## See Also

- MC task: `<UUID>`
- Related: [[<other decision or doc>]]
