# Phase 4: Procurement & Real-time Food Costing

**Date:** 2026-03-10
**Status:** COMPLETED

## What Was Built

Supplier management, purchase logging with auto-cost update trigger.

### Migration 021: Procurement
- `suppliers` TABLE: id UUID PK, name, contact_info, is_deleted, created_at, updated_at
- `purchase_logs` TABLE: id UUID PK, nomenclature_id FK, supplier_id FK, quantity, price_per_unit, total_price, invoice_date, notes
- `fn_update_cost_on_purchase()` TRIGGER: On INSERT into purchase_logs → updates nomenclature.cost_per_unit with latest price_per_unit (SSoT!)
- RLS: Full CRUD for authenticated users on both tables
- Realtime: Both tables published

### Frontend Components
| Component | Purpose |
|---|---|
| `Procurement.tsx` | 2-column grid: PurchaseForm + SupplierManager (left), PurchaseHistory (right) |
| `PurchaseForm.tsx` | Supplier + item select, auto-calc price_per_unit, cost delta comparison |
| `SupplierManager.tsx` | CRUD table for suppliers with modal, soft-delete |
| `PurchaseHistory.tsx` | Last 50 purchases. Two-query join pattern (CLAUDE.md Rule #3). |

### Key UX Features
- Auto Price-per-Unit: `price_per_unit = total_price / quantity`
- Cost Delta Indicator: shows % change vs current cost (green cheaper, red more expensive)
- Trigger-based Cost Update: DB trigger auto-updates nomenclature.cost_per_unit — zero manual work
