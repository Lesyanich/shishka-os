# Pack-Info Resolver — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `pack-info-resolver` library + schema migration + unit tests. No integration with receipt processing or cron yet — that's Phases 2-3.

**Architecture:** A pure-function cascade resolver with injectable data providers. Cascade priority: `supplier_catalog` exact → `supplier_catalog` fuzzy → `makro-lookup` barcode → `makro-lookup` fuzzy → fail. Returns `ResolverResult` with `confidence`, `conflicts[]`, and parsed pack info. The library has no DB writes — that decision belongs to the caller.

**Spec deviation:** The spec listed `gs1_weight_items` as cascade level 3 (conf 0.9). Schema check during plan self-review showed `gs1_weight_items` stores `unit` + `divisor` (used to decode weight EMBEDDED in each GS1-128 receipt-line barcode), not pack-level pack size. GS1 lookup gives per-purchase weight, not per-product pack info — wrong abstraction layer. Dropped from Phase 1; Phase 2 (real-time hook) can use GS1 directly when processing receipt lines, not via this resolver.

**Tech Stack:** TypeScript 5.8 (strict), Vitest, Supabase JS, lives inside `services/mcp-finance/src/lib/pack-info-resolver/`. Same package as mcp-finance to avoid premature monorepo abstraction.

**Spec:** [docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md](../specs/2026-05-08-pack-info-resolver-design.md)

**MC Initiative:** `e8df7bc4-3b1b-448f-be78-5292d0542b4f`

**Predecessor cleanup needed:** Vitest devDep is missing from `services/mcp-finance` and `services/mcp-chef` (MC `39f9de28`). CI fails on every PR until fixed. **Task 1 fixes this** — Phase 1 can't add tests without it.

---

## File Structure

```
services/mcp-finance/
├── package.json                              # MODIFY: add vitest devDep + test script
├── vitest.config.ts                          # CREATE
├── src/lib/pack-info-resolver/
│   ├── index.ts                              # CREATE: re-exports
│   ├── types.ts                              # CREATE: ResolverResult, PackInfo, Conflict, Source
│   ├── parse-pack.ts                         # CREATE: "500g" → {qty:500, unit:"g"}
│   ├── data-provider.ts                      # CREATE: PackInfoDataProvider interface + supabase impl
│   ├── resolver.ts                           # CREATE: resolve() cascade
│   └── tests/
│       ├── parse-pack.test.ts                # CREATE
│       ├── resolver.test.ts                  # CREATE: cascade with stub providers
│       ├── conflict.test.ts                  # CREATE: conflict detection
│       └── fixtures.ts                       # CREATE: test data

services/mcp-chef/
└── package.json                              # MODIFY: add vitest devDep (CI fix only)

services/supabase/migrations/
└── 170_pack_info_resolver_seed.sql           # CREATE
```

Phases 2-4 will add: real-time hook in `approve-receipt.ts`, `services/jobs/pack-info-sweep.ts`, admin-panel review UI, MCP tool wrapper.

---

## Task 1: Fix vitest devDep on both MCP services (CI unblock)

**Files:**
- Modify: `services/mcp-finance/package.json` (devDependencies + scripts)
- Modify: `services/mcp-chef/package.json` (devDependencies + scripts)
- Create: `services/mcp-finance/vitest.config.ts`
- Create: `services/mcp-chef/vitest.config.ts`

- [ ] **Step 1.1: Add vitest to both package.json files**

In `services/mcp-finance/package.json` add to `devDependencies`:
```json
"vitest": "^2.1.0"
```
And in `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Same edits in `services/mcp-chef/package.json`.

- [ ] **Step 1.2: Create vitest.config.ts in both services**

Create `services/mcp-finance/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Same file in `services/mcp-chef/vitest.config.ts`.

- [ ] **Step 1.3: Install in both services**

Run:
```bash
cd services/mcp-finance && npm install
cd ../mcp-chef && npm install
cd ../..
```

- [ ] **Step 1.4: Verify the existing broken test now compiles**

Run:
```bash
cd services/mcp-finance && npm run build && cd ../mcp-chef && npm run build && cd ../..
```

Expected: both succeed (no more "Cannot find module 'vitest'" error from `update-equipment.test.ts`).

- [ ] **Step 1.5: Verify tests run**

Run:
```bash
cd services/mcp-finance && npm test 2>&1 | tail -20
```

