# Salad Bar Layout — L2 Service Area

> **Source:** Legacy Google Sheet "Expenses and Capex Equipment", sheet REF_Locations_Map
> **GDrive file ID:** `1sj8yW3twE07P7Z_PY4JczzjYMPjSg65htKZD2lRT7nM`
> **Scheme image (in project):** `01_Business/Salad_Bar/salad bar scheme.jpeg`
> **Scheme image (GDrive):** folder `Salad_Bar` → `salad bar scheme.jpeg` (file ID: `1d11jLKS2KGd9Q7AHT4_w7i20X_sPD8ix`)
> **Supplier:** Shandong Lingfan Technology Co., Ltd. (SUP-003)
> **Each unit:** 150 x 80 x 135 cm, 304 Stainless Steel, Glass Top, LED lighting
> **Price per unit:** $746 USD (฿38,129 incl. delivery)

## Two identical units

Both salad bars are in Location L-2 (Service area, Tops).

| Equipment Code | DB ID | Name |
|---|---|---|
| `L-2-S-SB-150-9` | `1c5b1920-e911-4c0f-a0f9-18f58a552f49` | Salad Bar (Unit 1) |
| `L-2-S-SB-150-10` | `d12b2832-07c2-49b6-acd2-9cce09dbd4b3` | Salad Bar (Unit 2) |

## Slot layout per unit (28 slots each, 56 total)

Each unit has 3 zones + work surface + bottom storage:

### Work Surface
- **Surface:** 150 x 25 cm — front assembly area for plating

### Bottom Storage
- **Shelf:** refrigerated cabinet, capacity 100 kg

### Zone 1: Base Ingredients (Slots 1-6)

| Slot | GN Size | Depth | Capacity | Role |
|------|---------|-------|----------|------|
| S1 | GN 1/3 | 100mm | 4 L | Base Ingredient |
| S2 | GN 1/3 | 100mm | 4 L | Base Ingredient |
| S3 | GN 1/3 | 150mm | 6 L | Large Base (Deep) |
| S4 | GN 1/3 | 150mm | 6 L | Large Base (Deep) |
| S5 | GN 1/3 | 150mm | 6 L | Large Base (Deep) |
| S6 | GN 1/3 | 150mm | 6 L | Large Base (Deep) |

**Zone 1 total:** 2x GN 1/3 shallow (8L) + 4x GN 1/3 deep (24L) = **32 L**

### Zone 2: Toppings (Slots 7-22)

| Slot | GN Size | Depth | Capacity | Role |
|------|---------|-------|----------|------|
| S7-S18 | GN 1/6 | 100mm | 1.5 L each | Topping (12 slots) |
| S19-S22 | GN 1/6 | 150mm | 2.2 L each | Deep Topping (4 slots) |

**Zone 2 total:** 12x GN 1/6 shallow (18L) + 4x GN 1/6 deep (8.8L) = **26.8 L**

### Zone 3: Garnishes & Seeds (Slots 23-28)

| Slot | GN Size | Depth | Capacity | Role |
|------|---------|-------|----------|------|
| S23-S28 | GN 1/9 | 100mm | 0.6 L each | Garnish/Seeds (6 slots) |

**Zone 3 total:** 6x GN 1/9 (3.6L) = **3.6 L**

## Summary per unit

| Zone | Slots | GN Pans | Total Volume |
|------|-------|---------|-------------|
| Base Ingredients | 1-6 | 6x GN 1/3 | 32.0 L |
| Toppings | 7-22 | 16x GN 1/6 | 26.8 L |
| Garnishes | 23-28 | 6x GN 1/9 | 3.6 L |
| **Total** | **28** | **28 pans** | **62.4 L** |

Plus: 1 work surface (150x25cm), 1 bottom shelf (100kg refrigerated)

## Both units combined

- **56 GN pan slots** (12 base + 32 topping + 12 garnish)
- **124.8 L** total ingredient volume
- **200 kg** refrigerated bottom storage
- **2 assembly surfaces** (300 x 25 cm total)

## Admin grid model (implemented — `/salad-bar`)

The factory cells (6×GN1/3 + 16×GN1/6 + 6×GN1/9 per unit) tile the well **exactly** as an
**8-column × 2-row grid** of GN-1/3 footprints. This is the single source of truth for the
`salad_bar_slots` layout — do not introduce GN 1/1 or GN 1/2 pans (265mm is not a multiple of
the 176mm column → breaks the tiling and leaves gaps; this was the original bug).

- **Column** = 176 mm along the bar · **Row depth** = 325 mm
- **Well** = 8 × 176 = **1408 mm** wide × 2 × 325 = **650 mm** deep (fits the 150×80 cm unit)
- Each 176×325 footprint holds exactly one of: `1×GN1/3` (full depth) · `2×GN1/6` (split in depth) · `3×GN1/9` (split in depth)
- **Back row** (far from guest) = bases + bulky items, mostly GN1/3 · **Front row** (near guest) = toppings, herbs, seeds (GN1/6 / GN1/9)
- Empty footprints = spare capacity (dividers are field-adjustable)

DB columns (`salad_bar_slots`): `row` (`back`|`front`), `position` (column 1-8),
`depth_pos` (0-based order of a pan within a column, front→back). Slot codes:
`U{unit}-{A|B}{col}[a|b|c]` (A=back, B=front; suffix = depth order). Seeded by migration
`221_salad_bar_grid_reseed.sql`.

## Spare containers
- GN Pan 1/3 (Poly) — equipment code `L-2-S--42`, 20 pcs (32 x 17 x 10 cm) — TO ORDER from Makro
  - Purpose: Polycarbonate clear spare containers for salad bar rotation
