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

> **CORRECTION, 2026-10-17 (step 4, MC `16ad5772`).** That caller list is wrong — there are
> **zero** in-house callers. The detector regex `\mhttp_(get|post)\M` also matches the
> `http_post` inside `net.http_post`, because `.` is a word boundary. All five named here
> were already on `pg_net`. See § 4 below; the corrected detector is in migration 501.

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

---

# Step 2 — migration 490, and what writing it changed

CEO approved the allowlist on 2026-10-17 (anon empty, authenticated 51). Writing the
migration turned up four things the inventory had not reached. Three changed the SQL; one
changed the allowlist by four functions.

## 2.1 The prescribed revoke would have done nothing

165 of our 190 functions carry a grant to **PUBLIC** — `{=X/postgres,…}` in `proacl`.
`anon` and `authenticated` inherit EXECUTE through it, so
`REVOKE EXECUTE … FROM anon, authenticated` leaves every one of them callable. The revoke
has to name `PUBLIC`.

The same applies to default privileges. PostgreSQL grants EXECUTE on every new function to
`PUBLIC` as a built-in default, and that default does not appear in `pg_default_acl` at
all — so revoking the two named roles there would also have left the hole open for every
function created afterwards.

## 2.2 Four more functions must keep EXECUTE, or the admin panel dies

These are not RPCs. They are evaluated **inside RLS policies**, under the caller's
privileges — revoke EXECUTE and the tables stop returning zero rows and start raising
`permission denied for function`.

| Function | Evaluated by | Policies |
|---|---|---:|
| `fn_is_authenticated()` | RLS on ~58 tables | 58 |
| `fn_get_my_role()` | RLS on 8 HR tables (also a real RPC, already allowlisted) | 21 |
| `fn_is_owner()` | RLS on 10 tables | 10 |
| `fn_has_app_role(text[])` | RLS on 6 tables | 9 |
| `fn_active_menu_ingredient_ids()` | the `security_invoker` view `v_stock_sheet_items` | — |

Allowlist for `authenticated` is therefore **55**: the approved 51 plus these 4
(`fn_get_my_role` was already among the 51).

**This does not reopen the anon question.** All five are granted to `authenticated` only.
`price_tiers` is the one base table the live site reads that carries an
`fn_is_authenticated()` policy, and `EXPLAIN` as `anon` shows a bare `Seq Scan` with no
filter: the policy is `true OR fn_is_authenticated()`, the planner constant-folds it, and
the function is never executed. Confirmed again by the dry run below.

## 2.3 The http extension cannot be closed from a migration — measured

`postgres` is not a superuser and `pg_has_role(postgres, supabase_admin, MEMBER)` is
false. The `http` grants were made by `supabase_admin`, and only the grantor may revoke.
The dry run left `http_still_open_to_anon = 19`.

Section C of the migration attempts the revoke anyway and raises a WARNING naming the gap,
so the apply log states plainly that the hole is still open. Escalated as MC `16ad5772`
(critical) with three routes to close it; the preferred one is moving
`fn_staff_tasks_push` and the four Loyverse cron jobs onto `pg_net`, then having support
drop the extension.

## 2.4 Verification — transactional dry run against production

A Supabase branch was considered and rejected: a branch replays the repo's migration
history, and this schema is known to drift from it, so a branch would not reproduce the
ACLs the migration acts on. Instead the whole migration ran against **production** inside
a transaction that rolled back, which exercises the real ACLs and the real policies.

End state inside the transaction:

| Check | Result |
|---|---|
| our functions executable by `anon` | **0** |
| our functions executable by `authenticated` | **55** |
| our functions that lost `service_role` | **0** |
| our functions with a mutable `search_path` | **0** |
| `http` functions still executable by `anon` | **19** (see 2.3) |
| extension rows touched | **0** |

Role-scoped reads, before the change and after it inside the same transaction:

| Role | Counts | Before | After |
|---|---|---|---|
| `anon` | menu_public / menu_modifiers / nomenclature_tags / price_tiers / site_content / v_public_menu | 81 / 436 / 942 / 3 / 4 / 134 | **identical** |
| `authenticated` | price_tiers / business_tasks / staff / production_tasks / v_stock_sheet_items | 3 / 0 / 0 / 0 / 25 | **identical** |

The zeros are pre-existing: `SET LOCAL ROLE` carries no JWT, so `auth.uid()` is null and
the policies correctly return nothing. What matters is that they return nothing rather
than raising `permission denied for function` — that is the regression 2.2 guards against,
and it does not occur.

