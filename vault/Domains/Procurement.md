---
title: Procurement
type: domain
tags:
  - domain
  - procurement
  - supply-chain
date: 2026-04-28
status: active
owners:
  - "[[People/Lesia]]"
bounded_context: Sourcing, supplier catalog, purchase orders, and goods receiving — everything from "we need it" to "it's in the kitchen".
related:
  - "[[Domains/Finance]]"
  - "[[Domains/Kitchen]]"
aliases:
  - Sourcing
  - Purchasing
---

# Procurement

> [!info] Domain
> How Shishka decides what to buy, from whom, at what price — and how those goods enter the kitchen.

## Definition

Procurement covers supplier research, the supplier catalog (single source of truth for prices and lead times), purchase orders, and the receiving flow that turns a delivery into a stocked ingredient. The procurement agent compares options, builds tables, and posts recommendations as MC task comments.

## Boundaries

Inside: supplier_catalog, purchase_logs, supplier comparison, goods receiving, ingredient nomenclature for raw items. Outside: cost rollup and ledger postings ([[Domains/Finance]]), recipe consumption ([[Domains/Kitchen]]), and end-customer menu pricing ([[Domains/Menu]]).

## Active Projects

- [[Projects/Adaptive Receipt Learning]] — invoice parsing feeds supplier_catalog
- [[Projects/Phase 7.1 DB Architecture]] — supplier_catalog as SSoT for prices

## Recent Decisions

- [[Decisions/D-026-nomenclature-prefix-base-unit-convention]] — base-unit convention applies to supplier ingredients
- [[Decisions/D-005-db-and-mc-english-only]] — supplier names and SKUs in English

## See Also

- Architecture: [[Architecture/Procurement & Receiving Architecture]], [[Architecture/Receipt Routing Architecture]]
- Milestones: [[Milestones/2026-04-24-procurement-agent-v1]]
