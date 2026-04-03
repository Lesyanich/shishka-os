# BOM / Nomenclature Module Context

## Tables
- `nomenclature` (id UUID) — Unified SSoT for ALL products. Fields: product_code, name, type, base_unit, cost_per_unit, price, slug, image_url, nutrition (calories/protein/carbs/fat/allergens), markup_pct, display_order, is_available, is_featured, notes
- `bom_structures` (id UUID) — Dynamic BOM: parent_id FK, ingredient_id FK, quantity_per_unit, yield_pct, notes

## Lego Architecture (P0 Rule #3)
```
RAW (Raw ingredients) → PF (Semi-finished) → MOD (Toppings) → SALE (Dishes)
```
Product codes: `RAW-%`, `PF-%`, `MOD-%`, `SALE-%`

## Boris Rule #8: Filtering
**CRITICAL**: Nomenclature tabs MUST filter by `product_code` prefix using `.ilike('product_code', 'PREFIX-%')`.
NEVER use `.or()` with `type.eq.dish` — types can be ambiguous.

## Frontend
| File | Purpose |
|---|---|
| `src/pages/BOMHub.tsx` | Wrapper for RecipeBuilder with header |
| `src/components/RecipeBuilder.tsx` | Full BOM editor: left sidebar (item list), right panel (BOM table) |
| `src/hooks/useBOMCoverage.ts` | Nomenclature SALE% → BOM coverage + missing list |

### RecipeBuilder Features
- 4-tab filter: Sales, Prep, Toppings, Raw (strict product_code prefix)
- NomenclatureModal: 3-section editor (Basic & Site, Pricing Engine, Nutrition)
- Slug auto-generation (Cyrillic→Latin transliteration + kebab-case)
- Reactive Pricing Calculator: Markup% → Recommended Price
- Margin Indicator: (Price−Cost)/Price×100 (green >=30%, red <30%)
- КБЖУ Summary Card
- Allergen Tag Pills
- Editable BOM Table: qty, yield%, notes inline editing
- Per-line Cost: `unitCost × qty` in amber
- Cost Badge: calculated BOM cost

## Patterns & Gotchas
- `cost_per_unit` column-level REVOKE (Migration 031) — only trigger fn_update_cost_on_purchase can write
- nomenclature.price is updateable via admin panel (tech debt: no audit log)
- BOM cost is computed client-side from bom_structures + nomenclature.cost_per_unit

-> Shared domain: `docs/context/shared/nomenclature.md`, `docs/context/shared/nutrition.md`
-> Schema: `04_Knowledge/Architecture/Database Schema.md`
-> Architecture: `04_Knowledge/Architecture/Shishka OS Architecture.md`
-> Phase history: `docs/context/phases/phase-3-waste.md` (Phase 3.6 section)
