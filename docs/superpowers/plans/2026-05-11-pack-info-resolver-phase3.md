# Pack-Info Resolver — Phase 3 (Nightly Batch Sweep) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up a nightly batch sweep that scans `nomenclature` rows with suspicious `base_unit` and at least one historical purchase, runs them through the Phase 1 resolver, and routes results through the same decision gate as the Phase 2 real-time hook — so backlog rows get cleaned up over time without manual migrations.

**Architecture:** A new `runPackInfoSweep(sb, provider, opts)` orchestrator lives alongside `runPackInfoHook`. It pulls candidates via a new SQL RPC `pack_info_sweep_candidates(p_limit int)` (migration 171), which JOINs nomenclature with the most-recent `purchase_logs` row (LATERAL) so we get `supplier_id`, `barcode`, and `price_per_unit` per candidate. Each candidate flows through the existing resolver and the existing `writeAutoApply` / `writePending` / `writeSkip` writers — Phase 3 adds no DB write logic, only a new fetch shape. The job is shipped as a Node CLI (`services/mcp-finance/src/jobs/pack-info-sweep.ts`) invoked by a GitHub Actions schedule at 20:00 UTC (= 03:00 Bangkok), with a JSON summary printed to stdout (visible in the Actions log) plus an MC comment posted on this Phase 3 task per run.

**Tech Stack:** TypeScript 5.8 strict, Vitest, Supabase JS, GitHub Actions cron, Postgres RPC (`SECURITY DEFINER`, `STABLE`). All new code lives in `services/mcp-finance/` — same package as Phase 1/2, no monorepo split.

**Spec:** [docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md](../specs/2026-05-08-pack-info-resolver-design.md) (§ Batch Cron Flow + § Decision gate + § Error & Edge Cases)

**Phase 2 plan (for context):** [docs/superpowers/plans/2026-05-08-pack-info-resolver-phase2.md](./2026-05-08-pack-info-resolver-phase2.md)

**MC Phase 3 task:** `25523c4f-a7ce-43fc-96e4-bc2e304b6d11`
**MC Initiative:** `e8df7bc4-3b1b-448f-be78-5292d0542b4f`
**Branch:** `feature/data-health/pack-info-phase3`
**Worktree:** `~/code/shishka-worktrees/pack-info-phase3` (OFF Drive per `RULE-NO-WORKTREES-ON-DRIVE`)

---

## Key Design Decisions (CEO-approved 2026-05-11)

### 1. Separate `runPackInfoSweep` orchestrator (Option A)
The Phase 2 `runPackInfoHook` is a receipt-batch abstraction keyed on `expense_id`; it fetches `purchase_logs` per receipt and enriches lines with `food_items` brand/name input. Sweep has no expense_id and no per-line `food_items` context — it scans `nomenclature` directly and looks up the most-recent purchase synthetically. Sharing a single orchestrator (Option B) would require turning "line source" into a polymorphic abstraction; the DRY win is small because resolver + cooldown + writers are already extracted helpers. New orchestrator file with ~150 LOC keeps semantics clear and Phase 2 untouched.

### 2. RPC-backed candidate fetch (`pack_info_sweep_candidates`)
The spec's eligibility query (`nomenclature` filtered by suspicious unit × has purchase × NOT recent skip-decision × LATERAL most-recent purchase line) is not expressible cleanly in PostgREST. New SECURITY DEFINER RPC owns the join. Idempotent migration (CREATE OR REPLACE FUNCTION + grant to authenticated/service_role).

### 3. `run_id` semantics
The real-time hook uses `expense_id` as `run_id` (one batch = one receipt). Sweep generates a fresh UUID per invocation via `crypto.randomUUID()` and threads it through `writeAutoApply` / `writePending` / `writeSkip`. The UUID is also included in the summary so a sweep run can be reconstructed from `data_health_decisions` later.

### 4. GitHub Actions cron host
Only existing cron in the repo is `prune-memories` (`ci.yml`, schedule: `0 6 * * 1`). Phase 3 follows the same pattern with a dedicated workflow file (`pack-info-sweep.yml`) so failures don't block CI on the main repo runs. `workflow_dispatch` is enabled for manual invocation.

