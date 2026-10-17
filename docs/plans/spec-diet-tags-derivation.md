# Spec (DRAFT, not built): diet tags derived from ingredients + "check tags" mark

Status: design only. No migration written, nothing tagged, nothing applied. SOCRATIC-GATE.
CEO answers so far (2026-10-17): Q1 = one ingredient review, two outputs (diets get own columns; allergens and Seafood read the same review),
Q2 = hybrid (rules + model for ambiguous + human confirms), Q3 = hide diet tags from guests while a dish is flagged,
Q4 = badge on the dish row + one queue view. All four decided; next step is the build (needs its own PR and a claimed migration number).
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
a dish tag is then pure deterministic set logic over classified leaves. Compute once, store in the DB,
never call a model while rendering a page.

1. **Ingredient fact.** One classification per RAW from a closed vocabulary of animal origin: meat, fish,
   shellfish, dairy, egg, honey, other_animal (gelatin, rennet, fish extract, carmine...), plus
   `diet_state` (unknown | proposed | confirmed), `diet_reviewed_at/by`, `diet_evidence`
   (label, supplier spec, chef). An empty set means "plant" ONLY when state = confirmed.
2. **Dish status.** `fn_dish_diet_status(dish_id)`, same walk as `fn_dish_allergen_status`, same
   {diets, confident, unreviewed_items} shape. plant-based = no animal origin on any food leaf (honey counts as
   animal, per the CEO's original brief); vegetarian = no meat/fish/shellfish/other_animal (honey and dairy
   allowed). confident requires ingredients > 0, every leaf confirmed, no soft-deleted leaf.
3. **Published value.** One store: `nomenclature_tags` (tag_group 'dietary', slug `plant-based`; the site contract
   already reads it). On the dish: `diet_basis_hash`, `diet_reviewed_at`, `diet_needs_check boolean`.
4. **What invalidates.** The hash of the sorted (leaf id, classification) set at review time. Quantity, yield,
   packaging and note edits do NOT change it, so they never raise a flag; adding/removing an ingredient,
   editing a sub-recipe, reclassifying a RAW or soft-deleting one does. Triggers (modelled on
   `trg_cascade_bom_nutrition_on_bom/_on_item`, walking UP to every ancestor dish) keep the stored boolean fresh,
   because publication cannot compute the hash live (anon 3s timeout). A nightly/CI audit recomputes the hash
   and fails if any dish disagrees with its boolean: triggers are the speed path, the hash is the proof.
5. **Guest view (CEO Q3: hide).** The public view exposes dietary tags only for dishes with
   `NOT diet_needs_check`. A flagged dish keeps selling; its diet badge and its membership in the Plant-based
   filter disappear until a human confirms. Allergens are a separate, already-gated path and are not touched.
6. **customer_ingredients.** Same drift, same trigger path, MC 1dce3c7e. One mechanism can flag both, but
   ship diets first; deriving the ingredient text is a separate display problem.

### 2a. Q1 evidence: does the allergen confidence model fit diets?

The walk and the shape fit. The confidence column does NOT. `allergen_reviewed_at` asserts "this
ingredient's ALLERGEN set is known". RAW-CHICKEN-BREAST is reviewed with an empty allergen set, so reusing that
column would read chicken as clean. Diets need their own assertion (`diet_state`). Recommendation: extend the
pattern, the walk and the function family, but give diets their own ledger columns; make the review a
single action per ingredient that sets both (one label read answers allergens AND animal origin). That costs
one review per ingredient instead of two mechanisms side by side.

### 2b. Hybrid escalation rules (CEO Q2)

Rules, free and re-runnable, never use the model:
- R1 allergen-tag implication: a leaf tagged allergen-dairy / eggs / fish / shellfish gets dairy / egg / fish /
  shellfish. Deterministic.
- R2 category-to-origin, only for categories that cannot lie: F-PRO-RED (meat), F-PRO-SEA (fish or shellfish by
  tag), F-PRO-EGG, F-DAI-CHZ and F-DAI-YGT (dairy); plain-produce categories (fruit, frozen fruit, herbs,
  vegetables, dry spices, nuts, seeds, rice, legumes, salt, coffee, water) propose "plant" ONLY when the item
  is not composite (no sauce/paste/mix/syrup/seasoned/protein/bread/wrap in the name, and no unreviewed
  allergen tag).
