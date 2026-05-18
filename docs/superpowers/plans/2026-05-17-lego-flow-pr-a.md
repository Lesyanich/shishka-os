# Lego Flow PR A — M1 Data Layer + M2 Loyverse Pull + Modifiers UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data layer + Loyverse modifier pull + admin mapping UI that lets lego/bowl dishes work at L2 launch (~2026-06-15).

**Architecture:** 3 migrations extend `bom_structures` slot vocab + add slot/qty/Loyverse-id columns to `nomenclature_modifier_options` + create raw Loyverse mirror tables. Edge Function gains `pull_modifiers` action that pulls Loyverse modifier_lists into the mirror. New admin page `/menu/modifiers` lets CEO bind each pulled Loyverse option to a (dish, MOD-* nomenclature, slot, quantity) tuple for downstream BOM deduction.

**Tech Stack:** Supabase Postgres migrations · Deno Edge Function (TypeScript) · React 19 + Vite + React Router 7 + Tailwind · React 19 `useOptimistic` · vitest smoke stubs

**Spec:** [2026-05-17-lego-bowl-flow-design.md](../specs/2026-05-17-lego-bowl-flow-design.md)
**MC task:** `1c1f258d-69df-449e-833b-ac22da79925a`
**Branch:** create `feature/admin/lego-flow-pr-a` from `main`
**Deadline:** must merge before L2 launch (~2026-06-15)

---

## Task 1: Migration 193 — slot vocab swap on `bom_structures`

**Files:**
- Create: `services/supabase/migrations/193_lego_slot_vocab_swap.sql`
- Test (smoke SQL): inline `psql` queries below

- [ ] **Step 1: Create the migration file**

Write `services/supabase/migrations/193_lego_slot_vocab_swap.sql`:

```sql
-- Migration 193 — swap bom_structures.slot CHECK to lego vocabulary
-- Old: base / protein / finish / accent / dressing (set in mig 145)
-- New: base / protein / greens / topping / sauce  (CEO ratified 2026-05-17)
-- Safe: zero rows have non-NULL slot today; verified via Explore agent on 2026-05-17.

BEGIN;

ALTER TABLE bom_structures
  DROP CONSTRAINT bom_structures_slot_check;

ALTER TABLE bom_structures
  ADD CONSTRAINT bom_structures_slot_check
  CHECK (slot IS NULL OR slot IN ('base','protein','greens','topping','sauce'));

COMMENT ON COLUMN bom_structures.slot IS
  'Lego/bowl slot grouping for assembly. Vocabulary swapped 2026-05-17 from (finish/accent/dressing) to (greens/topping/sauce). Aligned with nomenclature_modifier_options.slot (mig 194).';

COMMIT;
```

- [ ] **Step 2: Apply migration locally**

Run:
```bash
psql "$DATABASE_URL" -f services/supabase/migrations/193_lego_slot_vocab_swap.sql
```
Expected: `BEGIN`, `ALTER TABLE`, `ALTER TABLE`, `COMMENT`, `COMMIT` — no errors.

- [ ] **Step 3: Smoke-test the new CHECK constraint**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'bom_structures_slot_check';"
```
Expected output contains: `CHECK ((slot IS NULL OR (slot = ANY (ARRAY['base'::text, 'protein'::text, 'greens'::text, 'topping'::text, 'sauce'::text]))))`

Run a reject test:
```bash
psql "$DATABASE_URL" -c "INSERT INTO bom_structures (parent_id, ingredient_id, quantity_per_unit, slot) SELECT id, id, 1, 'finish' FROM nomenclature LIMIT 1;"
```
Expected: ERROR `new row for relation \"bom_structures\" violates check constraint \"bom_structures_slot_check\"`.

- [ ] **Step 4: Verify `v_dish_assembly_components` view still compiles**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT slot, count(*) FROM v_dish_assembly_components GROUP BY slot ORDER BY 1;"
```
Expected: query returns without error (likely all rows have `slot=NULL` since seed leaves them blank).

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/admin/lego-flow-pr-a
git add services/supabase/migrations/193_lego_slot_vocab_swap.sql
git commit -m "feat(menu): mig 193 — swap bom_structures.slot CHECK to lego vocab"
```

---

## Task 2: Migration 194 — extend `nomenclature_modifier_options`

**Files:**
- Create: `services/supabase/migrations/194_modifier_options_lego_extension.sql`

- [ ] **Step 1: Create the migration file**

Write `services/supabase/migrations/194_modifier_options_lego_extension.sql`:

```sql
-- Migration 194 — extend nomenclature_modifier_options for lego flow
-- Adds: slot (groups options in Loyverse modifier_lists + KDS card)
--       quantity_per_unit (BOM-deduction multiplier)
--       loyverse_modifier_id / loyverse_modifier_list_id / loyverse_modifier_list_name (Loyverse linkage)
-- Safe: table is empty today (no INSERTs in any migration); verified 2026-05-17.

BEGIN;

ALTER TABLE nomenclature_modifier_options
  ADD COLUMN slot TEXT
    CHECK (slot IS NULL OR slot IN ('base','protein','greens','topping','sauce')),
  ADD COLUMN quantity_per_unit NUMERIC NOT NULL DEFAULT 1
    CHECK (quantity_per_unit > 0),
  ADD COLUMN loyverse_modifier_id TEXT,
  ADD COLUMN loyverse_modifier_list_id TEXT,
  ADD COLUMN loyverse_modifier_list_name TEXT;

CREATE UNIQUE INDEX idx_nomod_loyverse_modifier_id
  ON nomenclature_modifier_options (loyverse_modifier_id)
  WHERE loyverse_modifier_id IS NOT NULL;

COMMENT ON COLUMN nomenclature_modifier_options.slot IS
  'Lego slot grouping (base/protein/greens/topping/sauce). Matches bom_structures.slot vocab (mig 193).';
COMMENT ON COLUMN nomenclature_modifier_options.quantity_per_unit IS
  'Quantity of MOD-* consumed per single order unit. Multiplied with receipt qty at BOM-deduction time.';
COMMENT ON COLUMN nomenclature_modifier_options.loyverse_modifier_id IS
  'Loyverse internal modifier option id. Joined against receipt.line.modifiers[].id during webhook ingest.';

COMMIT;
```

- [ ] **Step 2: Apply migration**

Run:
```bash
psql "$DATABASE_URL" -f services/supabase/migrations/194_modifier_options_lego_extension.sql
```
Expected: BEGIN/ALTER/INDEX/COMMENT/COMMIT chain, no errors.

- [ ] **Step 3: Smoke-test columns exist**

Run:
```bash
psql "$DATABASE_URL" -c "\d nomenclature_modifier_options" | grep -E "(slot|quantity_per_unit|loyverse_modifier_id|loyverse_modifier_list_id|loyverse_modifier_list_name)"
```
Expected: all 5 column names appear in output.

