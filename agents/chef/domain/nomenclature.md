# Nomenclature Domain (Shared)

## Lego Architecture (P0 Rule #3)

```
RAW (Raw ingredients) -> PF (Semi-finished) -> MOD (Toppings) -> SALE (Dishes)
```

Product codes: `RAW-%`, `PF-%`, `MOD-%`, `SALE-%`

## Table: nomenclature

SSoT for ALL products. Key columns:
- `id` UUID (PK)
- `product_code` — unique, prefixed (RAW-CARROT, SALE-BOWL-01)
- `name` — display name (Russian)
- `type` — raw_ingredient | semi_finished | modifier | dish
- `base_unit` — kitchen unit (kg, L, pcs, g, ml)
- `cost_per_unit` — WAC (Weighted Average Cost), auto-updated by trigger
- `price` — sale price (admin-editable)
- `slug` — auto-generated (Cyrillic->Latin transliteration + kebab-case)
- `image_url`, `notes`, `markup_pct`, `display_order`
- `is_available`, `is_featured` — site visibility flags
- Nutrition: `calories`, `protein`, `carbs`, `fat`, `allergens`
- Syrve: `syrve_uuid`, `syrve_tax_category_id`

## Boris Rule #8: Filtering

**CRITICAL**: Nomenclature tabs MUST filter by `product_code` prefix using `.ilike('product_code', 'PREFIX-%')`.
NEVER use `.or()` with `type` field -- types can be ambiguous.

## Slug Generation

Cyrillic->Latin transliteration + kebab-case. Example: "Морковь свежая" -> "morkov-svezhaya".

## BOM Structure

Table `bom_structures`: parent_id FK -> ingredient_id FK, quantity_per_unit, yield_pct.
Cost is computed client-side: `sum(ingredient.cost_per_unit * qty)`.
