# Data Rules — Nomenclature, BOM, Nutrition, UoM

> Merged from: nomenclature.md, bom.md, nutrition.md, uom.md.
> Load when working with products, recipes, or costs.

## Lego Architecture (RULE-LEGO-ARCHITECTURE)

```
RAW (Raw ingredients) -> PF (Semi-finished) -> MOD (Toppings) -> SALE (Dishes)
```

Product codes: `RAW-%`, `PF-%`, `MOD-%`, `SALE-%`
Allowed BOM links: SALE->RAW/PF/MOD, PF->RAW/PF, MOD->RAW. RAW = leaf node.

## Table: nomenclature

SSoT for ALL products. Key columns:
- `id` UUID (PK), `product_code` (unique, prefixed), `name`, `type`
- `base_unit` — kitchen unit (kg, L, pcs, g, ml)
- `cost_per_unit` — WAC, auto-updated by trigger `fn_update_cost_on_purchase`. NEVER write directly.
- `price` — sale price (admin-editable)
- `slug` — auto-generated (Cyrillic->Latin transliteration + kebab-case)
- Nutrition: `calories`, `protein`, `carbs`, `fat`, `allergens` (TEXT[])
- Visibility: `is_available`, `is_featured`
- Syrve: `syrve_uuid`, `syrve_tax_category_id`

## RULE-BOM-PREFIX-FILTER

**CRITICAL**: Filter by `product_code` prefix using `.ilike('product_code', 'PREFIX-%')`.
NEVER use `.or()` with `type` field — types can be ambiguous.

## Cost Fallback Chain (BOM Walker)

When computing BOM cost for a leaf ingredient:
1. `nomenclature.cost_per_unit` (WAC) — authoritative, trigger-managed
2. `supplier_catalog.last_seen_price / conversion_factor` — estimated, from scraper/manual entry (marked `est.` in output)
3. `0` — no price data available (flagged as `has_null_cost`)

## Table: bom_structures

Dynamic BOM: `parent_id` FK -> `ingredient_id` FK, `quantity_per_unit`, `yield_loss_pct`, `notes`.
Cost computed by MCP bom-walker: `sum(ingredient.cost_per_unit * qty)` adjusted for yield loss, with supplier_catalog fallback for missing WAC.

## Nutrition Cascade

For composed products (PF, MOD, SALE):
```
nutrient = SUM(ingredient.nutrient * quantity_per_unit)
```
Yield loss does NOT reduce nutrition (nutrients stay in the food — only water/waste is lost).
Allergens for composed products = union of all BOM children allergens.
Data source: USDA reference data seeded via migration 067.

## UoM Conversion

Every item has `base_unit` — the kitchen unit. All inventory, BOM, and costing uses base_unit.

Supplier conversion (supplier_catalog table):
- `purchase_unit` — unit on receipt (bag, box, case)
- `conversion_factor` — multiplier to base_unit
- Formula: `inventory_qty = receipt_qty * conversion_factor`

Conversion applied at financial approval (`fn_approve_receipt`), not at receiving time.

## Frontend Reference

| File | Purpose |
|---|---|
| `src/pages/BOMHub.tsx` | Wrapper for RecipeBuilder |
| `src/components/RecipeBuilder.tsx` | Full BOM editor: sidebar (items) + panel (BOM table) |
| `src/hooks/useBOMCoverage.ts` | SALE% -> BOM coverage + missing list |

Gotchas:
- `cost_per_unit` has column-level REVOKE (migration 031) — only trigger can write
- BOM cost computed client-side from bom_structures + nomenclature.cost_per_unit
