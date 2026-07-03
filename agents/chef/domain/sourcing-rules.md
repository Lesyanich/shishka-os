# Sourcing Rules — Buy the Edible Kilogram, Not the Pack

> Loaded every session (Core). How the Chef Agent reasons about ingredient sourcing so it never again recommends a "cheaper" SKU that is actually more expensive or off-spec.
> Companion to the Grounding Gate in [`../AGENT.md`](../AGENT.md) and the freezing/glaze science in [`knowledge/food-science.md`](knowledge/food-science.md) §9.
> **Root failure this prevents:** recommending cheap IQF shrimp (185฿/kg) on pack price while ignoring 20–30% glaze (real ~240–250฿/edible-kg) and the tail-OFF brand spec.

---

## RULE-TRUE-COST — always compare per EDIBLE kilogram

A pack price is not a cost. Water, shell, head, tail, and trim are not food. Compute:

```
true_cost_per_edible_kg = pack_price / ( pack_kg × (1 − glaze_fraction) × edible_yield_fraction )
```

- **glaze_fraction** — surface ice on frozen protein. Quality standard is **8–12%** (Codex STAN 92; net weight is legally exclusive of glaze). The **cheap segment loads 20–30%+** to sell water at meat prices. If the SKU doesn't state glaze, assume **25%** for a cheap frozen item and mark the result **ESTIMATE**.
- **edible_yield_fraction** — what survives prep. E.g. head-on shell-on shrimp loses ~50% to head/shell/tail (see [`../../../docs/operations/sop-shrimp-prep.md`](../../../docs/operations/sop-shrimp-prep.md)).

**Worked example (the audit failure):** cheap IQF shrimp 185฿/kg pack, ~25% glaze → 185 / (1 × 0.75) ≈ **247฿/edible-kg of frozen meat** before any prep loss. The "saving" is imaginary. Present this math, labeled, whenever comparing a cheaper protein SKU.

---

## RULE-SPEC-MATCH — one failed spec = a different product, not an alternative

Before recommending ANY substitute SKU, **enumerate the brand spec constraints** and verify **each** against real data:

Typical protein spec axes: **tail on/off · size/count grade · IQF vs block-frozen · fresh vs frozen · wild/farmed · skin on/off · previously-frozen status.**

Verify each via, in order of authority:
1. `search_purchase_history` — what we actually bought and what it cost.
2. `supplier_catalog` / `search_makro_catalog` — real pack spec on offer now.
3. **WebSearch** — for anything the catalog doesn't state (glaze %, tail configuration of a segment, texture behavior).

**A single failed spec disqualifies the SKU.** Example: brand requires tail-OFF; the cheap frozen segment is tail-ON (manual de-tailing of semi-frozen shrimp at L2 is an unacceptable labor + presentation cost). Tail-ON is not a cheaper version of our shrimp — it is a different product.

---

## RULE-QUALITY-FLAGS — cheap frozen protein carries hidden quality costs

- **Block-frozen / slow-frozen** → large ice crystals → cell rupture → drip loss → "cottony" / rubbery texture on thaw (`food-science.md` §9). IQF is not a luxury; it is texture insurance for delicate proteins.
- **High glaze** is both a cost trap (above) and a signal of a low-end supply chain.
- **Refreeze / thaw-refreeze** history destroys texture and doubles danger-zone exposure — reject.
- **Water-frozen delicate proteins** lose the crunch/snap the guest pays for — disqualifying for a healthy premium format.

If a cheaper SKU wins on true cost but fails a quality flag, say so explicitly; do not let price bury quality.

---

## RULE-ESTIMATE-LABELING — never present a guess as a fact

- Any number **not** sourced from `supplier_catalog`, `purchase_logs`/`search_purchase_history`, a live catalog search, or a cited WebSearch result **must be prefixed `ESTIMATE`**.
- Show the assumption behind an estimate (e.g. "ESTIMATE, assuming 25% glaze on unlabeled cheap IQF").
- **Presenting an estimate as a fact is a violation** — it is exactly the "cabinet economist" behavior that triggered this recalibration.

---

## Where a cost cut is actually allowed

Per [`../../../docs/bible/kitchen-philosophy.md`](../../../docs/bible/kitchen-philosophy.md) §6: cost cuts come from **cross-utilization** (one ingredient feeding many dishes) and **local sourcing** (local superfoods replacing imported) — **never** from downgrading an ingredient class or violating a brand spec. A cheaper off-spec protein is not a cost cut; it is a brand cut.
