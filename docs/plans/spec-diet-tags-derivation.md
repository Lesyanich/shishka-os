# Spec (DRAFT, not built): diet tags derived from ingredients + "check tags" mark

Status: design only. No migration written, nothing tagged, nothing applied. SOCRATIC-GATE: the four
questions at the bottom are the CEO's to answer before any code.
Why in docs/plans/: next to spec-migration-number-allocator.md and the other mechanism specs; it is a
mechanism spec, not a domain fact (docs/domain/ holds those).

## 1. Measured facts (prod, 2026-10-17)

- 81 live dishes. All 121 tag links on them are tag_group='allergen'. Zero dietary tags on the menu.
  `vegan` (57 links) and `vegetarian` (62) sit only on preps / RAW / archived items.
- Walking every live BOM gives 141 food leaves (packaging excluded). 52 have no allergen review.
  `fn_dish_allergen_status` says 40/81 dishes are confident, 34 are not, 7 are bought-in items with no BOM.
- 4 soft-deleted RAW still sit in live BOMs, touching 6 live dishes (RAW-MAYONNAISE-HEALTHY alone: 5 dishes).
  Trigger `trg_guard_no_delete_referenced_ingredient` exists but was bypassed or predates them; the status
  function does not filter is_deleted, so they count as normal ingredients.
- Allergen data CANNOT derive diets. Chicken, beef, lamb, tuna, honey carry no allergen slug at all;
  RAW-CHICKEN-BREAST is "reviewed, no allergens". Fish/shellfish exist as slugs, meat/honey/gelatin do not.
- Existing vegan/vegetarian links on food leaves: about 25 of 141, positives only, inconsistent
  (egg tagged vegetarian, chicken breast only dairy-free). Absence of a tag proves nothing, the same
  trap documented for allergens.
- Category is not a safe rule. F-DAI-MLK holds coconut and almond milk, F-DAI-OIL holds olive/coconut oil,
  chicken sits in F-PRO-PLT, peanuts in F-PRD-VEG. Bread (3 leaves) carries milk. Roughly 100 of 141 leaves are
  plain produce/spice/nut/grain by category; about 20 are plainly animal; the remaining 20-40 are
  composite or processed (sauces, pastes, bread, wakame salad, truffle sauce, 6 chocolates, syrups) and only a
  label or supplier spec decides them.
- The same attribute would also settle Seafood: RAW-TUNA-SASHIMI and RAW-CRABSTICK are unreviewed (tagged
  fish / fish+shellfish, so no dish is wrong today, but a recipe change would silently lose the warning).

## 2. Design

Principle: AI belongs at the INGREDIENT layer, never the dish layer. About 150 leaves change rarely;
a dish tag is then pure deterministic set logic over classified leaves. Nothing is called per page view.

1. **Ingredient fact (new, mirrors the allergen ledger).** One classification per RAW, drawn from a closed
   vocabulary of animal origin: meat, fish, shellfish, dairy, egg, honey, other_animal (gelatin, rennet,
   fish extract, carmine...), plus `diet_reviewed_at/by` and `diet_evidence` (label, supplier spec, chef).
   An empty set counts as "plant" ONLY when reviewed, exactly like allergen_reviewed_at.
2. **Dish status.** `fn_dish_diet_status(dish_id)` next to `fn_dish_allergen_status`, same walk, same
   {diets, confident, unreviewed_items} shape. plant-based/vegan = no animal origin on any food leaf;
   vegetarian = no meat/fish/shellfish/other_animal. confident requires ingredients > 0, every leaf
   reviewed, and no soft-deleted leaf (mig 392 rule, plus the is_deleted hole above).
3. **Where the published value lives.** One store: `nomenclature_tags` (tag_group 'dietary', slug
   `plant-based`; the site contract already reads it). Beside it on the dish: `diet_basis_hash`,
   `diet_reviewed_at`, `diet_needs_check boolean`.
