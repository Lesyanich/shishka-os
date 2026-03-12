# Procurement Module Context

## Tables
- `suppliers` (id UUID) — name UNIQUE, contact_info, category_code FK, sub_category_code, is_deleted
- `purchase_logs` (id UUID) — nomenclature_id FK, supplier_id FK, quantity, price_per_unit, total_price, invoice_date, expense_id FK
- `supplier_item_mapping` (id UUID) — supplier_id FK, nomenclature_id FK, original_name, supplier_sku, match_count, purchase_unit, conversion_factor, base_unit

## RPCs / Triggers
- `fn_update_cost_on_purchase()` — Trigger: on purchase_logs INSERT → auto-updates nomenclature.cost_per_unit
- `fn_predictive_procurement(UUID)` — Recursive BOM walk → shortage array (used by MRP and WasteTracker)

## Mapping Engine (supplier_item_mapping)

### Resolution Chain
```
Lookup:  supplier_sku match  →  original_name match  →  unmapped
Ranking: ORDER BY match_count DESC, LIMIT 1
Save:    existing → match_count++ (UPDATE)  |  new → INSERT (match_count=1)
```
- Indexes are NON-UNIQUE (one SKU can map to multiple nomenclature_ids)
- Hook sorts by match_count DESC and takes first

### UoM Conversion (Phase 6.4)
- `purchase_unit` — Unit on receipt (e.g., "bag", "box")
- `conversion_factor` — Multiplier to base_unit
- `base_unit` — Kitchen unit (kg/L/pcs)
- Formula: `inventory_quantity = receipt_quantity × conversion_factor`
- **DB LIVE (Migration 040)** — fn_approve_receipt v6 applies conversion_factor on approval
- **UI LIVE (Phase 6.5)** — UoM Badge in StagingArea + inline editor + updateConversion in hook

## Frontend
| File | Purpose |
|---|---|
| `src/pages/Procurement.tsx` | 2-column grid layout |
| `src/components/procurement/PurchaseForm.tsx` | Supplier + item select, auto-calc, cost delta |
| `src/components/procurement/SupplierManager.tsx` | Supplier CRUD with soft-delete |
| `src/components/procurement/PurchaseHistory.tsx` | Last 50 purchases, two-query join pattern |
| `src/hooks/useSupplierMapping.ts` | Smart mapping: lookupMappings, saveMapping, applyMappings |

## Patterns & Gotchas
- Column-level REVOKE on purchase_logs (entire table) — RPCs retain privileges
- PurchaseHistory uses NomenclatureLabel for clean display
- Supplier auto-creation: fn_approve_receipt v6 auto-inserts unknown supplier_name
- UoM conversion: v6 applies conversion_factor (if not NULL) to purchase_logs.quantity + recalculates price_per_unit. total_price is NEVER changed.
- Two-query + JS join for PurchaseHistory (Rule #3)

→ Schema: `02_Obsidian_Vault/Database Schema.md`
→ Phase history: `docs/context/phases/phase-4-procurement.md`
