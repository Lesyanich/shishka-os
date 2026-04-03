# Nomenclature — Product Type System

> Lego-Architecture for menu construction.

## Product Types (BOM Chain)

| Type | Code | Description | Example |
|------|------|-------------|---------|
| **RAW** | `RAW-*` | Raw ingredients purchased from suppliers | `RAW-FRESH_CARROT` |
| **PF** | `PF-*` | Semi-finished products (prep recipes) | `PF-BAKED_PUMPKIN` |
| **MOD** | `MOD-*` | Modifiers / toppings (customer add-ons) | `MOD-SOUR_CREAM` |
| **SALE** | `SALE-*` | Final dishes sold to customers | `SALE-BORSCH_BIOACTIVE` |

## BOM Chain Rule

```
RAW -> PF -> SALE
RAW -> MOD -> (added to SALE at order time)
PF  -> SALE
RAW -> SALE (direct, for simple dishes)
```

- A SALE item must have at least one BOM ingredient.
- PF can contain RAW and other PF items.
- MOD can contain RAW items only.
- Circular references are forbidden.

## Naming Convention

ALL CAPS with underscores: `TYPE-DESCRIPTION_PARTS`
Examples: `RAW-OLIVE_OIL`, `PF-VEGETABLE_BROTH`, `SALE-PUMPKIN_SOUP`
