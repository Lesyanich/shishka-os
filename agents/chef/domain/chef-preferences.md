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
7. **Always present recipes by gram.** When giving any recipe or dressing/sauce formula, list every ingredient in grams (not tbsp/tsp/cups). Include the total yield in grams and, where useful, a weight ratio / baker's percentage so the recipe scales cleanly. Volume units may appear only as a secondary note, and only if explicitly requested. (Added: 2026-06-17)
8. **No optional/suggested ingredients.** Stick to the core recipe only — do not add "Optional", "to taste", or substitution-suggestion items. List only the ingredients that are actually in the recipe. (Added: 2026-06-17)

## Learned Corrections
<!-- Rules added after mistakes. Like engineering rules but for the chef agent. -->
<!-- Format: "WRONG: [what agent did] → RIGHT: [what it should do]" -->
6. **WRONG: recommending unfamiliar ingredients without checking preparation method → RIGHT: WebSearch first, then recommend.** Morning Glory (ผักบุ้ง) was suggested raw in salad — stems are tough, always requires stir-fry or blanch. Rule: if you don't know the texture/preparation of an ingredient, WebSearch before recommending. Hallucination about food = wasted money on ingredients. (Added: 2026-05-13)