- [ ] **Step 4: Smoke-test unique index**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_nomod_loyverse_modifier_id';"
```
Expected: contains `CREATE UNIQUE INDEX idx_nomod_loyverse_modifier_id ON ... (loyverse_modifier_id) WHERE (loyverse_modifier_id IS NOT NULL)`.

- [ ] **Step 5: Commit**

```bash
git add services/supabase/migrations/194_modifier_options_lego_extension.sql
git commit -m "feat(menu): mig 194 — extend nomenclature_modifier_options with slot/qty/loyverse-id"
```

---

## Task 3: Migration 195 — raw Loyverse mirror tables

**Files:**
- Create: `services/supabase/migrations/195_pos_loyverse_modifier_mirror.sql`

- [ ] **Step 1: Create the migration file**

Write `services/supabase/migrations/195_pos_loyverse_modifier_mirror.sql`:

```sql
-- Migration 195 — raw mirror of Loyverse modifier_lists + options
-- These tables are read-only mirror; refreshed by Edge Function pull_modifiers action.
-- Each pull TRUNCATEs both tables and re-INSERTs from Loyverse API response.

BEGIN;

CREATE TABLE pos_loyverse_modifier_lists (
  id TEXT PRIMARY KEY,                      -- Loyverse modifier_list_id
  name TEXT NOT NULL,                       -- e.g. "Protein", "Greens", "Sauce"
  min_select INT,
  max_select INT,
  raw JSONB NOT NULL,                       -- full Loyverse payload for forensics
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pos_loyverse_modifier_options (
  id TEXT PRIMARY KEY,                      -- Loyverse modifier_option_id
  list_id TEXT NOT NULL
    REFERENCES pos_loyverse_modifier_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                       -- e.g. "Chicken", "Tofu", "Sriracha"
  price NUMERIC,
  raw JSONB NOT NULL,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_loyverse_options_list
  ON pos_loyverse_modifier_options(list_id);

COMMENT ON TABLE pos_loyverse_modifier_lists IS
  'Raw mirror of Loyverse modifier_lists. Fully refreshed by loyverse-sync pull_modifiers action.';
COMMENT ON TABLE pos_loyverse_modifier_options IS
  'Raw mirror of Loyverse modifier options. CEO maps each row to a (dish, MOD-*, slot, qty) tuple via /menu/modifiers admin UI.';

COMMIT;
```

- [ ] **Step 2: Apply migration**

Run:
```bash
psql "$DATABASE_URL" -f services/supabase/migrations/195_pos_loyverse_modifier_mirror.sql
```
Expected: no errors.

- [ ] **Step 3: Smoke-test tables exist**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'pos_loyverse_modifier%';"
```
Expected: both `pos_loyverse_modifier_lists` and `pos_loyverse_modifier_options` listed.

- [ ] **Step 4: Smoke-test FK cascade**

Run:
```bash
psql "$DATABASE_URL" <<'SQL'
INSERT INTO pos_loyverse_modifier_lists (id, name, raw) VALUES ('L1', 'TestList', '{}'::jsonb);
INSERT INTO pos_loyverse_modifier_options (id, list_id, name, raw) VALUES ('O1', 'L1', 'TestOpt', '{}'::jsonb);
SELECT count(*) FROM pos_loyverse_modifier_options WHERE list_id = 'L1';
DELETE FROM pos_loyverse_modifier_lists WHERE id = 'L1';
SELECT count(*) FROM pos_loyverse_modifier_options WHERE list_id = 'L1';
SQL
```
Expected: first count = 1, second count = 0 (CASCADE worked).

- [ ] **Step 5: Commit**

```bash
git add services/supabase/migrations/195_pos_loyverse_modifier_mirror.sql
git commit -m "feat(menu): mig 195 — raw Loyverse modifier_list mirror tables"
```

---

## Task 4: Edge Function — verify Loyverse API + add `pull_modifiers` action

**Files:**
- Modify: `services/supabase/functions/loyverse-sync/index.ts`
- The file already contains: `loyverseGet`, `loyversePost`, `loyverseGetAll`, `logStart`, `logFinish`, `handleStatus`, `handleCategories`, `handleItems`, `handleFull`, `handlePushDish`, and a final `switch` dispatching on `?action=`.

- [ ] **Step 1: Verify Loyverse modifier_lists endpoint shape**

Locally with the env token in place:
```bash
LOYVERSE_API_TOKEN=$(security find-generic-password -s "shishka-loyverse-api-token" -w 2>/dev/null)
curl -s "https://api.loyverse.com/v1.0/modifier_lists?limit=5" \
  -H "Authorization: Bearer $LOYVERSE_API_TOKEN" >/tmp/loy-mod.json
jq '.modifier_lists | length' /tmp/loy-mod.json
jq '.modifier_lists[0] | keys' /tmp/loy-mod.json
jq '.modifier_lists[0].modifiers[0] | keys' /tmp/loy-mod.json 2>/dev/null || echo "no embedded modifiers field"
```
Expected: a JSON array `modifier_lists` returned. Inspect the top-level keys and the `modifiers[]` shape. Confirm names: should include `id`, `name`, `modifiers` (or similar — verify), `cursor` for pagination.

If the inner field is not `modifiers` (e.g., it's `options`), update the Step 2 code accordingly.

- [ ] **Step 2: Add `pull_modifiers` handler**

Open `services/supabase/functions/loyverse-sync/index.ts`. Find the section after `handlePushDish` and before the final `switch`. Insert:

```typescript
// ── Action: pull_modifiers ──

interface LoyverseModifier {
  id: string
  name: string
  price?: number
}

interface LoyverseModifierList {
  id: string
  name: string
  min_select_modifier?: number
  max_select_modifier?: number
  modifiers?: LoyverseModifier[]
}

const KNOWN_SLOTS = ['base', 'protein', 'greens', 'topping', 'sauce']

async function handlePullModifiers() {
  const logId = await logStart('modifiers_pull', 0)

  let lists: LoyverseModifierList[]
  try {
    lists = await loyverseGetAll<LoyverseModifierList>('/modifier_lists', 'modifier_lists')
  } catch (e) {
    await logFinish(logId, 'error', 0, 0, e instanceof Error ? e.message : String(e))
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502)
  }

  const optionRows: Array<{
    id: string
    list_id: string
    name: string
    price: number | null
    raw: LoyverseModifier
  }> = []

  const listRows = lists.map((l) => {
    for (const m of l.modifiers ?? []) {
      optionRows.push({
        id: m.id,
        list_id: l.id,
        name: m.name,
        price: m.price ?? null,
        raw: m,
      })
    }
    return {
      id: l.id,
      name: l.name,
      min_select: l.min_select_modifier ?? null,
      max_select: l.max_select_modifier ?? null,
      raw: l,
    }
  })

  const warnings: string[] = []
  for (const l of listRows) {
    if (!KNOWN_SLOTS.includes(l.name.toLowerCase())) {
      warnings.push(`List "${l.name}" does not match slot vocabulary (base/protein/greens/topping/sauce)`)
    }
  }

  // Replace mirror in a single RPC-less transaction via Postgres function.
  // Supabase JS does not support multi-statement TX directly; use rpc helper added below.
  const { error: txErr } = await db.rpc('fn_refresh_loyverse_modifier_mirror', {
    p_lists: listRows,
    p_options: optionRows,
  })
  if (txErr) {
    await logFinish(logId, 'error', 0, 0, `Mirror refresh failed: ${txErr.message}`)
    return json({ ok: false, error: txErr.message }, 500)
  }

  await logFinish(logId, 'success', listRows.length, 0)

  return json({
    ok: true,
    lists: listRows.length,
    options: optionRows.length,
    warnings: warnings.length ? warnings : undefined,
  })
}
```

- [ ] **Step 3: Add the new case to the action switch**

Still in `services/supabase/functions/loyverse-sync/index.ts`, find the `switch (action)` block at the bottom. Add a case BEFORE the default:

```typescript
      case 'pull_modifiers':
        return await handlePullModifiers()
```

- [ ] **Step 4: Add the header doc comment**

At the top of the file, find the `// Actions:` block comment and add the new line:

```
//   POST ?action=pull_modifiers      → pull Loyverse modifier_lists into raw mirror
```

- [ ] **Step 5: Create the `fn_refresh_loyverse_modifier_mirror` RPC**

The Edge Function code above calls a Postgres function for atomic mirror refresh. Add a new migration `services/supabase/migrations/196_fn_refresh_loyverse_modifier_mirror.sql`:

```sql
-- RPC: atomic refresh of pos_loyverse_modifier_lists + options from JSONB arrays.
-- Called by Edge Function loyverse-sync?action=pull_modifiers.

CREATE OR REPLACE FUNCTION fn_refresh_loyverse_modifier_mirror(
  p_lists JSONB,
  p_options JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- TRUNCATE in a single TX so a failed pull doesn't leave the mirror empty.
  TRUNCATE pos_loyverse_modifier_lists CASCADE;

  INSERT INTO pos_loyverse_modifier_lists (id, name, min_select, max_select, raw)
  SELECT
    e->>'id',
    e->>'name',
    NULLIF(e->>'min_select','')::int,
    NULLIF(e->>'max_select','')::int,
    e->'raw'
  FROM jsonb_array_elements(p_lists) AS e;

  INSERT INTO pos_loyverse_modifier_options (id, list_id, name, price, raw)
  SELECT
    e->>'id',
    e->>'list_id',
    e->>'name',
    NULLIF(e->>'price','')::numeric,
    e->'raw'
  FROM jsonb_array_elements(p_options) AS e;

  -- Refresh loyverse_modifier_list_name snapshot on any matched binding rows.
  UPDATE nomenclature_modifier_options nmo
  SET loyverse_modifier_list_name = pml.name,
      loyverse_modifier_list_id = pml.id
  FROM pos_loyverse_modifier_options pmo
  JOIN pos_loyverse_modifier_lists pml ON pml.id = pmo.list_id
  WHERE nmo.loyverse_modifier_id = pmo.id;
END;
$$;
```

- [ ] **Step 6: Apply the RPC migration**

```bash
psql "$DATABASE_URL" -f services/supabase/migrations/196_fn_refresh_loyverse_modifier_mirror.sql
```
Expected: `CREATE FUNCTION`.

- [ ] **Step 7: Deploy and smoke-test the Edge Function**

```bash
supabase functions deploy loyverse-sync
SUPABASE_URL=$(supabase status -o json | jq -r .API_URL)
TOKEN=$(security find-generic-password -s "shishka-supabase-anon-key" -w 2>/dev/null)
curl -s -X POST "$SUPABASE_URL/functions/v1/loyverse-sync?action=pull_modifiers" \
  -H "Authorization: Bearer $TOKEN" | jq .
```
Expected: `{ "ok": true, "lists": N, "options": M, "warnings": [...] }` with N ≥ 0.

Then verify rows:
```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM pos_loyverse_modifier_lists; SELECT count(*) FROM pos_loyverse_modifier_options;"
```
Both ≥ 0; if CEO already configured Loyverse modifier_lists, counts should match what the Edge Function returned.

- [ ] **Step 8: Commit**

```bash
git add services/supabase/functions/loyverse-sync/index.ts services/supabase/migrations/196_fn_refresh_loyverse_modifier_mirror.sql
git commit -m "feat(menu): loyverse-sync pull_modifiers action + mig 196 refresh RPC"
```

---

## Task 5: ModifiersPage skeleton + route + sidebar entry

**Files:**
- Create: `apps/admin-panel/src/pages/menu/ModifiersPage.tsx`
- Create: `apps/admin-panel/src/pages/menu/ModifiersPage.test.ts`
- Modify: `apps/admin-panel/src/App.tsx` (add route BEFORE `/menu/*` catch-all)
- Modify: `apps/admin-panel/src/layouts/AppShell.tsx` (add NAV item)

- [ ] **Step 1: Write the smoke test stub**

Create `apps/admin-panel/src/pages/menu/ModifiersPage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ModifiersPage } from './ModifiersPage'

describe('ModifiersPage', () => {
  it('is exported as a function component', () => {
    expect(typeof ModifiersPage).toBe('function')
  })
})
```

- [ ] **Step 2: Run test, verify it fails (no module)**

Run:
```bash
cd apps/admin-panel && npx vitest run src/pages/menu/ModifiersPage.test.ts
```
Expected: FAIL with "Cannot find module './ModifiersPage'" or similar.

- [ ] **Step 3: Write the skeleton page**

Create `apps/admin-panel/src/pages/menu/ModifiersPage.tsx`:

```typescript
import { RefreshCw } from 'lucide-react'

export function ModifiersPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Modifiers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pull modifier_lists from Loyverse Dashboard, bind each option to a
            dish + slot + MOD nomenclature for BOM deduction.
          </p>
        </div>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Pull now
        </button>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Pulled lists will appear here. (Task 6 wires the pull hook.)
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Bindings table will appear here. (Tasks 8–9 wire CRUD.)
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run test, verify it passes**

Run:
```bash
cd apps/admin-panel && npx vitest run src/pages/menu/ModifiersPage.test.ts
```
Expected: PASS.

- [ ] **Step 5: Add route to App.tsx**

In `apps/admin-panel/src/App.tsx`:

After line 34 (`const MenuPage = lazy(...)`), add:
```typescript
const ModifiersPage = lazy(() => import('./pages/menu/ModifiersPage').then(m => ({ default: m.ModifiersPage })))
```

In the `<Routes>` block, find the line:
```typescript
                  <Route path="/menu/*" element={<Suspense fallback={<PageLoader />}><MenuPage /></Suspense>} />
```

Insert immediately BEFORE it:
```typescript
                  <Route path="/menu/modifiers" element={<Suspense fallback={<PageLoader />}><ModifiersPage /></Suspense>} />
```

The more-specific route must come first so React Router 7 matches `/menu/modifiers` before falling through to the catch-all.

- [ ] **Step 6: Add sidebar entry in AppShell.tsx**

In `apps/admin-panel/src/layouts/AppShell.tsx`, find the `Menu & Products` section in `NAV_SECTIONS` (around line 64-71):

```typescript
  {
    title: 'Menu & Products',
    minRole: 'owner',
    items: [
      { path: '/menu', icon: LayoutGrid, label: 'Menu' },
      { path: '/bom', icon: GitBranch, label: 'BOM Hub' },
      { path: '/sku', icon: Package, label: 'SKU Manager' },
    ],
  },
```

Add a new item between `/menu` and `/bom`. Update the imports at the top of the file to include `SlidersHorizontal` from lucide-react:

```typescript
import {
  // ... existing imports ...
  SlidersHorizontal,
} from 'lucide-react'
```

Then the section becomes:
```typescript
  {
    title: 'Menu & Products',
    minRole: 'owner',
    items: [
      { path: '/menu', icon: LayoutGrid, label: 'Menu' },
      { path: '/menu/modifiers', icon: SlidersHorizontal, label: 'Modifiers' },
      { path: '/bom', icon: GitBranch, label: 'BOM Hub' },
      { path: '/sku', icon: Package, label: 'SKU Manager' },
    ],
  },
```

- [ ] **Step 7: Run typecheck + lint**

```bash
cd apps/admin-panel && npx tsc --noEmit && npx eslint src/pages/menu/ModifiersPage.tsx src/App.tsx src/layouts/AppShell.tsx
```
Expected: 0 errors, 0 warnings (admin-panel ESLint runs at `--max-warnings 0`).

- [ ] **Step 8: Smoke check in browser**

```bash
cd apps/admin-panel && npm run dev
```
Open `http://localhost:5173/menu/modifiers` → expect "Modifiers" page with disabled Pull button and two placeholder sections. Open `/menu` → standard menu page still loads (regression check).

- [ ] **Step 9: Commit**

```bash
git add apps/admin-panel/src/pages/menu/ModifiersPage.tsx apps/admin-panel/src/pages/menu/ModifiersPage.test.ts apps/admin-panel/src/App.tsx apps/admin-panel/src/layouts/AppShell.tsx
git commit -m "feat(menu): ModifiersPage skeleton + route + sidebar entry"
```

---

## Task 6: `useLoyverseModifierPull` hook + wire Pull button

**Files:**
- Create: `apps/admin-panel/src/hooks/useLoyverseModifierPull.ts`
- Create: `apps/admin-panel/src/hooks/useLoyverseModifierPull.test.ts`
- Modify: `apps/admin-panel/src/pages/menu/ModifiersPage.tsx`

- [ ] **Step 1: Write the smoke test stub**

Create `apps/admin-panel/src/hooks/useLoyverseModifierPull.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { useLoyverseModifierPull } from './useLoyverseModifierPull'

describe('useLoyverseModifierPull', () => {
  it('is exported as a function (custom hook)', () => {
    expect(typeof useLoyverseModifierPull).toBe('function')
  })
})
```

- [ ] **Step 2: Write the hook**

Create `apps/admin-panel/src/hooks/useLoyverseModifierPull.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface LoyverseModifierListRow {
  id: string
  name: string
  min_select: number | null
  max_select: number | null
  pulled_at: string
}

export interface LoyverseModifierOptionRow {
  id: string
  list_id: string
  name: string
  price: number | null
  pulled_at: string
}

interface PullResult {
  ok: boolean
  lists?: number
  options?: number
  warnings?: string[]
  error?: string
}

export function useLoyverseModifierPull() {
  const [lists, setLists] = useState<LoyverseModifierListRow[]>([])
  const [options, setOptions] = useState<LoyverseModifierOptionRow[]>([])
  const [lastPulledAt, setLastPulledAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPulling, setIsPulling] = useState(false)
  const [lastWarnings, setLastWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    const [listsRes, optsRes] = await Promise.all([
      supabase.from('pos_loyverse_modifier_lists').select('*').order('name'),
      supabase.from('pos_loyverse_modifier_options').select('*').order('name'),
    ])
    if (listsRes.error) setError(listsRes.error.message)
    if (optsRes.error) setError(optsRes.error.message)
    setLists((listsRes.data ?? []) as LoyverseModifierListRow[])
    setOptions((optsRes.data ?? []) as LoyverseModifierOptionRow[])
    setLastPulledAt(((listsRes.data ?? [])[0] as LoyverseModifierListRow | undefined)?.pulled_at ?? null)
    setIsLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const pull = useCallback(async () => {
    setIsPulling(true)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const url = `${supabase.supabaseUrl}/functions/v1/loyverse-sync?action=pull_modifiers`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token ?? supabase.supabaseKey}`,
        'Content-Type': 'application/json',
      },
    })
    const body = (await res.json()) as PullResult
    if (!body.ok) {
      setError(body.error ?? 'pull failed')
      setIsPulling(false)
      return body
    }
    setLastWarnings(body.warnings ?? [])
    await reload()
    setIsPulling(false)
    return body
  }, [reload])

  return { lists, options, lastPulledAt, lastWarnings, isLoading, isPulling, error, pull, reload }
}
```

- [ ] **Step 3: Run test, verify it passes**

```bash
cd apps/admin-panel && npx vitest run src/hooks/useLoyverseModifierPull.test.ts
```
Expected: PASS.

- [ ] **Step 4: Wire the hook into ModifiersPage**

Edit `apps/admin-panel/src/pages/menu/ModifiersPage.tsx` — replace the entire file with:

```typescript
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { useLoyverseModifierPull } from '../../hooks/useLoyverseModifierPull'

