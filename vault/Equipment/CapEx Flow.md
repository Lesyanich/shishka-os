---
title: CapEx Flow
type: page
tags: [equipment, capex, finance]
date: 2026-04-29
status: active
related:
  - "[[Equipment/]]"
  - "[[Finance/Receipt Routing]]"
  - "[[Finance/Classification]]"
---

# CapEx Flow

How a piece of equipment goes from "we bought a blast chiller" to "row in `equipment` + asset in `capex_assets` + ledger entries in `capex_transactions`" — automatically, on receipt approval.

## End-to-end flow

```
1. Photo of receipt arrives in inbox          → receipt_inbox
2. Finance agent OCRs + parses                → receipt_jobs / financial_transactions (draft)
3. Owner reviews + approves                   → calls fn_approve_receipt(receipt_id)
4. fn_approve_receipt runs (mig 164):
   a. Posts ledger entries
   b. Detects line items classified as CAPEX
   c. For each CAPEX line:
      • Creates a row in capex_assets         (the asset)
      • Creates a row in capex_transactions   (the purchase event)
      • Auto-creates a row in equipment       (with status = 'pending_setup')
5. Owner edits the auto-created equipment row to add zone, ID, notes
   → mcp-chef.update_equipment via Chef Agent or admin UI
```

The auto-creation step is what makes this flow "AI-native" — finance work creates the operational records that the kitchen needs, with no manual double-entry.

## Tables involved

| Table | Owner | Role |
|---|---|---|
| `receipt_inbox` | Finance | Photos / PDFs awaiting parsing |
| `receipt_jobs` | Finance | OCR + classification queue |
| `financial_transactions` | Finance | Ledger entries (the books) |
| `capex_assets` | Finance | One row per physical asset over its lifetime |
| `capex_transactions` | Finance | Purchase / disposal / revaluation events |
| `equipment` | Chef | Operational view — what's in the kitchen, where, status |

The two halves (`capex_*` finance side, `equipment` chef side) are linked via shared identity (asset code, e.g. `L1-BL-FRZ-790-66`).

## `fn_approve_receipt` logic (mig 164)

The function:

1. Iterates each line item on the receipt
2. Looks up the `category_code` (`COGS` / `CAPEX` / `OPEX` / `PAYROLL` — see [[Finance/Classification]])
3. If `CAPEX`:
   - Inserts `capex_assets` row with the line item's description and amount
   - Inserts `capex_transactions` (type=`'purchase'`)
   - Inserts `equipment` row with `status='pending_setup'`, `purchase_date`, `purchase_amount`, `supplier_id`
4. If `COGS` / `OPEX` / `PAYROLL`: posts to `financial_transactions` and stops

Migrations 162 (`delete_stale_capex_placeholders`) and 163 (`fix_equipment_status_constraint`) ironed out two earlier issues:

- 162: stale rows from a pre-launch placeholder pattern
- 163: the equipment status enum needed `'pending_setup'` added — older capex auto-creates failed the check constraint

See MC `3760af53` (Bug: `manage_capex_assets` auto-create equipment fails on status check constraint).

## Owner-side cleanup

After auto-create, the equipment row needs:

- A canonical `equipment_id` following the [[Equipment/]] naming convention (the auto-create uses a placeholder)
- Zone (e.g. `L1-Hot-W2`)
- `status` updated from `'pending_setup'` to `'active'`
- Optional: notes, photos, manual link

This is done via the admin Equipment page or `mcp-chef.update_equipment`.

## Disposal / revaluation

When equipment is sold, scrapped, or revalued:

- Insert `capex_transactions` row with type `'disposal'` or `'revaluation'`
- Update `equipment.status` to `'retired'` or similar
- Books reflect the loss / gain via `fn_record_capex_disposal` (TBD — not yet implemented at time of writing)

## See Also

- [[Finance/Receipt Routing]] — the receipt → ledger flow this builds on
- [[Finance/Classification]] — what counts as CAPEX vs OPEX
- [[Equipment/Inventory]] — the operational view of the same assets
- `services/supabase/migrations/164_approve_receipt_auto_capex_assets.sql`
- MC `3760af53` (open bug), `9ddb6c2` (commit that introduced the auto-create)
