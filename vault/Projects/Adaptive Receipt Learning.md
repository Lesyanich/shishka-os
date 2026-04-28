---
title: Adaptive Receipt Learning
type: project
tags: [project, finance, receipts, learning]
date: 2026-04-24
status: done
domain: "[[Domains/Finance]]"
mc_task: null
spec: docs/superpowers/specs/2026-04-24-adaptive-receipt-learning-design.md
branch: feature/finance/adaptive-receipt-learning
pr_numbers: [118, 119, 120, 121, 122, 123, 124]
start: 2026-04-24
end: 2026-04-24
related: []
aliases: [Receipt Learning, Self-Learning OCR]
---

# Adaptive Receipt Learning

> [!info] Project
> 4-module self-learning OCR pipeline so the system stops repeating the same receipt-parsing mistakes.

## Objective

Receipts get smarter with use. Four learning modules wired into the approval flow: `supplier_aliases` auto-saves name variants on resolve (instant exact match next time); `category_overrides` learns from CEO category corrections; `gs1_weight_items` decodes variable-weight barcodes; and an approval-diff engine (`fn_learn_from_approval` + `fn_approve_receipt_with_learning`) extracts correction rules from the diff between OCR output and approved payload. Three post-approval triggers also feed the loop from `purchase_logs`, `expense_ledger`, and `unmatched_items`.

## Current State

- **Phase:** done — live in production, all approvals route through `fn_approve_receipt_with_learning`
- **Owner:** [[People/Lesia]]
- **Migrations:** 150-153 (4 learning tables + diff engine + triggers)
- **PRs:** #118-#124

## Recent Outcomes

- 2026-04-24 — all 4 modules shipped; expected to suppress repeat classification errors after ~10-20 receipts
- 2026-04-24 — backfilled 14 GS1 weight items + 95 supplier_catalog entries from `purchase_logs`
- 2026-04-24 — supplier resolution improved ("SIAM MAKRO" → "Makro" via word fallback then alias table)

## Risks & Open Questions

- `correction_rules` (mig 150) is forward-looking; [[Projects/Data Health Self-Learning Loop]] is backward-looking — boundary intentional, do not merge

## See Also

- Spec: `docs/superpowers/specs/2026-04-24-adaptive-receipt-learning-design.md`
- Related: [[Projects/Data Health Self-Learning Loop]], [[Projects/GDrive Receipt Archive]]
- Domain: [[Domains/Finance]]
