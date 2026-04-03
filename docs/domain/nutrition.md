# Nutrition — KBZHU Calculation Rules

> KBZHU = Calories (K), Protein (B/Belki), Fat (Zh/Zhiry), Carbs (U/Uglevody)

## Storage Convention

Nutrition values are stored **per 1 base_unit**, NOT per 100g.

| base_unit | How to convert from "per 100g" |
|-----------|-------------------------------|
| kg | Multiply by 10 (1 kg = 10 x 100g) |
| g | Divide by 100 |
| L | Multiply by 10 (assuming ~1kg/L density) |
| ml | Divide by 100 |
| pcs | Store total for 1 piece |

## Aggregation

Nutrition for PF/MOD/SALE is calculated recursively from BOM:
1. Walk the BOM tree to leaf RAW nodes
2. For each RAW: `nutrition_per_unit * quantity * (yield_pct / 100)`
3. Sum all branches

## Yield Percentage

`yield_pct` (1-100) accounts for processing loss:
- Peeling carrots: ~85% yield
- Baking pumpkin: ~70% yield
- Boiling broth: ~90% yield
