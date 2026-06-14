# Data Health Sheriff Report
> Generated: 2026-06-14 03:06 UTC
> Mode: **OFFLINE** — cloud execution environment has no DB credentials
> Script: `tools/reconcile-unmatched/sheriff.py` (ready to run locally)
> Run locally: `DATABASE_URL=<url> python3 tools/reconcile-unmatched/sheriff.py`

---

## ⚠️ Execution Note

This report was generated in the Shishka OS cloud (remote) execution environment where
`DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not available (stored in macOS Keychain).

**To run the full live audit:**
```bash
# On macOS with DB URL in Keychain (shishka-database-url):
python3 tools/reconcile-unmatched/sheriff.py

# Or with explicit URL:
DATABASE_URL="postgresql://..." python3 tools/reconcile-unmatched/sheriff.py

# Fast mode (skip Makro API, ~1 min vs ~8 min):
python3 tools/reconcile-unmatched/sheriff.py --skip-makro

# Preview without DB writes:
python3 tools/reconcile-unmatched/sheriff.py --dry-run
```

---

## ? Health Score: UNKNOWN (live DB required)

**Score formula:** `100 - (errors × 5) - (warnings × 2) - (actions × 1)`

Based on codebase analysis and migration history, estimated risk areas:

| Risk area | Severity | Last known state |
|-----------|----------|-----------------|
| Frozen/fresh SKU mismatches | ⚠️ WARN | 3 items found 2026-05-22 (mig 216) |
| Equipment missing specs | ⚠️ WARN | Active rule, unknown current count |
| Nutrition missing | ⚠️ WARN | Added 2026-03-xx, unknown count |
| Duplicate barcodes | ⚠️ WARN | Fixed MIN(uuid) bug (mig 209) |
| Name weight tails | ℹ️ INFO | 38 stripped 2026-04-24 (mig 156) |
| Invalid base_unit | ℹ️ INFO | 11 fixed 2026-04-24 (mig 156) |

---

## Phase 1: Known Active Data Health Rules

The following rules are registered in `data_health_rules` (from migration history):

### Registered via data_health_rules table

| Rule code | Severity | Entity | Description | Since |
|-----------|----------|--------|-------------|-------|
| `NOMENCLATURE_NAME_WEIGHT_TAIL` | warn | nomenclature | Names ending with ", 200g" OCR artifact | mig 154 |
| `NOMENCLATURE_INVALID_BASE_UNIT` | warn | nomenclature | base_unit not in kg/g/L/ml/pcs/portion | mig 154 |
| `NOMENCLATURE_LOWERCASE_L` | info | nomenclature | base_unit='l' should be 'L' | mig 154 |
| `NOMENCLATURE_PREFIX_BASE_UNIT_CONVENTION` | info | nomenclature | PF/MOD/SALE prefix base_unit conventions | mig 156 |
| `EQUIPMENT_MISSING_SPECS` | warn | equipment | capacity=1 slot, no processing_time, no capex | mig 165b |
| `nomenclature_duplicate_barcode` | warn | nomenclature | Same barcode → multiple nomenclature IDs | mig 209 |
| `PL_FROZEN_FRESH_MISMATCH` | warn | purchase_logs | Notes say "frozen" but linked SKU is fresh | mig 216 |

### Hardcoded metrics in v_data_health (mig 165c)

| Metric | Severity | Description |
|--------|----------|-------------|
| `type_mismatch` | error | RAW- code but type ≠ raw_ingredient |
| `duplicate_names` | error | Multiple active items with same name |
| `no_category` | warning | RAW item without category_id |
| `zero_cost_with_purchases` | warning | cost=0 but has purchase history |
| `misclassified_cogs` | warning | COGS expense from non-food supplier |
| `equipment_missing_specs` | warning | Equipment with default/null specs |
| `nutrition_missing` | warning | RAW food item with NULL calories |
| `unmatched_queue` | action | unmatched_items without resolved_to |
| `orphan_items` | info | RAW item never purchased AND not in BOM |
| `stale_prices` | info | Last purchase > 30 days ago |
| `fuzzy_duplicate_candidates` | info | RAW-AUTO item similar to existing RAW |
| `variant_without_yield` | info | "trimmed/peeled/cleaned" item without yield_loss_pct |

---

## Phase 1: Auto-fixes

### WAC recalc (auto_apply eligible)
**Cannot run without DB.** When run live, script will:
1. Find items with `cost_per_unit = 0` and purchase history
2. Skip items where `notes LIKE '%free%'` (tahini from friend), `'%in-house%'`, `'%recipe%'` (chili paste)
3. Compute WAC = `SUM(quantity × price_per_unit) / SUM(quantity)` from `purchase_logs`
4. Apply `UPDATE nomenclature SET cost_per_unit = WAC`

**Exempt items (do NOT flag zero cost):**
- Tahini — sourced free from friend's factory (check notes for 'free')
- Chili paste — PF item made in-house from recipe (check notes for 'in-house'/'recipe')

---

## Phase 2: Duplicate / Merge Candidates

### Learned OCR patterns (from manual cleanup sessions)

The following known OCR variant patterns should be checked:

| Pattern | Example | Root cause |
|---------|---------|-----------|
| Lamb cuts vary by receipt | 'AU Frozen Lamb Shoulder', 'AU Frozen Lamb Leg', 'Frozen Minced Lamb' | Thai OCR reads `เนื้อแกะปิดแช่แข็ง` differently each scan |
| Tomato paste vs puree | 'Fine Tomato Puree 400g' = paste; 'Fresh Tomato' ≠ paste | Package type distinguishes: can/jar = paste, per kg = fresh |
| Produce with no barcode | Potatoes, meat by weight — name differs per Makro receipt | Makro does not print barcodes on weight items |

**Query to run live (pg_trgm required):**
```sql
SELECT a.product_code, a.name, a.cost_per_unit, b.product_code as dup_code, b.name as dup_name, b.cost_per_unit as dup_cost,
       similarity(lower(a.name), lower(b.name)) AS sim
