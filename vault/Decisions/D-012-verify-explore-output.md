---
title: D-012 — Verify Explore agent assumptions before acting on them
type: decision
id: D-012
tags: [decision, ops]
date: 2026-04-07
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Decisions/D-011-vite-anon-key-public]]"
  - "[[Decisions/D-010-verify-before-correcting]]"
aliases: []
---

# D-012 — Verify Explore agent assumptions before acting on them

> [!decision] Decided 2026-04-07 by lesia
> Explore subagent reports mix observations with inferences; verify file-content claims before escalating or planning on them.

## Context

On 2026-04-07 Explore reported that `apps/admin-panel/.env` "contains DATABASE_URL". The claim was inferred from a comment in `run-server.sh` ("sources from admin-panel/.env"), not from reading the file. COO escalated a security incident on the unverified claim.

## Decision

When an Explore report makes a file-content claim, re-read the original excerpt. If it cites a comment, "documented behavior", or "assumed", treat it as a hypothesis and add a cheap verification step (CEO confirmation or `grep`) before planning. For high-stakes decisions require two independent confirmations.

## Rationale

Explore agents synthesize narrative reports that read like fact. Acting on inferences as if observed leads to false escalations and wasted plans. Marking inferred claims explicitly in plan docs helps future-self when the inference breaks.

## See Also

- [[Decisions/D-011-vite-anon-key-public]]
- [[Decisions/D-010-verify-before-correcting]]
