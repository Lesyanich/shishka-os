---
title: D-001 — Always check column existence in migrations
type: decision
id: D-001
tags: [decision, tech]
date: 2026-03-13
status: ratified
decided_by: lesia
domain: Tech
supersedes: []
superseded_by: null
related:
  - "[[Domains/Admin Panel]]"
  - "[[Projects/Phase 7.1 DB Architecture]]"
aliases: []
---

# D-001 — Always check column existence in migrations

> [!decision] Decided 2026-03-13 by lesia
> SQL migrations that touch columns from earlier migrations must guard for the column actually existing in production.

## Context

Migration 049 failed in production because it referenced columns (`purchase_unit`, `conversion_factor`, `base_unit`) added by migration 039, which had never been applied to the live database. The repo's "47 migrations" count did not match what was actually deployed.

## Decision

Any migration that references columns added by a different migration must wrap the dependent statements in `DO $$ ... EXCEPTION WHEN undefined_column` or precheck via `information_schema.columns` before executing `ALTER`/`INSERT`.

## Rationale

Production may have skipped or silently failed migrations. Treating the migration history as authoritative is unsafe; the runtime check is cheap and turns a hard failure into a no-op.

## See Also

- [[Domains/Admin Panel]]
- [[Projects/Phase 7.1 DB Architecture]]
- [[Decisions/D-002-migrations-path]]
