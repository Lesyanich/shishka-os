# SOP — Shrimp Prep (Dual Prep: Marinated + Sous-vide)

> **SOURCE OF TRUTH for the shrimp line process.** Confirmed with CEO 2026-07-01.
> Staff chat cards (English / ไทย / မြန်မာ) are GENERATED FROM THIS FILE — edit here first, then re-translate.
> Written in deliberately simple, step-by-step language: the line team needs every detail spelled out.
> Companion data: PF-SHRIMP_MARINATED_FZ + PF-SHRIMP_SOUSVIDE (recipes_flow / pf_pack_card), category KP-PRP-SHR.
> RULE: every detailed process gets an SOP file like this — do NOT leave the detail in chat/session memory only.

Goal of the change: **minimize waste + preserve flavor** — long shelf life lives in the frozen RAW/portion, we cook to order.

---

## L0 — PURCHASE / RECEIVING (before the kitchen)
1. Buy **fresh White Shrimp, Size L, head-on** — never previously frozen. Default source: Makro code 118692, ~239 ฿/kg. (Fresh head-on wins over cheap frozen-peeled once we require big + tail-off + no ice-glaze.)
2. On delivery, check EVERY batch: shrimp firm, shell intact, **smells of the sea — NOT ammonia**, no slimy black liquid. Anything off → photo it, reject, tell the shift lead.
3. **Cold chain:** into the fridge / on ice immediately (<4°C). Prep the same day if you can.
4. **Ordering rule of thumb:** ~50% is lost (head + shell + tail). To end up with 1 kg of peeled shrimp, buy about **2 kg head-on**.

### Sourcing spec — why fresh head-on, not cheap frozen (grounding for the buyer)
This is the worked example behind RULE-TRUE-COST and RULE-SPEC-MATCH in `agents/chef/domain/sourcing-rules.md`. Do **not** switch to a cheaper frozen SKU on pack price:
- **Brand spec is non-negotiable:** Size L, **tail-OFF**, no ice-glaze, never previously frozen. A cheap SKU that fails one spec (e.g. tail-ON) is a *different product*, not an alternative.
- **True cost per edible kg, not pack price:** cheap IQF segment carries 20–30% glaze (quality standard is 8–12%, Codex STAN 92). A 185฿/kg "bargain" at 25% glaze is ≈ **247฿/edible-kg** of frozen meat *before* the ~50% prep loss. The saving is imaginary.
- **Texture:** water/block-frozen shrimp suffers ice-crystal cell rupture (`knowledge/food-science.md` §9) → loses the snap the guest pays for. Formula: `true_cost_per_edible_kg = pack_price / (pack_kg × (1 − glaze) × edible_yield)`.

---

## L1 — KITCHEN (making the bags)

### Every shrimp — first
1. Take fresh shrimp (Size L, head-on). Smell it: must smell like the sea, NOT like ammonia. Bad smell → tell the chef, do not use.
2. Keep shrimp COLD the whole time (on ice / in the fridge). Work in small batches so it never gets warm.
3. Wash hands, put on gloves.
4. Peel: remove the head, the shell, **AND the tail** (tail always OFF).
5. Cut the back shallow, pull out the black vein. Rinse.
6. **Dry the shrimp well with paper towel.** (Wet shrimp = marinade slips off and no good sear.)

### 🧄 The garlic-herb marinade (make a batch ahead — reusable for chicken/fish too)
Mix per ~1 litre batch: **rice-bran oil 900 ml · garlic 70 g · parsley 30 g · thyme 10 g · salt 30 g**. Neutral, **NO acid**, no lemon. Keep chilled. This is the reusable prep `PF-MARINADE_GARLIC_HERB` (it has its own card in /menu). **Dose on shrimp: ~8 ml — a thin coat — per 6 shrimp.**

> ⚠️ **POLICY CONFLICT — rice-bran oil (flagged 2026-07-03, chef recalibration).** Rice-bran oil is now a **banned RBD seed/grain oil** under `docs/bible/kitchen-philosophy.md` §2. This marinade (and the live `PF-MARINADE_GARLIC_HERB` recipe) predates the clarified red line and must be **reformulated**. Per the Fat Decision Tree, the replacement for a neutral marinade that gets a **hot sear from frozen** is **refined avocado oil** (high smoke point ~271°C, stays liquid when chilled) — *not* deodorized coconut (which solidifies in the freezer coat and smokes lower). **Awaiting CEO sign-off** before changing the confirmed recipe — see the MC task. Do not silently swap in production until approved.

