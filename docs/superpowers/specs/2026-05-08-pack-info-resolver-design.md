# Pack-Info Resolver: data_health × supplier_catalog × makro-lookup integration

> Date: 2026-05-08
> Status: Draft
> Scope: New cascade-based resolver that fills `package_*` fields and normalizes `base_unit` automatically; integrates with real-time receipt processing and a daily batch sweep
> Predecessor: [2026-04-14-data-health-makro-design.md](./2026-04-14-data-health-makro-design.md) (parser + cleanup foundation, mostly shipped via Adaptive Receipt Learning PRs #118-124 and data_health learning loop migrations 154-156)
> Discovery context: MC tasks `627a70df` (RAW-d9cd5a8b unit fix, done) and `36293390` (RAW-5a458281 same fix, blocked on this design)

## Problem

We have all the pieces for automatic pack-size resolution but they are not wired together:

| Asset | State |
|---|---|
| `supplier_catalog` table | Has `package_weight`, `package_qty`, `package_unit`, `barcode` columns. Populated for some Makro/Tops items. |
| `services/mcp-finance/src/tools/makro-lookup.ts` | Working web-scraper for Makro.pro by barcode or name. Returns `name/price/unit/brand/image_url`. |
| `gs1_weight_items` | Captures GS1-128 weight items from receipts. |
| `tools/data-health/run_rules.py` | Runs four nomenclature rules. All four use SQL detect + string-manipulation `fix_strategy`. **None call out to supplier_catalog or makro-lookup.** |
| `data_health_decisions` audit | Records all rule applications, but every entry today is a one-off manual fix. |

Result: every `pcs/kg` mismatch like RAW-d9cd5a8b (Ercho Rice Flour) and RAW-5a458281 (Divella Farina) is fixed by hand via single-row migrations even though the source-of-truth pack info is either already in the DB or one HTTP call away.

## Goals

1. Automatically resolve `package_weight/qty/unit` for nomenclature rows when triggered by a new receipt or a daily sweep.
2. Auto-normalize `base_unit` (e.g. `pcs`→`kg`) when confidence is high enough.
3. Always queue `cost_per_unit` corrections for CEO review (cost drives BOM margin — never silently changed).
4. Surface conflicts (same barcode mapped to different pack sizes across suppliers) instead of guessing.

## Non-Goals

- Tops Rawai web-scraper (separate effort, requires its own parser).
- Big C / Lotus / 7-Eleven scrapers.
- OpenFoodFacts integration (out-of-scope spike for later).
- Auto-resolution of barcode collisions (e.g. `8005121004113` mapped to two different products) — surfaced for CEO review only.
- Bulk backfill via one-shot migration — the daily sweep does the cleanup over time.
- Cost-per-unit auto-apply.
- Database-level trigger (`AFTER INSERT ON receipt_inbox`) — implemented at application level for testability.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | One pure-function `pack-info-resolver` library + thin integration points | DRY; resolver is unit-testable without network |
| Source cascade | `supplier_catalog` exact → `supplier_catalog` brand+name → `gs1_weight_items` → `makro-lookup` barcode → `makro-lookup` fuzzy → fail | Local first (cheap, accurate), external second |
| Auto-apply policy | Pack fields auto-apply at confidence ≥ 0.9 with no conflicts; cost always pending CEO review | Per CEO directive 2026-05-08; cost drives BOM margin and must not change silently |
| Conflict handling | If multiple sources disagree, confidence drops to 0.50 and result goes to pending queue with `conflicts[]` payload | Never auto-apply when sources disagree |
| Trigger model | Real-time hook in `approve-receipt.ts` + nightly cron sweep (3 AM Bangkok) | Real-time prevents future garbage; cron fixes existing |
| Idempotency | Resolver writes nothing if current state already matches; skip-decisions are not re-flagged for 7 days | Avoid noisy review queue |
| Library location | `services/lib/pack-info-resolver/` (shared TS) | Used by mcp-finance, mcp-chef, jobs/, and admin-panel |

## Architecture

### Components

| Component | Path | Responsibility |
|---|---|---|
| `pack-info-resolver` | `services/lib/pack-info-resolver/` | Pure function: `resolve(nomenclature_id, ?barcode) → ResolverResult`. Makro-fetcher injected as dependency. |
| Real-time hook | extension of `services/mcp-finance/src/tools/approve-receipt.ts` | After SKU match, calls resolver per line; applies gate; returns `pack_corrections[]` in response |
| Batch cron job | `services/jobs/pack-info-sweep.ts` (new) | Daily 3 AM Bangkok; scans `nomenclature` with suspicious `base_unit` and at least one purchase; calls resolver; routes via gate |
| MCP tool | `services/mcp-finance/src/tools/pack-info-lookup.ts` (new) | Wrapper around resolver for on-demand calls from chef/finance agents |
| New rule row | `data_health_rules` (seeded by migration 170) | `rule_code='NOMENCLATURE_AUTO_PACK_FILL'`, `auto_apply=true`, `confidence=0.90`, `fix_strategy='auto_fill_from_resolver'` |
| Schema migration | `services/supabase/migrations/170_pack_info_resolver_seed.sql` | Adds `confidence_score`, `source_payload`, `status` to `data_health_decisions`; extends `decision_source` CHECK; seeds new rule |
| Admin UI | new section in `apps/admin-panel/src/pages/DataHealth.tsx` | Pending review queue with approve/reject/skip; surfaces conflicts |

### Resolver cascade

The resolver tries sources top-to-bottom and returns at the first hit:

| # | Source | Match key | Confidence | Notes |
|---|---|---|---|---|
| 1 | `supplier_catalog` exact | `nomenclature_id` AND `barcode` AND `package_weight IS NOT NULL` | 1.00 | Already known |
| 2 | `supplier_catalog` brand+name | `nomenclature_id`, fuzzy on name | 0.85 | Barcode missing |
| 3 | `gs1_weight_items` | `base_barcode` | 0.90 | GS1-128 weight items from receipts |
| 4 | `makro-lookup` exact | barcode | 0.85 | External fetch |
| 5 | `makro-lookup` fuzzy | brand + name | 0.60 | Last resort |
| 6 | fail | — | 0 | Skip-decision, not re-flagged for 7 days |

Conflict detection: if step 1 or 2 returns multiple rows with different `package_weight`, or makro-lookup result disagrees with supplier_catalog, confidence drops to **0.50** and `conflicts[]` is populated with both versions. Conflicts always route to pending queue.

### Decision gate (after resolver returns)

```
ResolverResult →
  if conflicts.length > 0 → pending queue (decision_source='rule_auto_conflict', conf=0.50)
  else if confidence >= 0.90 → auto-apply pack fields (decision_source='rule_auto')
                              + always-pending cost (decision_source='rule_auto_cost_pending')
  else if confidence >= 0.50 → pending queue (decision_source='rule_auto', low confidence)
  else                      → skip-decision (decision_source='skip', not re-flagged 7d)
```

Cost-per-unit (`cost_per_kg = last_price_thb / (package_qty × unit_to_kg(package_unit))`) is **always** queued for CEO approval, even at confidence 1.0. This is per the D-policy from brainstorm vote: cost drives BOM margin and an incorrect lookup propagates to every recipe and dish.

Note: `supplier_catalog.package_weight` is TEXT (e.g. "500g"); the resolver parses it into the numeric `package_qty` + `package_unit` pair before any arithmetic. Rows where `package_qty` is NULL after parse are surfaced as cascade-fail (skip-decision), not auto-applied.

### Auto-apply transaction shape

```sql
BEGIN;
  -- 1. Normalize base_unit
  UPDATE nomenclature
     SET base_unit = $resolved_unit, updated_at = now()
   WHERE id = $nomenclature_id AND base_unit <> $resolved_unit;

  -- 2. Cache pack info in supplier_catalog
  UPDATE supplier_catalog
     SET package_weight = $pw, package_qty = $pq, package_unit = $pu, updated_at = now()
   WHERE nomenclature_id = $id AND supplier_id = $supplier_id;

  -- 3. Audit row (applied)
  INSERT INTO data_health_decisions
    (run_id, rule_id, entity_kind, entity_id, field, old_value, new_value,
     decision_source, decided_by, confidence_score, source_payload, status)
  VALUES (..., 'base_unit', ..., 'rule_auto', ..., 0.90, $payload, 'applied');
COMMIT;

-- 4. Always-pending cost row (separate, status='pending')
INSERT INTO data_health_decisions
  (..., 'cost_per_unit', '133', '266', 'rule_auto_cost_pending', ..., status='pending');
```

## Data Model

### Schema migration `170_pack_info_resolver_seed.sql`

- `data_health_decisions`:
  - `+ confidence_score NUMERIC` (0..1)
  - `+ source_payload JSONB` ({source, conflicts[], evidence})
  - `+ status TEXT DEFAULT 'applied' CHECK (status IN ('pending','applied','rejected','skip'))`
  - extend `decision_source` CHECK to include `'rule_auto_conflict'` and `'rule_auto_cost_pending'`
  - new partial index on `(entity_kind, status) WHERE status='pending'` for fast review-queue queries
- `data_health_rules` row inserted: `NOMENCLATURE_AUTO_PACK_FILL`, `auto_apply=true`, `confidence=0.90`, `severity=warn`
- `migration_log` self-register

### ResolverResult shape (TypeScript)

```ts
interface ResolverResult {
  nomenclature_id: string;
  resolved: {
    base_unit: 'kg' | 'L' | 'pcs' | 'portion' | 'g' | 'ml';
    package_weight: string | null;  // e.g. "500g", "1kg"
    package_qty: number | null;
    package_unit: string | null;
    cost_per_kg: number | null;
  } | null;
  source: 'supplier_catalog_exact' | 'supplier_catalog_fuzzy' | 'gs1' | 'makro_barcode' | 'makro_fuzzy' | null;
  confidence: number;  // 0..1
  conflicts: Array<{
    source: string;
    package_weight: string;
    evidence: Record<string, unknown>;
  }>;
  evidence: Record<string, unknown>;  // free-form for audit
}
```

## Real-Time Hook Flow

```
receipt_inbox INSERT (status='parsed')
    ↓
[existing approve-receipt.ts logic]
    SKU match per line item
    Insert purchase_logs
    ↓
[NEW: per line, if pack info incomplete]
    resolver.resolve(nomenclature_id, line.barcode)
    apply gate (auto / pending / skip)
    accumulate pack_corrections[]
    ↓
[existing approve-receipt response]
    response.pack_corrections = [...]
    receipt UI shows "Auto-corrected: N items, M pending review"
```

The hook never blocks the receipt approval — resolver errors are caught, logged structurally, and surfaced as `pack_correction_errors[]` in the response without failing the receipt.

## Batch Cron Flow

```
0 3 * * * Bangkok (= 20:00 UTC previous day)
    ↓
SELECT n.id FROM nomenclature n
WHERE n.is_deleted = false
  AND n.base_unit IN ('pcs','bag','bottle','pack')
  AND EXISTS (SELECT 1 FROM purchase_logs p WHERE p.nomenclature_id=n.id)
  AND NOT EXISTS (
    SELECT 1 FROM data_health_decisions d
    WHERE d.entity_id=n.id AND d.field='base_unit'
      AND d.decided_at > now() - interval '7 days'
  )
LIMIT 100;
    ↓
For each id: resolver.resolve(id, NULL)
    ↓
Apply same gate as real-time
    ↓
Send summary: "Pack-info sweep: N auto-applied, M pending review, K skipped"
```

The 7-day cooldown prevents the same skip-decision from being re-flagged daily and overwhelming the review queue.

## Error & Edge Cases

| Scenario | Behavior |
|---|---|
| Cascade fails (no source matched) | No write. Insert `data_health_decisions` with `decision_source='skip'`, `notes='no source matched'`. Not re-flagged for 7 days. |
| Makro fetch timeout / 5xx | Cascade continues to next level. Logged in structured log. Pipeline does not fail. |
| Barcode collision (e.g. `8005121004113` mapped to two products) | No auto-apply. Pending queue. `conflicts[]` payload contains both versions. |
| Nomenclature row not found | Resolver throws. Caller catches, logs, does not block the receipt. |
| Already-correct row (idempotent) | Skip silently. No decision row created. |
| `cost_per_unit` already queued (pending) for same row | Update existing pending row, don't create duplicate. |

## Testing

**Unit (Vitest, no network):**

- `resolver.test.ts`:
  - supplier_catalog exact match → conf=1.0, no fetch
  - supplier_catalog brand+name only → conf=0.85
  - barcode → injected makro-stub returns 500g → conf=0.85
  - two supplier_catalog rows disagree → conf=0.50, conflicts populated
  - cascade fail → returns null
  - makro-stub throws → cascade continues, does not fail
- `gate.test.ts`: for each ResolverResult shape, assert correct routing (auto / pending / skip)

**Integration (real Supabase test schema):**

- Seed → run sweep → assert nomenclature.base_unit updated AND `data_health_decisions` row created
- Seed conflict → run sweep → assert NO write to nomenclature, pending decision row exists
- Idempotency: run sweep twice → second run is no-op

**Smoke (post-deploy, manual):**

- Curl receipt parse endpoint with test receipt for RAW-d9cd5a8b → verify pending row appears for cost_per_unit
- Trigger cron manually → verify summary email/log
- Approve a pending decision in admin UI → verify nomenclature/cost updated and decision moved to status='applied'

## Decomposition

The spec maps to one implementation plan with four phases. Each phase is a separate atomic PR.

| Phase | Scope | Depends on | Effort (1 dev) |
|---|---|---|---|
| 1. Foundation | `pack-info-resolver` lib + migration 170 + unit tests | — | ~1 day |
| 2. Real-time hook | Wire resolver into `approve-receipt.ts` + integration test | Phase 1 | ~0.5 day |
| 3. Batch cron + summary | `pack-info-sweep.ts` job + summary notification | Phase 1 | ~0.5 day |
| 4. Admin UI + MCP tool | Pending review queue in `/data-health` + `pack_info_lookup` MCP wrapper | Phase 1 | ~1 day |

Phase 1 can ship without 2-4 (it just sits dormant). Phases 2/3/4 are independent of each other and can be parallelized across two sessions for ~2 day total wall-clock.

## Success Criteria

- A new RAW item bought via receipt has its `package_weight` and correct `base_unit` filled within seconds of receipt approval, without manual intervention, when supplier_catalog or makro-lookup has the data.
- Existing RAW items with `pcs/bag/bottle` units get swept nightly and either auto-corrected or surfaced for CEO review.
- All `cost_per_unit` changes from this pipeline appear in the CEO review queue, never silently applied.
- A barcode collision like `8005121004113` produces a single pending review item with both candidate pack sizes visible, not a wrong auto-apply.
- The migration is idempotent — re-running it on a DB that already has `confidence_score`, `source_payload`, `status` columns and the rule row is a no-op.

## Out-of-Scope Discoveries (separate MC tasks)

- **Barcode collision `8005121004113`** mapped to both "Divella Wheat Flour" (Tops) and "Divella Durum Wheat Semolina 500g" (Makro). Resolver will surface this as a conflict; resolution is a CEO data-quality decision, not part of this work.
- **CI red on main** ([MC 39f9de28](—)): MCP Chef and MCP Finance services miss `vitest` in `devDependencies`, breaking tsc on every PR. Independent fix needed before this spec can land Phase 1 (which adds new tests in those services).
