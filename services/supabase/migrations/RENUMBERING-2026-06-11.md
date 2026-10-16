# Migration Renumbering — 2026-06-11

> MC Task: 7e4f0f9c-d148-4c58-b5a3-8ee8b02534ec
> Audit: fable-project-audit-2026-06-11

37 migration files shared a numeric prefix with another file (32 colliding
numbers), because parallel branches merged without renumbering. All files were
already applied to prod — this was a repo-only rename; prod schema untouched.

**Rename rule:** per colliding number the earliest-applied file kept its name.
Each later duplicate moved to `<anchor><letter>_` where anchor = numeric prefix
of the latest-applied file (that kept its name) applied strictly before it, so
lexicographic replay order matches the order migrations actually hit prod.
Letter-suffix precedent: `067a_extend_tag_group_enum.sql`.

`267_renumber_collision_log_sync.sql` renames the 32 matching `migration_log`
rows. The 5 files marked *unlogged* never self-registered (tracked separately
in the log↔repo reconciliation task).

**Never reuse gap numbers** (e.g. 225-229, 251-252, 265-266): they belong to
migrations applied to prod from branches not yet merged. The pre-commit guard
(`scripts/migration-canary.sh --check-numbering`) enforces: no duplicate
numbers, new migrations strictly above HEAD max.

| Old | New | migration_log row |
|---|---|---|
| `081_backfill_sku_barcodes.sql` | `081a_backfill_sku_barcodes.sql` | renamed by 267 |
| `083_backfill_barcodes_from_raw_parse.sql` | `083a_backfill_barcodes_from_raw_parse.sql` | renamed by 267 |
| `092_receipt_inbox_delete_policy.sql` | `092a_receipt_inbox_delete_policy.sql` | renamed by 267 |
| `128_data_health_infra.sql` | `128a_data_health_infra.sql` | renamed by 267 |
| `130_approve_receipt_v13.sql` | `134a_approve_receipt_v13.sql` | renamed by 267 |
| `140_writeback_kds_anon_rls.sql` | `140a_writeback_kds_anon_rls.sql` | renamed by 267 |
| `142_fix_conversion_factor_cost.sql` | `142a_fix_conversion_factor_cost.sql` | unlogged |
| `148_production_log.sql` | `148a_production_log.sql` | renamed by 267 |
| `158_data_health_product_code_hygiene.sql` | `168a_data_health_product_code_hygiene.sql` | unlogged |
| `163_categorize_40_new_sale_items.sql` | `165a_categorize_40_new_sale_items.sql` | renamed by 267 |
| `164_data_health_equipment_missing_specs.sql` | `165b_data_health_equipment_missing_specs.sql` | renamed by 267 |
| `165_data_health_new_metrics.sql` | `165c_data_health_new_metrics.sql` | renamed by 267 |
| `165_learning_metrics.sql` | `166a_learning_metrics.sql` | renamed by 267 |
| `166_learning_counters_atomic_apply.sql` | `166b_learning_counters_atomic_apply.sql` | renamed by 267 |
| `167_salad_bar_aliases_and_notes.sql` | `167a_salad_bar_aliases_and_notes.sql` | renamed by 267 |
| `168_hr_payroll_foundation.sql` | `170a_hr_payroll_foundation.sql` | renamed by 267 |
| `169_hr_payroll_rpcs.sql` | `171a_hr_payroll_rpcs.sql` | renamed by 267 |
| `176_hr_add_helper_role_nono.sql` | `177a_hr_add_helper_role_nono.sql` | renamed by 267 |
| `197_fix_supplier_catalog_sugar_linkage.sql` | `198a_fix_supplier_catalog_sugar_linkage.sql` | unlogged |
| `198_add_goat_cheese_villa_market.sql` | `200a_add_goat_cheese_villa_market.sql` | renamed by 267 |
| `199_fix_cream_cheese_zaatar_shiitake.sql` | `200b_fix_cream_cheese_zaatar_shiitake.sql` | renamed by 267 |
| `214_add_external_url_to_supplier_catalog.sql` | `216a_add_external_url_to_supplier_catalog.sql` | renamed by 267 |
| `214_wac_recalc_on_purchase_update.sql` | `215a_wac_recalc_on_purchase_update.sql` | renamed by 267 |
| `218_drop_brain_lightrag_legacy.sql` | `217a_drop_brain_lightrag_legacy.sql` | unlogged |
| `218_salad_bar_slots.sql` | `219a_salad_bar_slots.sql` | renamed by 267 |
| `221_seed_raw_cost_from_catalog.sql` | `244e_seed_raw_cost_from_catalog.sql` | renamed by 267 |
| `236_add_loyverse_synced_at.sql` | `244c_add_loyverse_synced_at.sql` | renamed by 267 |
| `236_v_dish_assembly_components_drinks_raw.sql` | `236a_v_dish_assembly_components_drinks_raw.sql` | renamed by 267 |
| `237_loyverse_sync_dish_allow_resync.sql` | `244d_loyverse_sync_dish_allow_resync.sql` | renamed by 267 |
| `237_modifier_mirror_rls_read.sql` | `243a_modifier_mirror_rls_read.sql` | renamed by 267 |
| `238_modifier_option_price_override.sql` | `244a_modifier_option_price_override.sql` | renamed by 267 |
| `239_modifier_sync_state.sql` | `244b_modifier_sync_state.sql` | renamed by 267 |
| `246_stock_request_status.sql` | `247a_stock_request_status.sql` | renamed by 267 |
| `247_stock_sheet_filters.sql` | `247b_stock_sheet_filters.sql` | renamed by 267 |
| `249_v_dish_modifier_options_nutrition.sql` | `250a_v_dish_modifier_options_nutrition.sql` | renamed by 267 |
| `250_nutrition_rollup_food_only.sql` | `253a_nutrition_rollup_food_only.sql` | renamed by 267 |
| `255_visitor_site_public_menu.sql` | `250b_visitor_site_public_menu.sql` | unlogged |

