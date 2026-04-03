# Procurement — Domain Context

## Scope
Supplier management, purchasing, receiving station, inventory levels, MRP (material requirements planning), price tracking.

## Key Systems
- **Makro Parser** (`tools/makro-parser/`): wholesale catalog & price sync
- **Admin Panel**: Procurement page, Receiving Station, SKU Manager
- **Supabase**: `supplier_catalog` (SSoT), `inventory_levels`, `purchase_logs`

## Key Suppliers
- **Makro Samui** — Wholesale, main supplier (catalog parsed automatically)
- **Local markets** — Fresh produce, manual receipts
- **Online suppliers** — Specialty ingredients, delivery

## Current Priorities
- Supplier catalog completeness (SKU → product mapping)
- Price tracking over time (WAC — weighted average cost)
- Receiving station workflow (scan barcode → verify → accept)

## Typical Tasks
- Find new supplier for specific ingredient
- Price comparison across suppliers
- Negotiate bulk pricing
- Set up auto-reorder rules (MRP thresholds)
- Evaluate ingredient quality from new source
- Seasonal ingredient sourcing (what's available when)

## Budget Rules
- MOQ (minimum order quantity) awareness
- Delivery scheduling: Makro runs Tue/Fri
