# RPC grants inventory — step 1 (read-only)

> MC task: `f133850a-9f54-4e71-82dc-4ed5db276ada`
> Epic: Database reliability & ops (Supabase)
> Project: `qcqgtcsjoacuktcewpvo` · Date: 2026-10-17
> Before-state dump: `docs/audits/2026-10-17-rpc-grants-before.csv`
>
> **Nothing in production was changed to produce this document.**

---

## 1. Baseline — what is in `public` today

354 functions (`prokind='f'`), of which **164 are extension-owned** and **190 are ours**.

| Extension | Functions in `public` | anon EXECUTE |
|---|---:|---:|
| `vector` (pgvector) | 114 (+4 aggregates) | all |
| `pg_trgm` | 31 | all |
| `http` | 19 | all |

Our 190 functions:

| Metric | Count |
|---|---:|
| `SECURITY DEFINER` | 130 |
| `SECURITY DEFINER` **and** anon EXECUTE | **109** ← matches the advisor |
| …of those, non-trigger (reachable over REST) | 87 |
| anon EXECUTE (any security mode) | 169 |
| `authenticated` EXECUTE | 181 |
| trigger functions | 55 |
| **no fixed `search_path`** | **126** ← matches the advisor |
| `search_path` set but without `pg_temp` | 63 |

The advisor's two headline numbers (109 / 126) reproduce exactly.

---

## 2. Allowlist from code

Grepped `.rpc('…')` across `apps/admin-panel`, `apps/web`, `services/supabase/functions`,
`services/mcp-*`, `services/print-bridge`, `scripts`, plus the `shishka-health` and
`shishka-health-staging` repos.

### 2.1 `anon` — **empty**

| Surface | Supabase usage |
|---|---|
| `shishka-health` (the live site, repo that builds shishka.health) | `menu_public`, `menu_modifiers`, `nomenclature_tags`, `price_tiers`, `site_content` — **tables/views only, zero `.rpc(`** |
| `shishka-health-staging` | same four, zero `.rpc(` |
| `apps/web` (OS repo) | `v_public_menu` only, zero `.rpc(` |

The public site reads views. It calls no function. **No `anon` grant is required by any code we ship.**

One stale comment suggested otherwise: `apps/admin-panel/src/hooks/useStockSheet.ts:24` says
`fn_submit_stock_sheet` is "passcode-gated, anon". It is not — `/count/:code` sits behind
`RoleGuard minRole="cook"` (`apps/admin-panel/src/App.tsx:184`), so that call is `authenticated`.
The comment should be corrected in the same PR.

### 2.2 `authenticated` — 51 functions

The admin panel, the KDS and the staff TWA (team.shishka.health) are **one React app** behind
Supabase Auth, so everything it calls is `authenticated`. 50 come from `apps/admin-panel/src`,
plus `fn_explode_bom` from the server-side chef API route
(`apps/admin-panel/api/chef/_tools.ts`, which uses `supabaseForUser(jwt)` = anon key + user JWT
→ resolves to `authenticated`).

```
fn_apply_stocktake              fn_import_supplier_catalog      fn_set_dish_price
fn_apply_stocktake_session      fn_materialize_recurring_tasks  fn_set_expense_amount
fn_approve_pack_decision        fn_open_stocktake_session       fn_set_staff_pin
fn_approve_payroll              fn_pending_deliveries           fn_staff_login_status
fn_approve_po                   fn_pf_pack_card_save            fn_staff_pin_reveal
fn_approve_receipt_with_learning fn_receive_goods               fn_start_production_task
fn_archive_purchase_order       fn_record_stocktake_line        fn_submit_stock_sheet
fn_assign_staff_to_schedule     fn_record_supplier_quote        fn_suggest_catalog_matches
fn_calculate_payroll            fn_route_stocktake_session      fn_sync_holiday_credits
fn_cancel_stocktake_session     fn_save_syrve_mapping           fn_sync_inbox_status
fn_check_expense_duplicate      fn_seed_shopping_list_from_menu fn_thaw_batch
fn_clock                        fn_seed_shopping_list_low_stock fn_update_po
fn_create_batches_from_task     fn_set_canonical_cost           fn_upsert_syrve_config
fn_create_purchase_order        fn_dish_allergens               get_channel_margins
fn_delete_inbox_row             fn_dish_card_save               fn_explode_bom
fn_delete_purchase_order        fn_dish_scorecard
fn_delete_stocktake_line        fn_generate_daily_schedule
fn_get_my_role                  fn_get_syrve_config
```

All 51 exist in production. One has two overloads: `fn_create_batches_from_task` —
the app calls the **3-arg** form `(p_task_id, p_containers, p_produced_by)`
(`apps/admin-panel/src/pages/MyTasks.tsx:235`). Only that signature gets the grant.