function formatPulledAt(iso: string | null): string {
  if (!iso) return 'never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return new Date(iso).toLocaleDateString()
}

export function ModifiersPage() {
  const { lists, options, lastPulledAt, lastWarnings, isPulling, error, pull } = useLoyverseModifierPull()

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Modifiers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Last pull: {formatPulledAt(lastPulledAt)} · {lists.length} lists · {options.length} options
          </p>
        </div>
        <button
          type="button"
          onClick={() => pull()}
          disabled={isPulling}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <RefreshCw className={isPulling ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          {isPulling ? 'Pulling…' : 'Pull now'}
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-900/40 bg-rose-950/30 p-3 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {lastWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 p-3 text-xs text-amber-300">
          <strong className="block pb-1">Pull warnings:</strong>
          <ul className="list-disc pl-4">
            {lastWarnings.map((w, i) => (<li key={i}>{w}</li>))}
          </ul>
        </div>
      )}

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Pulled mirror accordion — Task 7.
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Bindings CRUD — Tasks 8 + 9.
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck + lint**

```bash
cd apps/admin-panel && npx tsc --noEmit && npx eslint src/hooks/useLoyverseModifierPull.ts src/pages/menu/ModifiersPage.tsx
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Manual smoke**

`npm run dev`, open `/menu/modifiers`, click `Pull now`. Expect button shows "Pulling…" then the header text updates with `N lists · M options`. Verify in DB:
```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM pos_loyverse_modifier_lists;"
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin-panel/src/hooks/useLoyverseModifierPull.ts apps/admin-panel/src/hooks/useLoyverseModifierPull.test.ts apps/admin-panel/src/pages/menu/ModifiersPage.tsx
git commit -m "feat(menu): useLoyverseModifierPull hook + wire Pull button"
```

---

## Task 7: Pulled-mirror accordion section

**Files:**
- Create: `apps/admin-panel/src/components/menu/modifiers/PulledMirrorSection.tsx`
- Create: `apps/admin-panel/src/components/menu/modifiers/PulledMirrorSection.test.ts`
- Modify: `apps/admin-panel/src/pages/menu/ModifiersPage.tsx`

- [ ] **Step 1: Write the smoke test**

Create `apps/admin-panel/src/components/menu/modifiers/PulledMirrorSection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { PulledMirrorSection } from './PulledMirrorSection'

describe('PulledMirrorSection', () => {
  it('is exported as a function component', () => {
    expect(typeof PulledMirrorSection).toBe('function')
  })
})
```

- [ ] **Step 2: Build the component**

Create `apps/admin-panel/src/components/menu/modifiers/PulledMirrorSection.tsx`:

```typescript
import { useState } from 'react'
import { ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react'
import type {
  LoyverseModifierListRow,
  LoyverseModifierOptionRow,
} from '../../../hooks/useLoyverseModifierPull'

const KNOWN_SLOTS = ['base', 'protein', 'greens', 'topping', 'sauce']

interface Props {
  lists: LoyverseModifierListRow[]
  options: LoyverseModifierOptionRow[]
}

export function PulledMirrorSection({ lists, options }: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (lists.length === 0) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        No Loyverse modifier_lists pulled yet. Click "Pull now" above.
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Pulled from Loyverse (read-only)</h2>
      </header>
      <ul className="divide-y divide-slate-800">
        {lists.map((l) => {
          const isOpen = openIds.has(l.id)
          const slotMatch = KNOWN_SLOTS.includes(l.name.toLowerCase())
          const listOpts = options.filter((o) => o.list_id === l.id)
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => toggle(l.id)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-900"
              >
                <span className="flex items-center gap-2">
                  {slotMatch ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                  )}
                  <span className="text-sm font-medium text-slate-200">{l.name}</span>
                  <span className="text-xs text-slate-500">
                    (min:{l.min_select ?? '–'} max:{l.max_select ?? '–'}) — {listOpts.length} options
                  </span>
                </span>
                <ChevronDown className={[
                  'h-3.5 w-3.5 text-slate-500 transition-transform',
                  isOpen ? '' : '-rotate-90',
                ].join(' ')} />
              </button>
              {isOpen && (
                <ul className="border-t border-slate-800 bg-slate-950/50 px-4 py-2">
                  {listOpts.length === 0 ? (
                    <li className="py-1 text-xs text-slate-600">(no options)</li>
                  ) : listOpts.map((o) => (
                    <li key={o.id} className="flex items-center justify-between py-1 text-xs">
                      <span className="text-slate-300">{o.name}</span>
                      <span className="text-slate-500">
                        {o.price != null ? `฿${o.price.toFixed(0)}` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 3: Wire into ModifiersPage**

Edit `apps/admin-panel/src/pages/menu/ModifiersPage.tsx`. Replace the placeholder section `Pulled mirror accordion — Task 7.` with:

```typescript
      <PulledMirrorSection lists={lists} options={options} />
```

Add the import at the top of the file:
```typescript
import { PulledMirrorSection } from '../../components/menu/modifiers/PulledMirrorSection'
```

- [ ] **Step 4: Run tests + typecheck + lint**

```bash
cd apps/admin-panel && npx vitest run src/components/menu/modifiers/ && npx tsc --noEmit && npx eslint src/components/menu/modifiers/ src/pages/menu/ModifiersPage.tsx
```
Expected: PASS, 0 errors.

- [ ] **Step 5: Manual smoke**

`npm run dev`, open `/menu/modifiers`. After pulling: expect accordion with N lists, each row showing slot-match icon (green check or amber alert). Click row → options listed.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-panel/src/components/menu/modifiers/ apps/admin-panel/src/pages/menu/ModifiersPage.tsx
git commit -m "feat(menu): pulled-mirror accordion on /menu/modifiers"
```

---

## Task 8: `useModifierBindings` hook (load + create + update + delete)

**Files:**
- Create: `apps/admin-panel/src/hooks/useModifierBindings.ts`
- Create: `apps/admin-panel/src/hooks/useModifierBindings.test.ts`

- [ ] **Step 1: Write the smoke test**

Create `apps/admin-panel/src/hooks/useModifierBindings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { useModifierBindings } from './useModifierBindings'

describe('useModifierBindings', () => {
  it('is exported as a function (custom hook)', () => {
    expect(typeof useModifierBindings).toBe('function')
  })
})
```

- [ ] **Step 2: Write the hook**

Create `apps/admin-panel/src/hooks/useModifierBindings.ts`:

```typescript
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type SlotName = 'base' | 'protein' | 'greens' | 'topping' | 'sauce'

export interface ModifierBindingRow {
  id: string
  dish_id: string
  dish_code: string
  dish_name: string
  modifier_id: string
  modifier_code: string
  modifier_name: string
  slot: SlotName | null
  quantity_per_unit: number
  price_delta: number
  is_default: boolean
  sort_order: number
  loyverse_modifier_id: string | null
  loyverse_modifier_list_name: string | null
}

export interface BindingPatch {
  dish_id: string
  modifier_id: string
  slot: SlotName
  quantity_per_unit: number
  loyverse_modifier_id?: string | null
  loyverse_modifier_list_id?: string | null
  loyverse_modifier_list_name?: string | null
  price_delta?: number
  is_default?: boolean
  sort_order?: number
}

export function useModifierBindings() {
  const [rows, setRows] = useState<ModifierBindingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('nomenclature_modifier_options')
      .select(`
        id, slot, quantity_per_unit, price_delta, is_default, sort_order,
        loyverse_modifier_id, loyverse_modifier_list_name,
        dish:dish_id ( id, product_code, name ),
        modifier:modifier_id ( id, product_code, name )
      `)
      .order('sort_order', { ascending: true })
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      type Row = {
        id: string
        slot: SlotName | null
        quantity_per_unit: number
        price_delta: number
        is_default: boolean
        sort_order: number
        loyverse_modifier_id: string | null
        loyverse_modifier_list_name: string | null
        dish: { id: string; product_code: string; name: string } | null
        modifier: { id: string; product_code: string; name: string } | null
      }
      const flat: ModifierBindingRow[] = ((data ?? []) as Row[])
        .filter((r) => r.dish && r.modifier)
        .map((r) => ({
          id: r.id,
          dish_id: r.dish!.id,
          dish_code: r.dish!.product_code,
          dish_name: r.dish!.name,
          modifier_id: r.modifier!.id,
          modifier_code: r.modifier!.product_code,
          modifier_name: r.modifier!.name,
          slot: r.slot,
          quantity_per_unit: Number(r.quantity_per_unit),
          price_delta: Number(r.price_delta),
          is_default: r.is_default,
          sort_order: r.sort_order,
          loyverse_modifier_id: r.loyverse_modifier_id,
          loyverse_modifier_list_name: r.loyverse_modifier_list_name,
        }))
      setRows(flat)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  const create = useCallback(async (patch: BindingPatch) => {
    const { error: err } = await supabase
      .from('nomenclature_modifier_options')
      .insert(patch)
    if (err) return { ok: false as const, error: err.message }
    await reload()
    return { ok: true as const }
  }, [reload])

  const update = useCallback(async (id: string, patch: Partial<BindingPatch>) => {
    const { error: err } = await supabase
      .from('nomenclature_modifier_options')
      .update(patch)
      .eq('id', id)
    if (err) return { ok: false as const, error: err.message }
    await reload()
    return { ok: true as const }
  }, [reload])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase
      .from('nomenclature_modifier_options')
      .delete()
      .eq('id', id)
    if (err) return { ok: false as const, error: err.message }
    await reload()
    return { ok: true as const }
  }, [reload])

  return { rows, isLoading, error, create, update, remove, reload }
}
```

- [ ] **Step 3: Run test, verify it passes**

```bash
cd apps/admin-panel && npx vitest run src/hooks/useModifierBindings.test.ts
```
Expected: PASS.

- [ ] **Step 4: Typecheck + lint**

```bash
cd apps/admin-panel && npx tsc --noEmit && npx eslint src/hooks/useModifierBindings.ts
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel/src/hooks/useModifierBindings.ts apps/admin-panel/src/hooks/useModifierBindings.test.ts
git commit -m "feat(menu): useModifierBindings hook (load/create/update/delete)"
```

---

## Task 9: Bindings table + add-binding form

**Files:**
- Create: `apps/admin-panel/src/components/menu/modifiers/BindingsTable.tsx`
- Create: `apps/admin-panel/src/components/menu/modifiers/BindingsTable.test.ts`
- Create: `apps/admin-panel/src/components/menu/modifiers/AddBindingForm.tsx`
- Create: `apps/admin-panel/src/components/menu/modifiers/AddBindingForm.test.ts`
- Modify: `apps/admin-panel/src/pages/menu/ModifiersPage.tsx`

- [ ] **Step 1: Write the smoke tests**

Create `apps/admin-panel/src/components/menu/modifiers/BindingsTable.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { BindingsTable } from './BindingsTable'

describe('BindingsTable', () => {
  it('is exported as a function component', () => {
    expect(typeof BindingsTable).toBe('function')
  })
})
```

Create `apps/admin-panel/src/components/menu/modifiers/AddBindingForm.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { AddBindingForm } from './AddBindingForm'

describe('AddBindingForm', () => {
  it('is exported as a function component', () => {
    expect(typeof AddBindingForm).toBe('function')
  })
})
```

- [ ] **Step 2: Build the BindingsTable component**

Create `apps/admin-panel/src/components/menu/modifiers/BindingsTable.tsx`:

```typescript
import { Trash2 } from 'lucide-react'
import type { ModifierBindingRow } from '../../../hooks/useModifierBindings'

interface Props {
  rows: ModifierBindingRow[]
  onDelete: (id: string) => void
}

export function BindingsTable({ rows, onDelete }: Props) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs text-slate-500">
        No bindings yet. Click "+ Add binding" above to map a Loyverse option to a dish.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Dish</th>
            <th className="px-3 py-2 font-semibold">Loyverse option</th>
            <th className="px-3 py-2 font-semibold">Slot</th>
            <th className="px-3 py-2 font-semibold">MOD</th>
            <th className="px-3 py-2 font-semibold text-right">Qty</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((r) => (
            <tr key={r.id} className="text-slate-300 hover:bg-slate-900/40">
              <td className="px-3 py-2">
                <div className="font-medium text-slate-100">{r.dish_code}</div>
                <div className="text-[10px] text-slate-500">{r.dish_name}</div>
              </td>
              <td className="px-3 py-2 text-slate-300">
                {r.loyverse_modifier_list_name && (
                  <span className="text-[10px] text-slate-500">{r.loyverse_modifier_list_name} → </span>
                )}
                {r.modifier_name}
              </td>
              <td className="px-3 py-2">
                {r.slot ? (
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    {r.slot}
                  </span>
                ) : (
                  <span className="text-amber-400">missing</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-200">{r.modifier_code}</div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.quantity_per_unit}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  className="text-slate-500 hover:text-rose-300"
                  aria-label="Delete binding"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Build the AddBindingForm component**

Create `apps/admin-panel/src/components/menu/modifiers/AddBindingForm.tsx`:

```typescript
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type {
  LoyverseModifierListRow,
  LoyverseModifierOptionRow,
} from '../../../hooks/useLoyverseModifierPull'
import type { BindingPatch, SlotName } from '../../../hooks/useModifierBindings'

const SLOT_VALUES: SlotName[] = ['base', 'protein', 'greens', 'topping', 'sauce']

interface NomLite { id: string; product_code: string; name: string }

interface Props {
  loyverseOptions: LoyverseModifierOptionRow[]
  loyverseLists: LoyverseModifierListRow[]
  onSubmit: (patch: BindingPatch) => Promise<{ ok: boolean; error?: string }>
  onCancel: () => void
}

export function AddBindingForm({ loyverseOptions, loyverseLists, onSubmit, onCancel }: Props) {
  const [dishes, setDishes] = useState<NomLite[]>([])
  const [mods, setMods] = useState<NomLite[]>([])
  const [dishId, setDishId] = useState<string>('')
  const [modifierId, setModifierId] = useState<string>('')
  const [loyverseOptionId, setLoyverseOptionId] = useState<string>('')
  const [slot, setSlot] = useState<SlotName | ''>('')
  const [qty, setQty] = useState<string>('1')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('nomenclature').select('id, product_code, name').like('product_code', 'SALE-%').order('product_code'),
      supabase.from('nomenclature').select('id, product_code, name').like('product_code', 'MOD-%').order('product_code'),
    ]).then(([s, m]) => {
      if (!alive) return
      setDishes((s.data ?? []) as NomLite[])
      setMods((m.data ?? []) as NomLite[])
    })
    return () => { alive = false }
  }, [])

  // Auto-fill slot from Loyverse list name when an option is picked.
  useEffect(() => {
    if (!loyverseOptionId) return
    const opt = loyverseOptions.find((o) => o.id === loyverseOptionId)
    if (!opt) return
    const list = loyverseLists.find((l) => l.id === opt.list_id)
    if (!list) return
    const guess = list.name.toLowerCase() as SlotName
    if (SLOT_VALUES.includes(guess)) setSlot(guess)
  }, [loyverseOptionId, loyverseOptions, loyverseLists])

  const loyverseListLookup = useMemo(() => {
    return new Map(loyverseLists.map((l) => [l.id, l]))
  }, [loyverseLists])

  const valid =
    dishId && modifierId && slot && Number(qty) > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setSubmitting(true)
    setError(null)
    const opt = loyverseOptions.find((o) => o.id === loyverseOptionId)
    const list = opt ? loyverseListLookup.get(opt.list_id) : undefined
    const patch: BindingPatch = {
      dish_id: dishId,
      modifier_id: modifierId,
      slot: slot as SlotName,
      quantity_per_unit: Number(qty),
      loyverse_modifier_id: opt?.id ?? null,
      loyverse_modifier_list_id: list?.id ?? null,
      loyverse_modifier_list_name: list?.name ?? null,
    }
    const res = await onSubmit(patch)
    setSubmitting(false)
    if (!res.ok) setError(res.error ?? 'save failed')
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Dish (SALE-*)</span>
          <select
            value={dishId}
            onChange={(e) => setDishId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          >
            <option value="">— pick dish —</option>
            {dishes.map((d) => (<option key={d.id} value={d.id}>{d.product_code} · {d.name}</option>))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Loyverse option (optional)</span>
          <select
            value={loyverseOptionId}
            onChange={(e) => setLoyverseOptionId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          >
            <option value="">— pick pulled option —</option>
            {loyverseOptions.map((o) => {
              const l = loyverseListLookup.get(o.list_id)
              return (
                <option key={o.id} value={o.id}>
                  {l ? `${l.name} · ${o.name}` : o.name}
                </option>
              )
            })}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Slot</span>
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value as SlotName | '')}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          >
            <option value="">— pick slot —</option>
            {SLOT_VALUES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-slate-500">MOD nomenclature</span>
          <select
            value={modifierId}
            onChange={(e) => setModifierId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
          >
            <option value="">— pick MOD —</option>
            {mods.map((m) => (<option key={m.id} value={m.id}>{m.product_code} · {m.name}</option>))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Quantity per unit</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 tabular-nums text-slate-200"
          />
        </label>
      </div>

      {error && <p className="text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || submitting}
          className="rounded bg-emerald-500/15 px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save binding'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Wire both into ModifiersPage**

Replace `apps/admin-panel/src/pages/menu/ModifiersPage.tsx` entirely with:

```typescript
import { useState } from 'react'
import { RefreshCw, AlertTriangle, Plus } from 'lucide-react'
import { useLoyverseModifierPull } from '../../hooks/useLoyverseModifierPull'
import { useModifierBindings } from '../../hooks/useModifierBindings'
import { PulledMirrorSection } from '../../components/menu/modifiers/PulledMirrorSection'
import { BindingsTable } from '../../components/menu/modifiers/BindingsTable'
import { AddBindingForm } from '../../components/menu/modifiers/AddBindingForm'

function formatPulledAt(iso: string | null): string {
  if (!iso) return 'never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return new Date(iso).toLocaleDateString()
}

export function ModifiersPage() {
  const { lists, options, lastPulledAt, lastWarnings, isPulling, error: pullError, pull } = useLoyverseModifierPull()
  const { rows, error: bindingsError, create, remove } = useModifierBindings()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Modifiers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Last pull: {formatPulledAt(lastPulledAt)} · {lists.length} lists · {options.length} options · {rows.length} bindings
          </p>
        </div>
        <button
          type="button"
          onClick={() => pull()}
          disabled={isPulling}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <RefreshCw className={isPulling ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          {isPulling ? 'Pulling…' : 'Pull now'}
        </button>
      </header>

      {(pullError || bindingsError) && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-900/40 bg-rose-950/30 p-3 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{pullError ?? bindingsError}</span>
        </div>
      )}

      {lastWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 p-3 text-xs text-amber-300">
          <strong className="block pb-1">Pull warnings:</strong>
          <ul className="list-disc pl-4">
            {lastWarnings.map((w, i) => (<li key={i}>{w}</li>))}
          </ul>
        </div>
      )}

      <PulledMirrorSection lists={lists} options={options} />

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-200">Bindings</h2>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20"
          >
            <Plus className="h-3 w-3" />
            {addOpen ? 'Close' : 'Add binding'}
          </button>
        </header>
        {addOpen && (
          <div className="border-b border-slate-800 p-4">
            <AddBindingForm
              loyverseOptions={options}
              loyverseLists={lists}
              onSubmit={async (patch) => {
                const res = await create(patch)
                if (res.ok) setAddOpen(false)
                return res
              }}
              onCancel={() => setAddOpen(false)}
            />
          </div>
        )}
        <BindingsTable rows={rows} onDelete={(id) => remove(id)} />
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Run tests + typecheck + lint**

```bash
cd apps/admin-panel && npx vitest run src/components/menu/modifiers/ src/pages/menu/ModifiersPage.test.ts && npx tsc --noEmit && npx eslint src/components/menu/modifiers/ src/pages/menu/ModifiersPage.tsx
```
Expected: PASS, 0 errors, 0 warnings.

- [ ] **Step 6: Manual smoke**

`npm run dev`, open `/menu/modifiers`. After Pull-now:
- Click "Add binding" → form expands inline.
- Pick a Loyverse option → slot auto-fills if list name matches vocab.
- Pick dish, MOD, qty → click Save → row appears in table.
- Click trash icon on a row → row disappears.

Verify in DB:
```bash
psql "$DATABASE_URL" -c "SELECT dish_id, modifier_id, slot, quantity_per_unit, loyverse_modifier_id FROM nomenclature_modifier_options;"
```
Expected: one row matching what you just added.

- [ ] **Step 7: Commit**

```bash
git add apps/admin-panel/src/components/menu/modifiers/ apps/admin-panel/src/pages/menu/ModifiersPage.tsx
git commit -m "feat(menu): bindings table + add-binding form on /menu/modifiers"
```

---

## Task 10: Loyverse Dashboard conventions doc

**Files:**
- Create: `docs/operations/loyverse-dashboard-conventions.md`

- [ ] **Step 1: Write the doc**

Create `docs/operations/loyverse-dashboard-conventions.md`:

```markdown
# Loyverse Dashboard — Naming Conventions

**Audience:** Lesia (operates Loyverse Dashboard at <https://r.loyverse.com>).
**Why this matters:** admin-panel `/menu/modifiers` pull job auto-fills the
internal `slot` enum from the Loyverse modifier_list name. Following these
conventions removes manual slot-tagging work on every pull.

## Modifier list names

When you create a modifier_list in Loyverse Dashboard, name it **exactly** one
of:

- `Base`
- `Protein`
- `Greens`
- `Topping`
- `Sauce`

Case-insensitive, but spelling must match. The pull job lowercases the name
and checks it against the universal slot enum.

If you name a list something else (e.g. `Spices`, `Add-ons`, `Sides`):
- The pull job stores it in the mirror tables as-is.
- The `Pull now` button in `/menu/modifiers` surfaces a warning.
- You must manually pick the slot in the Add-binding form per option.

## Modifier list min/max-select

- `Base` — min:1 max:1 (one base required)
- `Protein` — min:1 max:1 (one protein required; can be `none`)
- `Greens` — min:0 max:3 (up to three greens)
- `Topping` — min:0 max:3 (up to three toppings)
- `Sauce` — min:0 max:1 (one sauce or none)

These rules are enforced by Loyverse on cashier UX. admin-panel does not
re-enforce them.

## Option naming

- Use clear, customer-facing English (e.g. `Chicken`, `Tofu`, `Spinach`).
- Avoid Thai-only names for now — admin-panel maps option name → MOD
  nomenclature by hand, and Thai → MOD search is harder. Thai labels are fine
  once a Loyverse-option ↔ MOD binding exists.
- Same option name across multiple dishes is fine; each (dish, option) binding
  is a separate row in `nomenclature_modifier_options`.

## When to rename a list

Renaming a modifier_list in Loyverse Dashboard does NOT break existing
bindings — they're joined on `loyverse_modifier_id` (option id), not list
name. The next pull just refreshes the `loyverse_modifier_list_name` snapshot
on every binding row.

## Phase 2 future

Once admin-panel `/kds/assembly` (T8) is built and the SSoT flips, modifier
management moves into admin-panel and Loyverse Dashboard becomes read-only
for modifier_lists. This doc gets updated then.
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/loyverse-dashboard-conventions.md
git commit -m "docs(ops): Loyverse Dashboard naming conventions for modifier_lists"
```

---

## Task 11: End-to-end smoke + PR creation

- [ ] **Step 1: Full migration replay (clean DB scenario)**

If a staging DB is available, run all 4 migrations end-to-end:

```bash
psql "$STAGING_URL" -f services/supabase/migrations/193_lego_slot_vocab_swap.sql
psql "$STAGING_URL" -f services/supabase/migrations/194_modifier_options_lego_extension.sql
psql "$STAGING_URL" -f services/supabase/migrations/195_pos_loyverse_modifier_mirror.sql
psql "$STAGING_URL" -f services/supabase/migrations/196_fn_refresh_loyverse_modifier_mirror.sql
```
All 4 must apply with no errors.

If no staging DB, the production DB is the only target — confirm with CEO before applying.

- [ ] **Step 2: Edge Function deploy + smoke**

```bash
supabase functions deploy loyverse-sync
curl -X POST "$EDGE/loyverse-sync?action=pull_modifiers" \
  -H "Authorization: Bearer $TOKEN" | jq .
```
Expected: `{ "ok": true, "lists": N, "options": M, ... }`.

- [ ] **Step 3: Frontend build**

```bash
cd apps/admin-panel && npm run build
```
Expected: 0 errors. `dist/` produced.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feature/admin/lego-flow-pr-a
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --base main --title "feat(menu): lego flow PR A — data layer + Loyverse pull + /menu/modifiers UI" --body "$(cat <<'EOF'
## Summary

Foundation for lego/bowl dish flow per [spec](docs/superpowers/specs/2026-05-17-lego-bowl-flow-design.md) — M1 (data) + M2 (Loyverse pull + mapping UI).

- 4 migrations: slot vocab swap, modifier_options extension, raw Loyverse mirror, refresh RPC
- `loyverse-sync` Edge Function: new `pull_modifiers` action
- `/menu/modifiers` admin page: Pull button, pulled-mirror accordion, bindings CRUD
- Sidebar entry under Menu & Products
- Loyverse Dashboard naming conventions doc

Implements MC task `1c1f258d-69df-449e-833b-ac22da79925a`. Closes the data-layer half of MC `3f051d79`.

## Test plan

- [ ] Apply 4 migrations to staging → 0 errors, existing `v_dish_assembly_components` view still compiles
- [ ] Deploy Edge Function → `curl ?action=pull_modifiers` returns `{ ok: true, lists, options, warnings }`
- [ ] `/menu/modifiers` loads in production preview
- [ ] Click "Pull now" → mirror tables populate
- [ ] Add a binding via the form → row appears in `nomenclature_modifier_options` with non-null `slot`, `modifier_id`, `quantity_per_unit`
- [ ] Auto-fill: pick a Loyverse option whose list is named `Protein` → slot dropdown auto-selects `protein`
- [ ] Delete a binding → row gone
- [ ] Regression: `/menu` still renders dish list + drawer

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Update MC task**

Mark the MC task `1c1f258d-69df-449e-833b-ac22da79925a` as `in_progress` (when starting work) and `done` (when PR merged). Use the `task-lifecycle` skill or call `mcp__shishka-mission-control__update_task` directly.

---

## Self-Review Notes

- All 11 tasks have exact file paths and complete code blocks. No `// TODO`s.
- Migration numbers 193, 194, 195, 196 shipped one higher than planned because 192_fix_cheese_costs_merge_duplicates.sql already existed in the repo when this work started.
- The Edge Function reuses existing helpers (`loyverseGetAll`, `logStart`, `logFinish`, `db`) — no new dependencies.
- Types `LoyverseModifierListRow` / `LoyverseModifierOptionRow` defined in `useLoyverseModifierPull.ts` are re-imported by `PulledMirrorSection.tsx` and `AddBindingForm.tsx` — consistent across tasks.
- `SlotName` type and `BindingPatch` interface defined in `useModifierBindings.ts` are re-imported by `AddBindingForm.tsx` — consistent.
- `KNOWN_SLOTS` constant duplicated in Edge Function (Deno) and `PulledMirrorSection.tsx` (browser) — duplication is acceptable across runtime boundaries (cannot share TS modules between Deno and Vite).
- vitest smoke stubs match the admin-panel HC-3 gate convention per memory `feedback_admin_panel_hc3_no_runner.md`.
- Sidebar entry uses lucide-react `SlidersHorizontal` icon — already a member of the lucide icon set, no install needed.
- Spec coverage: M1.1 → Task 1; M1.2 → Task 2; M1.3 → Task 3; M2.1 → Task 4; M2.2 page → Tasks 5–9; M2.3 doc → Task 10; verification & PR → Task 11. All spec sections accounted for.