### 5. Notification: stdout JSON + MC comment
No telegram/webhook patterns exist in the repo. JSON to stdout is captured in the Actions log automatically. The MC comment goes to task_comments via Supabase JS (the table is directly writable — `add-comment.ts` confirms it's a simple insert with `task_id`, `author`, `body`). Per CEO approval one comment per sweep run, accepting ~30 comments/month on this task.

### 6. Cost handling unchanged
`writeAutoApply` already creates a pending `cost_per_unit` decision when `resolved.cost_per_kg != null`. Sweep takes `last_price_thb` from the most-recent purchase line, so cost rows get created the same way as Phase 2. No special-casing.

### 7. Unconditional `supplier_catalog` update kept (deferred from Phase 2)
Phase 2 noted that `writeAutoApply` writes `supplier_catalog.package_*` unconditionally — even when values match. In sweep batches (up to 100 rows/night) this could churn `updated_at` noisily. **Out-of-scope for Phase 3** — adding a change-guard requires extending `writeAutoApply`'s signature with `current_package_*` and a corresponding RPC field, which is a separate cleanup. Document as deferred concern in the PR description.

### 8. `decision_source` ambiguity unchanged (deferred from Phase 2)
Both `writePending` low-conf and `writeAutoApply` applied-base-unit use `decision_source='rule_auto'`, differentiated only by `status`. **Out-of-scope for Phase 3** — splitting requires migration 172 to extend the CHECK constraint with `'rule_auto_low_conf'`. Sweep produces the same row shapes Phase 2 produces; we don't introduce new ambiguity, we inherit existing ambiguity.

### 9. Suspicious-unit list matches Phase 2 hook
`pcs`, `bag`, `bottle`, `pack` (single shared `SUSPICIOUS_BASE_UNITS` constant moves to a shared file so hook + sweep + RPC all agree). The RPC encodes this list in SQL; the JS constant is kept for the cooldown check and is the source of truth that the migration must mirror.

### 10. Sweep does NOT short-circuit on `brand` absence
Sweep has `name` (from `nomenclature.name`) but no `brand`. The resolver Level 4 (makro_fuzzy) gracefully falls back to name-only query (`input.brand ? \`${brand} ${name}\` : input.name`). No change to resolver.

### 11. HC-3: every new `.ts` gets a co-located smoke `.test.ts`
Phase 1 and Phase 2 already follow this. Phase 3 continues — every new `src/`-side `.ts` ships with a `.test.ts` next to it that at minimum imports and asserts the symbol is defined.

---

## File Structure

```
services/mcp-finance/src/
├── lib/
│   ├── pack-info-hook/
│   │   ├── hook.ts                          # MODIFY: extend ErrorReport.stage union with 'sweep-fetch'
│   │   └── shared-constants.ts              # CREATE: SUSPICIOUS_BASE_UNITS shared by hook + sweep
│   │   └── shared-constants.test.ts         # CREATE: HC-3 smoke
│   └── pack-info-sweep/                     # NEW directory
│       ├── candidates.ts                    # CREATE: calls RPC, returns SweepCandidate[]
│       ├── candidates.test.ts
│       ├── sweep.ts                         # CREATE: runPackInfoSweep orchestrator
│       ├── sweep.test.ts
│       ├── notifier.ts                      # CREATE: postSweepSummary (stdout + MC comment)
│       ├── notifier.test.ts
│       ├── index.ts                         # CREATE: barrel export
│       └── index.test.ts                    # CREATE: HC-3 smoke
└── jobs/                                    # NEW directory
    ├── pack-info-sweep.ts                   # CREATE: CLI entrypoint
    └── pack-info-sweep.test.ts              # CREATE: HC-3 smoke

services/mcp-finance/
└── package.json                              # MODIFY: add scripts.sweep:pack-info

services/supabase/migrations/
└── 171_pack_info_sweep_rpc.sql               # CREATE: pack_info_sweep_candidates RPC

.github/workflows/
└── pack-info-sweep.yml                       # CREATE: cron schedule + workflow_dispatch
```

---

## Task 1: Migration 171 — `pack_info_sweep_candidates` RPC

**Files:**
- Create: `services/supabase/migrations/171_pack_info_sweep_rpc.sql`

- [ ] **Step 1.1: Write the migration**

Create `services/supabase/migrations/171_pack_info_sweep_rpc.sql`:

```sql
-- ============================================================
-- Migration 171: Pack-Info Resolver Phase 3 — sweep candidate RPC
--
-- Adds pack_info_sweep_candidates(p_limit int) RPC used by the
-- nightly batch sweep (services/mcp-finance/src/jobs/pack-info-sweep.ts).
--
-- Returns nomenclature rows with suspicious base_unit AND at least one
-- purchase_logs entry AND no skip-decision within the last 7 days,
-- joined with the most-recent purchase line's supplier_id / barcode /
-- price_per_unit so the resolver gets the context it needs.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, self-register ON CONFLICT.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pack_info_sweep_candidates(p_limit int DEFAULT 100)
RETURNS TABLE (
  nomenclature_id        uuid,
  base_unit              text,
  cost_per_unit          numeric,
  name                   text,
  recent_supplier_id     uuid,
  recent_barcode         text,
  recent_price_per_unit  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id              AS nomenclature_id,
    n.base_unit       AS base_unit,
    n.cost_per_unit   AS cost_per_unit,
    n.name            AS name,
    p.supplier_id     AS recent_supplier_id,
    p.barcode         AS recent_barcode,
    p.price_per_unit  AS recent_price_per_unit
  FROM public.nomenclature n
  CROSS JOIN LATERAL (
    SELECT pl.supplier_id, pl.barcode, pl.price_per_unit
    FROM public.purchase_logs pl
    WHERE pl.nomenclature_id = n.id
    ORDER BY pl.invoice_date DESC NULLS LAST, pl.created_at DESC
    LIMIT 1
  ) p
  WHERE n.is_deleted = false
    AND n.base_unit = ANY(ARRAY['pcs','bag','bottle','pack'])
    AND NOT EXISTS (
      SELECT 1 FROM public.data_health_decisions d
      WHERE d.entity_id  = n.id
        AND d.field      = 'base_unit'
        AND d.status     = 'skip'
        AND d.decided_at > now() - interval '7 days'
    )
  ORDER BY n.id
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.pack_info_sweep_candidates(int) IS
  'Phase 3 sweep candidate fetch. Returns nomenclature rows with suspicious base_unit and >=1 purchase, joined with most-recent purchase line. 7-day cooldown on skip-decisions. SECURITY DEFINER for service role.';

-- Service role + authenticated may invoke. Anon must not.
REVOKE ALL ON FUNCTION public.pack_info_sweep_candidates(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pack_info_sweep_candidates(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.pack_info_sweep_candidates(int) TO authenticated;

-- migration_log self-register
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '171_pack_info_sweep_rpc.sql',
  'claude-opus-session-28851866',
  'Pack-Info Resolver Phase 3 sweep RPC. Spec: 2026-05-08-pack-info-resolver-design.md. MC task: 25523c4f.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 1.2: Apply migration to remote DB**

Run from the worktree root:

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
DB_URL="$(security find-generic-password -s 'shishka-database-url' -w)" \
  psql "$DB_URL" -v ON_ERROR_STOP=1 \
    -f services/supabase/migrations/171_pack_info_sweep_rpc.sql >/dev/null 2>&1
unset DB_URL
echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 1.3: Verify RPC is callable**

```bash
DB_URL="$(security find-generic-password -s 'shishka-database-url' -w)" \
  psql "$DB_URL" -tAc "SELECT count(*) FROM public.pack_info_sweep_candidates(5);" 2>/dev/null
unset DB_URL
```

Expected: a non-error integer (0 or more — depends on current data; both are valid).

- [ ] **Step 1.4: Verify self-register**

```bash
DB_URL="$(security find-generic-password -s 'shishka-database-url' -w)" \
  psql "$DB_URL" -tAc "SELECT filename FROM public.migration_log WHERE filename='171_pack_info_sweep_rpc.sql';" 2>/dev/null
unset DB_URL
```

Expected: `171_pack_info_sweep_rpc.sql`.

- [ ] **Step 1.5: Commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add services/supabase/migrations/171_pack_info_sweep_rpc.sql
git commit -m "$(cat <<'EOF'
feat(pack-resolver): migration 171 — sweep candidate RPC (Phase 3)

Adds public.pack_info_sweep_candidates(p_limit int) — used by the
nightly batch sweep to fetch nomenclature rows eligible for pack-info
resolution. JOINs against purchase_logs (LATERAL most-recent) so the
resolver gets supplier_id, barcode, and last_price_thb context.

7-day cooldown filter on skip-decisions matches the JS-side cooldown
in services/mcp-finance/src/lib/pack-info-hook/cooldown.ts.

SECURITY DEFINER; grants to service_role + authenticated only.
Idempotent CREATE OR REPLACE. Self-registers in migration_log.

MC: 25523c4f
Spec: docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md
EOF
)"
```

---

## Task 2: Extend `ErrorReport.stage` and extract `SUSPICIOUS_BASE_UNITS`

**Files:**
- Modify: `services/mcp-finance/src/lib/pack-info-hook/hook.ts`
- Create: `services/mcp-finance/src/lib/pack-info-hook/shared-constants.ts`
- Create: `services/mcp-finance/src/lib/pack-info-hook/shared-constants.test.ts`

- [ ] **Step 2.1: Create the shared constants file**

Create `services/mcp-finance/src/lib/pack-info-hook/shared-constants.ts`:

```ts
/**
 * Base units that suggest the nomenclature row was created from a receipt
 * line where the parser couldn't infer the real weight unit (e.g. "5 pcs"
 * of a flour bag). These are the rows the pack-info pipeline targets for
 * auto-correction.
 *
 * Must stay in sync with the SQL array in
 * services/supabase/migrations/171_pack_info_sweep_rpc.sql (Phase 3 RPC).
 */
export const SUSPICIOUS_BASE_UNITS = new Set(['pcs', 'bag', 'bottle', 'pack']);

/**
 * data_health_rules.rule_code used by both the real-time hook and the
 * nightly sweep. The row is seeded by migration 170.
 */
export const PACK_INFO_RULE_CODE = 'NOMENCLATURE_AUTO_PACK_FILL';

/**
 * Decision-gate thresholds — shared between hook and sweep so the gate
 * behaves identically in both pipelines.
 */
export const AUTO_APPLY_CONFIDENCE = 0.9;
export const PENDING_CONFIDENCE_FLOOR = 0.5;
export const SKIP_COOLDOWN_DAYS = 7;
```

- [ ] **Step 2.2: Create the smoke test for shared-constants**

Create `services/mcp-finance/src/lib/pack-info-hook/shared-constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SUSPICIOUS_BASE_UNITS,
  PACK_INFO_RULE_CODE,
  AUTO_APPLY_CONFIDENCE,
  PENDING_CONFIDENCE_FLOOR,
  SKIP_COOLDOWN_DAYS,
} from './shared-constants.js';

describe('shared-constants', () => {
  it('SUSPICIOUS_BASE_UNITS contains the four target units', () => {
    expect(SUSPICIOUS_BASE_UNITS.has('pcs')).toBe(true);
    expect(SUSPICIOUS_BASE_UNITS.has('bag')).toBe(true);
    expect(SUSPICIOUS_BASE_UNITS.has('bottle')).toBe(true);
    expect(SUSPICIOUS_BASE_UNITS.has('pack')).toBe(true);
    expect(SUSPICIOUS_BASE_UNITS.has('kg')).toBe(false);
  });

  it('rule code matches migration 170 seed', () => {
    expect(PACK_INFO_RULE_CODE).toBe('NOMENCLATURE_AUTO_PACK_FILL');
  });

  it('confidence thresholds are ordered', () => {
    expect(AUTO_APPLY_CONFIDENCE).toBeGreaterThan(PENDING_CONFIDENCE_FLOOR);
    expect(SKIP_COOLDOWN_DAYS).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2.3: Refactor hook.ts to use shared-constants and extend ErrorReport.stage**

Open `services/mcp-finance/src/lib/pack-info-hook/hook.ts` and apply these edits:

Replace the top-of-file block:

```ts
const SUSPICIOUS_BASE_UNITS = new Set(['pcs', 'bag', 'bottle', 'pack']);
const COOLDOWN_DAYS = 7;
const RULE_CODE = 'NOMENCLATURE_AUTO_PACK_FILL';
const AUTO_APPLY_CONFIDENCE = 0.9;
const PENDING_CONFIDENCE_FLOOR = 0.5;
```

with:

```ts
import {
  SUSPICIOUS_BASE_UNITS,
  PACK_INFO_RULE_CODE,
  AUTO_APPLY_CONFIDENCE,
  PENDING_CONFIDENCE_FLOOR,
  SKIP_COOLDOWN_DAYS,
} from './shared-constants.js';
```

(Place this with the other imports at the top.) Then replace every occurrence of `COOLDOWN_DAYS` in the file with `SKIP_COOLDOWN_DAYS` and every occurrence of `RULE_CODE` with `PACK_INFO_RULE_CODE`.

Extend the `ErrorReport.stage` union to include `'sweep-fetch'`. Find the existing interface:

```ts
export interface ErrorReport {
  stage: 'fetch-purchase-logs' | 'fetch-nomenclature' | 'fetch-rule' | 'resolve' | 'write' | 'makro' | 'hook-init';
  level?: 'barcode' | 'fuzzy';
  nomenclature_id?: string;
  message: string;
}
```

Replace with:

```ts
export interface ErrorReport {
  stage:
    | 'fetch-purchase-logs'
    | 'fetch-nomenclature'
    | 'fetch-rule'
    | 'resolve'
    | 'write'
    | 'makro'
    | 'hook-init'
    | 'sweep-fetch';
  level?: 'barcode' | 'fuzzy';
  nomenclature_id?: string;
  message: string;
}
```

- [ ] **Step 2.4: Run hook tests + build**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm run build 2>&1 | tail -10
npm test -- pack-info-hook 2>&1 | tail -20
```

Expected: build passes, all existing pack-info-hook tests pass (refactor is pure rename + union widen).

- [ ] **Step 2.5: Commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add services/mcp-finance/src/lib/pack-info-hook/
git commit -m "$(cat <<'EOF'
refactor(pack-resolver): extract shared constants + extend ErrorReport.stage

Phase 3 prep — sweep needs the same SUSPICIOUS_BASE_UNITS list,
PACK_INFO_RULE_CODE, and gate thresholds as the real-time hook. Move
them to shared-constants.ts so both pipelines reference a single
source of truth (and so the SQL array in migration 171 has an obvious
JS counterpart to mirror).

Also extends ErrorReport.stage with 'sweep-fetch' for the new sweep
candidate-fetch failure path; no functional change to the hook.

MC: 25523c4f
EOF
)"
```

---

## Task 3: `pack-info-sweep/candidates.ts` — RPC wrapper

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-sweep/candidates.ts`
- Create: `services/mcp-finance/src/lib/pack-info-sweep/candidates.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `services/mcp-finance/src/lib/pack-info-sweep/candidates.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchSweepCandidates } from './candidates.js';

