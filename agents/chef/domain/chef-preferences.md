# Chef Agent Preferences & Rules
<!-- This file is read by the Chef Agent at every session start. -->
<!-- Rules are added ONLY after explicit confirmation from Lesia. -->
<!-- Format: numbered rule + date added + context. -->

## Data Entry Rules
1. **All database entries must be in English only.** Product names, descriptions, notes, MC task titles AND descriptions — everything written to any database (Supabase, Mission Control) must be in English. This includes emit_business_task descriptions, BOM notes, recipe flow instructions. The team is multilingual — Russian is only for conversation between Lesia and the agent. (Updated: 2026-04-05)

## Naming Conventions
<!-- e.g., "Use ROMAINE_LETTUCE not SALAD_ROMAINE" -->

## Workflow Rules
2. **Never write to the database without showing a plan first.** Before any create/update/delete, show exactly what will change and wait for confirmation. (Added: 2026-03-30)
3. **Always check for duplicates before creating.** Search by product_code AND by name (fuzzy match). If a similar item exists, show it and ask whether to use the existing one or create new. (Added: 2026-03-30)
4. **Check supplier availability for new RAW items.** When creating a new RAW ingredient, check supplier_products table. If not found at any supplier, warn: "This ingredient is not in any supplier catalog. Add a supplier first?" (Added: 2026-03-30)

## Menu & Production Knowledge
<!-- e.g., "We have 2 salad bars, 28 cells each", "Large cells hold base mixes" -->
5. **Two salad bars, 28 cells each.** Some cells are too small and should be replaced with larger ones. Large cells hold base salad mixes that are shared across multiple dishes. (Added: 2026-03-30)

## Culinary Preferences
<!-- e.g., "Shishka is a healthy kitchen — minimize sugar, maximize whole ingredients" -->

## Learned Corrections
<!-- Rules added after mistakes. Like engineering rules but for the chef agent. -->
<!-- Format: "WRONG: [what agent did] → RIGHT: [what it should do]" -->
6. **WRONG: recommending unfamiliar ingredients without checking preparation method → RIGHT: WebSearch first, then recommend.** Morning Glory (ผักบุ้ง) was suggested raw in salad — stems are tough, always requires stir-fry or blanch. Rule: if you don't know the texture/preparation of an ingredient, WebSearch before recommending. Hallucination about food = wasted money on ingredients. (Added: 2026-05-13)

7. **WRONG: judged frozen shrimp by pack price (185฿/kg cheap IQF from Makro) → RIGHT: compute true cost per EDIBLE kg + match every brand spec.** The cheap segment carries 20–30% ice glaze (Codex quality standard is 8–12%), so real meat cost ≈ 247฿/edible-kg before prep loss — the "saving" is imaginary. It is also tail-ON (brand requires tail-OFF; de-tailing semi-frozen shrimp at L2 is unacceptable), and water/block-frozen shrimp loses the crunch the guest pays for. Mechanism: `knowledge/food-science.md` §9 (glaze, ice-crystal rupture). Rule: RULE-TRUE-COST + RULE-SPEC-MATCH in `sourcing-rules.md`. (Added: 2026-07-03)

8. **WRONG: chicken breast flow sous-vide → lava-grill (L1) → blast-freeze → re-grill (L2) = 3 heat cycles = dry "sole leather" → RIGHT: one cook cycle per protein per chain.** Every full cook expels water permanently and losses stack (`food-science.md` §1–2). Correct flow: sous-vide 63–65°C at L1 → blast-chill → L2 Merrychef regen only (≤60–90s = reheat, not a cook cycle). L2 never re-cooks; L1 exists to unload L2, not duplicate its work. Rule: Heat-Cycle Budget + L1-Unloads-L2 (`culinary-knowledge.md` P8, P10). (Added: 2026-07-03)

9. **WRONG: cook salmon sous-vide, freeze it cooked, then serve cold / reheat at L2 → RIGHT: delicate fish = portioned RAW, frozen RAW (IQF), cooked to order with finishing color.** Cooking-then-freezing-then-reheating compounds coagulation water loss + ice-crystal cell rupture, and drives albumin bleed (white curd) on reheat — mushy, blotchy, destroying a 599฿/kg product. Salmon target 52°C, sear for color at service. Mechanism: `food-science.md` §2 (albumin) + §9 (freeze-thaw). Rule: Delicate-Protein Classification (`culinary-knowledge.md` P9). (Added: 2026-07-03)

10. **WRONG: recommended refined rice bran oil (a banned RBD seed/grain oil), then panicked into duck fat / ghee (ignoring the vegan line) → RIGHT: walk the Fat Decision Tree.** Step 1 clean-label: rice bran is solvent-extracted RBD → banned (`food-science.md` §3 — the extraction process is the objection). Step 2 line-compatibility: animal fats are GATED, never proposed unprompted, never in/feeding the vegan line. Step 3 function: high heat → avocado oil (~271°C), neutral marinade/freeze → deodorized coconut, dressing → EVOO. The tree goes straight from "no seed oil" to a plant answer — no panic. Rule: RULE-FAT-DECISION-TREE (`culinary-knowledge.md`) + `docs/bible/kitchen-philosophy.md` §2. (Added: 2026-07-03)

11. **WRONG: put the color-sear / char step at L2 ("Merrychef OR a color-sear ≤90s at L2") → RIGHT: char is an L1 lava-grill step; L2 has no grill and only regenerates.** Infrastructural Blindness — the flow was physically impossible: the Lava Grill (`L1-LAVA-GRILL-650-33`) lives at L1 (Zone 3); L2 has only a Merrychef (regen) + flat contact griddle + salad bars. Searing on the flat griddle can't make lava char and just dries the meat. Correct chicken-steak flow (CEO-approved): L1 lava-grill flash-char ~45s (sear-first, "90% Cooked") → L1 sous-vide 62°C → L1 blast-chill/freeze → L2 Merrychef regen ~60s. **Rule: RULE-EQUIPMENT-REALITY — name the machine + zone for every heat/char/finish step and verify it exists there (`docs/bible/operations.md` Equipment-by-Zone). Flavor is built where the equipment is.** (`culinary-knowledge.md` P8/P10, `process-technology.md` §3–4). (Added: 2026-07-03)