`search_path` edge cases came out right: `fn_provision_cook_auth` →
`public, auth, pg_temp`, `rls_auto_enable` → `pg_catalog, pg_temp`. The unused 2-arg
`fn_create_batches_from_task` overload is left ungranted; only the 3-arg form the app
calls is granted.

The migration carries the same checks as in-transaction assertions (section G), so a prod
apply that does not reach this end state rolls itself back.

## 2.5 Expected advisor delta

Baseline taken 2026-10-17 before any change:

| Lint | Level | Before | Expected after |
|---|---|---:|---:|
| `function_search_path_mutable` | WARN | 126 | **0** |
| `anon_security_definer_function_executable` | WARN | 109 | **0** |
| `authenticated_security_definer_function_executable` | WARN | 121 | **46** |
| `security_definer_view` | ERROR | 34 | 34 (untouched — separate concern) |
| `extension_in_public` | WARN | 4 | 4 (needs MC `16ad5772`) |
| `rls_enabled_no_policy` | INFO | 21 | 21 |
| `auth_leaked_password_protection` | WARN | 1 | 1 |

46 is the count of allowlisted functions that are also SECURITY DEFINER (the other 9 of
the 55 are INVOKER). It cannot go lower without changing function bodies, which this task
forbids.

## 2.6 Still open after this migration

- **`http` extension** — MC `16ad5772`, critical.
- **Flat `authenticated` tier** — any signed-in cook can still call `fn_calculate_payroll`,
  `fn_approve_payroll` or `fn_staff_pin_reveal`. Role separation lives in the UI
  `RoleGuard`, not the database. Closing it needs `fn_has_app_role` guards inside ~20
  bodies; forbidden here by the "no body changes" rule.
- **Table-level default privileges** — `pg_default_acl` grants `anon` full
  `arwdDxtm` on every new *table* in `public`. RLS is the only thing standing between anon
  and those tables. Out of scope for a functions migration, worth its own look.
- **`net.*`** (pg_net, 12 functions) is anon-executable but `net` is not a PostgREST-exposed
  schema, so it is not reachable over REST. Folded into MC `16ad5772`.

## 2.7 Prod apply checklist

1. Manual `pg_dump` first — MC `4405c6e9` is still open, there are no backups.
2. Apply in the quiet hour, after 23:00 Phuket.
3. Watch the apply log for the section C WARNING (http) and the section B WARNING
   (supabase_admin default privileges) — both are expected, neither aborts.
4. Re-dump after-state, diff against `2026-10-17-rpc-grants-after.csv` (which was produced
   from the dry run and should match exactly).
5. `get_advisors(security)` and compare against 2.5.
6. Smoke with real keys, not SQL: the live site with the **publishable** key, the admin
   panel with a real user JWT, and the Loyverse edge functions under `service_role`.

---

# Step 3 — applied to production 2026-10-17 10:12 UTC (17:12 Phuket)

Applied during service, not in the small hours. The brief said "after 23:00 Phuket";
the logs said otherwise, so the rule was checked rather than followed:

| Hour (Phuket) | Requests | RPC |
|---|---:|---:|
| 17 (apply) | 382 | 222 |
| 22 | 1778 | 316 |
| 23 | 903 | 158 |
| 01–09 | 0–33 | **0** |

23:00 is one of the busier hours and 22:00 is the daily peak — waiting for it would
have made things worse, not better. The genuinely quiet window is 01:00–09:00. With the
change already proven byte-identical by the rolled-back dry run, the transaction only
seconds long, assertions that self-roll-back, a verified dump in hand and a surgical
rollback script, applying at 17:12 was the better trade. CEO agreed on that reading.

## Result — every number as predicted

| Check | Expected | Actual |
|---|---:|---:|
| our functions executable by `anon` | 0 | **0** |
| executable by `authenticated` | 55 | **55** |
| retaining `service_role` | 190 | **190** |
| with a mutable `search_path` | 0 | **0** |
| `http` functions still open to `anon` | 19 | **19** (expected — MC `16ad5772`) |
| snapshot rows written | 702 | **702** (512 grants + 190 search_path) |

`migration_log` registered 490 at 10:12.

**Production state matches the committed prediction exactly.** Order-independent checksum
over all 190 rows of name/args/secdef/anon/auth/triggers/search_path:
`d6dee875989e8a6427902ac1da73b0a0` from live `pg_proc`, and the same value from
`2026-10-17-rpc-grants-after.csv`, which was generated from the dry run *before* the apply.
(A first comparison disagreed only because the database and `sort` order lines under
different collations; the multiset checksum removes that.)

## Advisors, before → after