function makeSb(rpcResponse: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResponse);
  return { rpc } as unknown as Parameters<typeof fetchSweepCandidates>[0];
}

describe('fetchSweepCandidates', () => {
  it('returns rows from the RPC', async () => {
    const rows = [
      {
        nomenclature_id: '11111111-1111-1111-1111-111111111111',
        base_unit: 'pcs',
        cost_per_unit: 30,
        name: 'Ercho Rice Flour',
        recent_supplier_id: '22222222-2222-2222-2222-222222222222',
        recent_barcode: '8005121004113',
        recent_price_per_unit: 133,
      },
    ];
    const sb = makeSb({ data: rows, error: null });
    const out = await fetchSweepCandidates(sb, 100);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.candidates).toEqual(rows);
    }
  });

  it('passes p_limit to the RPC call', async () => {
    const sb = makeSb({ data: [], error: null });
    await fetchSweepCandidates(sb, 25);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sb as any).rpc).toHaveBeenCalledWith('pack_info_sweep_candidates', { p_limit: 25 });
  });

  it('returns an error result when the RPC fails', async () => {
    const sb = makeSb({ data: null, error: { message: 'permission denied' } });
    const out = await fetchSweepCandidates(sb, 100);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain('permission denied');
    }
  });

  it('returns an empty array when RPC returns null data', async () => {
    const sb = makeSb({ data: null, error: null });
    const out = await fetchSweepCandidates(sb, 100);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.candidates).toEqual([]);
    }
  });
});
```

- [ ] **Step 3.2: Run it to verify FAIL (module not found)**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- candidates 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './candidates.js'`.

- [ ] **Step 3.3: Implement `candidates.ts`**

Create `services/mcp-finance/src/lib/pack-info-sweep/candidates.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SweepCandidate {
  nomenclature_id: string;
  base_unit: string;
  cost_per_unit: number | null;
  name: string | null;
  recent_supplier_id: string;
  recent_barcode: string | null;
  recent_price_per_unit: number | null;
}

export type FetchResult =
  | { ok: true; candidates: SweepCandidate[] }
  | { ok: false; error: string };

/**
 * Wraps the `pack_info_sweep_candidates(p_limit)` Postgres RPC (migration 171).
 * Returns rows of nomenclature joined with their most-recent purchase line,
 * filtered to suspicious base_unit + no recent skip-decision.
 */
export async function fetchSweepCandidates(
  sb: SupabaseClient,
  limit: number,
): Promise<FetchResult> {
  const { data, error } = (await sb.rpc('pack_info_sweep_candidates', { p_limit: limit })) as unknown as {
    data: SweepCandidate[] | null;
    error: { message: string } | null;
  };
  if (error) return { ok: false, error: error.message };
  return { ok: true, candidates: data ?? [] };
}
```

- [ ] **Step 3.4: Run tests to verify PASS**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- candidates 2>&1 | tail -15
```

Expected: 4/4 tests pass.

- [ ] **Step 3.5: Commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add services/mcp-finance/src/lib/pack-info-sweep/candidates.ts \
        services/mcp-finance/src/lib/pack-info-sweep/candidates.test.ts
git commit -m "$(cat <<'EOF'
feat(pack-resolver): pack-info-sweep candidates fetcher (Phase 3)

Thin TS wrapper around migration 171's pack_info_sweep_candidates RPC.
Returns a discriminated-union result so callers can distinguish RPC
failure (e.g. permission denied) from an empty-but-successful sweep.

MC: 25523c4f
EOF
)"
```

---