---

## Addendum — 2026-06-14 (duplicate 273/274/275)

> Branch: `feature/db/renumber-273-275`
> Migration: `282_renumber_273_275_collision_log_sync.sql`

Three more colliding prefixes appeared after parallel branches merged the
Loyverse-poller and staff-task-tracker work — the pre-commit canary
(`migration-canary.sh --check-numbering`) flagged duplicate 273/274/275 and
forced `--no-verify` on unrelated commits. All six files were already applied
to prod. Same rule as above: the file whose `migration_log` row already carries
the colliding number keeps its name; the other moves to `<anchor><letter>_`
where anchor = the latest kept-name migration applied strictly before it
(by `applied_at`).

The two staff-tracker files had been applied to prod under their **original**
branch numbers (`267_`/`268_`) before the repo bumped them to `273_`/`274_`, so
their `migration_log` rows still read `267_`/`268_`; migration 282 reconciles
those stale rows straight to the new `272a_`/`276a_` names.

Kept (row already matched repo name): `273_recipes_flow_location.sql`,
`274_loyverse_receipt_enrichment.sql`, `275_loyverse_entities_and_poll_state.sql`.

| Old (repo) | New | migration_log row | log UPDATE by 282 |
|---|---|---|---|
| `273_fix_fn_link_telegram_ambiguous.sql` | `272a_fix_fn_link_telegram_ambiguous.sql` | applied as `267_fix_fn_link_telegram_ambiguous.sql` | `267_…` → `272a_…` |
| `274_staff_tasks_cron.sql` | `276a_staff_tasks_cron.sql` | applied as `268_staff_tasks_cron.sql` | `268_…` → `276a_…` |
| `275_staff_app_role_task_manager.sql` | `279a_staff_app_role_task_manager.sql` | `275_staff_app_role_task_manager.sql` | `275_…` → `279a_…` |

Note: `280`/`281` are **not free** — `280_dip_serving_modifiers_and_hide_variants.sql`
and `281_dip_bread_choice_default_bun.sql` are applied to prod from an unmerged
branch. Hence the log-sync migration takes the next clear number, `282`.

---

## Addendum — 2026-10-16 (duplicate 463/465/466)

> Branch: `fix/menu/allergen-tag-backfill`
> Migration: `472_renumber_463_465_466_collision_log_sync.sql`

Three more colliding prefixes appeared within about half an hour of each other
when four sessions applied migrations to prod in parallel and merged without
renumbering. All six files were already applied; this is a repo + log rename,
prod schema untouched. Same rule as above: earliest-applied keeps its name, each
later duplicate moves to `<anchor><letter>_` where anchor = the numeric prefix
of the latest kept-name migration applied strictly before it (by `applied_at`).

Applied order on 2026-10-16 (UTC), keepers marked `*`:

```
12:45:47 * 463_ru_translations_catch_up_wraps
12:49:40 * 464_menu_translations_owner_rights_freshness
12:50:33 * 460_purchase_logs_historical_repair
13:05:00 * 465_pack_factor_normalization
13:10:27 * 466_tomato_paste_pack_factor
13:11:03   466_retire_potato_tacos               -> 466a
13:14:25   463_analytics_views_s1                -> 466b
13:15:38 * 467_unlink_stale_taco_loyverse_pointer
13:17:58   465_ru_hero_no_harm_moves_to_subline  -> 467a
13:37:53 * 468_count_class_clear_stubs_and_deleted
15:19:10 * 469_allergen_tag_backfill
```

| Old | New | migration_log row |
|---|---|---|
| `466_retire_potato_tacos.sql` | `466a_retire_potato_tacos.sql` | renamed by 472 |
| `463_analytics_views_s1.sql` | `466b_analytics_views_s1.sql` | renamed by 472 |
| `465_ru_hero_no_harm_moves_to_subline.sql` | `467a_ru_hero_no_harm_moves_to_subline.sql` | renamed by 472 |

`470` and `471` are **not free** — `470_th_ingredients_part2.sql` and
`471_ru_new_allergen_tags_and_worklist_drops_dish_names.sql` are applied to prod
from an unmerged branch. Hence the log-sync migration takes `472`.

