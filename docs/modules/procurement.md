# Procurement Module Context

## Architecture Overview (Phase 11-16)

Two procurement paths:
- **Path A: Receipt scan** (existing) — physical purchase → photo → AI OCR → fn_approve_receipt v11
- **Path B: Purchase Orders** (new) — PO → supplier delivery → receiving → reconciliation → fn_approve_po

Three roles:
- **Admin** — creates POs, communicates with suppliers, does physical receiving
- **Cook** — can substitute admin on receiving (/receive). No financial data visible
- **Owner/Controller** — financial reconciliation only. Approves → inventory + financials update

## Tables

### Existing
- `suppliers` (id UUID) — name UNIQUE, contact_info, category_code FK, sub_category_code, is_deleted
- `purchase_logs` (id UUID) — nomenclature_id FK, supplier_id FK, sku_id FK, quantity, price_per_unit, total_price, invoice_date, expense_id FK, po_line_id FK, receiving_line_id FK
- `supplier_catalog` (id UUID) — SSoT for supplier product mappings. supplier_id, nomenclature_id, sku_id, supplier_sku, original_name, match_count, purchase_unit, conversion_factor, base_unit, barcode, brand, last_seen_price

### New (Phase 11)
- `purchase_orders` (id UUID) — po_number (UNIQUE, auto PO-XXXX), supplier_id FK, status (po_status), expected_date, notes, financial fields (subtotal, discount, vat, delivery, grand_total), source_plan_id FK, expense_id FK, created_by
- `po_lines` (id UUID) — po_id FK (CASCADE), nomenclature_id FK, sku_id FK, qty_ordered, unit, unit_price_expected, total_expected (GENERATED), sort_order. UNIQUE(po_id, nomenclature_id, sku_id)
- `receiving_records` (id UUID) — po_id FK (NULL for Path A), expense_id FK, source (receiving_source), received_by, received_at, notes, status
- `receiving_lines` (id UUID) — receiving_id FK (CASCADE), po_line_id FK, nomenclature_id FK, sku_id FK, qty_expected, qty_received, qty_rejected, reject_reason, unit_price_actual, notes. REVOKE UPDATE (immutable)

### ENUMs
- `po_status`: draft → submitted → confirmed → shipped → partially_received → received → reconciled | cancelled
- `receiving_source`: purchase_order, receipt
- `reject_reason`: short_delivery, damaged, wrong_item, quality_reject, expired

## RPCs / Triggers

### Existing
- `fn_update_cost_on_purchase()` — Trigger: on purchase_logs INSERT → WAC updates nomenclature.cost_per_unit. **Mig 459:** skips an item whose `cost_source = 'manual'`, and averages `total_price / quantity` rather than the OCR's `price_per_unit`
- `fn_predictive_procurement(UUID)` — Recursive BOM walk → shortage array (used by MRP and WasteTracker)
- `fn_approve_receipt(JSONB)` — v17 (mig 459): receipt approval + receiving_records side effect. See § Import path below
- `fn_match_nomenclature(UUID, TEXT, TEXT, TEXT, TEXT)` — **Mig 459.** The receipt-line → nomenclature ladder, in the DB
- `fn_normalize_product_name(TEXT)` — **Mig 459.** Shared matching normalizer
- `fn_purchase_log_import_guard()` — **Mig 459.** BEFORE INSERT on purchase_logs: date window + quantity×price vs total

## Import path — how a receipt line finds its ingredient (mig 459, MC 00a81c22)

Until migration 459 `fn_approve_receipt` had **no matcher**: a line without a
`nomenclature_id` in the payload was given a fresh `RAW-AUTO-<random>` stub. The
suffix was random, so the same product bred a new stub on every receipt — 415 of
984 purchase rows (THB 67,714) ended up on stubs that reach no dish.

v17 resolves every food line through `fn_match_nomenclature` **before** anything
is minted:

1. **barcode** → `supplier_catalog` → `sku` → `purchase_logs` history → `correction_rules`
2. **supplier_sku** (+ supplier) → `supplier_catalog` → catalog-barcode cross-reference → history
3. **normalized exact name** → `supplier_catalog` (4 name columns) → `nomenclature` → `nomenclature.aliases` → mig-325 `[MERGED->CODE]` tombstones
4. **last resort:** a stub whose code is `RAW-AUTO-` + md5 of the normalized name, so a
   repeat item reuses one stub, plus an `unmatched_items` row carrying expense_id,
   barcode and supplier so a human can actually resolve it.

Three rules worth knowing:

