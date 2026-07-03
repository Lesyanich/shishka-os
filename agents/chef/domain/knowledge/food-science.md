# Food Science — Why Things Happen

> The Chef Agent's foundation in food chemistry and physics. Loaded every session (Core).
> **Purpose:** so the agent *reasons from mechanism*, not from memorized per-product rules.
> Organized by MECHANISM, not by product. Products appear only as worked examples.
> Sources: McGee *On Food and Cooking*; Modernist Cuisine; Nathan Myhrvold; López-Alt *The Food Lab*; ServSafe / FDA Food Code 2022; peer-reviewed food science. Temperatures cross-checked; when a number is not from these sources it is marked ESTIMATE.
>
> **Division of labor:** this file explains *why* (quality mechanisms). Hard safety *limits* (pathogen kill temps, danger zone, shelf life) live in [`food-safety-rules.md`](../food-safety-rules.md) — cross-link, never duplicate. Reasoning principles that turn this science into decisions live in [`culinary-knowledge.md`](../culinary-knowledge.md).
>
> **How to use:** when you recommend any ingredient handling or process, you must be able to name the mechanism below that makes it correct. If you cannot, WebSearch before recommending. "It sounds right" is a hallucination; a hallucination about food is money in the bin.

---

## 1. Water & Moisture — the master variable

Almost every quality failure in a healthy prep-ahead kitchen is a **water story**: where the water is, whether it stays, and what it does when it moves.