## Task 4: `pack-info-sweep/sweep.ts` — orchestrator

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-sweep/sweep.ts`
- Create: `services/mcp-finance/src/lib/pack-info-sweep/sweep.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `services/mcp-finance/src/lib/pack-info-sweep/sweep.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPackInfoSweep } from './sweep.js';
import { makeStubProvider } from '../pack-info-resolver/fixtures.js';
import type { SweepCandidate } from './candidates.js';

const NID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SUP = '99999999-9999-9999-9999-999999999999';
const RULE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeCandidate(over: Partial<SweepCandidate> = {}): SweepCandidate {
  return {
    nomenclature_id: NID_A,
    base_unit: 'pcs',
    cost_per_unit: 30,
    name: 'Test Item',
    recent_supplier_id: SUP,
    recent_barcode: '8005121004113',
    recent_price_per_unit: 133,
    ...over,
  };
}

/**
 * Builds a fake SupabaseClient stub with:
 *  - rpc('pack_info_sweep_candidates') → returns `candidates`
 *  - from('data_health_rules') → returns the rule row
 *  - from('data_health_decisions') / .insert() → records calls
 *  - from('nomenclature') / .update() → records calls
 *  - from('supplier_catalog') / .update() → records calls
 *  - cooldown queries return empty (no recent skips)
 */
function makeSb(opts: {
  candidates: SweepCandidate[];
  ruleErr?: string;
  cooldownHit?: boolean;
}) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];

  const rpc = vi.fn().mockResolvedValue({ data: opts.candidates, error: null });

  const from = vi.fn((table: string) => {
    if (table === 'data_health_rules') {
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue(
              opts.ruleErr
                ? { data: null, error: { message: opts.ruleErr } }
                : { data: { id: RULE_ID }, error: null },
            ),
          }),
        }),
      };
    }
    if (table === 'data_health_decisions') {
      const cooldownData = opts.cooldownHit ? [{ id: 'x' }] : [];
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                gt: () => ({
                  limit: vi.fn().mockResolvedValue({ data: cooldownData, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn((row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        }),
      };
    }
    if (table === 'nomenclature') {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          updates.push({ table, patch });
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }),
      };
    }
    if (table === 'supplier_catalog') {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          updates.push({ table, patch });
          return {
            eq: () => ({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    sb: { rpc, from } as unknown as Parameters<typeof runPackInfoSweep>[0],
    inserts,
    updates,
  };
}

describe('runPackInfoSweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-applies when resolver returns confidence >= 0.9 with resolved pack', async () => {
    const provider = makeStubProvider({
      sc_exact: [
        {
          nomenclature_id: NID_A,
          supplier_id: SUP,
          barcode: '8005121004113',
          package_weight: '500g',
          package_qty: null,
          package_unit: null,
        },
      ],
    });
    const { sb, inserts, updates } = makeSb({ candidates: [makeCandidate()] });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.errors).toEqual([]);
    expect(result.auto_applied).toHaveLength(1);
    expect(result.auto_applied[0].nomenclature_id).toBe(NID_A);
    expect(result.auto_applied[0].action).toBe('auto-applied');

    // nomenclature base_unit was updated (pcs → kg)
    expect(updates.some((u) => u.table === 'nomenclature' && u.patch.base_unit === 'kg')).toBe(true);
    // supplier_catalog cache was refreshed
    expect(updates.some((u) => u.table === 'supplier_catalog')).toBe(true);
    // applied decision row exists
    expect(inserts.some((i) => i.row.status === 'applied' && i.row.field === 'base_unit')).toBe(true);
    // cost_per_unit pending row exists
    expect(
      inserts.some((i) => i.row.status === 'pending' && i.row.field === 'cost_per_unit'),
    ).toBe(true);
  });

  it('queues pending when the resolver returns 0.5 <= conf < 0.9 (makro_fuzzy hit)', async () => {
    const provider = makeStubProvider({
      makro_name: { found: true, unit: '500g' },
    });
    const { sb, inserts } = makeSb({
      candidates: [
        makeCandidate({
          recent_barcode: null,
          name: 'Mystery Flour',
        }),
      ],
    });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.errors).toEqual([]);
    expect(result.pending).toHaveLength(1);
    expect(result.auto_applied).toEqual([]);
    expect(inserts.some((i) => i.row.status === 'pending' && i.row.decision_source === 'rule_auto')).toBe(true);
  });

  it('records conflict-driven pending when two supplier_catalog rows disagree', async () => {
    const provider = makeStubProvider({
      sc_fuzzy: [
        {
          nomenclature_id: NID_A,
          supplier_id: SUP,
          barcode: null,
          package_weight: '500g',
          package_qty: null,
          package_unit: null,
        },
        {
          nomenclature_id: NID_A,
          supplier_id: 'sup-other',
          barcode: null,
          package_weight: '1kg',
          package_qty: null,
          package_unit: null,
        },
      ],
    });
    const { sb, inserts } = makeSb({
      candidates: [makeCandidate({ recent_barcode: null })],
    });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.pending).toHaveLength(1);
    expect(inserts.some((i) => i.row.decision_source === 'rule_auto_conflict' && i.row.status === 'pending')).toBe(true);
  });

  it('writes a skip-decision when cascade fails entirely', async () => {
    const provider = makeStubProvider({}); // every source empty / not-found
    const { sb, inserts } = makeSb({ candidates: [makeCandidate({ recent_barcode: null })] });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.skipped.some((s) => s.reason === 'cascade-fail')).toBe(true);
    expect(inserts.some((i) => i.row.status === 'skip' && i.row.decision_source === 'skip')).toBe(true);
  });

  it('honors the 7-day cooldown — skips silently without writing', async () => {
    const provider = makeStubProvider({});
    const { sb, inserts } = makeSb({
      candidates: [makeCandidate()],
      cooldownHit: true,
    });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });

    expect(result.skipped.some((s) => s.reason === '7d-cooldown')).toBe(true);
    // No insert at all (cooldown is "do nothing", not "re-skip")
    expect(inserts).toEqual([]);
  });

  it('returns a sweep-fetch error and an empty result when the RPC fails', async () => {
    const provider = makeStubProvider({});
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
      from: vi.fn(),
    } as unknown as Parameters<typeof runPackInfoSweep>[0];
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });
    expect(result.errors[0].stage).toBe('sweep-fetch');
    expect(result.errors[0].message).toContain('permission denied');
    expect(result.auto_applied).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it('emits a fetch-rule error and skips work when the rule lookup fails', async () => {
    const provider = makeStubProvider({});
    const { sb } = makeSb({ candidates: [makeCandidate()], ruleErr: 'no row' });
    const result = await runPackInfoSweep(sb, provider, { limit: 10 });
    expect(result.errors.some((e) => e.stage === 'fetch-rule')).toBe(true);
  });

  it('uses the provided run_id when supplied', async () => {
    const provider = makeStubProvider({});
    const { sb, inserts } = makeSb({ candidates: [makeCandidate({ recent_barcode: null })] });
    const RUN = '00000000-0000-0000-0000-000000000099';
    await runPackInfoSweep(sb, provider, { limit: 10, runId: RUN });
    // skip row carries the run_id
    expect(inserts.some((i) => i.row.run_id === RUN)).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run tests to verify FAIL**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- sweep 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module './sweep.js'`.

- [ ] **Step 4.3: Implement `sweep.ts`**

