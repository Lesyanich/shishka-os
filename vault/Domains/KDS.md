---
title: KDS
type: domain
tags:
  - domain
  - kds
  - kitchen-display
date: 2026-04-28
status: active
owners:
  - "[[People/Alex]]"
  - "[[People/Hein]]"
bounded_context: The Kitchen Display System — the screen the cooks see, showing live orders and routing them through stations.
related:
  - "[[Domains/Kitchen]]"
  - "[[Domains/Staff]]"
aliases:
  - Kitchen Display
  - Kitchen Display System
---

# KDS

> [!info] Domain
> The kitchen-facing screen that turns incoming orders into a live, station-routed work queue for the cooks.

## Definition

KDS is the screen on the kitchen's shared tablet that shows live orders, routes tickets to stations based on the recipe flow, and lets cooks bump items to "ready". Auth is hardened: each cook account is bound to a `staff.auth_user_id` so the shared tablet still records who actually progressed each ticket.

## Boundaries

Inside: order display, ticket routing, bump/ready/recall actions, KDS auth model. Outside: order creation upstream from POS, the recipes and equipment behind a ticket ([[Domains/Kitchen]]), and the staff identity model itself ([[Domains/Staff]]).

## Active Projects

- [[Projects/ERP Consolidation]] — KDS merge into unified admin under role-based access
- [[Projects/Phase 7.1 DB Architecture]] — staff.auth_user_id and security prep enabling KDS hardening

## Recent Decisions

- [[Decisions/D-005-db-and-mc-english-only]] — KDS strings and station names in English

## See Also

- Architecture: [[Architecture/Shishka OS Architecture]], [[Architecture/Database Schema]]
- Code paths: `apps/admin-panel/src/pages/kds/`
