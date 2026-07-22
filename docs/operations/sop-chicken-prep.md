# SOP — Grilled Chicken Thigh Prep (Fresh Cook-Chill, Lava-Grilled)

> **SOURCE OF TRUTH for the grilled-chicken-thigh line process.** Confirmed with CEO 2026-07-05.
> Staff chat cards (English / ไทย / မြန်မာ) are GENERATED FROM THIS FILE — edit here first, then re-translate.
> Written in deliberately simple, step-by-step language: the line team needs every detail spelled out.
> Companion data: `PF-CHICKEN_THIGH_GRILL` (recipes_flow / pf_pack_card), category KP-PRP-CHK 🐔 Chicken.
> RULE: every detailed process gets an SOP file like this — do NOT leave the detail in chat/session memory only.

Goal of the change: **real grill/smoke flavor + juicy + NO freezer + safe** — full cook happens ONCE, on the lava grill at L1; L2 only reheats.

---

## Why THIS method (the decisions behind it)

- **Thigh, not breast.** Dark meat has fat + collagen → it survives a full lava grill and stays juicy. Lean breast dries out when grilled all the way through. Thigh is also cheaper and more forgiving.
- **No sous-vide.** We already have sous-vide chicken and the grill flavor washes out — the meat juice (purge) inside the vacuum bag dissolves the char. So for the *grilled* product we cook on the lava grill only.
- **No freezing.** Freezing cooked chicken makes it fibrous and dry on reheat (ice crystals + water loss). We work fresh cook-chill.
- **No convection oven step.** Lava grill does the full cook in one go.
- **Full cook at L1, reheat-only at L2.** The thigh is fully cooked and safe when it leaves L1. L2 never cooks raw chicken — it only reheats. This keeps the risk off the fast line (our "No Raw Zone at L2" rule).

**How the benchmarks do it (for reference):** fast-casual chains (Chipotle/Cava/Sweetgreen) batch-grill fresh and hot-hold; commissary/airline cook-chill fully cooks + blast-chills + reheats. Real deep smoke comes from a *full* grill (fat dripping on coals), NOT a 45-second flash. That is exactly this SOP.

---

## L0 — PURCHASE / RECEIVING

1. Buy **fresh boneless chicken leg/thigh meat (skinless)**. Default: Makro **CP Chicken Boneless Leg**, code **898811**, ~฿118/kg (barcode 8850653219586).
   - If out of stock: **Makro Bone-In Leg** code 31915 (~฿89/kg) → debone in L1 (extra labor + ~20% bone loss), or ARO frozen boneless leg as last resort.
2. On delivery check every batch: firm, fresh smell (NOT sour/ammonia), no slime. Anything off → photo, reject, tell the shift lead.
3. **Cold chain:** straight into the fridge (<4°C). Prep the same day if you can.
4. **Yield rule of thumb:** ~28% is lost in the full grill (juice + fat render). To end up with ~1 kg of finished grilled thigh, start with ~**1.4 kg raw**.

---

## L1 — KITCHEN (making the batch)

### 1) 🧂 Brine (moisture insurance — do NOT skip)
Because there is no sous-vide here, salt is the ONLY thing keeping the thigh juicy on the grill.
- Weigh the thigh. Add **fine sea salt = 1.5% of the weight** (e.g. 15 g salt per 1 kg meat). Rub evenly.
  - (Or submerge in a **4% brine** — 40 g salt per 1 L water.)
- Rest **in the fridge at least 2 hours** (overnight is even better).
- **Do NOT lay open trays all over the fridge.** Stack in **covered** GN pans (or brine sealed in bags) — saves space, no cross-contamination with other food.

### 2) 🔥 Lava-Grill — FULL cook (this is where the smoke lives)
- Preheat the **lava grill to ~220°C** (15 min).
- Lay the brined thigh on the grill. Give it a **deep, confident char on both sides** — we WANT strong grill marks and smoke. Fat drips on the lava stones = real smoke into the meat.
- Then move to a cooler part of the grill to finish. **Cook it FULLY — core 78–80°C.** Thigh stays juicy at this temperature (the fat and collagen melt in).
- This is the ONLY cook. The meat is done and safe after this step.

### 3) ❄️ Blast-Chill — **CCP (Critical Control Point)**
- Take the hot grilled thigh **straight to the blast chiller**.
- Drive the core from **+85°C down to +3°C in under 90 minutes.**
- **Log the core temperature** on the batch sheet. If it does not reach +3°C in 90 min → flag the shift lead.

### 4) 📦 Cold Vacuum Pack
- **Only after the thigh is fully cold**, portion it (~150 g portions, or in blocks) and **vacuum-seal**.
- Packing it cold means **no steam/condensation inside the bag** → the grilled crust and smoke stay dry and concentrated.
- Stick the label on. Write today's date on **"Packed:"**.
- Store fridge **≤3°C**. **NEVER freeze this product.**

**L1 rules:** full cook to 78–80°C core · blast-chill is a CCP, always log it · pack cold, never hot · never freeze.

---

## L2 — LINE / SERVICE (reheat only — no cooking)

The thigh arrives **fully cooked**. The cook at L2 only reheats it — never cooks raw chicken.

1. Order comes in → open one bag, take out the cold grilled thigh (it already smells of the grill).
2. Put it on a **perforated PTFE (teflon) sheet** in the **Merrychef**.
3. Run the reheat profile: **45–60 seconds**, **Fan (air) ~90%, Microwave ~10–15%.**
   - Hot air re-wakes the grill/smoke aroma on the crust; low microwave just warms the middle.
   - Goal: **core 74°C** for service (it's a reheat of already-cooked meat, so this is fast and safe).
4. Plate / slice into the bowl or salad. Serve.

---

## 📅 SHELF LIFE (strict — check every bag)
- Cooked, blast-chilled, sealed, fridge ≤3°C: **3 days (72 hours)** — this is our hard limit for cooked poultry.
- Any bag **OPENED**: **24 hours**.
- **NEVER freeze. NEVER refreeze.**
- Because it's only 3 days, **L1 must deliver every 2–3 days.** Do not over-produce.

## 🗑️ WASTE / EXPIRED
Before every shift, check the dates on all bags. **Do NOT use** a bag if:
- packed-sealed older than 3 days, OR opened older than 24 hours, OR
- the bag is torn / lost its vacuum / smells off.

Then: **set it aside → tell the shift lead → log the write-off** (waste sheet now; admin expiry screen — MC a305ef50). Never "use it quickly to save it."

---

## Data / app surfaces
- `PF-CHICKEN_THIGH_GRILL` renders in `/menu` L1 Cook tab from `recipes_flow` (temps, CCP, Merrychef fan/MW %, L1/L2 station via `location_id`) + `pf_pack_card` (fridge 0–3°C, 3-day, 150 g portion).
- Station map: steps 1–4 = L1 (Cold Prep / Proteins & Grill), step 5 = L2 (Assembly).

## Open items (not blocking the SOP)
- **Weigh the first real batch** → confirm true yield loss (v1 = 28%) and update the BOM `yield_pct` + `portion_weight_g`.
- Confirm boneless-leg supply at Rawai (CP 898811 was out of stock on 2026-07-05 → sourcing follow-up).
- Tune the exact Merrychef profile on the real machine (fan/MW %, seconds) — record final numbers here.
- Decide which SALE dishes this prep feeds (bowls / salads); the broken `SALE-GRILLED_CHICKEN_BREAST` is BREAST, kept separate for a future lean-breast card.
- Optional: clean-label smoke booster (smoked-paprika rub / lava-charred-onion oil) if we want to push the smoke further.