Create `services/mcp-finance/src/lib/pack-info-sweep/sweep.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolve, type PackInfoDataProvider, type ResolverResult } from '../pack-info-resolver/index.js';
import { hasRecentSkipDecision } from '../pack-info-hook/cooldown.js';
import { writeAutoApply, writePending, writeSkip } from '../pack-info-hook/decisions-writer.js';
import {
  SUSPICIOUS_BASE_UNITS,
  PACK_INFO_RULE_CODE,
  AUTO_APPLY_CONFIDENCE,
  PENDING_CONFIDENCE_FLOOR,
  SKIP_COOLDOWN_DAYS,
} from '../pack-info-hook/shared-constants.js';
import type { CorrectionReport, ErrorReport } from '../pack-info-hook/hook.js';
import { fetchSweepCandidates, type SweepCandidate } from './candidates.js';

export interface SweepOpts {
  /** Max nomenclature rows to sweep in this run. Defaults to 100. */
  limit?: number;
  /** Optional fixed run_id (UUID). Defaults to a freshly-generated UUID. */
  runId?: string;
}

export interface SweepResult {
  run_id: string;
  total_candidates: number;
  auto_applied: CorrectionReport[];
  pending: CorrectionReport[];
  skipped: Array<{ nomenclature_id: string; reason: string }>;
  errors: ErrorReport[];
}

const DEFAULT_LIMIT = 100;

export async function runPackInfoSweep(
  sb: SupabaseClient,
  provider: PackInfoDataProvider,
  opts: SweepOpts = {},
): Promise<SweepResult> {
  const run_id = opts.runId ?? crypto.randomUUID();
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const auto_applied: CorrectionReport[] = [];
  const pending: CorrectionReport[] = [];
  const skipped: Array<{ nomenclature_id: string; reason: string }> = [];
  const errors: ErrorReport[] = [];

  // 1. Fetch candidates via RPC
  const fetched = await fetchSweepCandidates(sb, limit);
  if (!fetched.ok) {
    errors.push({ stage: 'sweep-fetch', message: fetched.error });
    return { run_id, total_candidates: 0, auto_applied, pending, skipped, errors };
  }
  const candidates = fetched.candidates;
  if (candidates.length === 0) {
    return { run_id, total_candidates: 0, auto_applied, pending, skipped, errors };
  }

  // 2. Resolve rule_id once
  const { data: ruleRow, error: ruleErr } = (await sb
    .from('data_health_rules')
    .select('id')
    .eq('rule_code', PACK_INFO_RULE_CODE)
    .single()) as unknown as { data: { id: string } | null; error: { message: string } | null };

  if (ruleErr || !ruleRow) {
    errors.push({ stage: 'fetch-rule', message: ruleErr?.message ?? `rule ${PACK_INFO_RULE_CODE} not found` });
    return { run_id, total_candidates: candidates.length, auto_applied, pending, skipped, errors };
  }
  const rule_id = ruleRow.id;

  // 3. Iterate
  for (const c of candidates) {
    if (!SUSPICIOUS_BASE_UNITS.has(c.base_unit)) {
      // RPC already filters but double-check guards against schema drift
      continue;
    }

    if (await hasRecentSkipDecision(sb, c.nomenclature_id, 'base_unit', SKIP_COOLDOWN_DAYS)) {
      skipped.push({ nomenclature_id: c.nomenclature_id, reason: '7d-cooldown' });
      continue;
    }

    let result: ResolverResult;
    try {
      result = await resolve(
        {
          nomenclature_id: c.nomenclature_id,
          supplier_id: c.recent_supplier_id,
          barcode: c.recent_barcode ?? undefined,
          last_price_thb: c.recent_price_per_unit ?? undefined,
          name: c.name ?? undefined,
          onMakroError: (err, level) => {
            errors.push({
              stage: 'makro',
              level,
              nomenclature_id: c.nomenclature_id,
              message: err.message,
            });
          },
        },
        provider,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ stage: 'resolve', nomenclature_id: c.nomenclature_id, message: error.message });
      continue;
    }

    // Defensive invariant — matches hook.ts logic
    if (result.confidence >= AUTO_APPLY_CONFIDENCE && !result.resolved && result.conflicts.length === 0) {
      errors.push({
        stage: 'resolve',
        nomenclature_id: c.nomenclature_id,
        message: 'invariant violated: high-confidence result has no resolved pack info and no conflicts',
      });
      continue;
    }

    try {
      if (
        result.conflicts.length > 0 ||
        (result.confidence >= PENDING_CONFIDENCE_FLOOR && result.confidence < AUTO_APPLY_CONFIDENCE)
      ) {
        await writePending(sb, { run_id, rule_id, result, current_base_unit: c.base_unit });
        pending.push({
          nomenclature_id: c.nomenclature_id,
          action: 'pending',
          source: result.source,
          confidence: result.confidence,
          resolved_base_unit: result.resolved?.base_unit,
        });
      } else if (result.confidence >= AUTO_APPLY_CONFIDENCE && result.resolved) {
        await writeAutoApply(sb, {
          run_id,
          rule_id,
          result,
          supplier_id: c.recent_supplier_id,
          current_base_unit: c.base_unit,
          current_cost_per_unit: c.cost_per_unit,
        });
        auto_applied.push({
          nomenclature_id: c.nomenclature_id,
          action: 'auto-applied',
          source: result.source,
          confidence: result.confidence,
          resolved_base_unit: result.resolved.base_unit,
        });
      } else {
        await writeSkip(sb, {
          run_id,
          rule_id,
          nomenclature_id: c.nomenclature_id,
          current_base_unit: c.base_unit,
          reason: 'cascade-fail',
        });
        skipped.push({ nomenclature_id: c.nomenclature_id, reason: 'cascade-fail' });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ stage: 'write', nomenclature_id: c.nomenclature_id, message: error.message });
    }
  }

  return { run_id, total_candidates: candidates.length, auto_applied, pending, skipped, errors };
}
```

- [ ] **Step 4.4: Run tests to verify PASS**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- sweep 2>&1 | tail -25
```

Expected: 8/8 tests pass.

- [ ] **Step 4.5: Commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add services/mcp-finance/src/lib/pack-info-sweep/sweep.ts \
        services/mcp-finance/src/lib/pack-info-sweep/sweep.test.ts
git commit -m "$(cat <<'EOF'
feat(pack-resolver): runPackInfoSweep orchestrator (Phase 3)

Companion to Phase 2's runPackInfoHook for nightly batch processing.
Pulls candidates from migration 171's RPC, resolves each through the
Phase 1 resolver, and routes through the same decision gate
(auto-apply ≥0.9, pending ≥0.5, skip otherwise). Reuses cooldown helper
and the three writers from pack-info-hook/ — no new DB write logic.

run_id semantics: receipt hook uses expense_id as run_id (one batch =
one receipt); sweep generates a fresh UUID per invocation, also
returned in SweepResult.run_id for log correlation.

MC: 25523c4f
EOF
)"
```

---

## Task 5: `pack-info-sweep/notifier.ts` — summary publisher

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-sweep/notifier.ts`
- Create: `services/mcp-finance/src/lib/pack-info-sweep/notifier.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `services/mcp-finance/src/lib/pack-info-sweep/notifier.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postSweepSummary, formatSummaryBody } from './notifier.js';
import type { SweepResult } from './sweep.js';

const RUN = '00000000-0000-0000-0000-0000000000aa';

function makeResult(over: Partial<SweepResult> = {}): SweepResult {
  return {
    run_id: RUN,
    total_candidates: 3,
    auto_applied: [
      {
        nomenclature_id: 'aaa',
        action: 'auto-applied',
        source: 'supplier_catalog_exact',
        confidence: 1.0,
        resolved_base_unit: 'kg',
      },
    ],
    pending: [
      {
        nomenclature_id: 'bbb',
        action: 'pending',
        source: 'makro_fuzzy',
        confidence: 0.6,
        resolved_base_unit: 'kg',
      },
    ],
    skipped: [{ nomenclature_id: 'ccc', reason: 'cascade-fail' }],
    errors: [],
    ...over,
  };
}

describe('formatSummaryBody', () => {
  it('includes the run_id and the three counters', () => {
    const body = formatSummaryBody(makeResult());
    expect(body).toContain('Pack-info sweep');
    expect(body).toContain('1 auto-applied');
    expect(body).toContain('1 pending');
    expect(body).toContain('1 skipped');
    expect(body).toContain(RUN);
  });

  it('mentions errors when non-empty', () => {
    const body = formatSummaryBody(
      makeResult({ errors: [{ stage: 'makro', message: 'timeout', nomenclature_id: 'xxx' }] }),
    );
    expect(body).toMatch(/error/i);
    expect(body).toContain('makro');
    expect(body).toContain('timeout');
  });

  it('handles an empty result gracefully', () => {
    const body = formatSummaryBody(
      makeResult({ total_candidates: 0, auto_applied: [], pending: [], skipped: [], errors: [] }),
    );
    expect(body).toContain('0 auto-applied');
    expect(body).toContain('0 candidates');
  });
});

describe('postSweepSummary', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    logSpy.mockClear();
    errSpy.mockClear();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('prints a single JSON line to stdout', async () => {
    const sb = null;
    await postSweepSummary(sb, { task_id: null, result: makeResult() });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const printed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(printed.run_id).toBe(RUN);
    expect(printed.counts).toEqual({ candidates: 3, auto_applied: 1, pending: 1, skipped: 1, errors: 0 });
  });

  it('skips the MC comment insert when task_id is null', async () => {
    const sb = { from: vi.fn() } as unknown as Parameters<typeof postSweepSummary>[0];
    await postSweepSummary(sb, { task_id: null, result: makeResult() });
    expect((sb as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it('posts a task_comments row when task_id is provided', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const sb = {
      from: vi.fn(() => ({ insert })),
    } as unknown as Parameters<typeof postSweepSummary>[0];
    await postSweepSummary(sb, { task_id: 'TASK-123', result: makeResult() });
    expect((sb as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('task_comments');
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.task_id).toBe('TASK-123');
    expect(row.author).toBe('pack-info-sweep');
    expect(row.body).toContain('Pack-info sweep');
  });

  it('logs a warning when the MC insert fails but does not throw', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'rls denied' } });
    const sb = {
      from: vi.fn(() => ({ insert })),
    } as unknown as Parameters<typeof postSweepSummary>[0];
    await expect(
      postSweepSummary(sb, { task_id: 'TASK-123', result: makeResult() }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Run tests to verify FAIL**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- notifier 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './notifier.js'`.

- [ ] **Step 5.3: Implement `notifier.ts`**

