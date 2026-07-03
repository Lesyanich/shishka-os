# Chef Recalibration Eval — 2026-07

> Purpose: prove the recalibrated /chef reasons from food-science mechanisms, not invented numbers.
> Run each prompt in a **fresh /chef session** (so Context Loading + `recall_memories` actually fire).
> Every PASS requires the agent to **name the governing mechanism**, not just reach the right answer.
> A run is GREEN only if all 4 scenarios pass AND the generalization probe passes.

## Pre-flight (session bootstrap)
Before scenario 1, confirm the session actually loaded the new context:
- [ ] `recall_memories(agent_id='chef')` fired **before** the greeting, and the 4 correction memories (shrimp / chicken / salmon / fats, tagged `recalibration-2026-07`) surfaced.
- [ ] The agent read `kitchen-philosophy.md`, `culinary-knowledge.md`, `knowledge/food-science.md`, `knowledge/process-technology.md`, `sourcing-rules.md`.
- [ ] Any number the agent states that is not from a catalog/purchase source carries an `ESTIMATE` label.

---

## Scenario 1 — Shrimp sourcing
**Prompt (RU):** «Нашёл мороженую креветку в Makro за 185฿/кг — давай перейдём на неё, сэкономим на фудкосте.»

**PASS requires:**
- Checks brand spec: flags tail-OFF requirement vs the cheap tail-ON segment.
- Computes **true cost per edible kg** with glaze adjustment (~247฿/edible-kg at ~25% glaze), labeled ESTIMATE if glaze unstated.
- Notes IQF/water-frozen texture loss (ice-crystal rupture, `food-science.md` §9).
- Concludes it is NOT a saving; cites RULE-TRUE-COST / RULE-SPEC-MATCH.

**FAIL if:** recommends switching on pack price, or ignores tail-off / glaze.

---

## Scenario 2 — Chicken breast L1→L2 flow
**Prompt (RU):** «Спроектируй процесс для куриной грудки: L1 центральная кухня → L2 раздача.»

**PASS requires:**
- Exactly ONE cook cycle: **L1 lava-grill flash-char (sear-first) → sous-vide 62°C at L1 → blast-chill/freeze → L2 Merrychef regen only.**
- **Every heat/char step named with its machine + zone; the char is on the L1 Lava Grill.** Does NOT place any sear/char at L2 (no grill there). Cites RULE-EQUIPMENT-REALITY + P8/P10.
- Names the mechanism: cumulative myofibrillar water expulsion (`food-science.md` §1–2), regen≠cook (§7).

**FAIL if:** proposes any second full cook cycle, OR **schedules a sear/char/color step at L2** (Infrastructural Blindness — L2 has no lava grill), OR has L2 cooking a cook-chill item from raw.

---

## Scenario 3 — Salmon prep
**Prompt (RU):** «Как готовить лосось под раздачу L2? Может, засувидить заранее и заморозить готовым?»

**PASS requires:**
- Rejects cook-then-freeze; specifies **raw portions, frozen raw (IQF), cooked to order** at ~52°C with finishing color.
- Names the mechanism: albumin bleed (`food-science.md` §2) + freeze-thaw cell rupture (§9); cites Delicate-Protein Classification (P9).

**FAIL if:** proposes freezing cooked salmon, serving cold sous-vide, or reheating a pre-cooked fillet.

---

## Scenario 4 — Neutral marinade oil
**Prompt (RU):** «Нужно нейтральное масло для маринада — что взять подешевле?»

**PASS requires:**
- Goes straight to a plant answer via the Fat Decision Tree: avocado (high heat) or **deodorized coconut** (neutral marinade); no seed oils.
- Explicitly excludes rice bran / any RBD seed oil (step 1) and does NOT reach for duck fat/ghee (animal fat = gated, step 2).
- Names the mechanism: RBD extraction chemistry (`food-science.md` §3).

**FAIL if:** suggests rice bran or any seed oil, or volunteers ghee/duck fat unprompted.

---

## Generalization probe (proves foundation, not memorization)
Ask something NOT in the 4 corrections. Suggested:
**Prompt (RU):** «Можем ли мы заранее наварить осьминога/кальмара на L1, заморозить и потом просто разогреть на раздаче?»

**PASS requires:** reasoning from mechanisms the agent was NOT explicitly handed a rule for — e.g. octopus/squid is collagen-heavy (needs long moist heat to tenderize; robust, so cook-chill can work) OR delicate depending on prep, applies the Heat-Cycle Budget and delicate-vs-robust classification from first principles (`food-science.md` §2), rather than saying "there's no rule for octopus."

**FAIL if:** the agent only answers well when a canned per-product rule exists.

---

## MCP enforcement negative tests (Phase 2, run against the built server)
- `create_product("RAW-RICE_BRAN_OIL", "Rice Bran Oil", "L")` → **hard error**, cites the red line (does NOT create).
- `create_product("RAW-GHEE", "Ghee", "kg")` → **confirmation_required** with a GATED warning (not a hard block).
- `add_bom_line(parent=<a dish>, ingredient=<a banned RAW>)` → **hard error** (catches legacy banned RAWs).
- `validate_bom(<dish containing a banned RAW>)` → issue `RED_LINE_VIOLATION` (error severity).
- Unit: `npx vitest run src/lib/brand-rules.test.ts` → all green (approved fats + nut butters must NOT flag).

## Result log
| Date | Runner | 1 | 2 | 3 | 4 | Gen | MCP | Notes |
|------|--------|---|---|---|---|-----|-----|-------|
| _pending first run_ | | | | | | | | |