### This is the third time, and the cause is still unaddressed

2026-06-11 renamed 37 files, 2026-06-14 another three, and this round another
three — all from the same thing: a number is chosen as "max + 1 at the moment I
look", which cannot hold when several sessions apply migrations in the same
minute. While *this* addendum was being written, prod's `migration_log` already
accumulated further same-number pairs at 466, 467, 468 and 469 from branches not
yet merged; they are not in the repo, so they are out of scope here and will
collide again on merge.

A renumbering pass cleans up after the problem; it does not prevent the next
one. The durable fix is an allocation mechanism — reserving the number at the
moment a migration is first applied, so two sessions cannot be handed the same
one.

---

## Addendum — 2026-10-16 evening: the cause is now addressed

> MC task: `c520decf-8ea1-45a8-b3dc-c55240ede544`
> Migration: `483_migration_number_allocator.sql`
> Spec: `docs/plans/spec-migration-number-allocator.md`
> Rule: `docs/constitution/technical-rules.md` § RULE-MIGRATION-NUMBERING

The section above ends: *"A renumbering pass cleans up after the problem; it does
not prevent the next one. The durable fix is an allocation mechanism."* That
mechanism now exists.

### What happened in the hours after the third pass

The third pass (mig `472`) landed at 15:27. Before the evening was out the race
fired **four more times**, twice inside a cleanup:

| Time | Event |
|---|---|
| 15:37 | `473_analytics_hourly_heat_weekly.sql` applied |
| 15:39 | `479_renumber_th_migrations_log_sync.sql` renumbers the five TH migrations `466-471` → `473-478`, assigning **473** to `dish_names` — two minutes after 473 was taken. **Four collisions resolved, a fifth created.** |
| 15:43 | `480_retire_rice_paper_rolls.sql` applied, while `480_cost_trust_views.sql` already held 480 (it had just been renumbered there out of a 469 collision) |
| 15:51 | `481_unlink_stale_manakish_loyverse_pointers.sql` applied |
| ~15:55 | This allocator migration, written as `481`, finds 481 **and** 482 taken while it is being tested. Applied as `483`. |

The lesson is not that the cleanups were careless. It is that **the repair path
used the same rule as the thing it was repairing** — "max + 1 at the moment I
look" — and that rule is racy no matter who runs it.

### The four collisions this round was asked to resolve

`466`, `467`, `468`, `469` (nine files, five unmerged) were all resolved during
2026-10-16 by the owning sessions, which renumbered forward rather than by letter
suffix because their files were unmerged:

| Was | Became | By |
|---|---|---|
| `466_dish_names_stay_english_in_every_language.sql` | `473a_…` | mig 479 (+ a later fix off 473) |
| `467_th_translations_labels.sql` | `474_…` | mig 479 |
| `468_th_descriptions_and_allergen_clauses.sql` | `475_…` | mig 479 |
| `469_th_ingredients_part1.sql` | `476_…` | mig 479 |
| `469_cost_trust_views.sql` | `482_…` | owning session |

`466`, `467`, `468`, `469` keep the files that were already on `main`. **Nothing
is outstanding from that set.**

### State at the time of writing

- **Actionable collisions: zero.** `SELECT * FROM v_migration_collisions WHERE NOT is_pre_guard` → 0 rows.
- **File tree: clean.** `migration-canary.sh --check-numbering` → OK, 439 files, HEAD max 482.
- **50 frozen log-only duplicates** remain in `migration_log` (latest 2026-10-04,
  mostly the `400`-`418` band). These are branches whose files were renamed in the
  repo *without* a `migration_log.filename` UPDATE — the log↔repo reconciliation
  debt this document has noted since the first pass. They are flagged
  `is_pre_guard = true` and **block nothing**: the canary reads the file *tree*,
  not the log, and the tree has no duplicates. Reconciling them is cosmetic and
  out of scope; they are now at least visible in one query.

### The standing rule from here

1. **New migration** → claim the number, never choose it:
   `claim_migration_number(slug, session_id)` (MC MCP tool), or
   `scripts/migration-number.sh claim <slug>`.
2. **Repairing an already-applied duplicate** → still a letter suffix anchored by
   apply order, exactly as the three passes above did it — but claim the letter
   too, so two sessions repairing at once cannot both take `469a`:
   `scripts/migration-number.sh letter <anchor> <slug>`. Ship the
   `migration_log.filename` UPDATE in the same branch as the rename.
3. **Gap numbers are still never reused.** `migration_numbers` rows are never
   deleted, so an abandoned claim burns its number permanently. The rule is now
   structural rather than remembered.
4. **A fourth bulk pass should not be necessary.**
   `trg_migration_log_guard_number` rejects a duplicate prefix on
   `INSERT OR UPDATE OF filename`, so prod cannot accept the second file at all.
   A session that picks by eye now fails at *apply* time, with one file to
   rename — instead of at *merge* time, with the whole repo blocked. If a row
   ever appears with `is_pre_guard = false`, the trigger was disabled; that is
   the only way back into this state.