4. **What invalidates.** Correctness comes from the hash: md5 of the sorted (leaf id, classification) set at
   review time. needs_check = hash now differs from stored. It is correct by construction (BOM edit,
   sub-recipe edit, reclassification, soft-delete, new line all change it). Publication cannot compute it
   live (anon 3s timeout, planning cost), so triggers keep the stored boolean fresh, modelled on
   `trg_cascade_bom_nutrition_on_bom/_on_item` (walk UP to every ancestor dish), and a nightly/CI audit
   recomputes the hash and fails if any dish disagrees with its boolean. Triggers are the speed path, the hash
   is the proof.
5. **Who reviews.** The agent proposes (offline, in-session, free: the project's precompute-and-store rule),
   a human confirms. Confirming writes the tags, stores the hash, clears the flag.
6. **Guest view.** Public views expose a dietary tag only when `NOT diet_needs_check` and confident.
   Flagged dish: diet badge and filter membership vanish; allergens are untouched (separate, already gated).
7. **customer_ingredients.** Same drift, same trigger path, MC 1dce3c7e (auto-derive with manual override,
   still inbox). Recommendation: reuse the walk and the needs_check trigger so one mechanism flags both,
   but ship diets first; the ingredient-text derivation is a separate display problem.

## 3. Migration sketch (NOT a migration; number via claim_migration_number at write time)

```sql
-- ingredient layer
ALTER TABLE nomenclature
  ADD COLUMN animal_origin text[],            -- NULL = unknown; '{}' = reviewed plant (needs reviewed_at)
  ADD COLUMN diet_reviewed_at timestamptz,
  ADD COLUMN diet_reviewed_by text,
  ADD COLUMN diet_evidence text,
  ADD COLUMN diet_basis_hash text,            -- dishes only
  ADD COLUMN diet_needs_check boolean NOT NULL DEFAULT true;  -- dishes only; true until first review
-- fn_dish_diet_status(uuid) jsonb  : STABLE, same recursive walk as fn_dish_allergen_status
-- fn_dish_diet_hash(uuid) text     : md5(string_agg(leaf_id||':'||animal_origin::text ORDER BY leaf_id))
-- trg on bom_structures (I/U/D) and nomenclature(animal_origin, is_deleted): set diet_needs_check=true
--   on every ancestor dish (recursive UP, as fn_cascade_bom_nutrition_on_item does)
-- fn_confirm_dish_diets(dish_id, reviewer) : writes dietary tag links, stores hash, clears flag
-- public view change: join tags only WHERE NOT diet_needs_check  (verify with the anon KEY, not SQL)
-- audit: scripts / canary query comparing fn_dish_diet_hash to diet_basis_hash
-- backfill: classify ~141 food leaves in ONE reviewed batch; no dish tagged until its leaves are done
```
Safe alongside mig 500 (touches tags/nomenclature columns, not sections). New views/tables in public are born
anon-writable: REVOKE and verify.

## 4. Questions for the CEO (nobody else decides these)

1. **Scope.** Diets only (plant-based / vegetarian / vegan), or fold allergens and the Seafood filter into
   the same ingredient classification? Allergens already work; seafood would reuse the new fish/shellfish values.
2. **What "AI" means.** Recommended: rules cover the obvious, the agent (offline, stored) proposes the
   ambiguous, a human confirms; never a model per page view. Is that acceptable, and does honey count as
   animal-derived for "plant-based"?
3. **A flagged dish on the site.** Recommended: suppress its diet badge and filter membership until reviewed
   (a stale diet claim is a wrong promise to a guest). Or keep the old tag visible?
4. **Where review happens.** An admin queue of flagged dishes, a badge on the dish card, or both?

Open dependency: the 52 unreviewed allergen leaves and 4 soft-deleted RAW in live BOMs must be cleaned
first or the first backfill will report most dishes as not confident (MC 572c53b1 owns the allergen half).
