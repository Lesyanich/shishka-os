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
  not the log, and the tree has no duplicates. Reconciling them was out of scope
  here; the addendum below does it as far as it can be done, and accounts for
  what is left.

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

---

## Addendum — 2026-10-16b (log↔repo reconciliation, the 50 collision rows)

> MC `c520decf` (parent epic)
> Branch: `fix/db/reconcile-migration-log-repo-drift`
> Migration: `487_reconcile_migration_log_repo_drift.sql` — number **claimed** via
> `fn_claim_migration_number()`, the mechanism 483 introduced.

483 fixed the *cause* (atomic allocation + an apply-time guard) and deliberately
left the accumulated debt alone. This addendum closes the part of that debt that
can be closed, and says precisely why the rest cannot.

### What drift actually was

`v_migration_collisions` reported **50** duplicate prefixes, all
`is_pre_guard = true`. The number 50 is prefixes, not rows: comparing prod's
`migration_log` against the file tree at `origin/main` (e3676546) found **145**
log rows naming a file that is not in the repo, and **13** repo files with no log
row. Only where those two sets meet on the same slug is there a rename to undo.
They meet in exactly **12** places, plus one file that was applied but never
self-registered. Migration 487 fixes those 13 and nothing else.

### Reconciled by 487 — matched on slug, never on number

| migration_log row (applied as) | → repo file (shipped as) | cleared a duplicate? |
|---|---|---|
| `221_staff_codes.sql` | `244f_staff_codes.sql` | yes — 221 |
| `222_loyverse_sync_dish_staff_code.sql` | `244g_loyverse_sync_dish_staff_code.sql` | yes — 222 |
| `236_staff_schedule_templates.sql` | `244h_staff_schedule_templates.sql` | yes — 236 |
| `245_shopping_list.sql` | `244i_shopping_list.sql` | no — 245 still has two rows |
| `249_barada_chocolate_catalog.sql` | `248a_barada_chocolate_catalog.sql` | yes — 249 |
| `225_orders_customer_channel.sql` | `224a_orders_customer_channel.sql` | no — 225 was never duplicated |
| `226_public_menu_view.sql` | `224b_public_menu_view.sql` | no |
| `227_order_code_and_status.sql` | `224c_order_code_and_status.sql` | no |
| `321_matcha_drink_section.sql` | `360_matcha_drink_section.sql` | yes — 321 |
| `322_fix_chocolate_section_and_drinks_order.sql` | `361_fix_chocolate_section_and_drinks_order.sql` | yes — 322 |
| `338_thai_tea_category.sql` | `358_thai_tea_category.sql` | no |
| `339_thai_tea_modifiers_and_price.sql` | `359_thai_tea_modifiers_and_price.sql` | no |

Plus one **INSERT**, not a rename:
`397_public_holidays_and_substitute_credits.sql` is in `main` and its objects are
in prod — `holiday_credits`, `v_holiday_credit_balance`, `fn_sync_holiday_credits`
and `public_holidays.is_company_closed` were all verified present before the
backfill — but its self-register row never landed, so `check_migrations()` called
it *pending* and a re-run would have been attempted. Prefix 397 was free.

487 also inserts the 13 matching `migration_numbers` rows. 483 seeded that
registry from `migration_log` as it then stood, so without this step
`v_migration_number_map` would call 358-361 and 397 **gap** — i.e. reusable —
when prod has in fact run them.

**Result: `v_migration_collisions` 50 → 44. `check_migrations()` loses 13 of its
phantom rows.**

### The 44 that remain are not drift

Every remaining duplicate is a number burned in prod by a file that is **not in
the repo**, in one of two ways, and in neither case is renaming the log row the
right move:

* **On an unmerged branch.** The file exists, on a branch still awaiting CEO
  merge. Renaming its log row now would *desync* that branch: its file would then
  disagree with the log it already wrote. Renumbering belongs to the session that
  merges it — file and log row together, in one commit. This is the standing rule
  from the 2026-06-11 addendum; it has simply not been applied yet because the
  branches have not landed.
* **On no git ref at all.** 17 files were applied to prod and never committed
  anywhere (`git log --all --diff-filter=A` finds nothing). There is no filename
  to point the row at. The row is the only surviving evidence that prod ran that
  SQL, so it stays. Deleting it would make prod *less* described, not more.

Verified against every remote ref fetched on 2026-10-16:

