# MC Data Health Tab — Implementation Spec

## Status: Backlog

## Goal
Implement the Data Health tab in Mission Control that shows product data completeness checks — BOM links, recipe flows, nutrients, prices, photos, descriptions, supplier catalog, categories.

## Design
Already approved in `apps/admin-panel/mockups/mc-v9.html` (tab 3). Key elements:

1. **Score ring** — overall data health percentage (gradient: red → amber → emerald)
2. **Stats bar** — Critical count | Warnings count | All clear count
3. **Entity filters** — All Products | SALE-* | PF-* | RAW-* | MOD-*
4. **Check sections** by severity (Critical → High → Medium → All Clear):
   - Each check: name, entity scope, progress bar, fail count, expandable item list
   - Each item: product code + name + "Create Task" button
5. **"Create Task" button** on each failing item — creates a business_task linked to the product

## Data Source
Supabase queries against `products`, `bom_lines`, `recipe_flows`, `nutrition` tables.

### Health checks to implement:
| Check | Severity | Query |
|-------|----------|-------|
| BOM not linked | Critical | SALE/PF products without bom_lines |
| No recipe flow | Critical | SALE/PF products without recipe_flows |
| Nutrients missing | High | SALE products without nutrition record |
| No sale price | High | SALE products where sale_price IS NULL |
| BOM cost = 0 | High | Products with BOM where total cost = 0 |
| No photo | Medium | SALE products where photo_url IS NULL |
| No description | Medium | SALE products where description IS NULL |
| Supplier catalog | All Clear | RAW products with supplier_catalog entry |
| Categories | All Clear | All products with category assigned |

## Technical Approach
- Create `useDataHealth` hook — runs all checks, returns structured results
- Create `DataHealthTab` component — renders the approved UI design
- Wire into MissionControl.tsx replacing the current placeholder

## Dependencies
- Products table must exist (it does)
- BOM/recipe/nutrition tables must exist (they do)
