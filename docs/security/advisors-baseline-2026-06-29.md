# Supabase Advisors Baseline — 2026-06-29

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 0.3 (`f8e1359d`)
> Tool: `supabase get_advisors` (project `qcqgtcsjoacuktcewpvo`, Postgres 17.6)
> This is the **DB-level lint baseline** that complements the hand-written RLS audit
> (`docs/security/rls-audit-report.md`, `287f3cee`) and seeds Phase 3 (Security Audit).
> **Snapshot only — no DB changes.** All fixes are CEO-gated (Phase 4).

## Headline counts

| Advisor | Total | ERROR | WARN | INFO |
|---|---|---|---|---|
| **Security** | 365 | **22** | 327 | 16 |
| **Performance** | 298 | 0 | 154 | 144 |

> GOAL-CHECK criterion "get_advisors 0 critical / 0 high" maps to **0 ERROR + 0 security-WARN**.
> Current state is **22 ERROR + 327 WARN** → criterion is **far from met** and its remediation is
> **Phase 4 (CEO-gated apply)**. This snapshot is the "before" reference for that fix.

## Security findings by rule

| Count | Level | Rule | Meaning / disposition |
|---|---|---|---|
| 22 | ERROR | `security_definer_view` | Views run as owner, bypassing caller RLS. **Mixed**: some intentional (anon menu), some likely accidental. **Reconcile in Phase 3.1.** |
| 119 | WARN | `function_search_path_mutable` | Functions without a pinned `search_path`. Hardening item (set `search_path = ''`). Phase 3.3 / 4. |
| 86 | WARN | `authenticated_security_definer_function_executable` | SECURITY DEFINER funcs executable by `authenticated`. Review per-function in Phase 3.3. |
| 85 | WARN | `anon_security_definer_function_executable` | …executable by `anon` — **higher concern** (public repo, anon key shipped). Phase 3.3. |
| 29 | WARN | `rls_policy_always_true` | Policies `USING (true)` → **flat RLS** (any authenticated user reads/writes). **The core gap.** Phase 3.4 / 4. |
| 16 | INFO | `rls_enabled_no_policy` | RLS on, zero policies → deny-all to non-service-role (safe, but several are backup/junk tables → Phase 5). |
| 4 | WARN | `extension_in_public` | `http`, `pg_net`, `pg_trgm`, `vector` in `public`. Low severity, common. |
| 3 | WARN | `public_bucket_allows_listing` | Buckets `nomenclature-photos`, `receipts`, `task-photos` allow anon listing. **`receipts`/`task-photos` listing may leak operational data** — flag for Phase 4. |
| 1 | WARN | `auth_leaked_password_protection` | HaveIBeenPwned check disabled (auth uses PIN model — low relevance). |

### 22 ERROR views (`security_definer_view`)

```
menu_modifiers, menu_public*, v_dangling_bom, v_data_health, v_data_health_items,
v_data_health_items_legacy, v_data_health_summary, v_dish_assembly_components,
v_dish_cost_split, v_dish_modifier_options, v_dish_packaging, v_dish_tier_prices,
v_equipment_hourly_cost, v_equipment_maintenance_schedule, v_inventory_by_nomenclature,
v_learning_metrics, v_loyverse_sync_status, v_modifier_drift, v_public_menu*,
v_staff_access_last, v_stock_latest, v_stock_status
```

`*` = **intentional** anon-facing menu views — per the known gotcha, anon views *require*
SECURITY DEFINER to serve the public site (`menu_public`, `v_public_menu`). Do **not** "fix"
these blindly. Phase 3.1 must split this list into **(a) intentional anon** vs **(b) internal
admin views that should drop SECURITY DEFINER** (e.g. the `v_data_health_*`, `v_dish_*`,
`v_equipment_*` operational views — these likely should run with caller RLS, not owner).

### 26 tables with `rls_policy_always_true` (flat RLS — `USING (true)`)

```
brain_inbox, cook_feedback, dish_card, dish_modifier_groups, equipment_maintenance,
haccp_logs, leave_balances, modifier_option_cost, modifier_option_overrides,
modifier_sync_state, nomenclature_modifier_options, payroll_lines, payroll_periods,
pf_pack_card, production_log, production_orders, recipe_feedback, site_content,
staff_attendance, staff_task_assignees, staff_task_dead_letter, staff_tasks,
staff_telegram, stocktake_entries, telegram_link_codes, waste_entries
```

⚠ **`payroll_lines`, `payroll_periods`, `leave_balances`, `staff_attendance`** readable by *any*
authenticated staff is a privacy gap (HR/comp data). These pair with the column-level RLS work in
Phase 3.4 / 4.3 (price/amount/quantity → gated RPC). Confirm against the RLS audit report.

### 16 `rls_enabled_no_policy` — includes junk/backup tables

`nomenclature_rename_backup_20260417`, `nomenclature_rename_backup_311dc7fe_...` →
**data garbage**, candidates to DROP in Phase 5 (data-health). Others (`syrve_*`, `order_code_counters`,
`supplier_aliases`) are deny-all-safe but should get explicit service-role-only policies for clarity.

## Performance findings by rule (informational — not in epic scope, logged for completeness)

| Count | Level | Rule |
|---|---|---|
| 111 | WARN | `multiple_permissive_policies` (consolidate overlapping RLS policies — also a perf cost of flat RLS) |
| 76 | INFO | `unused_index` |
| 66 | INFO | `unindexed_foreign_keys` |
| 42 | WARN | `auth_rls_initplan` (wrap `auth.*()` in `(select …)` to avoid per-row re-eval) |
| 2 | INFO | `no_primary_key` |
| 1 | WARN | `duplicate_index` |

Perf items are **out of this epic's scope** (§6 of spec) but `auth_rls_initplan` +
`multiple_permissive_policies` will partly resolve as a side effect of the Phase 4 RLS rewrite.

## Hand-off

- **Phase 3.1 (`c36c3210`)**: reconcile the 22 ERROR views (intentional anon vs internal) + the
  26 flat-RLS tables against `rls-audit-report.md`; (re)number the fix migration off live `migration_log`.
- **Phase 3.3 (`c081de36`)**: triage the 85 anon- + 86 authenticated-executable SECURITY DEFINER funcs.
- **Phase 3.4 (`b91be681`)**: column-level gaps — payroll/comp tables + price/amount/quantity → RPC.
- **Phase 4 (`86f69daa`)**: apply (CEO-gated). **Phase 4.4 re-runs this advisor to prove 0 ERROR.**
- **Phase 5 (`26f8a912`)**: drop `nomenclature_rename_backup_*` junk tables.
