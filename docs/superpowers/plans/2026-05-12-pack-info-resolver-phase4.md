# Pack-Info Resolver — Phase 4 (Admin UI + MCP tool) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Final phase of the Pack-Info Resolver initiative. Two independent deliverables shipped as two PRs:

1. **PR1 — `pack_info_lookup` MCP tool.** Thin read-only wrapper around `resolver.resolve()` exposed via `mcp-finance`. Enables on-demand calls from chef/finance agents ("what does the cascade say about RAW-X?") without going through receipt approval or the nightly sweep. ~80 LOC + tests.

2. **PR2 — Admin Pending Review queue + RLS migration 172.** New section inside the existing `DataHealthTab` (NOT a new page — spec mentioned `pages/DataHealth.tsx` but reality is `components/mission-control/DataHealthTab.tsx`). Approve/Reject buttons that write to `nomenclature`/`supplier_catalog` and flip `data_health_decisions.status`. Migration 172 adds owner-only UPDATE policy on `data_health_decisions` so a hostile authenticated client cannot bypass the frontend gate.

**Spec deviations from `2026-05-08-pack-info-resolver-design.md`:**

| Spec said | Reality | Resolution |
|---|---|---|
| `services/lib/pack-info-resolver/` shared TS lib | Lib lives at `services/mcp-finance/src/lib/pack-info-resolver/` (Phase 1 decision to avoid premature monorepo) | MCP tool imports from same package; UI imports types via barrel re-export or via a tiny `apps/admin-panel/src/types/pack-info.ts` mirror |
| Admin UI in `apps/admin-panel/src/pages/DataHealth.tsx` | DataHealth is a TAB inside `/mission` route at `apps/admin-panel/src/components/mission-control/DataHealthTab.tsx` | Extend the tab with a new "Pending Review (Pack-Info)" section below the severity-grouped metric cards |

**SOCRATIC-GATE answered by CEO 2026-05-11:**
1. Pending Review section lives **inside `DataHealthTab`** (not a new tab)
2. Approve/Reject is **owner-only via frontend role gate + RLS policy** (defence in depth)
3. **Split into two PRs**, MCP tool first

**Spec:** [docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md](../specs/2026-05-08-pack-info-resolver-design.md)
**MC Task:** `91cbaab2-60b8-4bc6-a6c5-414732c24f3a` (child of umbrella `e8df7bc4`)
**Predecessors shipped:** Phase 1 PR #182 (`7a62d66`), Phase 2 PR #183 (`8d41b46`), Phase 3 PR #190 (`279ec84`)

---

## PR1 — `pack_info_lookup` MCP tool

### File Structure

```
services/mcp-finance/
├── src/tools/
│   ├── pack-info-lookup.ts                 # CREATE: MCP tool handler
│   └── pack-info-lookup.test.ts            # CREATE: handler tests
└── src/index.ts                             # MODIFY: register tool in tools list
```

### Tool contract

```ts
// Input
{
  nomenclature_id: string;  // UUID
  barcode?: string;         // optional, improves cascade hit-rate
}

// Output (ResolverResult shape, see types.ts)
{
  nomenclature_id: string;
  resolved: { base_unit, package_weight, package_qty, package_unit, cost_per_kg } | null;
  source: 'supplier_catalog_exact' | 'supplier_catalog_fuzzy' | 'makro_barcode' | 'makro_fuzzy' | null;
  confidence: number;
  conflicts: Array<{source, package_weight, evidence}>;
  evidence: Record<string, unknown>;
}
```

### Tasks

- [ ] **Step 1.1: Create `pack-info-lookup.ts` tool handler**
  - Import `resolve` from `../lib/pack-info-resolver/index.js`
  - Import `createDataProvider` and `makroFetcher` (same providers Phase 2 hook uses)
  - Validate inputs with a small Zod-or-manual guard (`nomenclature_id` is UUID, `barcode` is string or absent)
  - Call `resolve({ nomenclature_id, barcode }, { providers })` and return the `ResolverResult` directly
  - **No DB writes** — this tool is read-only. If chef/finance agent wants to apply a fix, they go through `approve-receipt` or `data_health_decisions` UI.
  - Surface tool errors structurally (resolver-internal vs network vs validation)

- [ ] **Step 1.2: Co-located test `pack-info-lookup.test.ts`**
  - Test cases:
    - Valid nomenclature_id + cached supplier_catalog hit → conf 1.0
    - Valid nomenclature_id + barcode → cascade reaches makro stub → conf 0.85
    - Invalid input (missing nomenclature_id) → validation error
    - Resolver throws (DB unreachable) → tool returns error response (does not crash)
  - Reuse fixtures from `pack-info-resolver/fixtures.ts`

- [ ] **Step 1.3: Register tool in `services/mcp-finance/src/index.ts`**
  - Add to tools list following existing pattern (see `makro-lookup`, `search-nomenclature`)
  - Verify with `npm run build && npm test` in `services/mcp-finance`