FROM nomenclature a JOIN nomenclature b ON a.id < b.id
  AND a.is_available AND b.is_available
  AND a.base_unit = b.base_unit
  AND a.cost_per_unit > 0 AND b.cost_per_unit > 0
  AND ABS(a.cost_per_unit - b.cost_per_unit) / GREATEST(a.cost_per_unit, b.cost_per_unit) < 0.2
  AND similarity(lower(a.name), lower(b.name)) > 0.5
WHERE (a.product_code LIKE 'RAW%' AND b.product_code LIKE 'RAW%')
ORDER BY sim DESC;
```

---

## Phase 3: Makro Barcode Audit

**Status: Not run** (requires live DB + Makro API access)

**To run separately:**
```bash
python3 tools/reconcile-unmatched/audit_makro_barcodes.py
# Full audit: ~222 barcodes, ~8 min
# Output: tools/reconcile-unmatched/audit_report.csv
```

**Status codes:**
- `MATCH` — barcode confirmed on Makro website
- `NAME_DIFF` — similar product, name difference (sim 0.4–0.7)
- `NAME_MISMATCH` — completely different product (sim < 0.4) → REVIEW
- `NOT_FOUND` — barcode not in Makro index (imported? OCR error?)

---

## Phase 4: Price Drift Alerts

**Status: Not run** (requires live DB)

### Known conversion factor patterns (from learned patterns)

| Pattern | Example | Fix |
|---------|---------|-----|
| Per-package WAC vs per-unit cost | Olive Oil WAC=440/L but last_price=2200 (5L bottle) | conversion_factor should be 5 |
| g vs kg unit confusion | Gouda WAC=0.82/g → should be 822/kg | Update base_unit to kg, multiply cost × 1000 |

**Unit confusion query to run live:**
```sql
SELECT product_code, name, cost_per_unit, base_unit, notes
FROM nomenclature
WHERE is_available = TRUE
  AND base_unit = 'g'
  AND cost_per_unit > 0
  AND cost_per_unit < 5
  AND (notes IS NULL
       OR (LOWER(notes) NOT LIKE '%free%'
       AND LOWER(notes) NOT LIKE '%in-house%'
       AND LOWER(notes) NOT LIKE '%recipe%'))
ORDER BY cost_per_unit ASC;
```

**Known critical frozen/fresh mismatches (found 2026-05-22, rule `PL_FROZEN_FRESH_MISMATCH`):**
- ARO Grated Frozen Cheddar Cheese 1 kg → was linked to RAW-GOLD_SHREDDED_CHEDDAR (fresh)
- ARO Shredded Frozen Mozzarella → was linked to RAW-CHEESE-MOZZARELLA (fresh)
- ARO Frozen Salmon Steak 120-160 g → was linked to RAW-SALMON (fresh "Salmon Fillet")
- **Action**: Verify these were fixed. If not, create RAW-FROZEN-* variants and re-link.

---

## Dishes with Empty BOM (need /chef)

**Status: Count unknown** (requires live DB)

```sql
SELECT n.product_code, n.name, n.price
FROM nomenclature n
WHERE n.is_available = TRUE AND n.product_code LIKE 'SALE-%'
  AND NOT EXISTS (SELECT 1 FROM bom_structures b WHERE b.parent_id = n.id)