| # | migration_log rows at that number | where each file is | why it stays |
|---|---|---|---|
| 142 | 2 | `142_multilingual_aliases` repo<br>`142_fix_nutrition_olive_oil_coconut_milk` **no ref** | `142_fix_nutrition_olive_oil_coconut_milk` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 143 | 2 | `143_auto_conversion_factor` repo<br>`143_fix_nutrition_bulk_per_unit` **no ref** | `143_fix_nutrition_bulk_per_unit` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 144 | 2 | `144_bom_nutrition_rollup` **no ref**<br>`144_flavor_arch_tags` repo | `144_bom_nutrition_rollup` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 145 | 2 | `145_nomenclature_images_usage_gdrive` **no ref**<br>`145_bom_composition_slots` repo | `145_nomenclature_images_usage_gdrive` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 146 | 2 | `146_backfill_image_url_from_primary` **no ref**<br>`146_pumpkin_crunch_split` repo | `146_backfill_image_url_from_primary` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 147 | 2 | `147_backfill_sku_barcodes_round2` **no ref**<br>`147_dish_scorecard` repo | `147_backfill_sku_barcodes_round2` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 148 | 2 | `148_sku_identifiers` **no ref**<br>`148_manaish_category` repo | `148_sku_identifiers` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 174 | 2 | `174_staff_user_management` **no ref**<br>`174_financial_dashboard` repo | `174_staff_user_management` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 175 | 2 | `175_access_audit_log` **no ref**<br>`175_loyverse_integration` repo | `175_access_audit_log` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 176 | 2 | `176_staff_pin_rpc` **no ref**<br>`176_approve_receipt_v15_always_purchase_logs` repo | `176_staff_pin_rpc` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 201 | 2 | `201_channel_pricing` repo<br>`201_expense_ledger_period` **no ref** | `201_expense_ledger_period` is on **no git ref** — applied, never committed; nothing to rename it to. |
| 245 | 2 | `245_menu_tables_anon_write_lockdown` `claude/eager-turing-4UEaR`<br>`245_stock_order_sheet` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 250 | 2 | `250_manakish_bundles` `feature/menu/manakish-bundles`<br>`250_vanilla_protein_syrups_coming_soon` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 253 | 2 | `253_buildyourown_from_price` `feature/menu/manakish-bundles`<br>`253_menu_public_modifiers_stock_state` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 255 | 2 | `255_price_tiers` `feature/menu/manakish-bundles`<br>`255_menu_public_surface_coming_soon` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 256 | 2 | `256_bundle_from_price_from_tiers` `feature/menu/manakish-bundles`<br>`256_menu_public_security_definer_fix` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 258 | 2 | `258_menu_public_section_fields` repo<br>`258_bundle_pool_subtree` `feature/menu/manakish-bundles` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 259 | 2 | `259_bundle_labels` `feature/menu/manakish-bundles`<br>`259_menu_modifiers_expose_min_select` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 260 | 2 | `260_bundle_sauce_labels` `feature/menu/manakish-bundles`<br>`260_modifier_group_max_select` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 309 | 2 | `309_staff_task_comment` repo<br>`309_staff_tasks_monthly_recurrence` `feature/admin/staff-tasks-monthly-recurrence` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 310 | 2 | `310_shift_clock_events` repo<br>`310_equipment_maintenance_link` `feature/admin/staff-tasks-monthly-recurrence` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 334 | 3 | `334_pantry_label_tag` `claude/amazing-villani-e24e5f`<br>`334_column_rls_owner_rpcs` `feature/cleanup/column-rls-rpcs`<br>`334_loyverse_push_queue` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 335 | 2 | `335_pantry_clean_label_names` `claude/amazing-villani-e24e5f`<br>`335_loyverse_push_queue_delete_action` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 375 | 2 | `375_shifts_freeze_past_and_audit` `fix/admin/leg004-audit-blockers`<br>`375_potato_tacos_vege_meat_restructure` **no ref** | `375_potato_tacos_vege_meat_restructure` is on **no git ref** — applied, never committed; nothing to rename it to. The other is on an unmerged branch. |
| 390 | 2 | `390_mango_canonicalization_and_peanut_removal` `feature/menu/mango-sauce-allergens`<br>`390_rls_role_gating_mc_tables` repo | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 400 | 3 | `400_small_salads_section` `feature/menu/small-salads-section`<br>`400_coffee_milk_modifiers` `feature/menu/coffee-milk-modifiers`<br>`400_menu_section_order_wraps_bowls_salads` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 401 | 3 | `401_mini_salads_rename` `feature/menu/small-salads-section`<br>`401_flavour_syrups_all_made_drinks` `feature/menu/coffee-milk-modifiers`<br>`401_rename_protein_chicken_tawook` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 402 | 2 | `402_board_price_alignment` **no ref**<br>`402_organize_wraps_display_order` `feature/menu/section-reorder-wraps-bowls-salads` | `402_board_price_alignment` is on **no git ref** — applied, never committed; nothing to rename it to. The other is on an unmerged branch. |
| 403 | 2 | `403_retire_shrimp_taco` **no ref**<br>`403_update_sauces_to_6_core` `feature/menu/section-reorder-wraps-bowls-salads` | `403_retire_shrimp_taco` is on **no git ref** — applied, never committed; nothing to rename it to. The other is on an unmerged branch. |
| 404 | 2 | `404_retire_peanut_lime_sauce` `feature/marketing/restaurant-posters`<br>`404_add_mayonnaise_soy_sauce` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 405 | 2 | `405_clear_stale_peanut_pos_link` `feature/marketing/restaurant-posters`<br>`405_correct_sauces_6_core` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 406 | 2 | `406_drink_temperature_modifier` `feature/menu/drink-temperature-modifier`<br>`406_consolidate_wraps_to_tortilla` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 407 | 2 | `407_espresso_double_shot` `feature/menu/espresso-double-shot`<br>`407_reorder_wraps_final` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 408 | 2 | `408_mind_kombucha` `feature/menu/mind-kombucha`<br>`408_add_section_hero_images` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 409 | 2 | `409_menu_four_category_concept` `feature/menu/four-category-concept`<br>`409_set_section_hero_images` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 410 | 2 | `410_menu_breakfast_subsections` `feature/menu/four-category-concept`<br>`410_consolidate_sauces_dressings_dips` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 411 | 2 | `411_menu_copy_and_allergens` `feature/menu/four-category-concept`<br>`411_rename_bread_crackers_to_extras` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 412 | 2 | `412_tabbouleh_is_a_salad` `feature/menu/four-category-concept`<br>`412_rename_tortilla_to_whole_wheat_wraps` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 413 | 2 | `413_bowls_are_not_cups` `feature/menu/four-category-concept`<br>`413_organize_sauces_dressings_dips_3_lines` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 414 | 2 | `414_spring_rolls_are_rice_paper_wraps` `feature/menu/four-category-concept`<br>`414_move_rule_to_end_normal_font` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 415 | 2 | `415_toasts_one_slice_and_cheaper` `feature/menu/four-category-concept`<br>`415_rename_protein_chicken_to_wrap` `feature/menu/section-reorder-wraps-bowls-salads` | all duplicates sit on unmerged branches — renumbering is the merging session's job. |
| 416 | 2 | `416_salads_bowls_wraps_renamed_and_cut` **no ref**<br>`416_remove_muhammara_move_hummus` `feature/menu/section-reorder-wraps-bowls-salads` | `416_salads_bowls_wraps_renamed_and_cut` is on **no git ref** — applied, never committed; nothing to rename it to. The other is on an unmerged branch. |
| 417 | 2 | `417_ingredient_cost_corrections` **no ref**<br>`417_fix_web_visibility_sauces_muhammara_name` `feature/menu/section-reorder-wraps-bowls-salads` | `417_ingredient_cost_corrections` is on **no git ref** — applied, never committed; nothing to rename it to. The other is on an unmerged branch. |
| 418 | 2 | `418_tropical_mango_bowl_clean_recipe` **no ref**<br>`418_set_sauce_photos_from_provided_images` `feature/menu/section-reorder-wraps-bowls-salads` | `418_tropical_mango_bowl_clean_recipe` is on **no git ref** — applied, never committed; nothing to rename it to. The other is on an unmerged branch. |

### What a session must do when one of those branches merges

Renumber the **file and the `migration_log` row in the same commit**. The file
alone recreates exactly the drift this addendum just cleaned up; the row alone
breaks the canary. `trg_migration_log_guard_number` now rejects an UPDATE into a
taken prefix, so a wrong target fails loudly at apply time instead of silently.
Claim the new number with `fn_claim_migration_letter(<anchor>, …)` — never pick
one by looking.

### Not closed here

* **`check_migrations()` (the MCP tool) is broken for an unrelated reason** — it
  resolves the migrations directory to `/services/supabase/migrations`, an
  absolute path, and fails `ENOENT` before reading anything. Its repo-root env
  var is unset in the launcher. Logged separately; 487 does not touch it.
* **132 log rows still name no file**, down from 145. Beyond the 44 collision
  groups above these are single (non-duplicate) rows from the same two causes —
  mostly the uncommitted 2026-04 and 2026-06 manual batches and the unmerged
  419-445 menu block. They are noise in `check_migrations()`, not a correctness
  problem, and they resolve as their branches merge.
