# RLS Audit Report — Anon-Key Attack Surface

> MC Task: 287f3cee
> Date: 2026-04-12
> Trigger: Repository `Lesyanich/shishka-os` went public. `VITE_SUPABASE_ANON_KEY` is embedded in the browser bundle and now discoverable by anyone on the internet. RLS is the ONLY protection layer.

## Executive Summary

**75 tables** audited in the `public` schema. Found **6 critical** and **9 high** severity issues. Two tables have RLS completely disabled. Four tables have permissive policies granting full CRUD to anonymous users. Nine tables leak business data via anonymous SELECT.

All tables have full GRANT privileges to the `anon` role (standard Supabase pattern) — RLS policies are the sole gatekeepers.

## Authentication Model

- `fn_is_authenticated()` → `auth.role() = 'authenticated'` — blocks anon role. ~30 tables use this; they are safe.
- Tables with RLS enabled but **no policies** → default-deny (no access for any role except superuser). 22 tables use this pattern (lightrag_*, syrve_*).
- Tables with `USING (true)` on `{public}` or `{anon}` role → **wide open to anon**.
- Tables with RLS **disabled** → grants apply directly, **no protection at all**.

---

## CRITICAL — Full Anon CRUD, No Protection

| # | Table | RLS | Issue | Impact |
|---|-------|-----|-------|--------|
| 1 | **business_tasks** | **DISABLED** | RLS off. Grants give anon full CRUD. Policy exists but is ignored. | All MC tasks readable/writable: task descriptions, assignees, sprint data, internal notes |
| 2 | **business_initiatives** | **DISABLED** | RLS off. Same pattern as business_tasks. | All initiatives readable/writable |
| 3 | **receipt_inbox** | ON | 7 policies on `{public}` with `USING (true)` for SELECT/INSERT/UPDATE/DELETE | Receipt photos, supplier data, amounts — full CRUD for anon |
| 4 | **sprints** | ON | `admin_full` policy: `{public}` ALL `USING (true)` | Sprint names, dates, goals — full CRUD for anon |
| 5 | **task_comments** | ON | `admin_full` policy: `{public}` ALL `USING (true)` | Internal task discussion — full CRUD for anon |
| 6 | **cook_feedback** | ON | `cook_feedback_anon_all`: `{anon}` ALL `USING (true)` | Kitchen feedback data — full CRUD for anon |

### Remediation (Critical)

- **business_tasks, business_initiatives**: Enable RLS. Existing `app.is_admin` policies will then take effect. Anon gets nothing (no anon-specific policy exists).
- **receipt_inbox**: Replace `USING (true)` policies with `fn_is_authenticated()`. Anon should not touch receipt data.
- **sprints, task_comments**: Replace `USING (true)` with `fn_is_authenticated()`. These are internal project management tables.
- **cook_feedback**: Replace anon ALL with anon INSERT-only (cooks submit feedback without auth via Telegram WebApp). SELECT/UPDATE/DELETE should require `fn_is_authenticated()`.

---

## HIGH — Anon Can SELECT Business Data

| # | Table | Policy | What leaks |
|---|-------|--------|------------|
| 7 | **staff** | `staff_read_anon` `{public}` SELECT `USING (true)` | Employee names, telegram user IDs — **PII** |
| 8 | **production_orders** | `prod_orders_anon_read` `{anon}` SELECT `USING (true)` | Production schedule, quantities, dates |
| 9 | **recipes_flow** | `recipes_flow_anon_read` `{anon}` SELECT `USING (true)` | Recipe steps, ingredients, processes — **IP** |
| 10 | **equipment_maintenance** | `eq_maintenance_anon_read` `{anon}` SELECT `USING (true)` | Maintenance records, schedules |
| 11 | **warnings** | `TWA anon can view warnings` `{anon}` SELECT `USING (true)` | Kitchen warnings, quality issues |
| 12 | **shifts** | `shifts_read_anon` `{public}` SELECT `USING (true)` | Shift schedule, staff assignments |
| 13 | **shift_tasks** | `shift_tasks_read_anon` `{public}` SELECT `USING (true)` | Task assignments within shifts |
| 14 | **equipment_slots** | `equipment_slots_read_anon` `{public}` SELECT `USING (true)` | Equipment scheduling |
| 15 | **migration_log** | `migration_log_read` `{public}` SELECT `USING (true)` | Schema version info |

### Context

Tables 7-14 were likely designed for Telegram WebApp (TWA) access where the user is not Supabase-authenticated but identified via `app.tg_user_id`. With the repo public, anyone with the anon key can read this data without even going through the TWA.

### Remediation (High)