ORDER BY n.name;
```

---

## Orphan Items (purchased but unused in BOM)

**Status: Count unknown** (requires live DB)

Migration 133 (2026-04-xx) deactivated 31 RAW-AUTO-* orphan items.
Any new orphans since then are candidates for deactivation.

```sql
SELECT n.product_code, n.name, n.cost_per_unit, n.created_at::date AS created
FROM nomenclature n
WHERE n.is_available = TRUE AND n.product_code LIKE 'RAW%'
  AND NOT EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id)
  AND NOT EXISTS (SELECT 1 FROM bom_structures b WHERE b.ingredient_id = n.id)
ORDER BY n.created_at DESC;
```

---

## Missing Nutrition Data

**Status: Count unknown** (requires live DB)

Metric `nutrition_missing` added in migration 165c. Flags RAW-* with `calories IS NULL`.

```sql
SELECT product_code, name
FROM nomenclature
WHERE product_code LIKE 'RAW-%' AND is_available = TRUE
  AND calories IS NULL AND type = 'raw_ingredient'
ORDER BY name;
```

---

## Zero-cost Items (intentionally exempt)

The following are intentionally zero-cost and must NOT be flagged:

| Item | Reason | Notes field pattern |
|------|--------|---------------------|
| Tahini | Free from friend's factory | contains 'free' |
| Chili paste | Made in-house from recipe | contains 'in-house' or 'recipe' |

---

## Unmatched Queue

```sql
SELECT COUNT(*), MIN(created_at) AS oldest
FROM unmatched_items WHERE resolved_to IS NULL;
```

Items in this queue need manual resolution in the admin panel.

---

## New Rule Recommendations

Based on migration history and learned patterns, consider adding:

### RULE: product_code_has_spaces
```sql
SELECT id AS entity_id, product_code, name,
       jsonb_build_object('space_count', length(product_code) - length(replace(product_code, ' ', ''))) AS extra_json
FROM nomenclature
WHERE is_available = TRUE AND product_code LIKE '% %';
```
*Known case: "RAW-WHITE VINEGAR 5%" has spaces in product_code (noted in mig 156)*

### RULE: SALE_item_missing_price
```sql
SELECT id AS entity_id, product_code, name,
       jsonb_build_object('price', price) AS extra_json
FROM nomenclature
WHERE is_available = TRUE AND product_code LIKE 'SALE-%'
  AND (price IS NULL OR price = 0);
```

### RULE: purchase_log_unit_mismatch
Detect purchase_logs where unit ≠ nomenclature.base_unit and conversion_factor = 1.0 (likely missing conversion).

---

## Action Checklist

### Critical (run ASAP)
- [ ] Run `python3 tools/reconcile-unmatched/sheriff.py` locally to get live health score
- [ ] Verify frozen/fresh mismatch items from mig 216 are resolved (Cheddar, Mozzarella, Salmon)
- [ ] Check if any new `duplicate_names` errors appeared since mig 132

### Important (this week)
- [ ] Review `zero_cost_with_purchases` items — WAC recalc auto-applies on live run
- [ ] Check `equipment_missing_specs` count and fill missing operational data
- [ ] Audit `nutrition_missing` RAW items — lookup USDA FoodData Central
- [ ] Review `unmatched_queue` in admin panel

### Nice to have (monthly)
- [ ] Run Makro barcode audit: `python3 tools/reconcile-unmatched/audit_makro_barcodes.py`
- [ ] Check `stale_prices` (last purchase > 30 days)
- [ ] Review `fuzzy_duplicate_candidates` (RAW-AUTO items similar to named RAW)
- [ ] Add `product_code_has_spaces` rule to data_health_rules

---

## Reference: Last Cleanup Runs

| Date | Migration | What was fixed |
|------|-----------|----------------|
| 2026-04-24 | mig 156 | 38 name weight-tail strips, 11 base_unit fixes, 1 lowercase L fix |
| 2026-04-xx | mig 132 | Deactivated RAW-YOGURT-COCONUT; renamed MOD add-ons |
| 2026-04-xx | mig 133 | Deactivated 31 RAW-AUTO-* junk/packaging items |
| 2026-05-22 | mig 216 | Detected 3 frozen/fresh mismatches (Cheddar, Mozzarella, Salmon) |

---

*Generated by Data Health AI Sheriff — offline codebase analysis*
*Run `python3 tools/reconcile-unmatched/sheriff.py` for live data*