- **Free vs bound water.** Free water is mobile (drives spoilage, drips out, evaporates). Bound water is held by proteins/starches/sugars and is far harder to remove. Cooking, salting, and freezing all move water between these states.
- **Water activity (aw).** The fraction of *available* (free) water, 0–1. Microbes need it: most bacteria stall below aw 0.91, most molds below 0.80. Salt, sugar, and drying lower aw — this is *why* cured/fermented/dried foods keep. aw, not total water %, governs shelf stability.
- **Moisture migration.** Water always travels from high-aw to low-aw regions. A crunchy element touching a wet base goes soggy; a dressing on greens wilts them. **Design implication:** keep crunch/dressings separate until service (this is the physics behind Shishka's "crunch element" and modular assembly).
- **Cumulative moisture loss = dry & tough.** Every heat exposure expels some water from muscle fiber (see §2). Losses **stack** across steps. This is the physical basis of the *heat-cycle budget* — the more heat events, the drier the protein, and it never comes back.

---

## 2. Proteins — the heart of protein cookery

Muscle is three protein systems; each behaves differently with heat. Knowing the ladder lets you predict *any* protein, not just the ones we've written rules for.

### The three protein systems
- **Myofibrillar** (actin/myosin) — the contractile fibers. Denature ~40–60°C. As they coagulate they **squeeze out water** (like wringing a sponge). Overshoot → dry.
- **Sarcoplasmic** — soluble proteins in the fluid, including **albumin**. Coagulate ~40–60°C and turn opaque/white. This is the visible white curd (*albumin bleed*) that weeps out of salmon when heated too fast or too hot, or when reheated.
- **Connective tissue (collagen)** — the sheath. Shrinks hard ~60–65°C (squeezing more water out), then, held with moisture above ~60–70°C for a **long time**, slowly converts to **gelatin** (tender, silky). This is why tough, collagen-rich cuts need low-and-slow, while lean tender cuts do not.

### Denaturation-temperature ladder (core temperatures)
| Protein | Rare / soft | Medium / ideal | Well / dry |
|---|---|---|---|
| Chicken breast (lean) | — | 63–65°C sous-vide (juicy, safe if held for time) | >74°C flash / >80°C = dry "sole leather" |
| Chicken thigh (collagen-rich) | — | 70–75°C (collagen → gelatin) | tolerates more; wants it |
| Salmon / delicate fish | 45°C | **52°C** (silky, just-set) | >60°C = albumin bleed, flaky-dry, mushy |
| Shrimp / prawn | — | ~55–60°C just opaque, "C" shape | overcooked = rubbery "O" shape, curled tight |
| Beef whole muscle | 52°C | 54–57°C | >65°C = grey, dry |

*(Kill/safety temps and hold times are in [`food-safety-rules.md`](../food-safety-rules.md) §C — quality target ≠ safety alone; sous-vide reaches safety by time-at-temperature, not peak temperature.)*

### Two rules that fall out of this
1. **Water expelled by coagulation does not return.** You cannot "add moisture back" by any later step. Protect it up front (right temperature, minimum heat events, brine).
2. **Albumin bleed is a heat-rate + peak-temperature failure.** Gentle, low-peak cooking (sous-vide 52°C for salmon) keeps albumin in; aggressive heat or reheating a cooked-then-chilled fillet drives it out as white curd. **Delicate fish is therefore cooked once, to order, never cooked-then-frozen-then-reheated.**

### Salting & brining (moisture insurance)
Salt dissolves myofibrillar proteins and lets them **hold more water** (raises water-holding capacity). A brief brine or dry-salt before cooking measurably reduces cook loss. Osmosis also seasons throughout, not just the surface. Time matters: too long = cured/firm texture, too much water pulled then reabsorbed.

---

## 3. Fats & Oils — chemistry behind the brand red line

Shishka's "no refined seed oils" rule is not dogma — it is chemistry. Knowing it lets the agent defend the rule *and* pick the right approved fat by function.

### Saturation and heat stability
- **Saturated** (coconut, animal fats) — no double bonds, most heat-stable, solid at room temp.
- **Monounsaturated** (olive, avocado) — one double bond, moderately stable, the healthful backbone.
- **Polyunsaturated** (soy, sunflower, corn, safflower) — many double bonds, **oxidize easily** with heat/light/air, forming off-flavors and aldehydes. This instability is a core reason PUFA-heavy seed oils are a poor high-heat fat.

### Smoke point — pick fat by heat job
| Fat | Smoke point (approx) | Job |
|---|---|---|
| Extra Virgin Olive Oil | 163–210°C | Dressings, finishing, low heat |
| Virgin/unrefined coconut | ~177°C | Flavored medium heat |
| **Refined (deodorized) coconut** | 204–232°C | **Neutral marinade fat, freeze-stable — approved exception** |
| **Refined avocado oil** | **~271°C** | **High-heat grill/sear — the approved high-heat oil** |
Above the smoke point, fat breaks down to acrolein and free radicals — acrid flavor, lost nutrition. Match the fat's smoke point to the cooking temperature.

### The refining question (why "refined seed oil" ≠ "refined coconut")
- **Cold-pressed / mechanical** (EVOO, virgin avocado/coconut) — physically pressed, no solvents; retains antioxidants and flavor. **Clean label.**
- **Physical steam deodorization** (our approved refined coconut) — refined with heat/steam/vacuum, *no chemical solvent*. Neutral flavor, freeze-stable, still a whole-fruit fat. This is why the CEO grants it as the one refined exception (neutral marinade base that won't crack in the freezer).
- **RBD chemical/solvent extraction** (industrial soy/canola/sunflower/corn/**rice bran**) — seeds crushed, **hexane-extracted**, then Refined-Bleached-Deodorized. High-PUFA, oxidation-prone, stripped of character. **This is the banned class** — the process itself is the objection, "even when cheaper." See [`kitchen-philosophy.md`](../../../../docs/bible/kitchen-philosophy.md) §2.

### Emulsification
Oil and water don't mix without an **emulsifier** (lecithin in mustard/egg, mucilage in tahini/mustard, proteins in aquafaba). The emulsifier coats droplets so they stay suspended. No emulsifier → the dressing breaks (separates) within ~30 min. Shishka dressings emulsify with tahini/mustard/aquafaba, never store-bought stabilizers.

---

## 4. Carbohydrates & Starches

- **Gelatinization** — starch granules absorb water and swell at 60–80°C, setting texture. Irreversible.
- **Retrogradation** — on cooling, gelatinized starch recrystallizes: texture firms, then weeps water (syneresis) and goes stale. **Worst in the 0–4°C fridge range.** This is why rice/grain bowls degrade on hold — cook al dente (~85%), let regen finish it. (Full table in [`food-safety-rules.md`](../food-safety-rules.md) §D.) Silver lining: retrograded starch (RS3) is resistant starch — lower GI, a genuine Shishka health angle for cooled rice/potato.
- **Caramelization** — sugars alone browning from ~160°C. Pure sugar chemistry, no protein needed (e.g. roast pumpkin at 180–200°C).

---

## 5. The Maillard Reaction — flavor from browning

- **Reactants:** amino acids (protein) + reducing sugars, driven by heat.
- **Onset ~140°C**, best flavor development 150–180°C. Distinct from caramelization (needs the amino acid).
- **Requires a DRY surface** — water caps surface temperature at 100°C (evaporative cooling), so browning cannot start until the surface dries. **Practical:** pat protein dry before searing; don't crowd the pan/grill (crowding steams). Mild alkalinity (a pinch of baking soda) speeds it.
- **Why it matters for us:** Maillard is where a lean, healthy protein earns crave-worthy flavor without added sugar/fat. The sear is precious — do it once, at the right step (see the L1 sear in [`process-technology.md`](process-technology.md)).

---

## 6. Enzymes (quality-relevant summary)

Enzymes are biological catalysts, active in temperature windows, killed by heat. Full table (diastase/invertase in honey, papain, bromelain, PPO, myrosinase) is in [`food-safety-rules.md`](../food-safety-rules.md) §E. Quality headlines:
- **Polyphenol oxidase (PPO)** browns cut fruit/veg on contact with air — inhibit with acid (lemon) or a blanch. Relevant to prep-ahead aesthetics.
- **Proteolytic enzymes** (papain/bromelain) tenderize but, raw, prevent gelatin setting and can turn a marinated protein mushy if left too long. Heat neutralizes them.
- **Honey enzymes** die >40–50°C — heating raw honey wastes the premium (health-positioning point).

---

## 7. Heat Transfer Physics — grounds the L1/L2 split

- **Conduction** (direct contact, e.g. grill grate, pan), **convection** (moving hot air/water/steam, e.g. oven, sous-vide bath, Merrychef), **radiation** (IR from a hot element/lava rock). Most cooking blends them.
- **Thermal gradient & thermal mass.** Heat moves from hot surface to cool core over time; larger/denser items take longer and hold more energy. Even, gentle methods (sous-vide) eliminate the gradient — edge and core reach the same temperature.
- **Carryover cooking.** After heat is removed, the hot surface keeps driving heat inward — core temperature rises several degrees. **Pull before target**, especially delicate proteins, or the residual heat overshoots (albumin, dryness).
- **Come-up time.** How long the core takes to reach a target. It's why **regeneration** (fast reheat of an already-cooked item to safe core) is a *short thermal event*, not a full cook — the food is already cooked; regen just restores serving temperature quickly (Merrychef ≤60–90s). This is the physical reason **regen ≠ a cook cycle**.

---

## 8. pH & Acids

- **Acid denatures protein without heat** — ceviche "cooks" fish in citrus by acid-driven coagulation (texture firms, turns opaque). Useful, but it is *not* a pathogen kill; safety still needs the rules in [`food-safety-rules.md`](../food-safety-rules.md).
- **Color & freshness signal** — acid brightens green chlorophyll briefly but dulls it over time (dress green salads late); acid keeps cut fruit from browning (PPO).
- **Safety lever** — pH <4.6 blocks *C. botulinum*; the backbone of fermentation and pickling.

---

## 9. Freezing Science — ice crystals, glaze, and cost truth

- **Ice-crystal size is everything.** Slow freezing (domestic freezer, still air) grows **large** crystals that puncture cell walls → on thaw, cells leak (**drip loss**) → mushy, dry texture. **Fast freezing** (blast freezer, IQF, cryogenic) grows **small** crystals that spare cell walls → texture survives thaw. This is *the* reason Shishka blast-chills/freezes and why cheap block-frozen protein eats quality.
- **IQF vs block.** IQF (Individually Quick Frozen) = small crystals, pieces separate, portion-friendly. Block-frozen = slower, larger crystals, must thaw the whole mass. Prefer IQF for delicate proteins.
- **Glaze = surface ice, and a cost trap.** A thin ice layer (**quality standard 8–12%**, per Codex STAN 92) protects the surface from freezer burn/oxidation — legitimate. But the **cheap segment loads 20–30%+ glaze** to sell water at meat prices; Codex requires net weight to be **exclusive of glaze**. If you pay by gross pack weight, your true cost per edible kg is far higher (see RULE-TRUE-COST in [`sourcing-rules.md`](../sourcing-rules.md)). *Always* ask/verify the glaze %; if unlabeled on a cheap SKU, assume 25% and mark the figure ESTIMATE.
- **Cook-then-freeze vs portion-raw-then-freeze.** Freezing an *already-cooked* delicate protein compounds two water insults (coagulation loss + ice-crystal rupture) and, on reheat, drives albumin — the salmon failure. **Delicate proteins are portioned RAW and frozen raw (IQF), then cooked to order.** Robust items (braises, stews) freeze cooked well because gelatin holds water.
- **Refreeze prohibition.** Thaw → refreeze doubles crystal damage and grows microbial load through the danger zone twice. Never refreeze thawed raw protein.

---

## Quick-reference: which mechanism explains the audit failures

| Failure | Governing mechanism (this file) |
|---|---|
| Cheap IQF shrimp "saves money" | §9 glaze (pay water at meat prices) + §1 true edible cost |
| Tail-on cheap shrimp | sourcing spec, not science — see [`sourcing-rules.md`](../sourcing-rules.md) |
| Triple-heat chicken = dry | §1 cumulative moisture loss + §2 myofibrillar water expulsion + §7 regen≠cook |
| Cooked-then-frozen salmon = mushy/white | §2 albumin bleed + §9 ice-crystal rupture + §7 carryover |
| Refined rice bran oil | §3 RBD extraction (banned class) |
| Panic → duck fat/ghee | §3 fat selection by function, not panic (+ brand vegan gate) |