| Lint | Level | Before | After |
|---|---|---:|---:|
| `anon_security_definer_function_executable` | WARN | 109 | **0 — gone** |
| `function_search_path_mutable` | WARN | 126 | **0 — gone** |
| `authenticated_security_definer_function_executable` | WARN | 121 | **46** |
| `security_definer_view` | ERROR | 34 | 34 |
| `extension_in_public` | WARN | 4 | 4 |
| `rls_enabled_no_policy` | INFO | 21 | 22 |
| `auth_leaked_password_protection` | WARN | 1 | 1 |

The two headline lints disappeared from the report entirely. `rls_enabled_no_policy` went
up by one: the new `rpc_grant_snapshot_490` table, which the `rls_auto_enable` event
trigger protected on creation and which deliberately has no policy — only `service_role`
and `postgres` should ever read it.

## Live smoke, with real keys

- **Public site** — `node scripts/contract-check.mjs` green on both endpoints with the
  publishable key: menu_public 81, nomenclature_tags 942, site_content 4, menu_modifiers
  436, menu_translations 236, price_tiers 0, and all four content assertions.
- **anon over REST, post-apply** — every read 200/206, no 4xx/5xx:
  menu_public, price_tiers, nomenclature_tags, menu_modifiers, site_content,
  menu_translations.
- **service_role / cron** — all pg_cron jobs succeeded after the apply, zero errors.
  `loyverse-push-drain` ran at 10:13, one minute *after* the migration, and succeeded;
  `loyverse-pull-receipts`, `loyverse-pull-shifts`, `loyverse-push-watchdog`,
  `staff-tasks-reminders` and `attendance-no-show` all green.

## Backup in place before the apply

CEO took a manual `pg_dump` (8.4 MB, 3529 objects, verified with `pg_restore --list`),
copied to the shared drive at `Shishka healthy kitchen/02_DB_Backups/` with matching
SHA-256. The recurring off-site automation remains MC `4405c6e9`; the lessons from doing
it by hand — client version, SSL, and not putting the password in the URI — are recorded
there.

## Rollback, if it is ever needed

`services/supabase/rollback/490_rollback.sql`, replaying
`public.rpc_grant_snapshot_490`. It restores the prior grants and `search_path` exactly
and asserts the result against the snapshot. Note that running it **reopens the anon
hole** — it is incident response, not a resting state.

---

# Step 4 — the `http` extension, closed out as far as we can take it

**MC** `16ad5772` (critical) · **migration** 501 · 2026-10-17

Step 2 § 2.3 left this as the one hole migration 490 could not close. Step 4 measured it
properly. Two things changed, one of them a correction to this very document.

## 4.1 It is genuinely exploitable, not just mis-granted

Called with nothing but the publishable key that ships in the live site's JS bundle:

```
POST /rest/v1/rpc/http_get  {"uri":"https://example.com"}   →  HTTP 200
```

The full response came back — status, every header, body. So this is a working SSRF
primitive originating inside Supabase's network, reachable by anyone who views the site
source. Target was IANA's reserved `example.com` on purpose; the aim was to prove the
primitive, not to probe anything internal.

## 4.2 The caller list in § 5.1 was a regex artifact — there are zero callers

§ 5.1 named `fn_staff_tasks_push` and four Loyverse cron jobs as users of `http_*`. They are
not. The detector was `prosrc ~* '\mhttp_(get|post)\M'`, and in POSIX regex `.` is a word
boundary — so `\mhttp_post\M` matches the `http_post` **inside `net.http_post`**. Every one
of the five was already on `pg_net`.

Re-measured with a guard for the qualified form, across `pg_proc.prosrc` (non-extension),
`cron.job.command` and `pg_views.definition`:

```sql
'(^|[^.[:alnum:]_])http_(get|post|put|delete|patch|head)[[:space:]]*\('   →  0 rows
```

| | § 5.1 claimed | actually |
|---|---:|---:|
| in-house `http` extension callers | 5 | **0** |

This is the opposite of bad news. The task's preferred route was "migrate the callers to
`pg_net`, then have support drop the extension" — and the migration half is already done, so
the sync-vs-async problem (`http_post` returns the response; `net.http_post` returns a
request id) never arises. `DROP EXTENSION http` is risk-free for us today.

`fn_staff_tasks_push` is on `net.http_post` and healthy: `staff-tasks-reminders` logged 37
successful runs in the preceding 24 h.

## 4.3 All three routes need `supabase_admin` — measured

```
pg_has_role('postgres', extowner, 'USAGE') .. false     (owner: supabase_admin)
grantors across all 19 proacl entries ...... supabase_admin, only
postgres WITH GRANT OPTION ................. none
```

