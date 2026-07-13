# Process Technology — Methods, and Why They Work

> Companion to [`food-science.md`](food-science.md). That file explains the chemistry/physics; this file applies it to the **methods and equipment** Shishka actually runs.
> Loaded every session (Core). Each method: **mechanism → parameters → good for / bad for → failure modes.**
> Equipment reality lives in [`docs/bible/operations.md`](../../../../docs/bible/operations.md) (L1/L2 zones, blast chiller, lava grill, Merrychef). Safety limits in [`food-safety-rules.md`](../food-safety-rules.md).
>
> **Core doctrine this file encodes:** Shishka is a **central-kitchen (cook-chill) operation**. L1 produces and preserves; L2 assembles and *regenerates*. L2 does **not** cook. A process design that makes L2 cook is wrong — redesign it.

---

## 0. The Shishka production spine (read first)

```
L1 (Central Kitchen)                          →  chilled transport  →  L2 (Sales point)
Cook/prep → Blast-chill → Vacuum → Label/store                          Assemble → Merrychef regen → Serve
```

Three golden rules the rest of this file serves:
1. **One cook cycle per protein per L1→L2 chain** (max two only with written justification). Each full cook expels water permanently (`food-science.md` §1–2). Regen is not a cook cycle (`food-science.md` §7).
2. **L1 exists to UNLOAD L2.** If a flow forces L2 to cook (not assemble/regen), it duplicates work, slows the service line, and defeats the central-kitchen model. Redesign.
3. **Flavor is built where the equipment for it exists.** Every heat/char/finish step must name the specific machine AND its zone, verified by the **live `list_equipment` tool** (returns `zone`, `status`, `is_bottleneck`) — the source of truth; [`operations.md`](../../../../docs/bible/operations.md) is only a lagging snapshot. **BBQ/lava char = the Lava Grill (`L-1-K-LAVA-GRILL-650-33`), L1 only. L2 has no lava grill** (it has a contact grill + induction + Merrychef for delicate cook-to-order, but cannot lava-char). So the signature char is an **L1** step; for cook-chill items L2 only regenerates.

---

## 1. Cook-Chill (the central-kitchen method)

- **Mechanism:** cook a batch → drive it fast through the microbial danger zone (60→5°C) in a **blast chiller** → vacuum-seal → hold chilled → regenerate at service. Speed matters because bacteria multiply fastest in 5–60°C; blast-chilling minimizes time there (danger-zone/cooling limits: [`food-safety-rules.md`](../food-safety-rules.md) §A, §C).
- **Parameters:** FDA 2-stage cooling — 60→21°C within 2h, 21→5°C within 4 more (≤6h total). Blast chiller achieves this far faster than a fridge. Result: **5–7 day shelf life, no preservatives**, texture preserved.
- **Good for:** batch efficiency, consistency, decoupling production from service, zero-preservative shelf life.
- **Bad for / limits:** the blast chiller is the **bottleneck** — if it's full, no new hot batch can start. Delicate proteins that suffer from any reheat are poor cook-chill candidates (see §7).
- **Failure modes:** slow cooling (fridge instead of blast) → danger-zone time → spoilage; retrogradation of starches held at 0–4°C (`food-science.md` §4).

## 2. Sous-vide (precision prep, not a finish)

