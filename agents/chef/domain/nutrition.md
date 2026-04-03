# Nutrition / KBZHU Domain (Shared)

## Fields on nomenclature

- `calories` (kcal per base_unit)
- `protein` (g per base_unit)
- `carbs` (g per base_unit)
- `fat` (g per base_unit)
- `allergens` (TEXT[] array)

## Cascade Calculation via BOM

For composed products (PF, MOD, SALE):
```
calories = SUM(ingredient.calories * qty / yield_pct)
protein  = SUM(ingredient.protein  * qty / yield_pct)
carbs    = SUM(ingredient.carbs    * qty / yield_pct)
fat      = SUM(ingredient.fat      * qty / yield_pct)
```

## Allergen Union

Allergens for composed products = union of all BOM children allergens.

## Data Source

USDA reference data seeded via migration 067 for ~50 base ingredients.
Tag groups: taste, boosters, science, serving, ops (migration 067).

## Frontend Display

- KBZHU Summary Card in RecipeBuilder (admin)
- Allergen Tag Pills in NomenclatureModal (admin)
- Nutrition display on menu items (web/app -- future)