Expected: test runner discovers `update-equipment.test.ts` and either passes or shows real test output (not a missing-module error).

- [ ] **Step 1.6: Commit**

```bash
git add services/mcp-finance/package.json services/mcp-finance/vitest.config.ts \
        services/mcp-chef/package.json services/mcp-chef/vitest.config.ts \
        services/mcp-finance/package-lock.json services/mcp-chef/package-lock.json
git commit -m "fix(ci): add vitest devDep to mcp-finance + mcp-chef (closes MC 39f9de28)

The update-equipment tool added .test.ts files in PR #152 but did not
add vitest as a devDep, breaking tsc on every PR build. Adds vitest
^2.1.0 + minimal vitest.config.ts in both services.

MC: 39f9de28"
```

---

## Task 2: Apply schema migration 170

**Files:**
- Create: `services/supabase/migrations/170_pack_info_resolver_seed.sql`

- [ ] **Step 2.1: Write the migration SQL**

Create `services/supabase/migrations/170_pack_info_resolver_seed.sql`:

```sql
-- ============================================================
-- Migration 170: Pack-Info Resolver — schema + rule seed
--
-- Spec: docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md
-- MC initiative: e8df7bc4-3b1b-448f-be78-5292d0542b4f
--
-- Adds confidence_score, source_payload, status to
-- data_health_decisions; extends decision_source CHECK; seeds
-- new NOMENCLATURE_AUTO_PACK_FILL rule.
-- ============================================================

BEGIN;

-- 1. Schema additions (idempotent)
ALTER TABLE public.data_health_decisions
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC,
  ADD COLUMN IF NOT EXISTS source_payload   JSONB,
  ADD COLUMN IF NOT EXISTS status           TEXT
       DEFAULT 'applied';

-- Backfill status for any pre-existing rows
UPDATE public.data_health_decisions SET status = 'applied' WHERE status IS NULL;

-- Make status NOT NULL after backfill
ALTER TABLE public.data_health_decisions
  ALTER COLUMN status SET NOT NULL;

-- Add CHECK constraint (drop-then-add for idempotency)
ALTER TABLE public.data_health_decisions
  DROP CONSTRAINT IF EXISTS data_health_decisions_status_check;
ALTER TABLE public.data_health_decisions
  ADD CONSTRAINT data_health_decisions_status_check
    CHECK (status IN ('pending', 'applied', 'rejected', 'skip'));

-- 2. Extend decision_source CHECK
ALTER TABLE public.data_health_decisions
  DROP CONSTRAINT IF EXISTS data_health_decisions_decision_source_check;
ALTER TABLE public.data_health_decisions
  ADD CONSTRAINT data_health_decisions_decision_source_check
    CHECK (decision_source IN (
      'rule_auto', 'ceo_review', 'manual_edit', 'skip',
      'rule_auto_conflict', 'rule_auto_cost_pending'
    ));

-- 3. Partial index for fast review-queue queries
CREATE INDEX IF NOT EXISTS idx_dhd_pending
  ON public.data_health_decisions (entity_kind, decided_at DESC)
  WHERE status = 'pending';

-- 4. Seed new rule
INSERT INTO public.data_health_rules
  (rule_code, title, description, entity_kind, metric,
   detect_sql, fix_strategy, severity, auto_apply,
   confidence, created_by)
VALUES (
  'NOMENCLATURE_AUTO_PACK_FILL',
  'Auto-fill pack info from supplier_catalog/makro-lookup cascade',
  'Resolves base_unit + package_weight via cascade: supplier_catalog → makro-lookup. Pack-related fields auto-applied at confidence>=0.9; cost_per_unit always queued for CEO review.',
  'nomenclature',
  'missing_pack_info',
  $sql$
    SELECT n.id AS entity_id, n.product_code, n.name,
           jsonb_build_object(
             'current_unit',  n.base_unit,
             'has_purchases', EXISTS (SELECT 1 FROM purchase_logs p WHERE p.nomenclature_id = n.id),
             'cost',          n.cost_per_unit
           ) AS extra_json
      FROM public.nomenclature n
     WHERE n.is_deleted = false
       AND n.base_unit IN ('pcs','bag','bottle','pack')
       AND EXISTS (SELECT 1 FROM purchase_logs p WHERE p.nomenclature_id = n.id)
  $sql$,
  'auto_fill_from_resolver',
  'warn',
  TRUE,
  0.90,
  'claude-opus-session-72f2077a'
)
ON CONFLICT (rule_code) DO NOTHING;

-- 5. migration_log self-register
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '170_pack_info_resolver_seed.sql',
  'claude-opus-session-72f2077a',
  'Pack-Info Resolver Phase 1 schema. Spec: 2026-05-08-pack-info-resolver-design.md. MC initiative: e8df7bc4.'
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

- [ ] **Step 2.2: Apply to remote DB**

Run:
```bash
DB=$(security find-generic-password -s "shishka-database-url" -w)
psql "$DB" -f services/supabase/migrations/170_pack_info_resolver_seed.sql
```

Expected output: `BEGIN`, several `ALTER TABLE` / `CREATE INDEX` / `INSERT 0 1` lines, `COMMIT`.

- [ ] **Step 2.3: Verify schema + rule**

Run:
```bash
DB=$(security find-generic-password -s "shishka-database-url" -w)
psql "$DB" -c "\d data_health_decisions" | grep -E "confidence_score|source_payload|status"
psql "$DB" -c "SELECT rule_code, auto_apply, confidence FROM data_health_rules WHERE rule_code='NOMENCLATURE_AUTO_PACK_FILL';"
psql "$DB" -c "SELECT filename FROM migration_log WHERE filename='170_pack_info_resolver_seed.sql';"
```

Expected: three columns present, rule row exists with `auto_apply=t` and `confidence=0.90`, migration_log row exists.

- [ ] **Step 2.4: Commit**

```bash
git add services/supabase/migrations/170_pack_info_resolver_seed.sql
git commit -m "feat(data-health): migration 170 — pack-info resolver schema + rule seed

