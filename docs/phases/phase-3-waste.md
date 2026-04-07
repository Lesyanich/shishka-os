# Phase 3: Waste, Inventory, Batches & BOM CRUD

**Date:** 2026-03-09
**Status:** COMPLETED
**Covers:** Phase 3 (Waste & Inventory) + Phase 3.5 (Batch Tracking) + Phase 3.6 (BOM Hub CRUD) + Phase 1.5 (Storefront)

## Phase 3: Smart Waste & Inventory

### Migration 017: Inventory, Waste & Predictive Procurement
- `waste_reason` ENUM: expiration, spillage_damage, quality_reject, rd_testing
- `financial_liability` ENUM: cafe, employee, supplier
- `inventory_balances` TABLE: PK=nomenclature_id, quantity, last_counted_at
- `waste_logs` TABLE: UUID PK, nomenclature_id FK, quantity, reason, financial_liability
- `fn_predictive_procurement(UUID)` RPC: Recursive CTE walks BOM tree → leaf RAW → compares vs inventory → shortage array

### Frontend: WasteTracker.tsx
- ZeroDayStocktake — inline-edit inventory table
- WasteLogForm — waste log with financial liability toggle
- PredictivePO — plan selector + Generate PO → shortage table

## Phase 3.5: Batch Tracking & Logistics

### Migration 018: Batches, Locations & Stock Transfers
- `location_type` ENUM: kitchen, assembly, storage, delivery
- `batch_status` ENUM: sealed, opened, depleted, wasted
- `locations` TABLE: Kitchen, Assembly, Storage (seeded)
- `inventory_batches` TABLE: barcode UNIQUE, weight, location_id, status
- `stock_transfers` TABLE: batch_id FK, from/to location FKs, CHECK(from≠to)
- 4 RPCs: fn_generate_barcode(), fn_create_batches_from_task(), fn_open_batch(), fn_transfer_batch()

### Frontend: LogisticsScanner.tsx
- TransferTab — barcode scan → transfer between locations
- UnpackTab — barcode scan → open → countdown timer

## Phase 3.6: BOM Hub Editor & Database Sync

### Migration 019: Nomenclature Cost & Notes
- `cost_per_unit NUMERIC DEFAULT 0` — unit cost in THB for RAW items
- `notes TEXT` — free-text notes per nomenclature item

### BOM Hub Improvements
- Filter Bugfix: Sales tab STRICTLY shows SALE-% only (RULE-BOM-PREFIX-FILTER created)
- Add/Edit Item modals, Cost Badge, Editable BOM Table, Per-line Cost

### Migrations 016-019 all applied to Supabase.

## Phase 1.5: Storefront Extension & Pricing Engine

### Migration 020: Storefront & Pricing
- 12 columns added to nomenclature: price, image_url, slug, is_available, display_order, is_featured, calories, protein, carbs, fat, allergens, markup_pct
- NomenclatureModal → 3-Section Editor: Basic & Site, Pricing Engine, Nutrition (КБЖУ)
- Slug auto-generation (Cyrillic→Latin), Reactive Pricing Calculator, Margin Indicator, КБЖУ Summary Card
