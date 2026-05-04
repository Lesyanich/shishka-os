---
title: Database RLS Policies
type: page
tags: [database, rls, security]
date: 2026-04-29
status: active
related:
  - "[[Database/]]"
  - "[[Database/Domain Contracts]]"
  - "[[Tech/Agent System]]"
---

# Database RLS Policies

Row-Level Security on Supabase tables — the Phase A audit (2026-04-06) and the Phase D plan to lock down per-MCP scopes. Source: [`docs/domain/rls-audit-2026-04-06.md`](../../docs/domain/rls-audit-2026-04-06.md).

## Current state — Phase A (audited 2026-04-06)

> Most policies are `USING (true)` / `WITH CHECK (true)` — meaning **any authenticated user (or service role) has full access to all tables**. There is no per-domain scoping yet. **Wide-open by design for the launch phase**, hardened in Phase D.

### Policy inventory (subset)

| Table | RLS | Policies | Effective access |
|---|---|---|---|
| `nomenclature` (products) | Yes | anon read, auth full | Wide open |
| `bom_structures` | Yes | auth full | Wide open |
| `supplier_catalog` | Yes | auth full | Wide open |
| `production_orders` | Yes (075) | auth full, anon read | Wide open |
| `recipes_flow` | Yes (074) | anon read, auth full | Wide open |
| `equipment_maintenance` | Yes (079) | anon read, auth full | Wide open |
| `receipt_inbox` | Yes (086) | select/insert/update/delete | Wide open |
| `receiving_records` / `receiving_lines` | Yes (062) | auth full | Wide open |
| `business_tasks` | Yes (091) | admin full | Wide open |
| `business_initiatives` | Yes (091) | admin full | Wide open |
| `sprints` | Yes (093) | admin full | Wide open |
| `task_comments` | Yes (093) | admin full | Wide open |
| `fin_categories` | Yes | select (028) | Read-only |
| `fin_sub_categories` | Yes | select (028) | Read-only |

Full list (with status `unknown` for a few un-audited tables) in [`docs/domain/rls-audit-2026-04-06.md`](../../docs/domain/rls-audit-2026-04-06.md).

## Risks (Phase A → D)

| Risk | Severity | Description |
|---|---|---|
| MCP cross-domain writes | **MEDIUM** | `mcp-finance` can write to `nomenclature`; `mcp-chef` can write to `receipt_inbox`. No table-ownership enforcement at DB layer (only at code via ESLint `no-restricted-imports`) |
| No audit trail | LOW | All writes look identical — no way to trace which MCP made a change |
| Admin panel full access | OK | Expected — admin is the primary UI for the owner |

## Phase D — per-MCP scoped roles (planned)

Three Supabase service accounts:

```
mcp_chef_role        — r/w on chef-owned tables, read-only on the rest
mcp_finance_role     — r/w on finance-owned tables, read-only on others
mcp_mc_role          — r/w on mission-control tables, read-only on others
authenticated        — admin panel, full access (owner / cook depending on app_role)
anon                 — public read on safe tables only
```

Example after Phase D (for `nomenclature`):

```sql
CREATE POLICY products_chef_full   ON nomenclature
  FOR ALL TO mcp_chef_role USING (true) WITH CHECK (true);

CREATE POLICY products_finance_read ON nomenclature
  FOR SELECT TO mcp_finance_role USING (true);

CREATE POLICY products_admin_full   ON nomenclature
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Each MCP server gets its own service-role API key bound to its scoped role.

### Prerequisites for Phase D

1. ✅ Stable table ownership documented (see [[Database/Domain Contracts]])
2. `supabase db push --dry-run` canary in pre-commit (Phase D6, planned)
3. Test coverage for MCP tools — verify no cross-domain writes in test runs

### Estimated effort

2–3 migrations + key rotation in MCP server `.env`s. ~1 session of focused work.

## Auth user model

The admin panel authenticates via **Supabase Auth** (email/password). On every protected request, RLS evaluates the JWT.

- `auth.uid()` returns the user's UUID
- `staff.auth_user_id = auth.uid()` is the link to operational identity
- `staff.app_role` (owner | cook | cashier) is checked via `RoleGuard` in the React layer (see [[Operations/Staff]])

## KDS hardening (already done — MC `f73da9fa`)

KDS tables previously had anon RLS allowing any unauth visitor to read production orders. The hardening:

1. Revoked anon policies on KDS tables
2. Required `staff.auth_user_id` on every read
3. Cooks log in to the shared kitchen tablet at shift start

This is the **first** Phase-D-style scoping in production — earlier than the broader Phase D rollout.

## Key principle

> RLS protects **data**, not just **routes**. Even if a bug bypasses the React route guards, the database itself rejects the unauthorized read.

This is why "wide-open" is acceptable today (small team, trusted users) but unacceptable as the team grows past CEO + cooks.

## See Also

- [[Database/Domain Contracts]] — table ownership matrix this RLS will enforce
- [[Tech/Agent System]] — multi-agent context where this matters
- [[Operations/Staff]] — auth model
- [`docs/domain/rls-audit-2026-04-06.md`](../../docs/domain/rls-audit-2026-04-06.md) — the Phase A audit
- [`docs/plans/spec-ai-native-ops.md`](../../docs/plans/spec-ai-native-ops.md) — HC-2 contracts in code