### 2.3 `service_role` — not touched

Edge functions (8, all on `SERVICE_ROLE_KEY`), cron jobs and the MCP servers call:

```
fn_claim_migration_number  fn_ingest_loyverse_receipt        fn_next_order_code
fn_get_loyverse_config     fn_link_telegram                  fn_refresh_dish_modifier_groups
fn_loyverse_sync_dish      fn_migration_number_high_water    fn_refresh_loyverse_modifier_mirror
fn_resolve_supplier        fn_upsert_loyverse_shift          pack_info_sweep_candidates
fn_approve_receipt_with_learning  fn_import_supplier_catalog  fn_upsert_syrve_config
fn_get_syrve_config        fn_apply_stocktake
```

`service_role` bypasses these grants entirely; no change needed.

---

## 3. Code vs. logs — 7 days of `/rest/v1/rpc/`

`edge_logs`, 2026-10-10 08:00Z → 2026-10-17 08:00Z, role resolved from
`request.sb.jwt.*.payload.role`, falling back to the API-key prefix.

| Function | `service_role` (`sb_secret_…`) | `authenticated` | `anon` |
|---|---:|---:|---:|
| `fn_upsert_loyverse_shift` | 35 334 | – | 0 |
| `fn_get_loyverse_config` | 840 | – | 0 |
| `fn_ingest_loyverse_receipt` | 651 | – | 0 |
| `fn_get_my_role` | – | 73 | 0 |
| `get_channel_margins` | – | 23 | 0 |
| `fn_dish_scorecard` | – | 9 | 0 |
| `fn_dish_allergens` | – | 8 | 0 |
| `fn_upsert_loyverse_employee` | 8 | – | 0 |
| `fn_loyverse_sync_dish` | 4 | – | 0 |
| `fn_materialize_recurring_tasks` | – | 3 | 0 |

**Zero `anon` RPC calls in seven days.** Discrepancy vs. the task brief: the brief listed
`fn_get_my_role`, `fn_get_loyverse_config`, `get_channel_margins`, `fn_dish_scorecard` and
`fn_dish_allergens` as "really called by anon over REST". They are called — but
`fn_get_loyverse_config` is `service_role` (edge functions) and the other four are
`authenticated` (the admin panel). None is anon.

The admin panel's traffic is light, so the logs under-report it badly (6 functions in 7 days
against 51 in the code). The code grep, not the log, is the authority for the
`authenticated` list; the log is only authority for the **absence** of anon.

---

## 4. Secret exposure check — `fn_get_loyverse_config`

**Not a blocker.** It is `SECURITY DEFINER` and returns the whole table —
`SELECT jsonb_object_agg(key, value) FROM loyverse_config` — but the table holds no secret:

| Table | Keys | Secret? |
|---|---|---|
| `loyverse_config` | `base_url`, `store_id` | no |
| `syrve_config` | `base_url`, `vat_rate`, + 4 empty-string keys | no |

The Loyverse API token lives in edge-function secrets, not in the database.

