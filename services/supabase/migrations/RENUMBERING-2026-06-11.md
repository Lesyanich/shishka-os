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
