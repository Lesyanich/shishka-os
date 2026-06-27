# Pre-merge modifier validation — LIVE RESULTS

**Branch:** `claude/shishka-product-tab-close-co2tme`
**Run against:** production `qcqgtcsjoacuktcewpvo` (live `execute_sql`)
**Date:** 2026-06-27
**Verdict:** ✅ SAFE TO MERGE — modifiers remain correct on the site, in the Loyverse mirror, and clean in the DB.

## 1. Why this branch cannot break modifiers (structural proof)

`git diff origin/main...HEAD` touches 9 files (UI + one new read hook). Verified:

- **Zero DB writes** — no `.insert/.update/.delete/.upsert/.rpc` anywhere in `apps/web`.
- **Zero migrations** — no files under `services/supabase/migrations/` changed.
- New hook `usePublicModifiers.ts` only does `.from('menu_modifiers').select(...)` (read-only).

A branch that never writes to modifier tables and never alters their schema cannot regress modifier data. The live checks below capture the unchanged production state.

## 2. Live validation suite — 15/18 PASS, 3 explained flags

| Check | Value | Result |
|---|---|---|
| menu_modifiers total rows | 344 | ✅ PASS |
| menu_modifiers dishes with mods | 26 | ✅ PASS |
| menu_modifiers blank option names | 0 | ✅ PASS |
| menu_modifiers negative delta | 11 | ⚠️ flag → false positive (see §3) |
| menu_modifiers min>max groups | 0 | ✅ PASS |
| dish_modifier_groups total | 95 | ✅ PASS |
| dish_modifier_groups orphaned dish | 0 | ✅ PASS |
| dish_modifier_groups orphaned list | 33 | ⚠️ flag → mirror-sync gap (see §4) |
| dish_modifier_groups min>max | 0 | ✅ PASS |
| nmo total options | 352 | ✅ PASS |
| nmo orphaned dish ref | 0 | ✅ PASS |
| nmo orphaned modifier ref | 0 | ✅ PASS |
| nmo negative price delta | 11 | ⚠️ flag → false positive (see §3) |
| loyverse total options | 66 | ✅ PASS |
| loyverse orphaned options | 0 | ✅ PASS |
| loyverse total lists | 15 | ✅ PASS |
| coverage — modifier dishes | 26 | ✅ PASS |
| coverage — mods for hidden dish | 0 | ✅ PASS |

**Site correctness:** the view the site reads (`menu_modifiers`) returns 344 clean rows across 26 dishes — no blanks, no min>max, no modifiers leaking onto hidden dishes.
**DB source-of-truth clean:** `nomenclature_modifier_options` (352) has zero orphaned dish/modifier refs.
**Loyverse mirror consistent:** 66 options, zero orphaned, across 15 lists.

## 3. Flag: 11 "negative price_delta" — FALSE POSITIVE (legitimate discounts)

The validation rule treats `price_delta < 0` as suspect. The 11 rows are all valid
cheaper-substitution discounts, confirmed by querying the actual rows:

- Smoothies → **"Water"** instead of milk base: −30 / −20 ฿
- Smoothies → **"Swap to Oat / Coconut / Cow Milk"**: −10 ฿

These are correct menu pricing, not corruption. (Same 11 rows are counted by both
the `menu_modifiers` and `nmo` checks.)

## 4. Flag: 33 "orphaned list" in dish_modifier_groups — pre-existing mirror gap, no site impact

`dish_modifier_groups.loyverse_modifier_list_id` values that have no matching row in the
read-only `pos_loyverse_modifier_lists` mirror (the mirror holds 15 lists; dishes reference more).

This does **not** affect the customer site: the `menu_modifiers` view (migration 261, line 29)
reads `nomenclature_modifier_options` → JOIN `nomenclature` → LEFT JOIN `dish_modifier_groups`.
**It never joins `pos_loyverse_modifier_lists`.** Group min/max comes straight from
`dish_modifier_groups`, which is clean (0 orphaned dish, 0 min>max).

It is also not introduced by this branch (zero DB writes). It is a pre-existing completeness
gap in the Loyverse mirror sync, logged here for follow-up but **not a merge blocker**.

## Conclusion

The merge changes UI only and touches no modifier data or schema. Live production checks
confirm the modifier chain is correct on the site, internally consistent in the Loyverse
mirror, and clean in the source-of-truth DB tables. **Safe to merge.**
