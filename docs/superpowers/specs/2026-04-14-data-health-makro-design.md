# Data Health: Nomenclature Cleanup & Smart Parser — Design Spec

> Date: 2026-04-14
> Status: Draft
> Scope: Makro-focused nomenclature audit, deduplication, category assignment, parser improvement, ongoing health monitoring

## Problem Statement

The receipt parser (OCR + Gemini Flash) creates `RAW-AUTO-*` nomenclature entries when it cannot match a line item to an existing product. Over time this has produced 202 auto-generated items — many of which are duplicates of each other or of curated items. Additionally:

- 227 of 439 nomenclature items (52%) have no category assigned
- 211 items have type="good" instead of "raw_ingredient" despite RAW- prefix
- 174 items have cost=0 (no purchase history linked)
- Exact duplicate names exist (e.g., "Red Bell Pepper, Large Bag, per kg" x4)
- Non-food expenses (gas, kitchenware, bike repair) classified as COGS
- Two supplier entries for the same store (Makro + Makro Rawai)

This blocks the menu page goal: automatic food cost calculation from purchase prices.

## Goals

1. Clean existing data: merge duplicates, fix types/categories, reclassify expenses
2. Make the parser smarter: 3-level matching so RAW-AUTO items are never created again
3. Ongoing monitoring: health check view + unmatched items review queue

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Makro + Makro Rawai | Merge into one supplier | Same store chain, splitting creates duplicate catalog entries |
| Water delivery | OpEx (not COGS) | Not a food ingredient |
| RAW-AUTO resolution | Auto-merge obvious + human review ambiguous | ~70% auto, ~30% manual — balances speed with accuracy |
| UI display | `name` field (human-readable), never `product_code` | CEO wants "Bell Pepper (Red)" not "RAW-BELL-PEPPER-RED" |
| Parser learning | Barcode-first + catalog feedback + fuzzy fallback | Barcode is ground truth; catalog learns from corrections |
| Unmatched items | Review queue (not auto-create RAW-AUTO) | Prevents future data pollution |

## Architecture

### Data Model Changes

#### New table: `unmatched_items`

```sql
CREATE TABLE unmatched_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id      UUID REFERENCES expense_ledger(id),
  raw_text        TEXT NOT NULL,           -- as printed on receipt
  barcode         TEXT,                    -- if available from OCR
  supplier_id     UUID REFERENCES suppliers(id),
  suggested_match UUID REFERENCES nomenclature(id),  -- fuzzy match suggestion
  confidence      NUMERIC(3,2),            -- 0.00–1.00
  resolved_to     UUID REFERENCES nomenclature(id),  -- after manual review
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_unmatched_pending ON unmatched_items(created_at)
  WHERE resolved_to IS NULL;
```

#### New view: `v_data_health`

Returns one row per health metric:

| Metric | Query | Severity |
|--------|-------|----------|
| `orphan_items` | nomenclature with no purchase_logs | info |
| `zero_cost` | cost_per_unit=0 but has purchase_logs | warning |
| `no_category` | category_id IS NULL | warning |
| `type_mismatch` | code LIKE 'RAW-%' AND type != 'raw_ingredient' | error |
| `duplicate_names` | same name appears >1 time in nomenclature | error |
| `unmatched_queue` | unmatched_items WHERE resolved_to IS NULL | action |
| `stale_prices` | last purchase > 30 days ago | info |
| `misclassified_expenses` | COGS from non-food suppliers | warning |

Health score formula: `100 - (errors * 5) - (warnings * 2) - (actions * 1)`

### Parser Matching (fn_approve_receipt upgrade)

3-level matching pipeline for each receipt line item:

```
Level 1: BARCODE MATCH (precision ~99%)
  supplier_catalog WHERE barcode = :barcode AND supplier_id = :sid
  -> found -> use nomenclature_id

Level 2: CATALOG LEARNING (precision ~90%)
  supplier_catalog WHERE original_name ILIKE :text AND supplier_id = :sid
  -> found, match_count >= 2 -> auto-assign
  -> found, match_count = 1 -> assign with low_confidence flag

Level 3: FUZZY TEXT (precision ~60%)
  Normalize text: strip "per kg", "Large Bag", "x1", weight digits
  Compare against nomenclature.name via pg_trgm similarity (requires extension)
  -> similarity > 0.6 -> assign as low_confidence
  -> similarity <= 0.6 -> INSERT into unmatched_items (no RAW-AUTO created)
```

