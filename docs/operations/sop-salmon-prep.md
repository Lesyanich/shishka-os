# SOP — Salmon Prep (Cook-to-Order from Raw Frozen Portion)

> **SOURCE OF TRUTH for the salmon line process.** Created 2026-07-03 (chef recalibration).
> Companion to `docs/bible/kitchen-philosophy.md` §2 Protocol 4 and `agents/chef/domain/knowledge/food-science.md` §2 (albumin), §9 (freeze-thaw).
> Written in simple, step-by-step language for the line team.

**Core rule: salmon is a DELICATE protein. It is portioned RAW, frozen RAW, and cooked to order. We NEVER cook salmon then freeze it then reheat it.** Cooking-then-freezing-then-reheating drives out albumin (ugly white curd), ruptures cells on the freeze (mushy), and produces a soapy, pale bowl — destroying an expensive product (≈599฿/kg).

---

## L0 — PURCHASE / RECEIVING
1. Buy fresh salmon (or reputable sashimi-grade previously-frozen for raw use — check spec). Firm flesh, clean sea smell, **no ammonia**, bright color, no gaping. Anything off → photo, reject, tell shift lead.
2. **Cold chain:** <4°C immediately. Portion the same day if possible.
3. Cost per edible kg, not pack price — account for skin/pin-bone/trim yield loss (RULE-TRUE-COST, `agents/chef/domain/sourcing-rules.md`).

---

## L1 — KITCHEN (portion raw, freeze raw)
1. Keep salmon COLD throughout. Work in small batches; gloves on.
2. Trim, pin-bone, and cut into **service portions** (state target g per portion once weighed).
3. **Vacuum seal one portion per bag, laid flat.** No air.
4. Label; write today's date on **"Frozen:"**.
5. **Blast-freeze NOW to −18°C** (fast setting). Fast freezing = small ice crystals = cells survive = texture holds on thaw (`food-science.md` §9). Do not slow-freeze in the soft freezer.
6. Store in bin **"Salmon – Raw Portions"**, FIFO.

**L1 rules:** never leave salmon warm > 2 h · **NEVER refreeze** · portions stay RAW (no cooking at L1).

---

## L2 — LINE / SERVICE (cook to order)
1. **Keep a small buffer thawing in the fridge** (bottom shelf, ≤3°C): each morning move portions from freezer to fridge to cover expected covers. Write **"Thawed:"** date. If none ready → quick-thaw the sealed bag under cold running water 5–10 min (do not open it).
2. On order, take **one thawed raw portion**. Pat the surface **dry** (dry surface = Maillard color; wet = steams, no color — `food-science.md` §5).
3. **Cook to order to ~52°C core (medium, silky).** Pull just before target — carryover finishes it (`food-science.md` §7). Do **not** push past ~60°C or albumin bleeds and the flesh dries/flakes.
   - Method: sear skin/presentation side for **color** on the hot surface, finish gently; or Merrychef program to core. Either way it is cooked **once, at service**.
4. Serve immediately with finishing color/glaze as the dish specifies.

**Why not cook-chill like chicken thigh?** Chicken thigh is collagen-rich and robust; salmon is delicate and albumin-rich. See the Delicate-Protein Classification (P9) in `agents/chef/domain/culinary-knowledge.md`.

---

## 📅 SHELF LIFE (strict)
- Raw portion, frozen sealed: state per safety table (`agents/chef/domain/food-safety-rules.md` §B — raw fish handling; sashimi-grade parasite-kill freezing rules if served raw).
- Raw portion, thawed in fridge ≤3°C: cook within **24 h** (`food-safety-rules.md` §B: cooked fish 2 days; raw fish 24 h).
- **NEVER refreeze** a thawed raw portion.

## 🗑️ WASTE / EXPIRED
Check dates every shift. Do not use a portion that is over its thaw window, lost vacuum, freezer-burned, or smells off. Set aside → tell shift lead → log the write-off.

## Open items
- Weigh a real batch → set target portion_weight_g and yield_loss_pct for the RAW → portion PF.
- Confirm whether service uses sear or Merrychef program; capture the program in recipes_flow.
