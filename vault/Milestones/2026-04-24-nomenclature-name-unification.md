---
title: 2026-04-24 — Nomenclature name unification
type: milestone
tags:
  - milestone
  - release
  - menu
date: 2026-04-24
status: closed
kind: release
domain: "[[Domains/Menu]]"
related:
  - "[[Projects/Data Health Self-Learning Loop]]"
  - "[[Decisions/D-026-nomenclature-prefix-base-unit-convention]]"
aliases: []
---

# 2026-04-24 — Nomenclature name unification

> [!success] Milestone
> Nomenclature names cleaned of grams, RAW prefixes, and inconsistent formatting.

## What Happened

MC task `7d386835` swept the `nomenclature` table to remove embedded gram weights, leftover `RAW` prefixes, and inconsistent capitalisation/punctuation from item names. Output is consistent, prefix-driven naming aligned with the PF/MOD/SALE conventions.

## Drivers

Driven by [[Projects/Data Health Self-Learning Loop]] — naming inconsistencies were polluting receipt matching and menu rendering.

## Impact

- Code: no app code changes
- Process: future writes follow the PF/MOD/SALE prefix convention
- Data: bulk update on `nomenclature.name`
- People: receipt matching and menu rendering both improve downstream

## See Also

- Project: [[Projects/Data Health Self-Learning Loop]]
- Domain: [[Domains/Menu]]
- Decisions: [[Decisions/D-026-nomenclature-prefix-base-unit-convention]]
