---
title: D-005 — All DB and MC writes must be in English
type: decision
id: D-005
tags: [decision, ops]
date: 2026-04-05
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Staff]]"
  - "[[People/Lesia]]"
aliases: []
---

# D-005 — All DB and MC writes must be in English

> [!decision] Decided 2026-04-05 by lesia
> Every value written to Supabase or Mission Control — product names, BOM notes, recipe steps, MC task titles, comments — must be in English, even when the conversation with the agent is in Russian.

## Context

The Shishka team is multilingual (Lesia, Bas, Alex, Hein), and Russian-only DB content excludes everyone except Lesia from reading shared records. Russian belongs in conversation, not in storage.

## Decision

Before any write tool fires (`create_product`, `emit_business_task`, `add_bom_line`, `manage_recipe_flow`, `update_task`, etc.), the agent verifies the payload is English. Russian text in MC titles or DB rows is treated as a bug.

## Rationale

DB and MC are read by all staff and external integrations. A single language contract keeps the team coherent and avoids translation overhead at every read. Conversation language stays human (RULE-LANGUAGE-CONTRACT).

## See Also

- [[Domains/Staff]]
- [[Decisions/D-017-call-it-supabase-log-not-tokens]]