Create `services/mcp-finance/src/lib/pack-info-sweep/notifier.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SweepResult } from './sweep.js';

export interface NotifierInput {
  /** MC task UUID for the per-run comment, or null to skip the comment. */
  task_id: string | null;
  result: SweepResult;
}

/**
 * Builds the human-readable comment body posted to MC.
 * Exported separately for unit testing.
 */
export function formatSummaryBody(r: SweepResult): string {
  const lines: string[] = [];
  lines.push(`## Pack-info sweep — run ${r.run_id}`);
  lines.push('');
  lines.push(
    `Scanned ${r.total_candidates} candidates → ${r.auto_applied.length} auto-applied, ` +
      `${r.pending.length} pending, ${r.skipped.length} skipped.`,
  );

  if (r.auto_applied.length > 0) {
    lines.push('');
    lines.push('### Auto-applied');
    for (const c of r.auto_applied) {
      lines.push(`- ${c.nomenclature_id} → ${c.resolved_base_unit ?? '?'} (source: ${c.source ?? 'n/a'}, conf=${c.confidence})`);
    }
  }

  if (r.pending.length > 0) {
    lines.push('');
    lines.push('### Pending review');
    for (const c of r.pending) {
      lines.push(`- ${c.nomenclature_id} → ${c.resolved_base_unit ?? '?'} (source: ${c.source ?? 'n/a'}, conf=${c.confidence})`);
    }
  }

  if (r.skipped.length > 0) {
    lines.push('');
    lines.push('### Skipped');
    for (const s of r.skipped) {
      lines.push(`- ${s.nomenclature_id}: ${s.reason}`);
    }
  }

  if (r.errors.length > 0) {
    lines.push('');
    lines.push(`### Errors (${r.errors.length})`);
    for (const e of r.errors) {
      const nid = e.nomenclature_id ? ` (${e.nomenclature_id})` : '';
      lines.push(`- [${e.stage}]${nid} ${e.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Emits a structured JSON line to stdout (captured by GitHub Actions log)
 * and optionally inserts a task_comments row for human-readable visibility
 * in Mission Control.
 *
 * Failures to post the MC comment are logged to stderr but do not throw —
 * the sweep itself is the source of truth via data_health_decisions.
 */
export async function postSweepSummary(
  sb: SupabaseClient | null,
  input: NotifierInput,
): Promise<void> {
  const json = {
    event: 'pack_info_sweep_summary',
    run_id: input.result.run_id,
    counts: {
      candidates: input.result.total_candidates,
      auto_applied: input.result.auto_applied.length,
      pending: input.result.pending.length,
      skipped: input.result.skipped.length,
      errors: input.result.errors.length,
    },
    errors: input.result.errors,
  };
  console.log(JSON.stringify(json));

  if (!sb || !input.task_id) return;

  const { error } = await sb.from('task_comments').insert({
    task_id: input.task_id,
    author: 'pack-info-sweep',
    body: formatSummaryBody(input.result),
  });
  if (error) {
    console.error(`[pack-info-sweep] failed to post MC comment to ${input.task_id}: ${error.message}`);
  }
}
```

- [ ] **Step 5.4: Run tests to verify PASS**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- notifier 2>&1 | tail -15
```

Expected: 7/7 tests pass.

- [ ] **Step 5.5: Commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add services/mcp-finance/src/lib/pack-info-sweep/notifier.ts \
        services/mcp-finance/src/lib/pack-info-sweep/notifier.test.ts
git commit -m "$(cat <<'EOF'
feat(pack-resolver): sweep summary notifier — stdout JSON + MC comment

Two-channel summary publisher: JSON line to stdout (visible in GitHub
Actions log, machine-parseable) plus a markdown task_comments row on
the Phase 3 MC task per CEO directive 2026-05-11.

MC comment failures are logged to stderr but never throw — the
authoritative record of a sweep run is data_health_decisions; the
comment is for human triage only.

MC: 25523c4f
EOF
)"
```

---

## Task 6: `pack-info-sweep/index.ts` — barrel export

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-sweep/index.ts`
- Create: `services/mcp-finance/src/lib/pack-info-sweep/index.test.ts`

- [ ] **Step 6.1: Write the barrel + smoke test**

Create `services/mcp-finance/src/lib/pack-info-sweep/index.ts`:

```ts
export { runPackInfoSweep } from './sweep.js';
export type { SweepOpts, SweepResult } from './sweep.js';
export { fetchSweepCandidates } from './candidates.js';
export type { SweepCandidate, FetchResult } from './candidates.js';
export { postSweepSummary, formatSummaryBody } from './notifier.js';
export type { NotifierInput } from './notifier.js';
```

Create `services/mcp-finance/src/lib/pack-info-sweep/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  runPackInfoSweep,
  fetchSweepCandidates,
  postSweepSummary,
  formatSummaryBody,
} from './index.js';

describe('pack-info-sweep barrel', () => {
  it('exports the public surface', () => {
    expect(typeof runPackInfoSweep).toBe('function');
    expect(typeof fetchSweepCandidates).toBe('function');
    expect(typeof postSweepSummary).toBe('function');
    expect(typeof formatSummaryBody).toBe('function');
  });
});
```

- [ ] **Step 6.2: Run + commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- pack-info-sweep 2>&1 | tail -25
```

Expected: all pack-info-sweep tests still pass.

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add services/mcp-finance/src/lib/pack-info-sweep/index.ts \
        services/mcp-finance/src/lib/pack-info-sweep/index.test.ts
git commit -m "$(cat <<'EOF'
feat(pack-resolver): pack-info-sweep barrel export

Exposes the public surface (runPackInfoSweep + helpers + types) used
by the CLI entrypoint and any future consumer.

MC: 25523c4f
EOF
)"
```

---

## Task 7: `jobs/pack-info-sweep.ts` — CLI entrypoint

**Files:**
- Create: `services/mcp-finance/src/jobs/pack-info-sweep.ts`
- Create: `services/mcp-finance/src/jobs/pack-info-sweep.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `services/mcp-finance/src/jobs/pack-info-sweep.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveJobConfig } from './pack-info-sweep.js';

describe('resolveJobConfig', () => {
  it('reads SUPABASE_URL and SERVICE_ROLE_KEY from env', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sk_test',
      PACK_INFO_SWEEP_LIMIT: undefined,
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      expect(cfg.value.supabaseUrl).toBe('https://x.supabase.co');
      expect(cfg.value.serviceRoleKey).toBe('sk_test');
      expect(cfg.value.limit).toBe(100); // default
      expect(cfg.value.mcTaskId).toBeNull();
    }
  });

  it('parses optional PACK_INFO_SWEEP_LIMIT', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      PACK_INFO_SWEEP_LIMIT: '25',
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(true);
    if (cfg.ok) expect(cfg.value.limit).toBe(25);
  });

  it('threads PACK_INFO_SWEEP_MC_TASK_ID through when set', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      PACK_INFO_SWEEP_LIMIT: undefined,
      PACK_INFO_SWEEP_MC_TASK_ID: 'TASK-9',
    });
    expect(cfg.ok).toBe(true);
    if (cfg.ok) expect(cfg.value.mcTaskId).toBe('TASK-9');
  });

  it('fails when SUPABASE_URL is missing', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      PACK_INFO_SWEEP_LIMIT: undefined,
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toContain('SUPABASE_URL');
  });

  it('fails when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      PACK_INFO_SWEEP_LIMIT: undefined,
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('fails when PACK_INFO_SWEEP_LIMIT is not a positive int', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      PACK_INFO_SWEEP_LIMIT: 'abc',
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toContain('PACK_INFO_SWEEP_LIMIT');
  });
});
```

- [ ] **Step 7.2: Run to verify FAIL**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- pack-info-sweep.test 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement the CLI**

Create `services/mcp-finance/src/jobs/pack-info-sweep.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { runPackInfoSweep, postSweepSummary } from '../lib/pack-info-sweep/index.js';
import { createSupabaseProvider, type MakroResult } from '../lib/pack-info-resolver/index.js';
import { makroLookup } from '../tools/makro-lookup.js';

export interface JobConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  limit: number;
  mcTaskId: string | null;
}

export type ConfigResult =
  | { ok: true; value: JobConfig }
  | { ok: false; error: string };

interface RawEnv {
  SUPABASE_URL: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  PACK_INFO_SWEEP_LIMIT: string | undefined;
  PACK_INFO_SWEEP_MC_TASK_ID: string | undefined;
}

/** Pure function — exported for unit testing. */
export function resolveJobConfig(env: RawEnv): ConfigResult {
  if (!env.SUPABASE_URL) return { ok: false, error: 'missing SUPABASE_URL' };
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: 'missing SUPABASE_SERVICE_ROLE_KEY' };

  let limit = 100;
  if (env.PACK_INFO_SWEEP_LIMIT !== undefined) {
    const parsed = Number.parseInt(env.PACK_INFO_SWEEP_LIMIT, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, error: `PACK_INFO_SWEEP_LIMIT must be a positive integer (got: ${env.PACK_INFO_SWEEP_LIMIT})` };
    }
    limit = parsed;
  }

  return {
    ok: true,
    value: {
      supabaseUrl: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      limit,
      mcTaskId: env.PACK_INFO_SWEEP_MC_TASK_ID ?? null,
    },
  };
}

async function main(): Promise<number> {
  const cfg = resolveJobConfig({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PACK_INFO_SWEEP_LIMIT: process.env.PACK_INFO_SWEEP_LIMIT,
    PACK_INFO_SWEEP_MC_TASK_ID: process.env.PACK_INFO_SWEEP_MC_TASK_ID,
  });
  if (!cfg.ok) {
    console.error(`[pack-info-sweep] config error: ${cfg.error}`);
    return 2;
  }

  const sb = createClient(cfg.value.supabaseUrl, cfg.value.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Same adapter shape as services/mcp-finance/src/tools/approve-receipt.ts:174
  // — createSupabaseProvider takes a single fetchMakro(query) function and
  // routes both barcode + name lookups through it.
  const fetchMakro = async (q: string): Promise<MakroResult> => {
    const raw = await makroLookup({ barcode: q });
    const r = raw as { found?: boolean; name?: string | null; unit?: string | null; brand?: string | null };
    return {
      found: !!r.found,
      name: r.name ?? null,
      unit: r.unit ?? null,
      brand: r.brand ?? null,
    };
  };
  const provider = createSupabaseProvider(sb, fetchMakro);

  const result = await runPackInfoSweep(sb, provider, { limit: cfg.value.limit });
  await postSweepSummary(sb, { task_id: cfg.value.mcTaskId, result });

  // Exit 0 even when the sweep reports per-row errors — the cron should not
  // be marked "failed" on an external-source flake. The summary already
  // carries the error list; a non-zero exit is reserved for catastrophic
  // failure (config, RPC, etc.) where main throws.
  return 0;
}

// ES-module entrypoint guard
const invokedDirectly =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (globalThis as any).process !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).url === `file://${(globalThis as any).process.argv[1]}`;

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`[pack-info-sweep] fatal: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
```

**Note on the adapter:** `createSupabaseProvider(sb, fetchMakro)` takes a single fetcher and routes both barcode and name queries through it (see `services/mcp-finance/src/lib/pack-info-resolver/data-provider.ts:27`). The adapter wrapping `makroLookup({barcode: q})` mirrors the Phase 2 pattern in `approve-receipt.ts:174` — keep the two shapes in sync.

- [ ] **Step 7.4: Sanity-check that imports resolve at build time**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm run build 2>&1 | tail -10
```

Expected: clean build. If any import path is wrong (e.g. `MakroResult` re-export missing from `pack-info-resolver/index.ts`), fix it now before running unit tests.

- [ ] **Step 7.5: Run tests to verify PASS**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- pack-info-sweep.test 2>&1 | tail -15
```

Expected: 6/6 resolveJobConfig tests pass.

- [ ] **Step 7.6: Commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add services/mcp-finance/src/jobs/pack-info-sweep.ts \
        services/mcp-finance/src/jobs/pack-info-sweep.test.ts
git commit -m "$(cat <<'EOF'
feat(pack-resolver): pack-info-sweep CLI entrypoint (Phase 3)

Node CLI consumed by the GitHub Actions schedule. Reads config from
env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional
PACK_INFO_SWEEP_LIMIT, optional PACK_INFO_SWEEP_MC_TASK_ID),
constructs the Supabase client + resolver provider, runs the sweep,
publishes the summary.

