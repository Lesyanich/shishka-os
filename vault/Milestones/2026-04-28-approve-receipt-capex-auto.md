---
title: 2026-04-28 — approve_receipt CapEx auto-create
type: milestone
tags:
  - milestone
  - release
  - finance
date: 2026-04-28
status: closed
kind: release
domain: "[[Domains/Finance]]"
related:
  - "[[Projects/Adaptive Receipt Learning]]"
  - "[[Decisions/D-026-nomenclature-prefix-base-unit-convention]]"
aliases: []
---

# 2026-04-28 — approve_receipt CapEx auto-create

> [!success] Milestone
> `fn_approve_receipt` now auto-creates `capex_assets` rows for CapEx receipts.

## What Happened

MC task `fd6afc75` shipped via commit `9ddb6c2` (PR #150). The `fn_approve_receipt` RPC now detects CapEx-classified receipts and inserts the corresponding `capex_assets` rows in the same transaction, removing the previous manual step.

## Drivers

Driven by [[Projects/Adaptive Receipt Learning]] — closing the loop from receipt classification to capex registry without admin intervention.

## Impact

- Code: `fn_approve_receipt` RPC body + tests
- Process: admin no longer manually inserts capex_assets after approving CapEx receipts
- Data: `capex_assets` rows created transactionally with receipt approval
- People: CEO and admin both see CapEx assets immediately on approval

## See Also

- Project: [[Projects/Adaptive Receipt Learning]]
- Domain: [[Domains/Finance]]
- PRs: #150 (commit `9ddb6c2`)
