# Rescue quarantine

Files here were rescued from uncommitted WIP on the stale branch
`feature/admin/prep-label-printing` (last commit 2026-06-14, 581 commits behind
main). They are **quarantined**, NOT active:

## `228_salad_bar_portion_scoops.sql.bak`
- Original path: `services/supabase/migrations/228_...sql`. **Deliberately renamed
  `.bak` and moved out of `migrations/`** so it is NOT applied and does NOT trip
  the pre-commit numbering guard (main is already at migration 387; number 228 is
  long taken).
- Adds `portion_grams` + `portion_tool` to `salad_bar_slots` ("1 scoop = 1 portion").
- **Do NOT apply as-is.** Checked 2026-07-22 against the live DB (`qcqgtcsjoacuktcewpvo`):
  `salad_bar_slots.portion_grams` and `.portion_tool` **already exist** — the effect is
  already applied (main gained salad-bar commits since June). So this migration is very
  likely obsolete/duplicate; kept only for provenance. Chef to confirm and discard if
  nothing else in it is missing. Tracked in MC (chef domain).
