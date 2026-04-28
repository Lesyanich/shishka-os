---
title: Staff
type: domain
tags:
  - domain
  - staff
  - people
date: 2026-04-28
status: active
owners:
  - "[[People/Lesia]]"
bounded_context: The real people who work at Shishka, their roles, and how they authenticate into the system.
related:
  - "[[Domains/KDS]]"
  - "[[Domains/Locations]]"
aliases:
  - Roster
  - Team
---

# Staff

> [!info] Domain
> The actual humans on the Shishka payroll, plus the shared kitchen tablet account — and how each one logs in.

## Definition

Staff covers the live roster and the auth identities behind it. The real roster is small and explicit: Lesia + Bas (owner), Alex + Hein (cook), and a kitchen shared tablet account. No fake or seed staff — historic seed names (Noi, Som, Lek) are cleanup targets, not real people.

## Boundaries

Inside: staff records, app_role, Supabase Auth bindings, the shared-tablet account model. Outside: the kitchen display the cooks operate ([[Domains/KDS]]), where they physically work ([[Domains/Locations]]), and how their actions tie into orders or ledger postings.

## Active Projects

- [[Projects/ERP Consolidation]] — role-based access driving sidebar visibility per staff role
- [[Projects/Phase 7.1 DB Architecture]] — staff.auth_user_id and security prep

## Recent Decisions

- [[Decisions/D-005-db-and-mc-english-only]] — staff records and roles in English

## See Also

- Architecture: [[Architecture/Database Schema]], [[Architecture/Shishka OS Architecture]]
- People: [[People/Lesia]], [[People/Bas]], [[People/Alex]], [[People/Hein]]