Exits 0 on per-row errors (logged in summary). Non-zero only on
catastrophic failure (config invalid, RPC unreachable) — the cron
shouldn't be flagged red on external-source flakes.

MC: 25523c4f
EOF
)"
```

---

## Task 8: npm script + package.json update

**Files:**
- Modify: `services/mcp-finance/package.json`

- [ ] **Step 8.1: Add sweep script**

Open `services/mcp-finance/package.json` and add to `scripts`:

```json
"sweep:pack-info": "tsx src/jobs/pack-info-sweep.ts"
```

Resulting scripts block:

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "tsx src/index.ts",
  "lint": "eslint src/",
  "test": "vitest run",
  "test:watch": "vitest",
  "sweep:pack-info": "tsx src/jobs/pack-info-sweep.ts"
}
```

- [ ] **Step 8.2: Verify lint + build pass**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
```

Expected: both pass (no new lint errors).

- [ ] **Step 8.3: Verify the sweep script is invocable (dry — only config error path)**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
# Intentionally no env vars — should exit 2 with config error
SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= npm run -s sweep:pack-info; echo "exit=$?"
```

Expected: prints `[pack-info-sweep] config error: missing SUPABASE_URL` (stderr) and `exit=2`.

- [ ] **Step 8.4: Commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add services/mcp-finance/package.json
git commit -m "$(cat <<'EOF'
feat(pack-resolver): add sweep:pack-info npm script

Wires the Phase 3 CLI as an npm script so the GitHub Actions cron can
invoke it via 'npm run sweep:pack-info' in services/mcp-finance/.

MC: 25523c4f
EOF
)"
```

---

## Task 9: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/pack-info-sweep.yml`

- [ ] **Step 9.1: Write the workflow**

Create `.github/workflows/pack-info-sweep.yml`:

```yaml
name: Pack-Info Sweep

on:
  # 03:00 Bangkok = 20:00 UTC previous day (Bangkok is UTC+7, no DST)
  schedule:
    - cron: '0 20 * * *'
  # Manual trigger for ad-hoc runs / smoke tests
  workflow_dispatch:
    inputs:
      limit:
        description: 'Max nomenclature rows to sweep'
        required: false
        default: '100'

concurrency:
  group: pack-info-sweep
  cancel-in-progress: false

jobs:
  sweep:
    name: Run nightly pack-info sweep
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/mcp-finance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: services/mcp-finance/package-lock.json
      - run: npm ci
      - name: Run sweep
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          PACK_INFO_SWEEP_LIMIT: ${{ github.event.inputs.limit || '100' }}
          PACK_INFO_SWEEP_MC_TASK_ID: '25523c4f-a7ce-43fc-96e4-bc2e304b6d11'
        run: npm run sweep:pack-info
```

- [ ] **Step 9.2: Validate YAML syntax**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
# Use Node to validate YAML — Python may not be installed
node -e "const yaml=require('js-yaml'); const fs=require('fs'); yaml.load(fs.readFileSync('.github/workflows/pack-info-sweep.yml','utf8')); console.log('ok');" 2>&1 || \
  python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pack-info-sweep.yml')); print('ok')"
```

Expected: `ok`. If neither tool is available, skip — `actionlint` will validate on PR.

- [ ] **Step 9.3: Commit**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git add .github/workflows/pack-info-sweep.yml
git commit -m "$(cat <<'EOF'
feat(pack-resolver): GitHub Actions schedule for nightly sweep (Phase 3)

Cron at 20:00 UTC daily (= 03:00 Bangkok, UTC+7 no DST). workflow_dispatch
enabled with a `limit` input for ad-hoc smoke runs.

Concurrency group prevents overlapping runs if a sweep takes longer
than 24h (extremely unlikely at limit=100, but defensive).

Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. MC task id
hard-coded to 25523c4f so per-run comments land on the Phase 3 task.

MC: 25523c4f
EOF
)"
```

---

## Task 10: Final build + lint + full test pass

- [ ] **Step 10.1: Run the full mcp-finance suite**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm run lint 2>&1 | tail -5
npm run build 2>&1 | tail -10
npm test 2>&1 | tail -30
```

Expected: lint clean, build clean, all tests pass (~25 new tests on top of Phase 2's 43).

- [ ] **Step 10.2: Confirm no Phase 2 regression — old hook tests still pass**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3/services/mcp-finance
npm test -- pack-info-hook 2>&1 | tail -10
```