### Acceptance criteria — PR1
- `services/mcp-finance/src/tools/pack-info-lookup.ts` exists, exports MCP tool handler
- Test file with ≥4 cases, all pass
- `npm run build` green in mcp-finance
- `npm test` green in mcp-finance (the 2 pre-existing `update-equipment.test.ts` failures remain; document in PR description)
- Tool registered in `src/index.ts` and discoverable via MCP protocol
- No new dependencies

---

## PR2 — Admin Pending Review queue + RLS migration 172

### File Structure

```
services/supabase/migrations/
└── 172_data_health_owner_update_policy.sql       # CREATE

apps/admin-panel/src/
├── hooks/
│   ├── usePackInfoPending.ts                     # CREATE: query + mutations
│   └── usePackInfoPending.test.ts                # CREATE
├── components/mission-control/
│   ├── PackInfoPendingSection.tsx                # CREATE
│   ├── PackInfoPendingSection.test.tsx           # CREATE (smoke; admin-panel test env caveats per memory)
│   └── DataHealthTab.tsx                         # MODIFY: render <PackInfoPendingSection /> below severity sections
└── types/
    └── pack-info.ts                              # CREATE: types mirror (or import path from mcp-finance if tsconfig allows)
```

### Migration 172 — owner-only UPDATE policy

The existing mig 154 RLS allows:
- `authenticated` SELECT (read for everyone logged in) — keep as-is
- `service_role` ALL (writes for Phase 2 hook + Phase 3 sweep) — keep as-is

Add:
- `authenticated` UPDATE limited to `app_role = 'owner'` users, restricted to flipping `status` from `'pending'` to `'applied'` or `'rejected'`. All other column changes blocked.

Sketch:
```sql
-- Helper SECURITY DEFINER function — reads my app_role from the existing fn_get_my_role pattern
CREATE OR REPLACE FUNCTION public.fn_is_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE my_role TEXT;
BEGIN
  SELECT app_role INTO my_role FROM ... WHERE user_id = auth.uid();  -- mirror fn_get_my_role exactly
  RETURN my_role = 'owner';
END $$;

CREATE POLICY "data_health_decisions_owner_update_pending"
  ON public.data_health_decisions FOR UPDATE
  TO authenticated
  USING (status = 'pending' AND public.fn_is_owner())
  WITH CHECK (status IN ('applied', 'rejected') AND public.fn_is_owner());
```

The `USING` clause guards the read-side ("which rows can I update"); the `WITH CHECK` clause guards the write-side ("what the new row must look like"). The policy lets an owner flip status only from `pending` → `applied`/`rejected`. Any other column change is rejected at the DB level.

**Caveat:** the UPDATE policy controls `data_health_decisions` itself. The actual fix-application (UPDATE on `nomenclature` and `supplier_catalog`) needs **separate consideration**:

- Option A — frontend does two writes: status flip + nomenclature/supplier_catalog UPDATE. Requires owner UPDATE policies on those tables too (might already exist; verify).
- Option B — wrap in a SECURITY DEFINER RPC `fn_approve_pack_decision(decision_id)` that does all three writes atomically. Cleaner; mirrors how `fn_approve_payroll` (mig 169) does it for HR.

**Recommendation: Option B.** Atomic transaction, single owner-only grant, easier to audit. Migration 172 includes both the policy AND the RPC.

- [ ] **Step 2.1: Pre-check existing RLS on `nomenclature` and `supplier_catalog`**
  - Read mig 154 + any newer policies via `grep`
  - Decide A vs B definitively (default: B)

- [ ] **Step 2.2: Write migration 172**
  - `fn_is_owner()` helper (or reuse `fn_get_my_role()` if it returns the role)
  - `fn_approve_pack_decision(p_decision_id UUID, p_action TEXT)` SECURITY DEFINER RPC
    - Asserts caller is owner via `fn_is_owner()`
    - Asserts `p_action IN ('applied','rejected')`
    - If `applied`: UPDATE nomenclature SET base_unit=new_value, UPDATE supplier_catalog SET package_*=*, UPDATE data_health_decisions SET status='applied', decided_by=auth.uid()
    - If `rejected`: UPDATE data_health_decisions SET status='rejected', decided_by=auth.uid()
    - All in single transaction
  - GRANT EXECUTE on RPC to `authenticated`
  - migration_log self-register

- [ ] **Step 2.3: Apply migration via psql + DATABASE_URL from keychain**
  - Use `security find-generic-password -s "shishka-database-url" -w`
  - Pattern: `export DB_URL="$(...)" && psql "$DB_URL" -f services/supabase/migrations/172_*.sql`
  - Verify with `\df fn_approve_pack_decision` and `\d data_health_decisions` (policy list)

