---
title: Daily Standards
type: page
tags: [operations, sop, daily]
date: 2026-04-29
status: active
related:
  - "[[Operations/]]"
  - "[[Recipes/Production Routing]]"
  - "[[Equipment/]]"
---

# Daily Standards

The L1 → L2 daily rhythm. Source: [`docs/bible/operations.md`](../../docs/bible/operations.md). The factory model says we do NOT cook to order for guests — we produce batches that are cooled, packaged, and shipped to the sales point.

## L1 philosophy

> **A factory, not a restaurant.**

The L1 Kitchen operates on the **Central Kitchen** model. We do not cook to order for guests at L1. We produce batches that are cooled, packaged, and shipped to L2.

## Main algorithm — Cook-Chill

```
1. Receiving & Storage           Zone 1
2. Prep & Cutting (Cold Prep)    Zone 2
3. Thermal Processing            Zone 3
4. Shock Cooling (Blast Chill)   Zone 4 — CRITICAL
5. Vacuum Sealing                Zone 4
6. Dispatch                      L1 → L2 (motorbike, isothermal box, +2…+4°C)
7. Heat in Merrychef             at L2 (~60 sec)
```

## Daily timeline (target)

```
06:30   Owner opens L1 → temperature check on all fridges + Blast Chiller calibration
07:00   Receiving (Zone 1) — produce arrives from Rawai market / Makro deliveries
07:00   Cold Prep (Zone 2) starts — wash + UV → slice → portion
08:00   Hot batch 1 (Zone 3) — protein sear, soup base
09:30   Blast Chill cycle 1 complete → Vacuum + Label batch 1
09:45   First L1 → L2 dispatch (Hot batch 1 + cold prep)
10:00   Hot batch 2 — additional proteins, roasted vegetables
11:30   Second dispatch
12:00   L2 lunch peak begins (until 14:00)
14:00   Lunch wind-down — restock fresh items at L2
15:30   Third dispatch (replenishment for evening)
16:00   L1 cleaning + sanitation begins
17:00   L2 evening peak (until 19:30)
20:00   L2 closes, cash-close, transfer cash bag
21:00   L1 closes; HACCP sheets sealed in archive folder
```

These are targets — see KPIs in [[Finance/Targets & KPIs]]. Real timing flexes around the **Blast Chiller bottleneck** (90-min cycle, blocking).

## Receiving SOP (Zone 1)

1. Driver / cook arrives with delivery
2. Open box → verify temperature (probe thermometer): chilled ≤ +5°C, frozen ≤ −15°C
3. Cross-reference against ordered list (`purchase_logs` shows expected; receiving compares against arrival)
4. Reject any item failing temp / quality / quantity
5. Photo of receipt → upload to receipt inbox (or hand to owner for batch upload at end of day)
6. Stack cold items in `L1-SPM-FRG-200-25` (main fridge)
7. Stack dry in `L1-SHELF-200-54` (central pantry)

See [[Procurement/Receiving]] for the full architecture.

## Prep SOP (Zone 2 — Cold Prep)

> **Critical**: water through `L1-WAT-HF-UV-69` only. Phuket tap is not safe for salads or drinking.

1. Take produce from main fridge → wash in `L1-DBL-SINK-180-5`
2. UV-filter rinse for anything eaten raw
3. Slice on `L1-VEG-SLCR-CHINA-12` for high-volume cuts (cubes, julienne, slices)
4. Hand-cut for low-volume / specialty cuts
5. Portion into vacuum bags or gastro containers
6. Label with date + lot number (HACCP), max +5°C in `L1-UC-FRG-180-3`

## Hot production SOP (Zone 3)

> **Critical**: extraction hood `L1-KTC-HOOD-150-31` always on before grill ignition.

1. Pre-heat grill (`L1-LAVA-GRILL-650-33`) or gas range (`L1-GAS-RNG-570-32`)
2. Apply **"90% Cooked" rule** — pull proteins before fully cooked (Maillard achieved, internal core not fully set)
3. Transfer immediately to Blast Chiller (`L1-BL-FRZ-790-66`) — within 30 seconds of cook completion
4. Blast Chill cycle: +85°C → +3°C in <90 minutes
5. Vacuum-seal (`L1-VAC-500-67`) — 99.9% air removal
6. Label, store in `L1-UC-FRZ-180-22` (Assembly Station)

Full equipment detail in [[Equipment/Inventory]]; per-recipe steps in [[Recipes/Production Routing]].

## Dispatch SOP (L1 → L2)

1. Pack vacuum-sealed batches into isothermal box with ice packs
2. Probe-check temp before sealing — must be ≤ +4°C
3. Motorbike to L2 (~5 min)
4. **L2 receiving**: Shift Leader probes temp on arrival
5. **Reject if > +8°C** — log in HACCP sheet, notify owner immediately

## L2 service SOP

> **Speed & Crunch**

L2 handles only ready-to-eat or ready-to-heat ingredients. Zero cross-contamination risk (no raw zone at L2).

For each order:

1. Cashier prints ticket → KDS displays on prep screen
2. Salad bar assemble → bowl / box / salad → toppings → CBS booster squeeze
3. For hot mains: vacuum bag → Merrychef oven → 60 seconds → plate
4. Hand to customer — TTR target <2 min

## Closing SOP

- Cash-close at L2 (cashier counts → photo of close-out → daily cash deposit recorded in [[Finance/Ledger]])
- L1 sanitation — surfaces, sinks, slicer, bowl cutter
- Empty grease trap if drain slow
- HACCP sheets dated, signed, archived in operations folder
- Set fridge / freezer temp probe alarms to high-sensitivity for overnight

## Food safety — Thai context

- **Thai FDA (อย.)** — applicable to packaged products; Phase 2 mini-store may need certification
- **HACCP** — internal; sheets archived for 1 year minimum
- **Personal hygiene** — gloves for ready-to-eat handling; aprons changed mid-shift; sick → off

See `docs/bible/kitchen-philosophy.md` for the full red-line list (banned ingredients, banned techniques).

## See Also

- [[Operations/Locations]] — L1 / L2 physical setup
- [[Equipment/Inventory]] — units this SOP runs on
- [[Recipes/Production Routing]] — recipe-side view of the algorithm
- [[Operations/KDS]] — the digital ticket layer at L2
- [`docs/bible/operations.md`](../../docs/bible/operations.md)