### 🔥 MARINATED (raw — for HOT dishes)
7. Put dry shrimp in a bowl. Add a **thin coat** of garlic-herb marinade — about **8 ml per 6 shrimp** (~1.5 teaspoons). Just lightly cover. NO extra oil, NO lemon/lime.
8. Put **exactly 6 shrimp** in one vacuum bag, laid flat.
9. Vacuum seal — no air inside.
10. Stick the printed label on. Write today's date on **"Frozen:"**.
11. **Blast-freeze now** (fast/hard setting, to −18°C). NOT the normal soft freezer.
12. Store in bin **"Shrimp – Marinated"**. Oldest in front (FIFO).

### 🌯 SOUS-VIDE (cooked — for COLD dishes / rolls)
13. Put dry shrimp in a bowl. Add **only salt**, a little (~10 g per 1 kg). NO sugar, NO herbs.
14. Lay **6 shrimp in ONE single layer** in the bag (single layer cooks evenly). Vacuum seal.
15. Cook **sous-vide 60°C for 30 minutes**.
16. Take the bag **straight from the hot water into the blast freezer** — **do NOT put it in ice water first.** Freeze to −18°C.
17. Label + write **"Frozen:"** date. **Do NOT cut/butterfly now.**
18. Store in bin **"Shrimp – Sous-vide"**. Oldest in front (FIFO).

**L1 rules:** never leave shrimp warm > 2 hours · **NEVER refreeze** · one kind per bin.

---

## L2 — LINE / SERVICE

### 🔥 MARINATED (hot dishes)
1. Take one bag from the freezer.
2. **Cook straight from frozen** — no thawing. Hot pan, cook until pink, firm, and hot in the middle.
3. Add lemon/sauce at the end if the dish needs it. Serve.

### 🌯 SOUS-VIDE (cold dishes — Summer Rolls)
1. **Keep 2 sous-vide bags thawing in the fridge at all times.** Each morning, if there are fewer than 2, move bags from the freezer to the fridge (bottom shelf) to make it 2. Write today's date on **"Thawed:"**.
   - A sealed thawed bag is good for **7 days**, so leftovers carry over — just always keep 2 ready.
   - If an order comes and no thawed bag is ready → quick-thaw a sealed bag under **cold running water, 5–10 min** (do not open it).
2. When an order comes: open **ONE bag = 6 shrimp = 1 dish (2 rolls)**.
3. **Butterfly:** lay each cooked shrimp flat, cut in half lengthwise so the pink shows. Pat dry if wet.
4. Put **3 shrimp (6 halves) in each roll**, assemble cold, serve.

---

## 📅 SHELF LIFE (strict — check every bag)
- Frozen, sealed: **30 days**
- Sous-vide, thawed but still SEALED, fridge ≤3°C: **7 days**
- Any bag OPENED: **48 hours**
- Marinated raw, thawed: **24 hours** (we cook from frozen, so rare)
- **NEVER refreeze.**

## 🗑️ WASTE / EXPIRED (confirmed 2026-07-01)
Before every shift, check the dates on all bags. **Do NOT use** a bag if:
- thawed-sealed older than 7 days, OR opened older than 48 hours, OR
- the bag is torn / lost its vacuum / freezer-burned / smells off.

Then: **set it aside → tell the shift lead → log the write-off** (waste sheet now; admin expiry screen when ready — MC a305ef50). Never "use it quickly to save it."

---

## App surfaces — where staff see this (Variant 1, decided 2026-07-01; build = MC 56b8c6dc)
- The **SALE dish is the end-to-end anchor.** A "Full Process" view walks Buy → L1 prep (per component PF) → L2 assemble → Serve by following BOM links — nothing duplicated.
- **L1 Cook tab** = the prep (L1) steps only. **L2 Assembler tab** = the dish's L2 steps, **auto-pulling** each frozen component's L2 handling (thaw/butterfly) from its PF. Shelf-life + waste strips on both.
- Multi-language staff chat cards + the station poster are **generated from THIS file** — edit here first.

## Open items (not blocking the SOP)
- Exact grams per 6 Size-L shrimp — weigh the first real batch and update portion_weight_g.
- "2 bags ready" buffer is for current low volume — raise it when orders grow (→ par model).
- **Reformulate `PF-MARINADE_GARLIC_HERB` off rice-bran oil** → avocado oil (pending CEO sign-off; see MC task from chef recalibration 2026-07-03).