- R3 honey (name or supplier category) = honey, by definition.
- R4 packaging (NF-%), PF and SALE rows are never classified directly; they roll up.
- R5 a confirmed value is never overwritten; a re-run only touches unknown/proposed rows, and an ingredient
  whose name, brand or supplier changed goes back to unknown.

Escalates to the model (offline, in-session, a proposal only): leaves that no rule resolves. Concretely the
categories that mislead (F-DAI-MLK holds coconut and almond milk, F-DAI-OIL, F-PRO-PLT holds chicken,
F-PRO-VEG) and composite items: bread/wraps, sauces and pastes, syrups, pickles, wakame salad, truffle
sauce, supplements, the six bought-in chocolates. Input: name, brand, supplier_catalog row, purchase history,
any stored label text. Output: proposed origin set + evidence + `needs_label` when it cannot ground the answer.
The model may not output "plant" without evidence, and absence of evidence yields unknown, which blocks the
dish from being confident. Never decides alone: every model output lands as `proposed`, a human confirms.
Estimate on today's 141 leaves: about 100 resolved by R2 plant, about 20 by R1/R2 animal, about 20-40 escalated,
once; afterwards only new RAW items.

## 3. Consequence of hiding, and who owns it (CEO Q3)

A dish whose composition just changed silently loses its vegan / plant-based label on shishka.health until
someone clears the flag. The review queue is therefore not housekeeping: it is what stops correct dishes
from looking unlabelled. How often: 26 of 81 live dishes (own or sub-recipe) received a new BOM line in the
last 30 days and 51 in 90 days. That is an UPPER bound (it includes initial builds of new dishes, and the
hash ignores quantity edits and re-created lines for the same ingredient), but plan for roughly one dish in
four to three per month needing a look.
Duration and owner (recommendation, part of Q4): the person or agent who changes the recipe proposes the new
tags in the same session and a human confirms with one click; a flag open longer than 48 h is escalated to the
chef agent's daily list. Unflagged, unconfirmed dishes (all of them at launch) simply have no diet tag.

## 4. Migration sketch (NOT a migration; number via claim_migration_number at write time)

```sql
ALTER TABLE nomenclature
  ADD COLUMN animal_origin text[],            -- NULL = unknown; '{}' = plant, valid only when confirmed
  ADD COLUMN diet_state text NOT NULL DEFAULT 'unknown',  -- unknown | proposed | confirmed
  ADD COLUMN diet_reviewed_at timestamptz, ADD COLUMN diet_reviewed_by text, ADD COLUMN diet_evidence text,
  ADD COLUMN diet_basis_hash text,            -- dishes only
  ADD COLUMN diet_needs_check boolean NOT NULL DEFAULT true;  -- dishes only
-- fn_dish_diet_status(uuid) jsonb, fn_dish_diet_hash(uuid) text (md5 of sorted leaf_id:animal_origin)
-- fn_propose_ingredient_diets(): applies R1-R5, writes proposed only, returns the escalation list
-- triggers on bom_structures (I/U/D) and nomenclature(animal_origin, is_deleted) -> ancestors diet_needs_check=true
-- fn_confirm_dish_diets(dish_id, reviewer): writes dietary tag links, stores hash, clears flag
-- v_diet_review_queue: flagged dishes + why (changed leaf) for the admin
-- public view: dietary tags only WHERE NOT diet_needs_check (verify with the anon KEY, not SQL)
-- REVOKE on every new view/table in public (born anon-writable); canary query for hash vs boolean
```
Safe alongside mig 500 (columns on nomenclature, not sections).

## 5. Decisions (all four answered by the CEO, 2026-10-17)

1. **Scope:** one ingredient review, two outputs. Diets own their columns (section 2a); the allergen function is
   unchanged; Seafood reads the same fish/shellfish values, and its exclusion filter becomes safe once the 52
   unreviewed leaves are confirmed.
2. **AI:** hybrid, rules in section 2b.
3. **Flagged dish:** diet tags hidden from guests (section 3).
4. **Review:** "needs check" badge on the dish row in the existing admin menu table plus one queue/filter view,
   no separate page.

Open dependency: the 52 allergen-unreviewed leaves and 4 soft-deleted RAW in live BOMs must be cleaned first
or the first backfill reports most dishes as not confident (MC 572c53b1 owns the allergen half).
