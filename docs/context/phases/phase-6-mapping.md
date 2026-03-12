# Phase 6: Perfect Inventory & Mapping Engine

**Date:** 2026-03-12
**Status:** IN PROGRESS
**Branch:** `feature/phase-6-mapping-engine`

## Problem Statement

Receipt upload infrastructure was solved (Phases 4-5.0f). Gemini 2.5 Flash parses receipts in seconds. But business logic had 5 critical gaps:
1. Math mismatches (discounts/VAT not extracted)
2. UoM chaos (purchase units vs kitchen units)
3. Ugly `RAW-AUTO-{hash}` nomenclature
4. AI hallucinations
5. Difficulty verifying Thai line items

## Sub-Phases

### 6.1: Financial Reconciliation
- AI extracts structured `footer` object: `{subtotal, discount_total, vat_amount, grand_total}`
- Balancing formula: `subtotal + discount_total + vat_amount = grand_total`
- GAS `validateAndPostProcess_` cross-checks items sum vs subtotal
- New `ReconciliationPanel` in StagingArea: editable discount/VAT, green checkmark when balanced
- Migration 038: `expense_ledger` gains `discount_total`, `vat_amount`, `invoice_number`
- `fn_approve_receipt` v5: accepts and stores new financial fields

### 6.2: Anti-Hallucination + Confidence Scoring
- 3-layer defense: prompt engineering → GAS post-processing → frontend visual cues
- Prompt: item_count_observed anchor, confidence scoring (high/medium/low), UNREADABLE rule
- Post-processing: item count validation, per-item price math check, duplicate detection
- Frontend: confidence-colored borders (green/amber/red), warning tooltips

### 6.3: Smart Nomenclature Creation
- Replaced `__NEW__` (ugly RAW-AUTO-{hash}) with guided Create Item modal
- Modal: name pre-filled, auto-generated `RAW-{SLUG}` code, base_unit radio (kg/L/pcs)
- Fuzzy match suggestions from existing nomenclature

### 6.4: UoM Conversion Layer
- Migration 039: `supplier_item_mapping` gains `purchase_unit`, `conversion_factor`, `base_unit`
- `useSupplierMapping` hook returns `MappingMatch` with conversion data
- Formula: `inventory_quantity = receipt_quantity × conversion_factor`
- **UI pending** — hook ready, UI not yet built

### 6.5: Item Identification UX
- Line number badges, SKU chips (clickable copy), Thai original_name shown, per-item warnings

## Migrations
| Migration | Purpose |
|---|---|
| 038_reconciliation.sql | expense_ledger: discount_total, vat_amount, invoice_number + fn_approve_receipt v5 |
| 039_uom_conversion.sql | supplier_item_mapping: purchase_unit, conversion_factor, base_unit |

## Pending Deployment
- Migrations 038 & 039 need `supabase db push`
- GAS needs `clasp push && npm run deploy`
- UoM conversion UI in StagingArea (hook ready, UI pending)
- fn_approve_receipt does not yet apply conversion_factor to purchase_logs
