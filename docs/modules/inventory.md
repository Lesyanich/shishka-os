# Inventory Module Context

## Tables
- `inventory_balances` (PK: nomenclature_id UUID) — On-hand quantities, last_counted_at
- `waste_logs` (id UUID) — Waste tracking: quantity, reason (ENUM), financial_liability (ENUM), comment
- `inventory_batches` (id UUID) — Batch tracking: barcode UNIQUE, weight, location_id, status (ENUM)
- `locations` (id UUID) — Kitchen, Assembly, Storage (seeded)
- `stock_transfers` (id UUID) — Batch movement log: from/to location FKs, CHECK(from≠to)

## ENUMs
- `waste_reason`: expiration, spillage_damage, quality_reject, rd_testing
- `financial_liability`: cafe, employee, supplier
- `location_type`: kitchen, assembly, storage, delivery
- `batch_status`: sealed, opened, depleted, wasted

## RPCs
- `fn_predictive_procurement(UUID)` — Recursive CTE: walks BOM tree → leaf RAW → compares vs inventory → shortage array
- `fn_generate_barcode()` — 8-char uppercase alphanumeric, collision-safe
- `fn_create_batches_from_task(UUID, JSONB)` — Creates N batches + completes task + returns barcodes
- `fn_open_batch(UUID)` — Opens batch, shrinks expires_at to +12h
- `fn_transfer_batch(TEXT, TEXT)` — Moves batch by barcode, logs transfer

## Frontend
| File | Purpose |
|---|---|
| `src/pages/WasteTracker.tsx` | Orchestrates 3 waste components |
| `src/components/waste/ZeroDayStocktake.tsx` | Inline-edit inventory table with search + per-row Save |
| `src/components/waste/WasteLogForm.tsx` | Waste log form with financial liability toggle |
| `src/components/waste/PredictivePO.tsx` | Plan selector + Generate PO → shortage table |
| `src/pages/LogisticsScanner.tsx` | Mobile-first Transfer + Unpack tabs |
| `src/components/logistics/TransferTab.tsx` | Barcode scan → transfer between locations |
| `src/components/logistics/UnpackTab.tsx` | Barcode scan → open → countdown timer |
| `src/hooks/useInventory.ts` | Two-query: nomenclature + inventory_balances, JS join |
| `src/hooks/useWasteLog.ts` | Two-query: waste_logs + nomenclature, createWaste + auto-deduct |
| `src/hooks/usePredictivePO.ts` | RPC call to fn_predictive_procurement |
| `src/hooks/useBatches.ts` | Batches + createBatchesFromTask + openBatch |
| `src/hooks/useLocations.ts` | Locations list |
| `src/hooks/useStockTransfer.ts` | transferBatch RPC |

## Patterns & Gotchas
- Column-level REVOKE on stock_transfers (entire table) and waste_logs audit fields (Migration 031)
- inventory_balances.quantity is legitimately updated by admin panel for stocktake (no REVOKE)
- Two-query + JS join pattern for all inventory hooks

→ Schema: `vault/Database Schema.md`
→ Phase history: `docs/phases/phase-3-waste.md`
