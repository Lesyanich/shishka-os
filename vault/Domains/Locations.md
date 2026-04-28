---
title: Locations
type: domain
tags:
  - domain
  - locations
  - compliance
date: 2026-04-28
status: active
owners:
  - "[[People/Lesia]]"
bounded_context: Where Shishka physically operates — the factory kitchen, the retail point, and the regulatory regime that applies.
related:
  - "[[Domains/Kitchen]]"
  - "[[Domains/Staff]]"
aliases:
  - Sites
  - Facilities
---

# Locations

> [!info] Domain
> The physical sites where Shishka cooks and sells, and the Thai regulatory context that governs them.

## Definition

Shishka operates two locations in Thailand: L-1 is the factory kitchen (production) and L-2 is the retail/display point. Because the business is in Thailand, the governing regulator is the Thai FDA (อย.) — HACCP, labelling, and allergen standards follow Thai rules, not Dubai/UAE/EU. Staff may speak Thai, Russian, and English.

## Boundaries

Inside: site identity (L-1, L-2), regulatory regime (Thai FDA, HACCP), site-level configuration. Outside: what is cooked there ([[Domains/Kitchen]]), who works there ([[Domains/Staff]]), and the menu sold ([[Domains/Menu]]).

## Active Projects

- [[Projects/ERP Consolidation]] — location-aware admin views
- [[Projects/Phase 7.1 DB Architecture]] — multi-location data model

## Recent Decisions

- [[Decisions/D-005-db-and-mc-english-only]] — location names and addresses in English even though the country is Thai-speaking

## See Also

- Architecture: [[Architecture/Shishka OS Architecture]], [[Architecture/Database Schema]]
