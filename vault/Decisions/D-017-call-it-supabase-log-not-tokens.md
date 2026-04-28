---
title: D-017 — Call cost tracking "Supabase log", not "token accounting"
type: decision
id: D-017
tags: [decision, ops]
date: 2026-04-09
status: ratified
decided_by: lesia
domain: Strategy
supersedes: []
superseded_by: null
related:
  - "[[People/Lesia]]"
  - "[[Domains/Admin Panel]]"
aliases: []
---

# D-017 — Call cost tracking "Supabase log", not "token accounting"

> [!decision] Decided 2026-04-09 by lesia
> When proposing LLM cost or usage tracking, lead with where the data lives ("в нашей Supabase таблице") — never with English observability jargon like "token accounting" or "telemetry pipeline".

## Context

2026-04-09: agent proposed a `brain_query_log` table and Lesia read "token accounting" as a paid SaaS proposal (Langfuse / Helicone / Datadog). Her exact reaction: «если у нас есть выбор между написать код самим и забыть или платить - мы выбираем первое!». The wording sounded vendor-ish even though the implementation was a single Postgres table.

## Decision

Frame any metrics, logging, or monitoring proposal by location first ("Supabase таблица", "наш код пишет в наш Postgres", "миграция + React компонент") before describing what it tracks. If a paid vendor is genuinely the right answer, state the price upfront, never bury it.

## Rationale

Shishka's default for infra is "write it ourselves and forget" over "subscribe to a SaaS". Jargon-first framing accidentally signals "I want to spend money", which derails the conversation.

## See Also

- [[Decisions/D-005-db-and-mc-english-only]]
- [[People/Lesia]]