- **staff**: Most critical — contains PII. Gate SELECT behind `fn_is_authenticated()` or `app.tg_user_id IS NOT NULL`.
- **recipes_flow**: Contains business IP. Gate behind `fn_is_authenticated()`.
- **production_orders, shifts, shift_tasks, equipment_***: These were designed for TWA read. Consider gating behind `app.tg_user_id IS NOT NULL` to at least require TWA context, even if not full auth.
- **warnings**: TWA-visible by design. Lower risk but still leaks internal quality data.
- **migration_log**: Low-value data but unnecessary exposure. Gate behind `fn_is_authenticated()`.

---

## MEDIUM — Benign Read Exposure

| # | Table | Policy | Notes |
|---|-------|--------|-------|
| 16 | api_cost_log | anon SELECT `true` | Agent cost tracking — low value |
| 17 | brain_quality_tests | anon SELECT `true` | Test prompts/answers — low value |
| 18 | brain_query_log | anon SELECT `true` | Query history — low value |
| 19 | nomenclature | anon SELECT WHERE `product_code LIKE 'SALE-%'` | **By design** — public menu items |

### Remediation (Medium)

- **api_cost_log, brain_quality_tests, brain_query_log**: Gate behind `fn_is_authenticated()`. No reason for anon to read agent diagnostics.
- **nomenclature**: Keep current behavior — SALE items are intentionally public.

---

## SAFE — Protected by fn_is_authenticated()

These 30 tables use `fn_is_authenticated()` (checks `auth.role() = 'authenticated'`). Anon role is effectively blocked.

| Table | Write protection |
|-------|-----------------|
| bom_structures | fn_is_authenticated() |
| brands | fn_is_authenticated() |
| capex_assets | fn_is_authenticated() |
| capex_transactions | fn_is_authenticated() |
| equipment (auth_full_access) | fn_is_authenticated() |
| expense_ledger | fn_is_authenticated() |
| fin_categories | fn_is_authenticated() |
| fin_sub_categories | fn_is_authenticated() |
| inventory_batches | fn_is_authenticated() |
| locations | fn_is_authenticated() |
| nomenclature (write) | fn_is_authenticated() |
| nomenclature_tags | fn_is_authenticated() |
| opex_items | fn_is_authenticated() |
| order_items | fn_is_authenticated() |
| orders | fn_is_authenticated() |
| plan_targets | fn_is_authenticated() |
| po_lines | fn_is_authenticated() |
| product_categories | fn_is_authenticated() |
| production_plans | fn_is_authenticated() |
| production_task_outputs | fn_is_authenticated() |
| production_tasks (auth_full) | fn_is_authenticated() |
| purchase_logs | fn_is_authenticated() |
| purchase_orders | fn_is_authenticated() |
| receipt_jobs | fn_is_authenticated() |
| receiving_lines | fn_is_authenticated() |
| receiving_records | fn_is_authenticated() |
| sku | fn_is_authenticated() |
| sku_balances | fn_is_authenticated() |
| stock_transfers | fn_is_authenticated() |
| supplier_catalog | fn_is_authenticated() |
| suppliers | fn_is_authenticated() |
| tags | fn_is_authenticated() |
| waste_logs | fn_is_authenticated() |

---

## DEFAULT-DENY — RLS On, No Policies

These tables have RLS enabled but zero policies, so no role (including authenticated) can access them via the REST API. Access is only possible via service_role or direct SQL.

**LightRAG tables (17):** lightrag_doc_chunks, lightrag_doc_full, lightrag_doc_status, lightrag_entity_chunks, lightrag_full_entities, lightrag_full_relations, lightrag_llm_cache, lightrag_relation_chunks, lightrag_vdb_chunks_bge_m3_1024d, lightrag_vdb_chunks_bge_m3_latest_1024d, lightrag_vdb_chunks_text_embedding_3_small_1536d, lightrag_vdb_entity_bge_m3_1024d, lightrag_vdb_entity_bge_m3_latest_1024d, lightrag_vdb_entity_text_embedding_3_small_1536d, lightrag_vdb_relation_bge_m3_1024d, lightrag_vdb_relation_bge_m3_latest_1024d, lightrag_vdb_relation_text_embedding_3_small_1536d

**Syrve tables (5):** syrve_config, syrve_sales, syrve_sync_log, syrve_sync_queue, syrve_uom_map

Note: These tables are accessed by backend services using service_role key, so the lack of policies is intentional and correct.

---

## Fix Migration

Migration `109_rls_audit_fixes.sql` addresses all 6 critical findings and the most sensitive high findings (staff PII, recipes IP).

**Status: WRITTEN, NOT APPLIED.** Requires manual review and `psql` execution.

---

## Duplicate Policy Warning

**receipt_inbox** has 7 overlapping policies (3 pairs of duplicates). The fix migration drops duplicates.

---

## Grant Audit Note

All 75 tables in the `public` schema have full GRANT (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES) to the `anon` role. This is the default Supabase pattern — PostgREST relies on RLS to filter access, not grants. Revoking grants would break PostgREST entirely. The correct approach is to ensure RLS + policies are properly configured, which this audit validates.
