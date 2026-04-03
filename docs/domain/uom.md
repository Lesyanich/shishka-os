# Units of Measurement (UoM)

## Base Units

| Unit | Type | Used for |
|------|------|----------|
| kg | Weight | Most ingredients |
| g | Weight | Small quantities, spices |
| L | Volume | Liquids |
| ml | Volume | Small liquid quantities |
| pcs | Count | Eggs, containers, portions |

## Conversion Rules

| From | To | Factor |
|------|----|--------|
| kg | g | x 1000 |
| g | kg | / 1000 |
| L | ml | x 1000 |
| ml | L | / 1000 |

Cross-type conversions (kg <-> L) require density data per ingredient.
Not all conversions are possible — the system must reject ambiguous ones.

## BOM Consistency

All BOM quantities must use the ingredient's `base_unit`.
If a recipe says "200ml olive oil" but olive oil's base_unit is `L`, store as `0.2 L`.