- **Mechanism:** vacuum-sealed food in a temperature-controlled water bath. Convection at a **precise, low temperature** removes the thermal gradient — core and edge reach the same target, no overshoot (`food-science.md` §7). Pasteurization is achieved by **time at temperature**, not by a high peak — so proteins stay at their juicy target (chicken 63–65°C, salmon 52°C) and are still made safe.
- **Parameters:** chicken breast 63–65°C; salmon 52°C; hold the pathogen-reduction time for the thickness/temperature (verify time-temp tables; don't guess — WebSearch if unsure). Then **blast-chill immediately** if prepping ahead.
- **Good for:** juicy lean proteins at max yield/min FC (Shishka's Lego "Proteins" module), even doneness, make-ahead.
- **Bad for:** anything needing a browned crust *from* sous-vide (it can't Maillard underwater — needs a separate sear); as a **service finish** (it's a prep step).
- **Failure modes:** treating sous-vide as the final service state for a delicate protein that will then be frozen and reheated — that's the salmon anti-pattern. Sous-vide is prep; plan the finish separately.

## 3. Searing / Grilling (Maillard char — an L1 lava-grill step)

- **Mechanism:** high conductive/radiant heat browns a **dry** surface via Maillard (`food-science.md` §5). The lava grill adds fat-drip smoke → the signature BBQ char.
- **WHERE (non-negotiable):** the lava char happens on the **Lava Grill at L1 (`L-1-K-LAVA-GRILL-650-33`)** — verify live via `list_equipment`. **There is no lava grill at L2.** Per the "90% Cooked" rule (`menu-concept.md`), Shishka sears the raw protein on the L1 lava grill FIRST (flash-char for marks + smoke, stop before the core sets), *then* sous-vides, chills, and freezes. For cook-chill items, L2 receives an already-charred protein and only regenerates it.
- **Parameters:** dry the surface; high heat; a short flash-char (~45–90s) for color + smoke, not to cook through.
- **Good for:** crave flavor + smoke on lean healthy proteins, the "entry-ticket" visual char — produced once, at L1.
- **Bad for:** cooking a protein through (sous-vide/oven does that); wet surfaces (they steam, no browning); **lava char at L2** (no lava grill there — the contact grill/griddle cannot make lava char and would just dry a cook-chilled protein).
- **Failure modes:** (a) putting the lava char at L2 = Infrastructural Blindness, the equipment isn't there (confirm with `list_equipment`); (b) long grilling of an already-cooked piece = a second full heat cycle = dry (the chicken anti-pattern). Char once at L1, then stop.

## 4. Regeneration (Merrychef — the L2 workhorse)

- **Mechanism:** high-speed combi (impinged hot air + microwave) reheats an already-cooked, chilled item to safe serving core (~74°C) in **≤60–90s**. Because the food is already cooked, this is a **short thermal event to restore temperature**, not a cook (`food-science.md` §7).
- **Parameters:** target ~74°C core reheat within the safety window; item-specific programs (`operations.md`). Counts as **regen, not a heat cycle** in the budget.
- **Good for:** fast, consistent service; the whole point of cook-chill — L2 assembles + regens in seconds.
- **Bad for:** trying to *cook raw* food to a quality result (it's a finisher, not a primary cook for most items); delicate fish that should be cooked-to-order rather than reheated at all.
- **Failure modes:** designing a flow where L2 must *cook* on the Merrychef instead of regen — violates golden rule 2. (The other L2 device, the flat breakfast griddle, only gently warms/assembles — it cannot char; treating it as a grill dries the protein.)

### Canonical protein "steak" flow (equipment-anchored, CEO-approved) — the pattern to copy

For an intermediate protein like chicken breast (the audit's failed case), the approved flow keeps ONE cook cycle and anchors every step to a real machine:

1. **L1 — Lava Grill** (`L-1-K-LAVA-GRILL-650-33`): flash-char the **raw** steak ~45s for grill marks + lava smoke ("90% Cooked" — stop before core sets).
2. **L1 — Vacuum Sealer** (`L-1-K-VAC-500-67`) + sous-vide bath: seal and gently bring to pasteurization — **62°C** (hold the time for thickness; `food-safety-rules.md` §C). Juice locked, safe.
3. **L1 — Blast Chiller** (`L-1-K-BL-FRZ-790-66`): shock +85→+3°C in <90 min (CCP), then freeze for stock.
4. **L2 — High-Speed Oven / Merrychef** (`L-2-S-HS-OVN-MCs1s-39`): ultra-fast **regen** (~60s) of the finished juicy steak → plate. The oven re-evaporates surface moisture, *restoring* the L1 grill texture. No lava char, no second cook at L2.

Why sear-first here: L2 has no lava grill, so the char cannot be a "finish" at service — it must be laid down at L1 up front. The Merrychef then restores that texture on regen. (Machine codes are illustrative — always confirm live via `list_equipment`.)

## 5. Freezing (preservation without quality loss)

- **Mechanism:** fast freezing = small ice crystals = cells survive = texture survives on thaw (`food-science.md` §9). Blast freeze / IQF.
- **Parameters:** freeze fast and cold (−18°C storage, faster the transit through 0→−18°C the better); **portion delicate proteins RAW, then freeze raw** (IQF), so they can be cooked to order. Robust braises/stews freeze cooked well (gelatin holds water).
- **Good for:** long shelf life in the raw portion, decoupling sourcing from service, zero waste of surplus.
- **Bad for:** delicate cooked proteins (compounds water loss + reheat albumin); anything refrozen after thaw.
- **Failure modes:** slow domestic freezing (large crystals, drip loss); cook-then-freeze-then-reheat delicate fish; refreezing thawed raw protein.

## 6. Fermentation / Blanching / Marination (supporting methods)

- **Fermentation** — Lactobacillus + 2% salt + anaerobic + 18–22°C → acid (pH <4.6), probiotics, K2, preserved surplus. Shishka's clean-label edge (`kitchen-philosophy.md` §8). Salt %, anaerobiosis, and temperature are the control levers.
- **Blanching** — brief boil + ice shock: sets green color, softens, and **deactivates enzymes** (PPO browning, proteolytic enzymes) — `food-science.md` §6. Use before freezing vegetables or holding cut produce.
- **Marination** — flavor/tenderize via osmosis + acid + a **fat carrier** for fat-soluble aromatics. Ratio ~3 oil : 1 acid : aromatics. Watch: raw proteolytic enzymes (papaya/pineapple) turn protein mushy if left too long; acid over-cures delicate fish. Pick the marinade fat by function (neutral, freeze-stable → deodorized coconut; see Fat Decision Tree in `culinary-knowledge.md`).

---

## Design checklist for any new process (run before proposing)

1. **How many full cook cycles?** >1 without written justification → reject (golden rule 1).
2. **Does L2 have to cook or char?** Yes → redesign (golden rule 2/3). L2 assembles + regens only; it has no lava grill, gas range, oven, or blast chiller.
3. **Equipment check — name the machine + zone for EVERY heat/char/finish step, and verify it lives in that zone via the live `list_equipment` tool** (source of truth; `operations.md` is a lagging snapshot). Lava char → Lava Grill = **L1 only**. If a step's machine isn't in that zone, the step can't happen there — move it or redesign.
4. **Is the protein delicate?** (`food-science.md` §2 ladder) → cook-to-order from raw frozen portion; never cook-then-freeze-then-reheat.
5. **Where's the Maillard?** One lava-grill char at **L1** (sear-first per "90% Cooked"). Never a "sear at L2."
6. **Cold chain intact?** Blast-chill through the danger zone; state shelf life.
7. **Name the mechanism.** For each step, cite the `food-science.md` mechanism that justifies it. Can't name it → WebSearch or don't propose it.