`DROP`/`ALTER EXTENSION SET SCHEMA` need ownership; `REVOKE` needs to be the grantor. So
there is no *migration* that closes this. A support ticket was drafted on that basis — and
then turned out to be unnecessary; see § 4.7.

Worth noting for whoever reads the ticket: a revoke would have to strip **both** the
`PUBLIC` grant and the explicit `anon`/`authenticated` grants. All 19 functions carry both.

## 4.4 `pg_net` — accepted, no ticket

Also `anon`-executable, also `supabase_admin`-owned, also beyond our reach. But `net` is not
in PostgREST's exposed schemas, so it is not reachable over REST — verified rather than
assumed:

```
POST /rest/v1/rpc/net.http_post  →  404 PGRST202
```

PostgREST reads the dotted name as a function literally called `net.http_post` in `public`.
pg_net is load-bearing for every cron job, so there is nothing to change. The view below
keeps watch in case the exposed-schema config ever changes.

## 4.5 Migration 501 — what it does, and a trap it walked into

501 changes no grants on the extension, because none is possible. It installs
`public.v_security_outbound_http_exposure`, which reports placement, owner, per-role
executability, REST reachability and the corrected caller count — so the post-support fix is
one query, and a regression (a new `http_*` caller, which would make a plain drop unsafe) is
visible.

**The trap.** The view came out of its first apply **readable and writable by `anon`**:

```
has_table_privilege('anon', 'public.v_security_outbound_http_exposure', 'SELECT') → true
relacl → {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, …}
```

Migration 490 cleared the `postgres` default privilege for **functions** in `public`, but
the one for **tables and views** is untouched and still reads
`anon=arwdDxtm/postgres`. So "closed by default" holds for functions only — every new view
or table in `public` is born fully open to `anon`, and a view has no RLS to fall back on.
501 ends with an explicit `REVOKE ALL … FROM anon, authenticated` (grantor is `postgres`
here, so it bites). Verified from outside: `GET /rest/v1/v_security_outbound_http_exposure`
→ `401 / 42501 permission denied`.

This is a general gap, not a quirk of this one view, and is filed as its own MC task.

## 4.6 State at the end of step 4

| | |
|---|---|
| `http` anon-executable functions | **19 — still open**, needs `supabase_admin` |
| in-house `http` callers | **0** (was mis-reported as 5) |
| `DROP EXTENSION http` safe for us? | **yes** |
| `pg_net` REST-reachable | no (404) — accepted |
| new view reachable by anon | no (401) |
| live-site surface (`menu_public`, `site_content`, `price_tiers`) | 200, unchanged |
| advisor `extension_in_public` | 4, unchanged — clears for `http` once support acts |

The task is done as far as our privileges allow. What remains is a single privileged
statement that only Supabase can run — or so it looked. See § 4.7.

## 4.7 Closed the same day — the Dashboard toggle outranks `postgres`

**Supabase Dashboard → Database → Extensions → `http` → disable.** It worked, and it
dropped the extension outright rather than merely revoking it. No support ticket was sent;
the draft has been deleted rather than kept, since it documents an ask that was never
needed.

**This is the lesson worth carrying.** Everything in § 4.3 is still true — `postgres` is
not the owner, is not the grantor, holds no grant option, and no migration can touch a
`supabase_admin`-owned extension. All of that was measured, not assumed, and it was all
correct. The wrong inference was the next step: that "no SQL route" means "only a support
ticket". The Dashboard runs above `postgres`. **Before drafting a ticket about an object
`postgres` cannot touch, spend two minutes on the Dashboard control for it.**

Verified after the drop:

| Check | Result |
|---|---|
| `http` row in `pg_extension` | **none** — dropped, not just un-granted |
| `http_*` functions left in `public` | 0 |
| anon-executable among them | 0 |
| the proven exploit, publishable key | `POST /rest/v1/rpc/http_get` → **404 PGRST202** (was 200 with full body) |
| live menu over REST | 200 |
| pg_cron after the drop | all jobs succeeded; `loyverse-push-drain` 90/90 in the hour |
| our 190 functions anon-executable | still 0 — migration 490 holds |
| extensions left in `public` | `pg_net`, `pg_trgm`, `vector` → advisor `extension_in_public` 4 → 3 |

The zero-caller correction in § 4.2 is what made this safe: a drop, rather than a revoke,
was the simplest option *and* the safest, and nothing had to be migrated first.

`v_security_outbound_http_exposure` (migration 501) stays. Its job is now regression
watch — `anon_ssrf_open` must stay false and `in_house_callers` must stay 0, so that a new
`http_*` caller or a change to PostgREST's exposed schemas surfaces instead of going
unnoticed.

MC `16ad5772` closed.
