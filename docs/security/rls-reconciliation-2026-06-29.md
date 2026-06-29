# RLS Audit Reconciliation — 2026-06-29

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 3.1 (`c36c3210`)
> Supersedes the stale **2026-04-12** audit (`docs/security/rls-audit-report.md`, `287f3cee`).
> Method: live `pg_policies` / `pg_class` / `pg_proc` queries on prod (`qcqgtcsjoacuktcewpvo`)
> cross-checked against the Phase 0.3 advisor baseline.

## TL;DR — the 2026-04-12 audit is largely DONE

The original audit pre-dates ~215 migrations. Reconciliation against live schema shows **all 6
CRITICAL findings are already fixed** and most HIGH ones too. The real remaining work is a
**smaller, different** set of gaps (mostly anon **writes** + internal **cost** reads), plus the
design decision of how to gate the Telegram-WebApp (TWA) + public-menu anon surface.

### Helper functions (verified live)

- `fn_is_authenticated()` = `SELECT auth.role() = 'authenticated'` — **real**, blocks anon. The 30
  "SAFE" tables in the old audit are genuinely protected. (Migration 245's "no-op" remark meant it
  does not *owner*-gate, i.e. any authenticated user passes — that is the column-level concern in
  Phase 3.4, not a broken function.)
- `fn_is_owner()` = `EXISTS(staff WHERE auth_user_id = auth.uid() AND app_role='owner' AND is_active)`
  — `SECURITY DEFINER`, `search_path=public`. This is the gate for owner-only RPCs (Phase 4.3).

## Audit item-by-item reconciliation

| # | Table | 2026-04 finding | Live state 2026-06-29 | Fixed by |
|---|---|---|---|---|
| 1 | business_tasks | RLS DISABLED | **RLS enabled**, no anon policy | mig 109 + 110 |
| 2 | business_initiatives | RLS DISABLED | **RLS enabled**, no anon policy | mig 109 + 110 |
| 3 | receipt_inbox | anon CRUD `USING(true)` | **not in anon-open set** | mig 109 |
| 4 | sprints | anon ALL `USING(true)` | **not in anon-open set** | mig 109 |
| 5 | task_comments | anon ALL `USING(true)` | **not in anon-open set** | mig 109 |
| 6 | cook_feedback | anon ALL `USING(true)` | **anon INSERT-only** (read+write split) | mig 109 |
| 7 | staff | anon SELECT PII | **not in anon-open set** | mig 109 + 141 |
| 9 | recipes_flow | anon SELECT IP | **not in anon-open set** | mig 109 |
| 15 | migration_log | anon SELECT | still anon SELECT (low value, schema version only) | — (accept) |
| 8,10-14 | production_orders, equipment_maintenance, shifts, shift_tasks, equipment_slots, warnings | anon SELECT | **still anon SELECT** — but these are **TWA cook-screen reads** (see below) | design |

> No public **base table** has RLS disabled (live `pg_class.relrowsecurity` check returned empty).
> `business_tasks`/`business_initiatives` — the delicate MC tables — are **enabled and working**
> (MC reads/writes fine; mig 110 swapped `app.is_admin` → `fn_is_authenticated()` after 109).

## The anon surface is largely BY DESIGN — two intentional consumers

1. **Public menu / visitor site** reads through `menu_public` + other **SECURITY DEFINER views**,
   which run as owner and **bypass RLS** — so they do *not* require anon policies on the underlying
   raw tables. Anon SELECT on `nomenclature` (SALE only), `product_categories`, `tags`, `price_tiers`,
   `site_content`, `nomenclature_images`, the `*modifier*` tables, `dish_card` etc. supports any
   *direct* anon reads the site/app still does.
2. **Telegram WebApp (TWA)** cook screens authenticate via `app.tg_user_id`, **not** Supabase Auth —
   so they hit tables as `anon`. This is why `production_*`, `shifts`, `shift_tasks`, `staff_tasks`,
   `staff_task_assignees`, `stocktake_entries`, `warnings`, `equipment_*`, `haccp_logs` carry anon
   policies. **Revoking these naively breaks the cook screens** — hence Phase 4.2 ("TWA gating") is a
   deliberate, separate, design-led step, not a blanket revoke.

## Genuine CURRENT gaps (authoritative — from live query)

### A. Anon WRITE that exceeds "submit-only" (highest concern)

| Table | Policy | Problem | Proposed fix |
|---|---|---|---|
| `recipe_feedback` | `recipe_feedback_write` anon+auth **ALL** `USING(true)` | anon can **UPDATE/DELETE any row** | anon **INSERT-only** + authenticated full (mirror mig-109 cook_feedback) |
| `production_log` | `prodlog_update_anon` anon **UPDATE** `USING(true)` | anon can **mutate any production record** | drop anon UPDATE; keep anon INSERT + SELECT (TWA logs, doesn't edit arbitrary rows) ⚠ verify no cook "edit status" path in 3.2 |
| `haccp_logs` | `haccp_logs_insert` public **INSERT** `WITH CHECK(true)` | anon can forge HACCP compliance rows | ⚠ TWA verification needed — likely keep INSERT (cook logging) but confirm |
| `waste_entries` | `waste_entries_insert` public **INSERT** `WITH CHECK(true)` | anon can insert waste rows | ⚠ TWA verification needed |

### B. Anon READ of internal COST data (IP leak, no public-site need)

| Table | Policy | Note |
|---|---|---|
| `modifier_option_cost` | `mod_opt_cost_anon_read` anon SELECT `true` | **cost**, not price — public menu shows price via definer view; raw cost has no anon need |
| `modifier_option_overrides` | `mod_opt_override_anon_read` anon SELECT `true` | internal cost overrides |
| `modifier_sync_state` | `mod_sync_state_read` anon+auth SELECT `true` | internal Loyverse sync state |

> Gating B behind `fn_is_authenticated()` is **low-risk IF** the public menu reads only via the
> SECURITY DEFINER views (which bypass RLS). **Phase 3.2 must confirm no direct anon-key frontend
> query** hits these raw tables before Phase 4 applies.

### C. Accept-as-designed (document, do not "fix")

`migration_log` (schema version), `public_holidays`, `staff_schedule_templates`, and all menu/TWA
reads in the "by design" section — unless Phase 3.2 finds a sensitive column. `staff_tasks` /
`staff_task_assignees` anon SELECT is worth a second look (assignee names) under Phase 4.2.

## Migration (re)numbering

- Old `109_rls_audit_fixes.sql` is **applied** (`migration_log.mig109_registered = 1`). Do not touch.
- Live `max(migration_log)` = **325**; folder max = 325; no `326+` exists. **Next free number = 326.**
- Prepared **`326_rls_reconciliation_fixes.sql`** (this PR) closes the highest-confidence gaps from
  §A/§B. **It is NOT applied** — apply is Phase 4.1/4.2, **CEO-gated**. Phase 4.4 re-runs
  `get_advisors` to confirm the `rls_policy_always_true` count drops.

## Hand-off

- **Phase 3.2 (`abe792de`)**: grep the admin-panel + TWA/edge code for **direct anon-key reads** of
  the §B cost tables and the §A write tables → confirms which fixes in 326 are safe to apply.
- **Phase 3.4 (`b91be681`)**: `fn_is_authenticated()` is not owner-gating → payroll/comp + price/amount/
  quantity need column-level RPC design.
- **Phase 4.1/4.2 (CEO-gated)**: apply 326 (+ TWA gating) after 3.2 verification.