Adds confidence_score, source_payload, status columns to
data_health_decisions; extends decision_source CHECK with
'rule_auto_conflict' and 'rule_auto_cost_pending'; adds partial
index for pending queue; seeds NOMENCLATURE_AUTO_PACK_FILL rule.

Spec: docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md
MC: e8df7bc4-3b1b-448f-be78-5292d0542b4f"
```

---

## Task 3: Define resolver types

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-resolver/types.ts`

- [ ] **Step 3.1: Write types file**

Create `services/mcp-finance/src/lib/pack-info-resolver/types.ts`:

```ts
export type Source =
  | 'supplier_catalog_exact'
  | 'supplier_catalog_fuzzy'
  | 'makro_barcode'
  | 'makro_fuzzy';

export type CanonicalUnit = 'kg' | 'g' | 'L' | 'ml' | 'pcs' | 'portion';

export interface PackInfo {
  base_unit: CanonicalUnit;
  package_weight: string;        // e.g. "500g", "1kg"
  package_qty: number;           // numeric form, e.g. 500
  package_unit: string;          // unit of qty, e.g. "g"
  cost_per_kg: number | null;    // computed when last_price + qty available
}

export interface Conflict {
  source: Source;
  pack_info: PackInfo;
  evidence: Record<string, unknown>;
}

export interface ResolverResult {
  nomenclature_id: string;
  resolved: PackInfo | null;
  source: Source | null;
  confidence: number;             // 0..1
  conflicts: Conflict[];
  evidence: Record<string, unknown>;
}
```

- [ ] **Step 3.2: Verify it compiles**

Run:
```bash
cd services/mcp-finance && npm run build && cd ../..
```

Expected: success (file is referenced nowhere yet, but tsc must accept it).

- [ ] **Step 3.3: Commit**

```bash
git add services/mcp-finance/src/lib/pack-info-resolver/types.ts
git commit -m "feat(pack-resolver): define ResolverResult, PackInfo, Conflict, Source types"
```

---

## Task 4: Implement parse-pack-weight (TDD)

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-resolver/tests/parse-pack.test.ts`
- Create: `services/mcp-finance/src/lib/pack-info-resolver/parse-pack.ts`

- [ ] **Step 4.1: Write failing tests**

Create `services/mcp-finance/src/lib/pack-info-resolver/tests/parse-pack.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePackWeight } from '../parse-pack.js';

