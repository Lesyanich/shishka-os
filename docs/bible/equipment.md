---
domain: [kitchen, ops, procurement]
agents: [chef, ops]
load_when: "equipment specs, maintenance, zone mapping, capacity planning, bottleneck analysis"
last_updated: 2026-04-05
updated_by: CEO
source: "Notion SHISHKA CORE HUB, Section 3.2"
---

# Equipment Registry

> **CRITICAL**: Unit 66 (Blast Chiller) is the process bottleneck. Hot food cannot wait to be cooled.
> If the Blast Chiller is full, a new hot cooking batch CANNOT be started.
> Logistics L1→L2 is possible only after the full cycle: Cook → Shock → Vacuum → Label

## Zone 1: Logistics & Storage

| Unit ID | Name | Type | Location |
|---------|------|------|----------|
| L1-SHELF-200-54 | Central Pantry | Heavy Duty Rack | L1-Hot-W2 / Cold-W3 wall |
| L1-SHELF-200-55 | Logistics Hub | Heavy Duty Rack | L1-Hot-W2 / Cold-W3 wall |
| L1-SHELF-200-59 | Storage Rack | Heavy Duty Rack | Wall |
| L1-SHELF-180-60 | Storage Rack | Heavy Duty Rack | Wall |
| L1-SPM-FRG-200-25 | Main Cold Storage ("The Warehouse") | 2-door supermarket fridge (1200L) | L1-Store-W3 |

**Central Pantry (L1-SHELF-200-54)**: Bottom: sacks of rice/quinoa (25kg). Middle: oil, sauces. Top: spices.
**Logistics Hub (L1-SHELF-200-55)**: Vacuum bags (sensitive to moisture!), HACCP labels, clean containers for transporting food to L2.

## Zone 2: Cold Prep

| Unit ID | Name | Type | Location |
|---------|------|------|----------|
| L1-DBL-SINK-180-5 | Double Sink | Stainless steel sink | L1-Cold-W2 |
| L1-WAT-HF-UV-69 | Water Filter | Filtration + UV Lamp | L1-Cold-W2 |
| L1-GR-TRAP-38 | Grease Trap | Fat separator | Under sink |
| L1-UC-FRG-180-3 | Prep Workstation | Under-counter Fridge | L1-Cold-W1 |
| L1-VEG-SLCR-CHINA-12 | Veg Slicer | Electric slicer | On prep table |
| L1-BL-CUT-8L-19 | Bowl Cutter | 8L food processor | On prep table |
| L1-D-MIX-10KG-18 | Dough Mixer | Spiral mixer (10kg) | L1-Cold-Corner |
| L1-SS-STND-50-72 | Mixer Stand | Low stand (50cm) | L1-Cold-Corner |

## Zone 3: Hot Production

| Unit ID | Name | Type | Location |
|---------|------|------|----------|
| L1-KTC-HOOD-150-31 | Extraction Hood | Kitchen exhaust | Ceiling above thermal line |
| L1-SS-STND-160-68 | Hot Line Stand | Reinforced stand (38cm + wheels) | Hot line base |
| L1-GAS-RNG-570-32 | Gas Range 4-Burner ("The Workhorse") | Gas range | On L1-SS-STND-160-68 |
| L1-LAVA-GRILL-650-33 | Lava Grill | Gas grill with volcanic rocks | On L1-SS-STND-160-68 |
| L1-EL-CON-OVEN-83-20 | Baking Station | Convection Oven (3 levels) | L1-Hot-W3 |
| L1-SS-STND-120-71 | Oven Stand | Stand with tray runners | L1-Hot-W3 |

## Zone 4: Cook-Chill Hub

| Unit ID | Name | Type | Location | CRITICAL |
|---------|------|------|----------|----------|
| L1-BL-FRZ-790-66 | Blast Chiller ("The Time Machine") | Shock Freezer / Blast Chiller | Next to oven/hot line | **YES — BOTTLENECK** |
| L1-VAC-500-67 | Vacuum Sealer | Chamber Vacuum Sealer | Table in L1-Hot-W2 | |
| L1-UC-FRZ-180-22 | Assembly Station ("The Pass") | Island Freezer (Under-counter) | Center L1-Hot-W1 | |

## Auxiliary

| Unit ID | Name | Type | Location |
|---------|------|------|----------|
| L1-KITCH-BLND-CHINA-13 | Blender | High-power blender | Table in cold zone |
| L1-JUIC-EXTR-CHINA-15 | Juicer | Juice extractor | Cold zone |

## Future CapEx (Dairy/Fermentation)

| Unit ID | Name | Type | Purpose |
|---------|------|------|---------|
| L1-YOG-10L | Yogurt Maker | 10L fermenter | Live yogurt, kefir |
| L1-D-MIX-10KG | High-Power Mixer | 10kg mixer | Tvorog, syrniki base |
