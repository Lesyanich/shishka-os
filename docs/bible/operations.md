---
domain: [kitchen, ops]
agents: [chef, ops]
load_when: "production workflow, L1-L2 logistics, cold chain, staffing, scheduling, daily ops"
last_updated: 2026-07-03
updated_by: CEO
change_log: "2026-07-03 — added L2 Point-of-Sale equipment + Equipment-by-Zone quick reference; then pivoted it to a SNAPSHOT that defers to the LIVE `equipment` table via list_equipment (which now returns zone). Corrected L2 against live data (it HAS contact grill + induction + HS oven — only the LAVA grill is L1-only). Fixes chef Infrastructural Blindness without hardcoding a stale equipment list."
source: "Notion SHISHKA CORE HUB, Section 3.2.1"
---

# Operations — Production & Logistics

## L1 Philosophy: "A Factory, Not a Restaurant"

The L1 Kitchen operates on the **Central Kitchen** model. We do NOT cook "to order" for guests. We produce batches of food that are then cooled, packaged, and shipped to the sales point (L2).

## The Main Algorithm (Cook-Chill)

1. **Receiving & Storage** (Logistics) — Zone 1
2. **Prep & Cutting** (Cold Prep) — Zone 2
3. **Thermal Processing** (Hot Production) — Zone 3
4. **Shock Cooling** (Blast Chilling) — *Critical Step* — Zone 4
5. **Vacuum Sealing** (Packaging) — Zone 4
6. **Dispatch** (Transport) — to L2
7. **Heat in high-speed oven** Merrychef — at L2

## Kitchen Zones

### Zone 1: Logistics & Storage
*Products arrive from suppliers. The "warehouse" inside the kitchen.*

**Dry Storage & Inventory Racks**: L1-SHELF-200-54 (Central Pantry), L1-SHELF-200-55 (Logistics Hub — vacuum bags, HACCP labels, containers)

**Main Cold Storage ("The Warehouse")**: L1-SPM-FRG-200-25 — Large 2-door supermarket fridge (1200L). Zone L1-Store-W3. Buffer zone for incoming raw materials.

### Zone 2: Cold Prep (Clean Label)
*Washing, peeling, cutting. "Where prep is born."*

**Washing & Water Safety ("The Kidney of the Kitchen")**: L1-DBL-SINK-180-5 (Double sink) + L1-WAT-HF-UV-69 (UV Water Filter). Zone L1-Cold-W2. UV lamp is CRITICAL — Phuket water is unsafe for salads and drinking.

**Grease Trap**: L1-GR-TRAP-38 — under the sink. Must be cleaned manually if water drains slowly.

**Prep Workstation (Mise-en-place)**: L1-UC-FRG-180-3 (Under-counter Fridge). Zone L1-Cold-W1. Surface = main cutting table. Inside = washed/peeled vegetables (+2C...+5C).
- **Veg Slicer** (L1-VEG-SLCR-CHINA-12): Mass cutting (slices, cubes) for high volumes
- **Bowl Cutter** (L1-BL-CUT-8L-19): 8-liter "Robot" for hummus, pesto, forcemeat. Sits on rubber mat for vibration

**Dough Mixer ("Heavy Artillery")**: L1-D-MIX-10KG-18 — Spiral mixer for 10kg dough. Zone L1-Cold-Corner. On special low stand L1-SS-STND-50-72 (50cm height) for ergonomic unloading.

### Zone 3: Hot Production
*Where flavor magic happens (Maillard reaction). Under powerful ventilation.*

**Extraction Hood ("The Lungs of the Kitchen")**: L1-KTC-HOOD-150-31. Without it, grill operation is impossible.

**Frying & Boiling Line** (on reinforced stand L1-SS-STND-160-68, 38cm + wheels):
- **Gas Range 4-Burner** (`L-1-K-GAS-RNG-570-32`): "The Workhorse" — soups, stocks, quinoa
- **Lava Grill** (`L-1-K-LAVA-GRILL-650-33`): Volcanic rocks, fat drips → smoke → BBQ flavor. Proteins (chicken, tofu, halloumi) without excess oil

