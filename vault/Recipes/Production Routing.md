---
title: Production Routing
type: page
tags: [recipes, production, equipment]
date: 2026-04-29
status: active
related:
  - "[[Recipes/]]"
  - "[[Recipes/BOM Structure]]"
  - "[[Equipment/Routing]]"
---

# Production Routing

Where [[Recipes/BOM Structure]] answers *what's in this dish*, **production routing** answers *how it's made*: the ordered steps a recipe travels through, with the specific equipment and zone for each step.

Backing table: `recipes_flow` (migrations 073, 074, 124).

## Why routing lives in `recipes_flow`, not `equipment`

> Routing logic belongs to the recipe, **not** to the physical unit.

A blast chiller doesn't "know" that borscht goes into it after stove-cooking and before vacuum-packing — that's recipe knowledge. The `equipment` table holds inventory and capacity; `recipes_flow` holds the process. This is recorded as decision **D-020 — equipment routing via recipes_flow** (in Auto Memory; will be promoted to `vault/Decisions/D-020-...` on next backlog sweep).

Practical consequence: if you change which equipment a recipe uses, you update `recipes_flow` for that recipe — never `equipment`.

## Schema sketch

```
recipes_flow
├── id                  uuid PK
├── nomenclature_id     fk → nomenclature.id  (the SALE or PF this routing belongs to)
├── step_number         smallint              (1, 2, 3, …)
├── operation           text                  (e.g. "boil", "blast-chill", "vacuum-seal")
├── equipment_id        fk → equipment.id     (which unit performs the step)
├── zone                text                  ("L1-Cold-W2", "L1-Hot-W3", "L2-Pass", …)
├── duration_min        smallint
├── temp_c              smallint              (target temperature)
└── notes               text                  (free-form chef instructions)
```

Migrations:
- `073_recipes_flow.sql` — initial table
- `074_recipes_flow_seed.sql` — seed data for Phase 1 dishes
- `124_recipes_flow_*.sql` — refinement (TBD detail)

## The L1 → L2 algorithm (Cook-Chill)

Every dish that requires hot processing follows this routing skeleton — see [`docs/bible/operations.md`](../../docs/bible/operations.md) for the full SOP.

```
1.  Receiving & Storage      Zone 1 (L1-Store-W3 fridge / pantry shelves)
2.  Prep & Cutting           Zone 2 — Cold Prep
                             ↳ wash + UV filter (L1-WAT-HF-UV-69)
                             ↳ slice (L1-VEG-SLCR-CHINA-12)
                             ↳ blend (L1-BL-CUT-8L-19)
3.  Thermal Processing       Zone 3 — Hot Production
                             ↳ gas range (L1-GAS-RNG-570-32) — soups, stocks, quinoa
                             ↳ lava grill (L1-LAVA-GRILL-650-33) — proteins
                             ↳ convection oven (L1-EL-CON-OVEN-83-20) — roasting, bread
4.  Shock Cooling            Zone 4 — Blast Chiller (L1-BL-FRZ-790-66)
                             ⚠ BOTTLENECK — if full, no new hot batch can start
                             +85°C → +3°C in <90 min
5.  Vacuum Sealing           Zone 4 — L1-VAC-500-67
                             99.9% air removal → 7–10 day shelf life
6.  Dispatch to L2           Isothermal box, +2…+4°C
                             3×/day; reject batch at L2 if temp > +8°C
7.  Regenerate at L2         Merrychef / TurboChef oven (~60 sec)
                             "90% Cooked" protein → restored grilled texture
```

## Bottleneck — the Blast Chiller

The Blast Chiller (`L1-BL-FRZ-790-66`) is the kitchen's **process bottleneck**.

- One cycle = 90 min, +85°C → +3°C
- Capacity = N trays (TBD measured)
- If full → **no new hot batch can begin** until cycle completes
- Logistics L1 → L2 only possible after the full cycle: Cook → Shock → Vacuum → Label

This is the single most important routing constraint. When scheduling production windows in [[Operations/Daily Standards]], the Blast Chiller cycle is the bottleneck the rest of the schedule wraps around.

## "90% Cooked" rule

Proteins are seared at L1 for the Maillard reaction but pulled before the core is fully set:

- L1 sears + holds at ~88°C internal
- Blast-chill → vacuum → dispatch
- L2 Merrychef finishes the last 10% during 60-second regeneration
- Result: chef-grade texture (juicy inside, crispy outside) at fast-food speed

## See Also

- [[Equipment/Inventory]] — the unit IDs referenced above
- [[Equipment/Routing]] — the equipment-side view of the same flow
- [[Operations/Daily Standards]] — when each step happens in the day
- [`docs/bible/operations.md`](../../docs/bible/operations.md) — the full SOP source