describe('parsePackWeight', () => {
  it('parses simple grams', () => {
    expect(parsePackWeight('500g')).toEqual({ qty: 500, unit: 'g' });
  });
  it('parses kilograms', () => {
    expect(parsePackWeight('1kg')).toEqual({ qty: 1, unit: 'kg' });
    expect(parsePackWeight('2.5kg')).toEqual({ qty: 2.5, unit: 'kg' });
  });
  it('parses milliliters and liters', () => {
    expect(parsePackWeight('250ml')).toEqual({ qty: 250, unit: 'ml' });
    expect(parsePackWeight('1L')).toEqual({ qty: 1, unit: 'L' });
    expect(parsePackWeight('4.5L')).toEqual({ qty: 4.5, unit: 'L' });
  });
  it('handles whitespace and case variations', () => {
    expect(parsePackWeight(' 500 g ')).toEqual({ qty: 500, unit: 'g' });
    expect(parsePackWeight('500G')).toEqual({ qty: 500, unit: 'g' });
    expect(parsePackWeight('1KG')).toEqual({ qty: 1, unit: 'kg' });
    expect(parsePackWeight('1l')).toEqual({ qty: 1, unit: 'L' });
  });
  it('returns null for unparseable input', () => {
    expect(parsePackWeight('')).toBeNull();
    expect(parsePackWeight('large')).toBeNull();
    expect(parsePackWeight('500')).toBeNull();
    expect(parsePackWeight('g')).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run tests — expect FAIL**

Run:
```bash
cd services/mcp-finance && npm test -- parse-pack 2>&1 | tail -10 && cd ../..
```

Expected: FAIL with "Cannot find module '../parse-pack.js'".

- [ ] **Step 4.3: Write minimal implementation**

Create `services/mcp-finance/src/lib/pack-info-resolver/parse-pack.ts`:

```ts
const PATTERN = /^(\d+(?:\.\d+)?)\s*(g|kg|ml|l)$/i;

export function parsePackWeight(input: string): { qty: number; unit: 'g' | 'kg' | 'ml' | 'L' } | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(PATTERN);
  if (!match) return null;
  const qty = parseFloat(match[1]);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const rawUnit = match[2];
  const unit = rawUnit === 'l' ? 'L' : (rawUnit as 'g' | 'kg' | 'ml');
  return { qty, unit };
}
```

- [ ] **Step 4.4: Run tests — expect PASS**

Run:
```bash
cd services/mcp-finance && npm test -- parse-pack 2>&1 | tail -10 && cd ../..
```

Expected: all 5 test groups pass.

- [ ] **Step 4.5: Commit**

```bash
git add services/mcp-finance/src/lib/pack-info-resolver/parse-pack.ts \
        services/mcp-finance/src/lib/pack-info-resolver/tests/parse-pack.test.ts
git commit -m "feat(pack-resolver): parse pack-weight strings (TDD)"
```

---

## Task 5: Define data-provider interface

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-resolver/data-provider.ts`

- [ ] **Step 5.1: Write the interface + supabase impl**

Create `services/mcp-finance/src/lib/pack-info-resolver/data-provider.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupplierCatalogRow {
  supplier_id: string;
  package_weight: string | null;
  package_qty: number | null;
  package_unit: string | null;
  barcode: string | null;
  product_name: string | null;
  brand: string | null;
}

export interface MakroResult {
  found: boolean;
  name: string | null;
  unit: string | null;
  brand: string | null;
}

export interface PackInfoDataProvider {
  getSupplierCatalogExact(nomenclature_id: string, barcode: string): Promise<SupplierCatalogRow[]>;
  getSupplierCatalogFuzzy(nomenclature_id: string): Promise<SupplierCatalogRow[]>;
  fetchMakroByBarcode(barcode: string): Promise<MakroResult>;
  fetchMakroByName(query: string): Promise<MakroResult>;
}

export function createSupabaseProvider(
  sb: SupabaseClient,
  fetchMakro: (q: string) => Promise<MakroResult>,
): PackInfoDataProvider {
  return {
    async getSupplierCatalogExact(nomenclature_id, barcode) {
      const { data, error } = await sb
        .from('supplier_catalog')
        .select('supplier_id, package_weight, package_qty, package_unit, barcode, product_name, brand')
        .eq('nomenclature_id', nomenclature_id)
        .eq('barcode', barcode)
        .not('package_weight', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    async getSupplierCatalogFuzzy(nomenclature_id) {
      const { data, error } = await sb
        .from('supplier_catalog')
        .select('supplier_id, package_weight, package_qty, package_unit, barcode, product_name, brand')
        .eq('nomenclature_id', nomenclature_id)
        .not('package_weight', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    async fetchMakroByBarcode(barcode) {
      return fetchMakro(barcode);
    },
    async fetchMakroByName(query) {
      return fetchMakro(query);
    },
  };
}
```

- [ ] **Step 5.2: Verify compilation**

Run:
```bash
cd services/mcp-finance && npm run build && cd ../..
```

Expected: success.

- [ ] **Step 5.3: Commit**

```bash
git add services/mcp-finance/src/lib/pack-info-resolver/data-provider.ts
git commit -m "feat(pack-resolver): PackInfoDataProvider interface + supabase impl"
```

---

## Task 6: Implement resolver cascade (TDD with stub provider)

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-resolver/tests/fixtures.ts`
- Create: `services/mcp-finance/src/lib/pack-info-resolver/tests/resolver.test.ts`
- Create: `services/mcp-finance/src/lib/pack-info-resolver/resolver.ts`

- [ ] **Step 6.1: Write fixtures helper**

Create `services/mcp-finance/src/lib/pack-info-resolver/tests/fixtures.ts`:

```ts
import type { PackInfoDataProvider, SupplierCatalogRow, MakroResult } from '../data-provider.js';

export interface StubConfig {
  sc_exact?: SupplierCatalogRow[];
  sc_fuzzy?: SupplierCatalogRow[];
  makro_barcode?: MakroResult;
  makro_name?: MakroResult;
  throwOnMakroBarcode?: boolean;
}

export function makeStubProvider(cfg: StubConfig): PackInfoDataProvider {
  const empty: MakroResult = { found: false, name: null, unit: null, brand: null };
  return {
    async getSupplierCatalogExact() { return cfg.sc_exact ?? []; },
    async getSupplierCatalogFuzzy() { return cfg.sc_fuzzy ?? []; },
    async fetchMakroByBarcode() {
      if (cfg.throwOnMakroBarcode) throw new Error('makro 5xx');
      return cfg.makro_barcode ?? empty;
    },
    async fetchMakroByName() { return cfg.makro_name ?? empty; },
  };
}

export const SCROW = (over: Partial<SupplierCatalogRow> = {}): SupplierCatalogRow => ({
  supplier_id: 'sup-1',
  package_weight: '500g',
  package_qty: 500,
  package_unit: 'g',
  barcode: '8005121004113',
  product_name: 'Divella Farina',
  brand: 'Divella',
  ...over,
});
```

- [ ] **Step 6.2: Write failing resolver tests**

Create `services/mcp-finance/src/lib/pack-info-resolver/tests/resolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolve } from '../resolver.js';
import { makeStubProvider, SCROW } from './fixtures.js';

const NID = 'd411c6ec-b843-46c7-8cd4-eba0f6efe19a';

describe('resolve()', () => {
  it('returns supplier_catalog_exact at conf=1.0 when barcode matches one row', async () => {
    const provider = makeStubProvider({ sc_exact: [SCROW()] });
    const r = await resolve({ nomenclature_id: NID, barcode: '8005121004113', last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.source).toBe('supplier_catalog_exact');
    expect(r.confidence).toBe(1.0);
    expect(r.resolved?.package_qty).toBe(500);
    expect(r.resolved?.package_unit).toBe('g');
    expect(r.resolved?.cost_per_kg).toBeCloseTo(266, 0);
    expect(r.conflicts).toEqual([]);
  });

  it('falls back to fuzzy when no barcode given', async () => {
    const provider = makeStubProvider({ sc_fuzzy: [SCROW()] });
    const r = await resolve({ nomenclature_id: NID, last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.source).toBe('supplier_catalog_fuzzy');
    expect(r.confidence).toBe(0.85);
  });

  it('detects conflict when fuzzy returns multiple rows with different pack_weight', async () => {
    const provider = makeStubProvider({
      sc_fuzzy: [SCROW({ package_weight: '500g', package_qty: 500 }), SCROW({ package_weight: '1kg', package_qty: 1, package_unit: 'kg' })],
    });
    const r = await resolve({ nomenclature_id: NID, last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.confidence).toBe(0.5);
    expect(r.conflicts.length).toBe(2);
    expect(r.resolved).toBeNull();
  });

  it('reaches makro_barcode level when local sources empty', async () => {
    const provider = makeStubProvider({
      makro_barcode: { found: true, name: 'Divella Farina 500g', unit: '500g', brand: 'Divella' },
    });
    const r = await resolve({ nomenclature_id: NID, barcode: '8005121004113', last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.source).toBe('makro_barcode');
    expect(r.confidence).toBe(0.85);
    expect(r.resolved?.package_qty).toBe(500);
  });

  it('continues cascade when makro fetch throws', async () => {
    const provider = makeStubProvider({
      throwOnMakroBarcode: true,
      makro_name: { found: true, name: 'Divella Farina 500g', unit: '500g', brand: 'Divella' },
    });
    const r = await resolve({ nomenclature_id: NID, barcode: '8005121004113', last_price_thb: 133, supplier_id: 'sup-1', name: 'Divella Farina', brand: 'Divella' }, provider);
    expect(r.source).toBe('makro_fuzzy');
    expect(r.confidence).toBe(0.6);
  });

  it('returns null resolved + 0 confidence when entire cascade fails', async () => {
    const provider = makeStubProvider({});
    const r = await resolve({ nomenclature_id: NID, last_price_thb: 133, supplier_id: 'sup-1' }, provider);
    expect(r.resolved).toBeNull();
    expect(r.source).toBeNull();
    expect(r.confidence).toBe(0);
  });
});
```

- [ ] **Step 6.3: Run — expect FAIL (no resolver.ts yet)**

Run:
```bash
cd services/mcp-finance && npm test -- resolver 2>&1 | tail -10 && cd ../..
```

Expected: FAIL — module not found.

- [ ] **Step 6.4: Implement resolver.ts**

Create `services/mcp-finance/src/lib/pack-info-resolver/resolver.ts`:

```ts
import type { CanonicalUnit, Conflict, PackInfo, ResolverResult, Source } from './types.js';
import type { PackInfoDataProvider, SupplierCatalogRow, MakroResult } from './data-provider.js';
import { parsePackWeight } from './parse-pack.js';

export interface ResolveInput {
  nomenclature_id: string;
  supplier_id: string;
  barcode?: string;
  last_price_thb?: number;
  name?: string;
  brand?: string;
}

const CANONICAL_UNIT_MAP: Record<string, CanonicalUnit> = {
  g: 'kg',  // weight items normalized to kg base
  kg: 'kg',
  ml: 'L',  // volume items normalized to L base
  L: 'L',
};

function rowToPackInfo(row: SupplierCatalogRow, last_price_thb: number | undefined): PackInfo | null {
  if (!row.package_weight) return null;
  const parsed = parsePackWeight(row.package_weight);
  if (!parsed) return null;
  const base_unit = CANONICAL_UNIT_MAP[parsed.unit] ?? 'pcs';
  const grams_or_ml = parsed.unit === 'kg' || parsed.unit === 'L' ? parsed.qty * 1000 : parsed.qty;
  const cost_per_kg =
    last_price_thb != null && grams_or_ml > 0
      ? (last_price_thb / grams_or_ml) * 1000
      : null;
  return {
    base_unit,
    package_weight: row.package_weight,
    package_qty: parsed.qty,
    package_unit: parsed.unit,
    cost_per_kg,
  };
}

function makroToPackInfo(m: MakroResult, last_price_thb: number | undefined): PackInfo | null {
  if (!m.found || !m.unit) return null;
  const parsed = parsePackWeight(m.unit);
  if (!parsed) return null;
  const base_unit = CANONICAL_UNIT_MAP[parsed.unit] ?? 'pcs';
  const grams = parsed.unit === 'kg' ? parsed.qty * 1000 : parsed.qty;
  const cost_per_kg = last_price_thb != null && grams > 0 ? (last_price_thb / grams) * 1000 : null;
  return {
    base_unit,
    package_weight: m.unit,
    package_qty: parsed.qty,
    package_unit: parsed.unit,
    cost_per_kg,
  };
}

function emptyResult(nomenclature_id: string): ResolverResult {
  return { nomenclature_id, resolved: null, source: null, confidence: 0, conflicts: [], evidence: {} };
}

function detectConflict(rows: SupplierCatalogRow[], src: Source, last_price_thb?: number): Conflict[] {
  const seen = new Map<string, Conflict>();
  for (const r of rows) {
    if (!r.package_weight) continue;
    const pi = rowToPackInfo(r, last_price_thb);
    if (!pi) continue;
    const key = `${pi.package_qty}${pi.package_unit}`;
    if (!seen.has(key)) {
      seen.set(key, { source: src, pack_info: pi, evidence: { ...r } });
    }
  }
  return seen.size > 1 ? Array.from(seen.values()) : [];
}

export async function resolve(input: ResolveInput, p: PackInfoDataProvider): Promise<ResolverResult> {
  // Level 1: supplier_catalog exact
  if (input.barcode) {
    const exact = await p.getSupplierCatalogExact(input.nomenclature_id, input.barcode);
    if (exact.length === 1) {
      const pi = rowToPackInfo(exact[0], input.last_price_thb);
      if (pi) return { nomenclature_id: input.nomenclature_id, resolved: pi, source: 'supplier_catalog_exact', confidence: 1.0, conflicts: [], evidence: { sc: exact[0] } };
    } else if (exact.length > 1) {
      const conflicts = detectConflict(exact, 'supplier_catalog_exact', input.last_price_thb);
      if (conflicts.length > 0) return { nomenclature_id: input.nomenclature_id, resolved: null, source: null, confidence: 0.5, conflicts, evidence: { sc: exact } };
    }
  }

  // Level 2: supplier_catalog fuzzy
  const fuzzy = await p.getSupplierCatalogFuzzy(input.nomenclature_id);
  if (fuzzy.length > 0) {
    const conflicts = detectConflict(fuzzy, 'supplier_catalog_fuzzy', input.last_price_thb);
    if (conflicts.length > 0) {
      return { nomenclature_id: input.nomenclature_id, resolved: null, source: null, confidence: 0.5, conflicts, evidence: { sc: fuzzy } };
    }
    const pi = rowToPackInfo(fuzzy[0], input.last_price_thb);
    if (pi) return { nomenclature_id: input.nomenclature_id, resolved: pi, source: 'supplier_catalog_fuzzy', confidence: 0.85, conflicts: [], evidence: { sc: fuzzy[0] } };
  }

  // Level 3: makro by barcode
  if (input.barcode) {
    try {
      const m = await p.fetchMakroByBarcode(input.barcode);
      const pi = makroToPackInfo(m, input.last_price_thb);
      if (pi) return { nomenclature_id: input.nomenclature_id, resolved: pi, source: 'makro_barcode', confidence: 0.85, conflicts: [], evidence: { makro: m } };
    } catch (err) {
      // continue cascade — log handled by caller
    }
  }

  // Level 4: makro by name
  if (input.name) {
    try {
      const query = input.brand ? `${input.brand} ${input.name}` : input.name;
      const m = await p.fetchMakroByName(query);
      const pi = makroToPackInfo(m, input.last_price_thb);
      if (pi) return { nomenclature_id: input.nomenclature_id, resolved: pi, source: 'makro_fuzzy', confidence: 0.6, conflicts: [], evidence: { makro: m, query } };
    } catch (err) {
      // continue
    }
  }

  return emptyResult(input.nomenclature_id);
}
```

- [ ] **Step 6.5: Run tests — expect PASS**

Run:
```bash
cd services/mcp-finance && npm test -- resolver 2>&1 | tail -25 && cd ../..
```

Expected: all 6 test cases pass.

- [ ] **Step 6.6: Commit**

```bash
git add services/mcp-finance/src/lib/pack-info-resolver/resolver.ts \
        services/mcp-finance/src/lib/pack-info-resolver/tests/fixtures.ts \
        services/mcp-finance/src/lib/pack-info-resolver/tests/resolver.test.ts
git commit -m "feat(pack-resolver): implement cascade with TDD (7 cases)"
```

---

## Task 7: Index re-exports + barrel

**Files:**
- Create: `services/mcp-finance/src/lib/pack-info-resolver/index.ts`

- [ ] **Step 7.1: Write barrel file**

Create `services/mcp-finance/src/lib/pack-info-resolver/index.ts`:

```ts
export { resolve } from './resolver.js';
export type { ResolveInput } from './resolver.js';
export type {
  ResolverResult,
  PackInfo,
  Conflict,
  Source,
  CanonicalUnit,
} from './types.js';
export { createSupabaseProvider } from './data-provider.js';
export type {
  PackInfoDataProvider,
  SupplierCatalogRow,
  MakroResult,
} from './data-provider.js';
export { parsePackWeight } from './parse-pack.js';
```

- [ ] **Step 7.2: Verify build**

Run:
```bash
cd services/mcp-finance && npm run build && cd ../..
```

Expected: success.

- [ ] **Step 7.3: Verify tests still green**

Run:
```bash
cd services/mcp-finance && npm test 2>&1 | tail -10 && cd ../..
```

Expected: all tests pass.

- [ ] **Step 7.4: Commit**

```bash
git add services/mcp-finance/src/lib/pack-info-resolver/index.ts
git commit -m "feat(pack-resolver): barrel exports for clean import surface"
```

---

## Task 8: Push, PR, merge

- [ ] **Step 8.1: Push branch**

Run:
```bash
git push -u origin $(git branch --show-current)
```

- [ ] **Step 8.2: Create PR**

Run:
```bash
gh pr create --title "feat(pack-resolver): Phase 1 foundation — lib + migration 170 (initiative e8df7bc4)" --body "$(cat <<'EOF'
## Summary
- Phase 1 of Pack-Info Resolver initiative — pure-function cascade library + schema migration
- Includes CI fix for missing vitest devDep (closes MC 39f9de28)
- No external integration yet — Phases 2-4 will wire the resolver into receipt processing, batch cron, admin UI

## MC
- Initiative: e8df7bc4-3b1b-448f-be78-5292d0542b4f
- CI fix: 39f9de28

## Spec
- docs/superpowers/specs/2026-05-08-pack-info-resolver-design.md

## Test plan
- [x] vitest installed in mcp-finance + mcp-chef
- [x] Migration 170 applied to remote DB
- [x] parse-pack-weight: 5 test groups
- [x] resolver cascade: 6 test cases (all 4 cascade levels + conflict + cascade-fail)
- [ ] Reviewer: tsc + lint pass on both services
EOF
)"
```

- [ ] **Step 8.3: Wait for checks + merge**

Run:
```bash
PR_URL=$(gh pr view --json url --jq .url)
PR_NUM=$(gh pr view --json number --jq .number)
gh pr checks $PR_NUM --watch
gh pr view $PR_NUM --json state,mergeable --jq '{state, mergeable}'
gh pr merge $PR_NUM --squash
gh pr view $PR_NUM --json state --jq .state  # must be MERGED
```

- [ ] **Step 8.4: Update MC initiative**

Use `mcp__shishka-mission-control__update_task` with task_id `e8df7bc4-3b1b-448f-be78-5292d0542b4f`:
- Set `notes`: "Phase 1 done. PR #N merged. Phases 2-4 ready for separate plans."
- Set `related_ids`: `{phase1_pr: N, phase1_merge_sha: "..."}`

Use `mcp__shishka-mission-control__update_task` with task_id `39f9de28-c74b-4ee7-b126-5e20b13f2748`:
- Set `status`: "done"
- Set `notes`: "Closed by Phase 1 of pack-info-resolver initiative — vitest devDep added to mcp-finance + mcp-chef in PR #N."

---

## Self-Review Checklist (engineer should run before merging)

- [ ] **Spec coverage:** Every Phase 1 deliverable from the spec is implemented. Phases 2-4 explicitly out of scope of this plan.
- [ ] **Placeholder scan:** No `TODO`, `TBD`, `add error handling`, "similar to Task N" left in code or tests.
- [ ] **Type consistency:** `ResolverResult` shape matches what tests assert. `Source` enum values match between `types.ts` and resolver returns. `PackInfo.package_unit` strings match `parsePackWeight` outputs.
- [ ] **Migration is idempotent:** Re-running `170_pack_info_resolver_seed.sql` is a no-op on a DB that already has the columns and rule.
- [ ] **Resolver is pure:** No DB calls in `resolver.ts` itself — only via `PackInfoDataProvider`.

---

## Out of Scope for Phase 1 (separate plans)

- **Phase 2:** Real-time hook in `services/mcp-finance/src/tools/approve-receipt.ts`
- **Phase 3:** `services/jobs/pack-info-sweep.ts` daily cron
- **Phase 4:** Admin-panel pending review queue + `pack-info-lookup` MCP tool

Each gets its own `docs/superpowers/plans/2026-05-XX-pack-info-resolver-phaseN.md` after Phase 1 lands.