Expected: every existing pack-info-hook test still green.

- [ ] **Step 10.3: Verify migration is on remote DB**

```bash
DB_URL="$(security find-generic-password -s 'shishka-database-url' -w)" \
  psql "$DB_URL" -tAc "SELECT filename FROM public.migration_log WHERE filename='171_pack_info_sweep_rpc.sql';" 2>/dev/null
unset DB_URL
```

Expected: `171_pack_info_sweep_rpc.sql` (applied in Task 1.2; this is just a sanity recheck).

- [ ] **Step 10.4: Smoke the RPC against real data**

```bash
DB_URL="$(security find-generic-password -s 'shishka-database-url' -w)" \
  psql "$DB_URL" -c "SELECT * FROM public.pack_info_sweep_candidates(5);" 2>/dev/null | head -20
unset DB_URL
```

Expected: 0-5 candidate rows with the seven columns. Either result is fine — it just confirms the RPC's plan is valid.

- [ ] **Step 10.5: Push branch + open PR**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
git push -u origin feature/data-health/pack-info-phase3
gh pr create --base main --title "feat(pack-resolver): Phase 3 nightly batch sweep (initiative e8df7bc4)" --body "$(cat <<'EOF'
## Summary

Phase 3 of the Pack-Info Resolver initiative ([umbrella e8df7bc4](https://github.com/Lesyanich/shishka-os/issues?q=is%3Aissue+e8df7bc4)). Adds a nightly GitHub Actions cron that scans `nomenclature` rows with suspicious `base_unit` (pcs/bag/bottle/pack) plus at least one historical purchase, resolves their pack info via the Phase 1 cascade, and routes through the Phase 2 decision gate — so backlog rows get cleaned up over time without manual migrations.

Predecessors:
- Phase 1 (PR #182, sha `7a62d66`): resolver lib + migration 170
- Phase 2 (PR #183, sha `8d41b46`): real-time hook in `approve-receipt`

## What's in this PR

- **Migration 171** — `pack_info_sweep_candidates(p_limit int)` RPC. JOINs nomenclature with most-recent purchase_log line (LATERAL) so the resolver gets supplier_id / barcode / price context. SECURITY DEFINER, idempotent.
- **`services/mcp-finance/src/lib/pack-info-sweep/`** — new module:
  - `candidates.ts` — thin RPC wrapper
  - `sweep.ts` — `runPackInfoSweep` orchestrator (reuses cooldown helper + 3 writers from Phase 2 `pack-info-hook/`)
  - `notifier.ts` — `postSweepSummary` (stdout JSON + MC comment via task_comments)
  - `index.ts` — barrel
- **`services/mcp-finance/src/jobs/pack-info-sweep.ts`** — Node CLI entrypoint
- **`services/mcp-finance/src/lib/pack-info-hook/shared-constants.ts`** — extracted constants shared by hook + sweep (SUSPICIOUS_BASE_UNITS, gate thresholds, rule code, cooldown days)
- **`services/mcp-finance/src/lib/pack-info-hook/hook.ts`** — `ErrorReport.stage` extended with `'sweep-fetch'`; refactored to import shared constants
- **`services/mcp-finance/package.json`** — `sweep:pack-info` npm script
- **`.github/workflows/pack-info-sweep.yml`** — schedule `0 20 * * *` (= 03:00 Bangkok) + `workflow_dispatch`

## Decisions

- **Separate orchestrator** (Option A from CEO socratic gate 2026-05-11): kept hook untouched; sweep has different fetch shape (no `expense_id`, no `food_items` brand context).
- **`run_id` per sweep run** — fresh UUID, threaded through writers. Receipt hook still uses `expense_id` as `run_id`; sweep does not have one.
- **Cron host: GitHub Actions** — matches the existing `prune-memories` pattern in `ci.yml`. No new infrastructure.
- **Notification** — JSON to stdout (Actions log) + MC comment on task `25523c4f`. CEO approved one comment per run.

## Deferred concerns (carried from Phase 2)

These are noted in the plan but out of scope:

1. **Unconditional `supplier_catalog.package_*` update** in `writeAutoApply` — could churn `updated_at` for sweep batches. Fix requires extending `AutoApplyArgs` with `current_package_*` plus RPC field. Separate task if it surfaces as noise.
2. **`decision_source='rule_auto'` ambiguity** — pending low-conf vs applied base_unit share the same value, differentiated only by `status`. Splitting requires migration 172 to extend the CHECK constraint with `'rule_auto_low_conf'`.

## Test plan

- [x] Unit tests for `fetchSweepCandidates` (RPC call + error path)
- [x] Unit tests for `runPackInfoSweep` (auto-apply / pending / conflict / skip / cooldown / RPC fail / rule-fail / explicit run_id)
- [x] Unit tests for `postSweepSummary` (stdout JSON / MC comment / null task_id / DB error)
- [x] Unit tests for `formatSummaryBody`
- [x] Unit tests for `resolveJobConfig` (env parsing + validation)
- [x] HC-3 smoke for barrel + jobs
- [x] `npm run build && npm run lint` pass
- [x] Migration 171 applied to remote DB
- [x] RPC smoke from psql
- [ ] First scheduled run (post-merge, observe Actions tab + MC comment)

MC: 25523c4f
Spec: docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md
EOF
)" 2>&1 | tail -5
```

- [ ] **Step 10.6: Wait for CI green, then merge**

```bash
cd ~/code/shishka-worktrees/pack-info-phase3
# Watch CI
gh pr checks --watch 2>&1 | tail -20
# When green:
gh pr merge --squash --delete-branch
```

- [ ] **Step 10.7: Capture merge SHA + clean up**

```bash
git fetch origin main
MERGE_SHA="$(git log origin/main --pretty=format:%h -1)"
echo "MERGE_SHA=$MERGE_SHA"
cd ~/code/shishka-worktrees
git worktree remove pack-info-phase3
```

- [ ] **Step 10.8: Close the MC task**

Use `mcp__shishka-mission-control__update_task` to set status=done with notes referencing the PR + merge sha. Then `add_comment` on the umbrella `e8df7bc4` with a Phase 3 SHIPPED summary (parallel to the Phase 1 / Phase 2 comments already there).

---

## Self-Review

### Spec coverage

- [x] § Batch Cron Flow — eligibility query → migration 171 RPC; orchestrator in Task 4; schedule at 20:00 UTC in Task 9.
- [x] § Decision gate (auto / pending / skip / conflict) — Task 4 uses Phase 2 writers; thresholds in `shared-constants.ts`.
- [x] § Cost always pending — inherited from `writeAutoApply` (Phase 2). Tests cover the `cost_per_unit` row creation.
- [x] § 7-day cooldown — RPC's `NOT EXISTS` clause + JS-side `hasRecentSkipDecision` (defensive double-check).
- [x] § Error & Edge Cases — `sweep-fetch` error stage; `cascade-fail` skip path; cooldown skip path; conflict pending path.
- [x] § Notification — Task 5 covers stdout + MC comment.

### Placeholder scan

No "TODO" / "fill in details" / "similar to Task N" left in steps. Every code block is complete. Task 7.4 includes a verification step in case `createSupabaseProvider` doesn't have the dependency-injection signature the CLI assumes — if the verification surfaces a mismatch, fix inline.

### Type consistency

- `SweepCandidate` defined in Task 3 (`candidates.ts`), consumed in Task 4 (`sweep.ts`) and Task 4 tests.
- `SweepResult` defined in Task 4 (`sweep.ts`), consumed in Task 5 (`notifier.ts`) and its tests.
- `CorrectionReport` / `ErrorReport` imported from `pack-info-hook/hook.ts` (Phase 2 types reused — `'sweep-fetch'` added to `ErrorReport.stage` in Task 2).
- `JobConfig` defined in Task 7 (`jobs/pack-info-sweep.ts`), only consumed internally.
- All function names match between definition site and call site (`runPackInfoSweep`, `fetchSweepCandidates`, `postSweepSummary`, `formatSummaryBody`, `resolveJobConfig`).
