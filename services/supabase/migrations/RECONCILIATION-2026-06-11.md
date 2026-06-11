# Migration Log ↔ Repo Reconciliation — 2026-06-11

> MC Task: 835eb489-a0c8-42a4-94fe-2fb57be4dc73
> Follow-up to: RENUMBERING-2026-06-11.md (MC 7e4f0f9c, PR #331)

Audit found 42 migration_log rows without a file on main and 14 repo files
without a log row. Resolution below; log changes shipped in
`268_reconcile_migration_log.sql`.

## A. Log rows without a file on main (42)

### In-flight feature branches — no action, will arrive with their PRs (33)

| Branch | Migrations |
|---|---|
| `feature/kds/pwa-mvp` | 120, 121, 122 |
| `feature/kds/auth-hardening` | 141, 142_fix_nutrition_olive_oil_coconut_milk, 143_fix_nutrition_bulk_per_unit, 145_nomenclature_images_usage_gdrive, 146_backfill_image_url_from_primary, 147_backfill_sku_barcodes_round2, 148_sku_identifiers |
| `feature/admin/receipt-ocr-fixes` | 111 |
| `feature/admin/user-management-ui` | 174_staff_user_management, 175_access_audit_log, 176_staff_pin_rpc |
| `claude/goofy-shirley-68b4d6` | 201_expense_ledger_period |
| `feature/menu/staff-codes` | 221_staff_codes, 222_loyverse_sync_dish_staff_code |
| `feature/web/qr-menu-ordering-mvp` / `feature/menu/manakish-bundles` | 225, 226, 227 |
| `claude/priceless-bartik-e1d25d` | 229 |
| `feature/admin/monthly-schedule-generator` | 236_staff_schedule_templates |
| `claude/eager-turing-4UEaR` | 245_menu_tables_anon_write_lockdown |
| `feature/admin/shopping-list` | 245_shopping_list |
| `feature/menu/barada-chocolate-import` | 249_barada_chocolate_catalog |
| `feature/menu/manakish-bundles` | 250-253 bundles set, 255_price_tiers, 256_bundle_from_price_from_tiers, 258_bundle_pool_subtree, 259_bundle_labels, 260_bundle_sauce_labels |

**These branches will trip the numbering guard at merge** (their numbers are
below HEAD max or collide). Procedure: rename file to a letter-suffix slot +
ship a `migration_log.filename` UPDATE (precedent: this doc + RENUMBERING doc).

### Recovered into main by this task (4 + 1 rename)

| Log row (old) | Now | Source |
|---|---|---|
| `263_packaging_display_fixes.sql` | `262a_packaging_display_fixes.sql` | local branch `claude/elegant-poincare-9331ce` (commit 571bbb9) |
| `264_staff_task_tracker.sql` | `264a_staff_task_tracker.sql` | uncommitted worktree `compassionate-zhukovsky-7fff3e` |
| `265_telegram_link_codes.sql` | `264b_telegram_link_codes.sql` | same worktree |
| `266_staff_tasks_reminder_sent.sql` | `264c_staff_tasks_reminder_sent.sql` | same worktree |
| `107_brain_quality_tests_seed.sql` | repo file `105_…` renamed to `107_…` | file was renamed before apply, repo copy never updated |

### Lost forever — tombstoned in migration_log (3)

`110_fix_business_tasks_rls_policy.sql`, `144_bom_nutrition_rollup.sql`,
`228_salad_bar_portion_scoops.sql` — applied from sessions that never
committed the file. Effects remain live in prod; a fresh replay will skip
these steps. Marked with TOMBSTONE notes in migration_log.

## B. Repo files without a log row (14)

| File | Resolution |
|---|---|
| 099, 108, 142a, 143, 168a, 174_financial_dashboard, 178, 191, 198a, 206, 207, 250b | **Backfilled** in 268 (applied_at = git date; object-level verification where possible — see notes in migration_log) |
| `105_brain_quality_tests_seed.sql` | **Renamed** to `107_…` to match its actual log row |
| `217a_drop_brain_lightrag_legacy.sql` | Was genuinely PENDING. **Re-scoped and APPLIED 2026-06-11** after CEO rule "drop unused, keep used": dropped `brain_quality_tests` + `brain_gaps` view + LIGHTRAG_* remnants; **kept** `brain_query_log` (still read by admin `/api-cost` legacy section — see apiCost.ts) and `brain_inbox`. |

## Replay caveat

Even after reconciliation, a fresh replay of main is **best-effort**: 33
applied migrations still live only in unmerged branches, and 3 are tombstoned
(lost). Full replay parity is reached only when the in-flight branches merge.