- **The name levels require NORMALIZED EXACT equality and refuse to guess** when two
  canonical items match. The edge function (`functions/_shared/nomenclature.ts`)
  still falls back to `ILIKE '%name%'`; that is how "Three Ladies rice noodles" and
  "Boran rice paper" got swapped, and the DB ladder deliberately will not do it.
- **`barcode` and `sku_id` are written to purchase_logs.** v16 omitted them, which
  switched off the matcher's own "previously approved by barcode" level — every
  approval taught the system nothing.
- **`conversion_factor` comes from the catalog row the ladder matched**, not from a
  `nomenclature_id` that does not exist yet, so a first-time purchase normalizes too.

⛔ **Still open (MC 00a81c22 items 6-7, human-gated):** the 20 rows whose
`quantity × price ≠ total`, the re-dedupe of the 415 stub-bound rows, and the WAC
recompute. For the spice/oil cases the STORED cost is the plausible one and
purchase_logs is the corrupt source (a 100 g pack booked as 1 kg), so a blanket
`fn_recalc_wac_for_product` is destructive — on RAW-COFFEE-ESPRESSO it yields
241.67 THB/g instead of ~0.66. Normalize quantities against the receipt images first.

### New (Phase 12)
- `fn_create_purchase_order(JSONB)` — Creates PO with lines, auto-populates prices from supplier_catalog
- `fn_receive_goods(JSONB)` — Physical receiving by admin/cook. NO inventory update. Sets status partially_received or received
- `fn_approve_po(JSONB)` — Financial reconciliation by controller. Creates expense_ledger + purchase_logs + sku_balances + WAC
- `fn_pending_deliveries()` — Returns pending POs for receiving screen. NO prices returned
- `fn_generate_po_number()` — Auto PO-XXXX sequence

## Mapping Engine (supplier_catalog)

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
- Applied in fn_approve_receipt v11 and fn_approve_po

## Frontend

### Existing
| File | Purpose |
|---|---|
| `src/pages/Procurement.tsx` | 2-column grid layout |
| `src/components/procurement/PurchaseForm.tsx` | Supplier + item select, auto-calc, cost delta |
| `src/components/procurement/SupplierManager.tsx` | Supplier CRUD with soft-delete |
| `src/components/procurement/PurchaseHistory.tsx` | Last 50 purchases, two-query join pattern |
| `src/hooks/useSupplierMapping.ts` | Smart mapping: lookupMappings, saveMapping, applyMappings |

### New (Phase 13-15)
| File | Purpose |
|---|---|
| `src/pages/ReceivingStation.tsx` | Mobile-first receiving (/receive), max-w-lg |
| `src/components/receiving/PendingDeliveries.tsx` | List of expected PO cards |
| `src/components/receiving/ReceivingChecklist.tsx` | Item checklist + barcode scanner + stepper |
| `src/components/receiving/ReceivingSummary.tsx` | Post-receiving confirmation |
| `src/components/procurement/PurchaseOrderForm.tsx` | Create/edit PO |
| `src/components/procurement/PODetail.tsx` | PO detail + reconciliation view |
| `src/components/procurement/POHistory.tsx` | PO list with status filters |
| `src/hooks/usePurchaseOrders.ts` | CRUD + status transitions |
| `src/hooks/useReceiving.ts` | fn_receive_goods + fn_pending_deliveries |
| `src/types/procurement.ts` | PO, POLine, Receiving types |

## Receiving UX (/receive)
- **No prices** — names, UoM, quantities only
- **Barcode scanner** — one scan = +1 qty_received. Auto-marks ✅ when qty_received == qty_expected
- **Two buttons per item**: ✅ OK (full qty) or ⚠️ Issue (numeric stepper + reason)
- **Accept All Remaining** — one tap for unchecked items
- **sessionStorage** for progress persistence

## Patterns & Gotchas
- Column-level REVOKE on purchase_logs and receiving_lines (entire tables) — RPCs retain privileges
- PurchaseHistory uses NomenclatureLabel for clean display
- Supplier auto-creation: fn_approve_receipt v11 auto-inserts unknown supplier_name
- UoM conversion applied at approval time only (not at receiving)
- Two-query + JS join for PurchaseHistory (Rule #3)
- Partial deliveries: multiple receiving_records per po_id, status = partially_received until all lines closed

→ Schema: `vault/Database Schema.md`
→ Phase history: `docs/phases/phase-4-procurement.md`
→ Architecture: `vault/Procurement & Receiving Architecture.md`
