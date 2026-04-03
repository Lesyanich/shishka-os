# Chef Agent Preferences & Rules
<!-- This file is read by the Chef Agent at every session start. -->
<!-- Rules are added ONLY after explicit confirmation from Lesia. -->
<!-- Format: numbered rule + date added + context. -->

## Data Entry Rules
1. **All database entries must be in English only.** Product names, descriptions, notes — everything in the DB is English. (Added: 2026-03-30)

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
<!-- Rules added after mistakes. Like Boris Rules but for the chef agent. -->
<!-- Format: "WRONG: [what agent did] → RIGHT: [what it should do]" -->