- [ ] **Step 2.4: Create `usePackInfoPending` hook**
  - Query: `SELECT d.*, n.name, n.product_code, n.base_unit FROM data_health_decisions d JOIN nomenclature n ON d.entity_id = n.id WHERE d.status = 'pending' AND d.rule_id = (SELECT id FROM data_health_rules WHERE rule_code = 'NOMENCLATURE_AUTO_PACK_FILL') ORDER BY d.decided_at DESC`
  - Group by `entity_id` so multiple pending fields on the same nomenclature row collapse into one card (base_unit + cost_per_unit pending → one card showing both)
  - Mutations: `approve(decision_ids[])` / `reject(decision_ids[])` → call `fn_approve_pack_decision` RPC
  - Optimistic update + refetch on completion
  - Test mock for supabase client (smoke; admin-panel test env still has the empty-VITE_SUPABASE_URL issue per MC `0e5b05a7`)

- [ ] **Step 2.5: Create `PackInfoPendingSection.tsx` component**
  - Render only when `useAppRole().role === 'owner'` (frontend gate; RLS is defence)
  - Empty state: "No pending pack-info decisions" with a help link to the spec
  - Card per nomenclature row:
    - Product code + name + current base_unit (badge)
    - Proposed change(s): `base_unit: pcs → kg`, `cost_per_unit: 133 → 266`
    - Confidence badge (green ≥0.9, amber 0.5-0.9, red <0.5)
    - `source` chip (`supplier_catalog_exact`, `makro_barcode`, etc.)
    - If `source_payload.conflicts.length > 0`: collapsible "Conflicts" panel showing both versions
    - Approve / Reject buttons (loading state, disabled after click)
  - Use the existing `MetricCard` collapsible pattern + `ItemRow` button states (matches DataHealthTab visual language)

- [ ] **Step 2.6: Wire into `DataHealthTab.tsx`**
  - Add `<PackInfoPendingSection />` after the severity-grouped `SEVERITY_ORDER.map` block
  - Wrap in same section heading style as other groups: `<h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pending review (pack-info)</h3>`

- [ ] **Step 2.7: Smoke tests + visual check**
  - `npm run build` + `npm run lint` in `apps/admin-panel`
  - Open `/mission` → Data Health tab → verify section renders (real prod likely has 0-5 pending rows post-Phase-3 first sweep)
  - If 0 pending: trigger one synthetic write via `psql` to verify rendering, then revert

### Acceptance criteria — PR2
- Migration 172 applied to prod, idempotent on re-run
- `fn_approve_pack_decision` RPC callable only by owner role; authenticated non-owner gets permission error
- `<PackInfoPendingSection />` renders inside DataHealthTab, hidden from cooks
- Approve/Reject flow works end-to-end: button click → RPC → optimistic UI → row disappears from queue
- Build + lint green
- 2 pre-existing `update-equipment.test.ts` failures unchanged; documented in PR description

---

## PR Strategy + Worktree

- **Off-Drive worktree** at `~/code/shishka-worktrees/pack-info-phase4` per `RULE-NO-WORKTREES-ON-DRIVE`
- **PR1 first**, merge, then **PR2** branched off updated main
- Branch naming: `feature/data-health/pack-info-phase4-mcp-tool` and `feature/data-health/pack-info-phase4-admin-ui`
- Commit message template (per phase 3 precedent): `feat(pack-resolver): <scope> (Phase 4)`

## Out-of-Scope (Phase 4 boundary)

- **Cost auto-apply.** Cost fixes always stay `pending` regardless of confidence. CEO judgment per spec § Decision gate.
- **Cooks approving.** Hard owner-only. Cooks see Data Health (read), not the review queue.
- **Bulk approve.** Per-row Approve/Reject only. If 50 pending pile up, surface a separate MC task for a bulk RPC.
- **Phase 2 deferred concerns** (unconditional `supplier_catalog` updates, `rule_auto` ambiguity) — these go in separate MC tasks, not Phase 4.
- **Telemetry/analytics on approval rate** — not in spec, separate work.

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Phase 3 sweep fires tonight with 0 pending (clean prod) → can't visually test PR2 with real data | Step 2.7 includes synthetic write fallback |
| RPC permission errors for owners (jwt parsing) | Pre-deploy test: log into admin-panel as Lesia, call RPC via supabase client console, confirm |
| Migration 172 collides with another in-flight migration | Verify `services/supabase/migrations/` for 172_*.sql before psql apply |
| `pack_info_lookup` tool overlaps semantically with sweep cron logic | Different surface: tool returns `ResolverResult` only, no DB writes. Sweep is the only writer. |

## Verification Steps (before marking task done)

1. Both PRs merged to `main`, no rollback within 24h
2. Migration 172 confirmed in `migration_log`
3. `fn_approve_pack_decision` callable only by owner (test as `cook` user → permission error)
4. PackInfoPendingSection renders in admin panel
5. End-to-end: pending row exists → owner approves → nomenclature updated → row exits queue
6. MC task `91cbaab2` status → `done` with PR numbers in related_ids
