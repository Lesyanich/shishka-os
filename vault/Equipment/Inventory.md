---
title: Equipment Inventory
type: page
tags: [equipment, inventory]
date: 2026-04-29
status: active
related:
  - "[[Equipment/]]"
  - "[[Operations/Daily Standards]]"
---

# Equipment Inventory

Current units in the L1 kitchen by zone. Source: [`docs/bible/equipment.md`](../../docs/bible/equipment.md). The DB row truth lives in `equipment` table; this page is the human-readable index.

## Zone 1 — Logistics & Storage

*Products arrive from suppliers. The "warehouse" inside the kitchen.*

| Unit ID | Name | Type | Location |
|---|---|---|---|
| `L1-SHELF-200-54` | Central Pantry | Heavy-duty rack | L1-Hot-W2 / Cold-W3 wall |
| `L1-SHELF-200-55` | Logistics Hub | Heavy-duty rack | L1-Hot-W2 / Cold-W3 wall |
| `L1-SHELF-200-59` | Storage Rack | Heavy-duty rack | Wall |
| `L1-SHELF-180-60` | Storage Rack | Heavy-duty rack | Wall |
| `L1-SPM-FRG-200-25` | Main Cold Storage *("the Warehouse")* | 2-door supermarket fridge (1200L) | L1-Store-W3 |

- **Central Pantry** — bottom: 25 kg sacks of rice/quinoa; middle: oil, sauces; top: spices.
- **Logistics Hub** — vacuum bags (moisture-sensitive!), HACCP labels, clean L2-bound containers.

## Zone 2 — Cold Prep (Clean Label)

*Wash, peel, cut. Where prep is born.*

| Unit ID | Name | Type | Location |
|---|---|---|---|
| `L1-DBL-SINK-180-5` | Double Sink | Stainless-steel | L1-Cold-W2 |
| `L1-WAT-HF-UV-69` | Water Filter | Filtration + UV lamp | L1-Cold-W2 |
| `L1-GR-TRAP-38` | Grease Trap | Fat separator | Under sink |
| `L1-UC-FRG-180-3` | Prep Workstation | Under-counter fridge | L1-Cold-W1 |
| `L1-VEG-SLCR-CHINA-12` | Veg Slicer | Electric slicer | On prep table |
| `L1-BL-CUT-8L-19` | Bowl Cutter | 8L food processor | On prep table |
| `L1-D-MIX-10KG-18` | Dough Mixer *("Heavy Artillery")* | Spiral mixer (10 kg) | L1-Cold-Corner |
| `L1-SS-STND-50-72` | Mixer Stand | Low stand (50 cm) | L1-Cold-Corner |

- **`L1-WAT-HF-UV-69`** — the **kidney of the kitchen**. UV is critical: Phuket water is unsafe for salads or drinking without it.
- **Grease trap** — under sink. Manual cleaning if drainage slows.
- **Bowl Cutter** — sits on rubber mat for vibration damping.
- **Dough Mixer** — on `L1-SS-STND-50-72` for ergonomic unloading.

## Zone 3 — Hot Production

*Where Maillard happens. Under powerful ventilation.*

| Unit ID | Name | Type | Location |
|---|---|---|---|
| `L1-KTC-HOOD-150-31` | Extraction Hood *("the Lungs")* | Kitchen exhaust | Ceiling above hot line |
| `L1-SS-STND-160-68` | Hot Line Stand | Reinforced stand (38 cm + wheels) | Hot line base |
| `L1-GAS-RNG-570-32` | Gas Range 4-Burner *("the Workhorse")* | Gas range | On `L1-SS-STND-160-68` |
| `L1-LAVA-GRILL-650-33` | Lava Grill | Volcanic-rock gas grill | On `L1-SS-STND-160-68` |
| `L1-EL-CON-OVEN-83-20` | Convection Oven | 3-level | L1-Hot-W3 |
| `L1-SS-STND-120-71` | Oven Stand | With tray runners | L1-Hot-W3 |

- **Lava Grill** — fat drips → smoke → BBQ flavor. Used for proteins (chicken, tofu, halloumi) without excess oil.
- **Convection Oven** — root vegetable roasting, croissant baking.

## Zone 4 — Cook-Chill Hub *(heart of technology)*

*Turns hot food into safe, long-storage semi-finished bricks.*

| Unit ID | Name | Type | Location | Critical |
|---|---|---|---|---|
| `L1-BL-FRZ-790-66` | **Blast Chiller** *("the Time Machine")* | Shock Freezer / Blast Chiller | Next to oven & hot line | ⚠ **BOTTLENECK** |
| `L1-VAC-500-67` | Vacuum Sealer | Chamber Vacuum Sealer | Table in L1-Hot-W2 | |
| `L1-UC-FRZ-180-22` | Assembly Station *("the Pass")* | Under-counter island freezer | Center L1-Hot-W1 | |

### Blast Chiller details

- Algorithm: hot tray (+90°C) → IMMEDIATELY into Blast Chiller → +3°C in <90 minutes
- Why: bacteria can't multiply, moisture stays locked in meat fibers
- **BOTTLENECK** — if full, no new hot cooking batch can start. See [[Equipment/Routing]].

### Vacuum Sealer

- Chilled product portioned → bag → 99.9% air removal
- Result: shelf life 7–10 days, no oxidation, no taste degradation

### Assembly Station

- Chef's pass — sauces and microgreens stored inside the under-counter freezer

## Auxiliary

| Unit ID | Name | Type | Location |
|---|---|---|---|
| `L1-KITCH-BLND-CHINA-13` | Blender | High-power blender | Cold-zone table |
| `L1-JUIC-EXTR-CHINA-15` | Juicer | Juice extractor | Cold zone |

- **Juicer** — for detox-drink bases and ginger/celery marinades. Mesh requires immediate post-use cleaning.

## Future CapEx (planned, not bought)

| Unit ID | Name | Type | Purpose |
|---|---|---|---|
| `L1-YOG-10L` | Yogurt Maker | 10L fermenter | Live yogurt, kefir |
| `L1-D-MIX-10KG` | High-Power Mixer | 10kg mixer | Tvorog, syrniki base |

These power the Phase-2 dairy and fermentation expansion. See [[Menu/Categories]] §6.

## See Also

- [[Equipment/Routing]] — how recipes use these units
- [[Equipment/CapEx Flow]] — how a new unit gets onto the books
- [`docs/bible/equipment.md`](../../docs/bible/equipment.md) — canonical source