**Prerequisites:** `pg_trgm` extension must be enabled (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`). Currently NOT installed in production.

**Low-confidence tracking:** when a match is made at Level 2 (match_count=1) or Level 3, the purchase_log row is created normally, but an `unmatched_items` row is ALSO created with `resolved_to = matched_id` and `confidence < 1.0` — so the admin can review and override if wrong.

**Feedback loop:** manual resolution in admin panel -> UPSERT supplier_catalog (original_name, nomenclature_id, match_count++). Next time same text -> Level 2 matches automatically.

**Barcode enrichment (async):** if barcode exists but not in supplier_catalog -> query Makro Pro website parser -> create/update SKU + supplier_catalog entry.

### Cleanup Migration

#### Step 0: Enable pg_trgm
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

#### Step 1: Supplier merge
```sql
-- Move all Makro Rawai references to Makro
UPDATE purchase_logs SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
  WHERE supplier_id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6';
UPDATE supplier_catalog SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
  WHERE supplier_id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6';
UPDATE expense_ledger SET supplier_id = 'c548db19-8a70-4f34-96af-d66162793cbf'
  WHERE supplier_id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6';
UPDATE suppliers SET is_active = false
  WHERE id = '9e168318-6dd5-41b2-a5f6-43a0a26b5dc6';
```

#### Step 2: Fix nomenclature types
```sql
UPDATE nomenclature SET type = 'raw_ingredient'
WHERE product_code LIKE 'RAW-%' AND type != 'raw_ingredient';
```

#### Step 3: Category assignment
Keyword-based mapping from product name to product_categories L3 codes:
- pepper, tomato, potato, arugula, asparagus -> F-PRD-VEG
- chicken, beef, lamb -> F-PRO-PLT / F-PRO-RED
- oil, olive -> F-GRN-OIL
- cheese, cream, yogurt, parmesan -> F-DRY-CHZ
- etc.

Full keyword mapping will be built during implementation by querying all product_categories L3 codes and matching against actual nomenclature names. Items that don't match any keyword -> flagged for manual review.

#### Step 4: RAW-AUTO merge (scripted)

Three-pass process:
1. **Exact match**: RAW-AUTO name matches curated name exactly, or same barcode -> auto-merge
2. **High-confidence fuzzy**: normalized name similarity > 0.8 to curated item -> auto-merge with log
3. **Ambiguous**: similarity 0.4-0.8 -> export CSV for human review

Merge operation per item:
```sql
-- Reassign all references from auto to curated
UPDATE purchase_logs SET nomenclature_id = :curated_id WHERE nomenclature_id = :auto_id;
UPDATE supplier_catalog SET nomenclature_id = :curated_id WHERE nomenclature_id = :auto_id;
UPDATE sku SET nomenclature_id = :curated_id WHERE nomenclature_id = :auto_id;
-- Deactivate auto item
UPDATE nomenclature SET is_available = false, name = '[MERGED] ' || name WHERE id = :auto_id;
```

#### Step 5: Expense reclassification
```sql
-- Non-food suppliers -> OpEx
-- Teun Gas and Ice Shop, Gas Installation Supplier, Sunshine Kitchenware, Bike fix,
-- Water delivery, Provincial Waterworks Authority
UPDATE expense_ledger SET flow_type = 'OpEx'
WHERE supplier_id IN (
  'd394d574-6a99-49db-af21-b19ab2eceed2',  -- Teun Gas and Ice Shop
  'cac0a1aa-d19b-496a-bcd5-92a74751084a',  -- Gas Installation Supplier
  '5cd67613-63e7-48df-a361-8b2f9122c201',  -- Sunshine Kitchenware Store
  '19b68c3e-9956-452a-8b19-153b36ad94de',  -- Bike fix
  'adb98b55-8fdb-47c2-908a-005221b46e7a',  -- Water delivery
  '1ba6f98e-8918-46fb-88fd-5081cb84498c'   -- Provincial Waterworks Authority
) AND flow_type = 'COGS';

-- Fix garbage dates
UPDATE expense_ledger SET transaction_date = '2026-02-26'
WHERE transaction_date = '2046-02-26';
```

## Execution Order

| Step | What | Depends on | Output |
|------|------|------------|--------|
| 1 | Cleanup migration (supplier merge, type fix, categories, expense reclass) | Nothing | Clean base data |
| 2 | RAW-AUTO merge script (auto + CSV for review) | Step 1 | Deduplicated nomenclature |
| 3 | Human review of ambiguous merges | Step 2 | Final merge decisions |
| 4 | Apply reviewed merges | Step 3 | All RAW-AUTO resolved |
| 5 | Create unmatched_items table + v_data_health view | Step 1 | Monitoring infrastructure |
| 6 | Upgrade fn_approve_receipt (3-level matching) | Step 5 | Smart parser |
| 7 | Verification: run v_data_health, test parse a receipt | Step 4 + 6 | Health score > 90 |

## Out of Scope

- Admin panel UI page for Data Health (separate task)
- Full re-parse of all historical receipts
- Cron-based Makro Pro parser runs
- Makro Pro barcode enrichment automation (async worker)
- Other suppliers beyond Makro (future phase)

## Success Criteria

1. Zero RAW-AUTO items active in nomenclature
2. All RAW items have category_id assigned
3. All RAW items have type="raw_ingredient"
4. No duplicate names in active nomenclature
5. New receipt parse does NOT create RAW-AUTO — goes to unmatched_items queue
6. Health score > 90 from v_data_health
7. Makro is single supplier (Makro Rawai merged)
8. Non-food expenses correctly classified as OpEx