**The write side is the problem.** `fn_upsert_loyverse_config(p_key, p_value)` and
`fn_upsert_syrve_config(p_key, p_value)` are `SECURITY DEFINER` with EXECUTE to `anon`, and
contain no role check. Anyone holding the publishable key (it ships in the site's JS) can
repoint `loyverse_config.base_url` at a host they control, and the cron-driven Loyverse sync
will follow it. That is an anon write to integration config.

---

## 5. Findings outside the advisor's 109

### 5.1 `http` extension is anon-executable — the worst item found

The `http` extension is installed **in `public`**, which PostgREST exposes. All 19 functions
(`http_get`, `http_post`, `http_put`, `http_delete`, `http_patch`, `http_head`, `http`,
`http_set_curlopt`, …) carry EXECUTE for `anon` and `authenticated`.

They are **not** `SECURITY DEFINER`, which is exactly why the advisor's 109 missed them.
`anon` can make the database issue arbitrary outbound HTTP requests and read the response —
an SSRF primitive originating inside Supabase's network, reachable with the public key.

In-house users of `http_*`: `fn_staff_tasks_push` and four cron jobs
(`loyverse-pull-receipts`, `loyverse-pull-shifts`, `loyverse-pull-dim`,
`loyverse-push-drain`). All run as `postgres`/cron, so revoking from `anon` and
`authenticated` breaks nothing.

`net.*` (pg_net, 12 functions) is likewise anon-executable, but `net` is not in PostgREST's
exposed schemas, so it is not reachable over REST. Lower priority; worth tidying.

### 5.2 `set_request_context` — latent privilege escalation

`set_request_context(p_tg_user_id bigint, p_is_admin boolean)` is `SECURITY DEFINER`, anon
EXECUTE, no role check, and sets `app.is_admin`. Seven RLS policies trust exactly that
setting:

| Table | Policies |
|---|---|
| `warnings` | `Admin can view warnings`, `Admin can update warnings` |
| `maintenance_logs` | `Admin can manage maintenance_logs`, `Authenticated users can view maintenance_logs` |
| `production_tasks` | `Cooks can update own or unclaimed tasks`, `Authenticated users can view all tasks` |
| `equipment` | `Authenticated users can view equipment` |

**Not exploitable over REST today**: the function uses `set_config(..., is_local := true)`, and
PostgREST runs each request in its own transaction, so the setting does not survive to a
second request. The hole needs both calls inside one request. Still, an anon-callable
"make me admin" switch has no reason to exist — revoking it closes the class of bug rather
than relying on PostgREST's transaction boundary holding forever.

### 5.3 Scope note for the blanket REVOKE

`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public` would also strip pgvector's 114 and
pg_trgm's 31 operator/support functions. Those are pure computation with no security
meaning, and stripping them silently breaks any `%`/`<=>` query or index path a client
uses. The migration therefore revokes **per function, excluding extension-owned ones**
(`pg_depend.deptype = 'e'`), and handles the `http` extension explicitly.

Same reasoning for `ALTER FUNCTION … SET search_path`: extension-owned functions must not be
altered — it breaks `pg_dump`/extension upgrade. 126 of **our** functions need the fix.

---

## 6. Proposed migration shape (for approval — not yet written)

1. `REVOKE EXECUTE … FROM anon, authenticated` on each of our 190 `public` functions,
   generated from `pg_proc` with `pg_get_function_identity_arguments` so overloads are exact.
2. `REVOKE EXECUTE` on the 19 `http` extension functions from `anon, authenticated`
   (explicit, named — the extension itself is left installed and `postgres`/cron keep access).
3. `ALTER DEFAULT PRIVILEGES` revoking EXECUTE from `anon, authenticated` for every role
   that currently appears in `pg_default_acl` for `public`, plus `postgres` and the
   migration owner.
4. `GRANT EXECUTE` to `authenticated` on the 51 allowlisted functions, each with a comment
   naming the caller. **No `GRANT` to `anon` at all.**
5. `ALTER FUNCTION … SET search_path = public, pg_temp` for the 126 of our functions that
   lack it, and add `pg_temp` to the 63 that set `search_path` without it.
   `fn_provision_cook_auth` keeps `auth` in its path; `rls_auto_enable` keeps `pg_catalog`.
6. `COMMENT ON FUNCTION` for each allowlisted function: `rpc: authenticated — <caller>`.
7. No `DROP`. No function body changed. Trigger functions keep their definitions and get
   only the `search_path` fix (they need no EXECUTE grant — triggers run as the table owner).

Expected advisor delta: `anon_security_definer_function_executable` 109 → 0,
`function_search_path_mutable` 126 → 0.

### Open question for the CEO

`authenticated` is a single flat tier — any signed-in cook can call `fn_calculate_payroll`,
`fn_approve_payroll` or `fn_staff_pin_reveal`, because role separation is enforced in the UI
(`RoleGuard`), not at the database. This migration does **not** change that; it only removes
`anon`. Closing the owner/manager/cook gap at the DB level is a separate, larger piece of
work (it needs `fn_has_app_role` guards inside ~20 function bodies, which this task forbids).
Worth its own task.

---

## 7. Verification plan (step 3, after approval)

1. Apply on a Supabase branch; dump after-state to
   `docs/audits/2026-10-17-rpc-grants-after.csv`; attach the diff.
2. Smoke on the branch:
   - public site — `menu_public`, `menu_modifiers`, `nomenclature_tags`, `price_tiers`,
     `site_content` read with the **publishable key** (not SQL — per the
     "invoker fn inside a DEFINER view" trap, SQL as owner proves nothing about anon);
   - admin — `fn_get_my_role`, `get_channel_margins`, `fn_dish_scorecard`,
     `fn_dish_allergens`, `fn_clock`, `fn_staff_login_status`, plus the top stocktake and
     procurement calls, each with a real user JWT;
   - edge Loyverse — `fn_get_loyverse_config`, `fn_upsert_loyverse_shift`,
     `fn_ingest_loyverse_receipt` under `service_role`;
   - negative test — `http_get('http://example.com')` as `anon` must fail;
     `set_request_context(1, true)` as `anon` must fail.
3. `get_advisors(security)` before/after.
4. Manual `pg_dump` before the prod apply (MC `4405c6e9` is still open — there are no backups).
5. Prod apply in the quiet hour (after 23:00 Phuket), then repeat the smoke on prod.
