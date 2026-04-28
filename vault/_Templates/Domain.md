---
title: <Domain Name>
type: domain
tags:
  - domain
  - <area>
date: YYYY-MM-DD
status: active             # active | merged | retired
owners:
  - "[[People/<Name>]]"
bounded_context: <one-line definition of where this domain begins and ends>
related:
  - "[[Domains/<adjacent domain>]]"
aliases: []
---

# <Domain Name>

> [!info] Domain
> One-line definition. What concept does this domain represent in the business?

## Definition

Two to four sentences. What does this domain cover? What are its core concepts? Use plain business language, not code names.

## Boundaries

What is **inside** this domain (responsibilities, decisions, data) and what is **outside** (handed to adjacent domains). List adjacent domains as wikilinks.

## Key Concepts

- **Concept 1** — short definition
- **Concept 2** — short definition

## Active Projects

- [[Projects/<name>]] — one-line status
- [[Projects/<name>]] — one-line status

## Recent Decisions

- [[Decisions/D-NNN-...]] — one-line summary
- [[Decisions/D-MMM-...]] — one-line summary

## Open Questions

- [[Open Questions/<slug>]] — one-line summary

## See Also

- Architecture: [[Architecture/<related diagram>]]
- Code paths (if relevant): `apps/.../...`, `services/.../...`
