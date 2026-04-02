# UoM Conversion Domain (Shared)

## Base Unit Semantics

Every `nomenclature` item has a `base_unit` — the kitchen unit (kg, L, pcs, g, ml).
All inventory, BOM, and costing is expressed in base_unit.

## Supplier UoM Conversion (supplier_catalog)

- `purchase_unit` — unit on receipt/invoice (e.g., "bag", "box", "case")
- `conversion_factor` — multiplier to convert to base_unit
- `base_unit` — target unit (matches nomenclature.base_unit)

**Formula:** `inventory_quantity = receipt_quantity * conversion_factor`

Example: 2 boxes of oil, conversion_factor = 6L/box -> 12L in inventory.

## Where Conversion is Applied

- `fn_approve_receipt` v11 — recalculates quantity + price_per_unit, preserves total_price
- `fn_approve_po` — same logic for PO-based receiving
- **NOT at receiving time** — conversion only at financial approval

## Syrve UoM Mapping

Table `syrve_uom_map`: maps internal UoM to Syrve POS UoM identifiers.
Used during purchase push (Phase 18) and sales pull (Phase 19).