**Baking Station**: `L-1-K-EL-CON-OVEN-83` — Convection Oven (3 levels). Zone L1-Hot-W3. On stand L1-SS-STND-120-71 with tray runners. For roasting root vegetables and baking croissants. (Note: the live `equipment` table lists a separate Proofer under `L-1-K-EL-CON-OVEN-83-20` — don't conflate them; confirm via `list_equipment`.)

### Zone 4: Cook-Chill Hub (Heart of Technology)
*The most important stage. Turns food into safe, long-storage semi-finished products.*

**Blast Chiller ("The Time Machine")**: `L-1-K-BL-FRZ-790-66` — CRITICAL UNIT
- Algorithm: Chef removes hot tray (+90C) → IMMEDIATELY into Blast Chiller → +3C in <90 minutes
- Why: Bacteria can't multiply, moisture stays locked in meat fibers. Foundation of food safety
- **BOTTLENECK**: If Blast Chiller is full, no new hot cooking batch can start. Logistics L1→L2 only possible after cycle: Cook → Shock → Vacuum → Label

**Vacuum Sealer**: `L-1-K-VAC-500-67` — Chamber Vacuum Sealer. On table in Hot Zone (L1-Hot-W2).
- Algorithm: Chilled product portioned → bag → machine removes 99.9% of air
- Result: Shelf life 7-10 days. No oxidation, no taste degradation

**Assembly Station ("The Pass")**: L1-UC-FRZ-180-22 — Island Freezer (Under-counter). Center of Hot Zone L1-Hot-W1. Chef's assembly table. Sauces and microgreens stored inside.

### Auxiliary Units
- **Blender** (L1-KITCH-BLND-CHINA-13): On table in cold zone. For hot puree soups and sauces. Powerful, noisy
- **Juicer** (L1-JUIC-EXTR-CHINA-15): For detox drink bases and marinades (ginger/celery juice). Requires thorough mesh cleaning immediately after use

## Equipment & Zones — LIVE source of truth

> ⚠️ **This table below is a human-readable SNAPSHOT and can lag. The authoritative, continuously-updated source is the `equipment` DB table (mig 070), queried via the Chef Agent's `list_equipment` tool** — it returns each unit's `zone` (L1/L2, from the `equipment_code` prefix `L-1-*` / `L-2-*`), `location_zone`, `is_bottleneck`, and `preheat_min`. **When designing a flow, confirm the machine + zone by calling `list_equipment(name_search=...)` — do NOT trust this markdown as final.** Equipment is its own operational table; the finance `capex_assets` ledger is separate.

## L2 — Point of Sale (Finishing & Assembly)

L2's operating model: **assemble + regenerate.** For cook-chill items, staff do not cook — the char/cook was done at L1 ("90% Cooked" rule, `menu-concept.md`). L2 *does* have some cooking capability (below), used only for **delicate cook-to-order** items (e.g. salmon) — never to re-char a cook-chilled protein.

**L2 equipment (confirm live via `list_equipment`):**
- **High-Speed Oven / Merrychef** (`L-2-S-HS-OVN-MCs1s-39`) — regeneration. Reheats a "90% Cooked" vacuum-packed protein to a juicy core in ~60s; evaporates surface moisture to *restore* the grilled texture created at L1. A re-heater, not a grill.
- **Contact Grill** (`L-2-S-GRIILL-CNT-48`) + **Breakfast Station** (grill+griddle 2-in-1, `EQ-COOK-4D3D4`) — flat/clamshell surfaces. Can gently cook a delicate à-la-carte item, but **cannot reproduce lava-rock char** and will just dry a cook-chilled protein if used to "re-sear" it.
- **Induction burners** (`L-2-S-INDCT-BRN-2-6`, `L-2-S-INDCT-BRN-2-65`) — electric hobs for à-la-carte finishing.
- **2× Salad Bars** (`L-2-S-SB-150-9/10`) — cold assembly, 28 GN pans each.

**The one thing L2 does NOT have: a ❌ Lava Grill.** BBQ smoke/char is **L1-only**. (Gas range, blast chiller, vacuum sealer, convection oven are also L1-only — see below.)

## Equipment-by-Zone — Quick Reference (flow-design guardrail)

> **Hard rule for anyone (human or agent) designing a production flow: flavor is built where the equipment for it exists.** Name the specific machine AND its zone for every heat/char/finish step, then verify the machine physically lives in that zone (**via `list_equipment`, not this snapshot**). If it doesn't, the step cannot happen there — redesign.

| Capability | Machine (live code) | Zone | Notes |
|---|---|---|---|
| **Char / smoke / grill marks (lava)** | Lava Grill `L-1-K-LAVA-GRILL-650-33` | **L1** only | The ONLY source of BBQ/lava char. No equivalent at L2. |
| Boil / stock / sauté (gas) | Gas Range `L-1-K-GAS-RNG-570-32` | **L1** only | L2 has induction hobs instead. |
| Roast / bake | Convection Oven `L-1-K-EL-CON-OVEN-83` | **L1** only | |
| Sous-vide / vacuum seal | Chamber Vacuum Sealer `L-1-K-VAC-500-67` (+ bath) | **L1** only | |
| Shock-chill (CCP) / freeze | Blast Chiller `L-1-K-BL-FRZ-790-66` | **L1** only | Bottleneck; gates all L1→L2 dispatch. |
| **Regenerate** (reheat to service temp) | High-Speed Oven `L-2-S-HS-OVN-MCs1s-39` | **L2** | Re-heat, NOT a cook or a char. |
| Gentle à-la-carte cook / warm | Contact Grill `L-2-S-GRIILL-CNT-48`, Breakfast Station `EQ-COOK-4D3D4`, Induction `L-2-S-INDCT-BRN-*` | **L2** | Delicate cook-to-order only; cannot lava-char. |
| Cold assembly | Salad Bars `L-2-S-SB-150-9/10` | **L2** | |

**Consequence for protein flows:** the **lava char** step is an **L1** step ("90% Cooked" rule). L2 receives an already-charred, already-cooked, chilled protein and only **regenerates** it. Never design a "lava char / re-sear at L2" step — there is no lava grill there, and re-searing a cook-chilled piece on the contact grill just dries it.

## Daily Operations Model
- L1 preps batches: morning 07:00-10:00 — 10-12kg toppings, bottled sauces, dough
- Delivery to L2: motorbike, 5 min, 3x/day
- Split: 80% take-away, 20% eat-in

## Staffing
- 4-6 people total
- An (cashier/admin)
- 2 Burmese prep staff (interviews pending)
- Prep-chef or consultant for recipes — one-time
- Training: 1 week on checklists/HACCP
