# Data Health Sheriff Report

**Date:** 2026-07-21
**Run type:** Scheduled weekly audit — migration-analysis mode
**Session:** claude-opus-session-4f1536f6
**Branch:** claude/wonderful-ritchie-q07lue
**Consecutive missed live runs:** 3 (2026-06-21 · 2026-07-12 · 2026-07-21)

---

## Access Status

| Method | Result |
|--------|--------|
| `DATABASE_URL` env var | ✅ Present (postgres.qcqgtcsjoacuktcewpvo, ap-south-1) |
| TCP port 5432 | ❌ Blocked — CI network policy blocks raw-TCP databases |
| TCP port 6543 (pooler) | ❌ Blocked — same policy |
| Supabase REST API (HTTPS) | ❌ Blocked — egress policy denies `*.supabase.co:443` (403) |
| MCP shishka-chef / shishka-finance | ❌ Unstable — server disconnects before tool responses return |
| Migration file analysis | ✅ Full access — 298 migrations read |

**Live counts in this report are marked `n/a`.** To get them: run `SELECT * FROM v_data_health;` in the Supabase SQL editor, or add egress allowlist for `qcqgtcsjoacuktcewpvo.supabase.co` to the scheduled-routine network policy.

---

## 1. Health Score: UNKNOWN (DB unreachable)

**Scoring formula** (defined in v_data_health, mig 165c):
`score = 100 − (errors×5) − (warnings×2) − (actions×1)`

Live query: `SELECT health_score FROM v_data_health LIMIT 1;`

---

## 2. Full Rule Inventory — All 17 Active Rules

### Legacy view metrics (`v_data_health_items_legacy` + mig 165c additions)

| metric | severity | description | count |
|--------|----------|-------------|-------|
| `type_mismatch` | **error** | RAW-* product_code but `type ≠ 'raw_ingredient'` | n/a |
| `duplicate_names` | **error** | Multiple active nomenclature rows with same `name` | n/a |
| `no_category` | warning | RAW-* items with `category_id IS NULL` | n/a |
| `zero_cost_with_purchases` | warning | `cost_per_unit=0/NULL` but purchase_logs exist (auto_apply=true) | n/a |
| `misclassified_cogs` | warning | COGS expense where supplier `category_code ∉ {4100, 2100}` | n/a |
| `equipment_missing_specs` | warning | Equipment: stub capacity or null processing_time or no capex_asset | n/a |
| `nutrition_missing` | warning | RAW food items (`type='raw_ingredient'`) with `calories IS NULL` | n/a |
| `unmatched_queue` | action | `unmatched_items` rows with `resolved_to IS NULL` | n/a |
| `orphan_items` | info | RAW-* items with zero purchase_logs | n/a |
| `stale_prices` | info | RAW-* last purchase >30 days, no recent buy | n/a |
| `fuzzy_duplicate_candidates` | info | RAW-AUTO items with pg_trgm similarity >0.6 to a named RAW | n/a |
| `variant_without_yield` | info | Trimmed/peeled/cleaned items missing yield_loss_pct in BOM | n/a |

### `data_health_rules` table entries

| rule_code | severity | auto_apply | detect summary | count |
|-----------|----------|------------|----------------|-------|
| `nomenclature_duplicate_barcode` | warn | false | Barcode in purchase_logs → >1 distinct nomenclature_id (fixed MIN(UUID) bug mig 209) | n/a |
| `cogs_missing_food_items` | warn | false | COGS expense where spokes < 80% of hub amount (missing purchase_logs) | n/a |
| `PL_FROZEN_FRESH_MISMATCH` | warn | false | purchase_logs.notes matches `/frozen\|freeze\|frz/i` but linked nomenclature name does not | n/a |
| `NOMENCLATURE_PRODUCT_CODE_HYGIENE` | warn | false | product_code contains chars outside `[A-Z0-9_-]+` | n/a |
| `NOMENCLATURE_PREFIX_BASE_UNIT_CONVENTION` | info | false | PF/MOD/SALE base_unit doesn't match learned prefix convention | n/a |

---

## 3. Critical Findings (Confirmed from Migration Evidence)

### 🚨 A. Frozen/Fresh SKU Mismatches — 3 Confirmed Cases

Rule `PL_FROZEN_FRESH_MISMATCH` added in migration 216 (2026-05-22). The migration's preview query found 3 real cases that were open at time of rule creation and have **not been resolved by any subsequent migration**:

| purchase_logs notes | currently linked to | correct SKU needed |
|--------------------|--------------------|--------------------|
| ARO Grated Frozen Cheddar Cheese 1 kg | `RAW-GOLD_SHREDDED_CHEDDAR` (fresh) | Create `RAW-CHEDDAR-FROZEN` |
| ARO Shredded Frozen Mozzarella | `RAW-CHEESE-MOZZARELLA` (fresh) | Create `RAW-MOZZARELLA-FROZEN` |
| ARO Frozen Salmon Steak 120-160 g | `RAW-SALMON` ("Salmon Fillet", fresh) | Create `RAW-SALMON-FROZEN` |

**Impact:** Frozen product prices are averaged into fresh SKU WAC → recipe costs wrong for affected dishes.
**Fix:** `/chef create_product` (frozen SKU) → UPDATE purchase_logs.nomenclature_id → WAC trigger recalculates both.

### 🚨 B. Invalid Product Code — Spaces & Special Chars

Rule `NOMENCLATURE_PRODUCT_CODE_HYGIENE` (mig 168a). Confirmed open from mig 156 edge-case note:

| product_code | issue | name |
|-------------|-------|------|
| `RAW-WHITE VINEGAR 5%` | space + `%` sign | Ercho White Vinegar 5% 4.5L |

Breaks GS1 barcode lookups, supplier_catalog joins, URL-safe identifiers, and the import-guard trigger regex.
**Fix:** rename to `RAW-WHITE-VINEGAR-5PCT`; update supplier_catalog + purchase_logs FKs. Requires CEO sign-off (per RULE-NO-DIRECT-DB-EDITS → write a migration).

### ⚠️ C. `nomenclature_duplicate_barcode` Was Silently Failing

Migration 209 (recent) fixed a `MIN(UUID)` crash in this rule's detect_sql. Before 209, `fn_data_health_rules_items()` caught the error per-rule and returned a diagnostic row instead of real results — barcode conflicts were invisible in `v_data_health_summary`. Since 209 is now applied, **the first clean run of `SELECT * FROM v_data_health_summary` will surface any surviving barcode conflicts for the first time.**

### ⚠️ D. 9 Packaging Items Orphaned (Cost Corrected, BOM Not Yet Wired)

Migration 246 normalized 9 NF-PKG items to per-piece pricing (pack→pcs, verified against Makro scraper). Per mig 246 notes, none are in any bom_structures yet. They will all appear as **orphan_items** (purchased but not in BOM). Phase 2 of MC task 2385d288 (Packaging-as-BOM) is open.

---

## 4. Auto-fixes Applied This Run

**None** — DB unreachable from CI network.

The `zero_cost_with_purchases` rule (auto_apply=true) would trigger WAC recalc. To run manually in Supabase SQL editor:

```sql
WITH wac_calc AS (
  SELECT pl.nomenclature_id,
         ROUND(SUM(pl.quantity * pl.price_per_unit) / NULLIF(SUM(pl.quantity), 0), 4) AS wac
  FROM purchase_logs pl
  JOIN nomenclature n ON n.id = pl.nomenclature_id
  WHERE n.is_available
    AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
    AND pl.price_per_unit > 0 AND pl.quantity > 0
    AND (n.notes IS NULL OR NOT (
      lower(n.notes) LIKE '%free%'
      OR lower(n.notes) LIKE '%in-house%'
      OR lower(n.notes) LIKE '%recipe%'
    ))
  GROUP BY pl.nomenclature_id
  HAVING SUM(pl.quantity) > 0
)
UPDATE nomenclature n
SET cost_per_unit = w.wac, updated_at = now()
FROM wac_calc w WHERE n.id = w.nomenclature_id
RETURNING product_code, name, cost_per_unit AS new_wac;
```

Note: Tahini (notes='free from factory') and Chili Paste (notes='in-house recipe') are excluded.

---

## 5. Merge Candidates (Duplicates)

Live query for current count:
```sql
SELECT metric, val FROM v_data_health
WHERE metric IN ('duplicate_names', 'fuzzy_duplicate_candidates', 'nomenclature_duplicate_barcode');
```

**Import guard (mig 166)** is active: new RAW-AUTO inserts with pg_trgm >0.4 match to existing named RAW are auto-deactivated and queued in `unmatched_items`. This reduces future accumulation.

**Learned patterns** (from past cleanup sessions):
- Thai product names OCR differently each receipt → same item appears as 2-3 RAW-AUTO entries
- Detection: same supplier + price ±20% + overlapping dates + trgm >0.5
- **Never auto-merge** — deactivate the duplicate after manual confirm

---

## 6. Empty BOM Dishes (need /chef)

Live query:
```sql
SELECT n.product_code, n.name
FROM nomenclature n
WHERE n.is_available
  AND n.product_code SIMILAR TO '(SALE|PF|MOD)-%'
  AND NOT EXISTS (SELECT 1 FROM bom_structures bs WHERE bs.parent_id = n.id)
ORDER BY n.product_code;
```

**High-risk new additions** (from migrations 230-298, no BOM verification migration follows):
- Smoothie recipes (mig 238, 244): base recipes seeded — verify full ingredient chain via `/chef validate_bom`
- Manakish SALE items (mig 291-293): `zaatar-cheese`, `salami` recipe flows seeded — verify PF → RAW chain is complete
- Dip modifiers (mig 280-283): check bread-choice defaults are wired to actual BOM lines

---

## 7. Orphan Items (Purchased but Not in Any BOM)

Live query:
```sql
SELECT n.product_code, n.name,
       ROUND(SUM(pl.quantity * pl.price_per_unit)) AS total_spent,
       MAX(pl.invoice_date) AS last_purchased
FROM nomenclature n
JOIN purchase_logs pl ON pl.nomenclature_id = n.id
WHERE n.is_available AND n.product_code LIKE 'RAW%'
  AND NOT EXISTS (SELECT 1 FROM bom_structures bs WHERE bs.ingredient_id = n.id)
GROUP BY n.id, n.product_code, n.name
ORDER BY total_spent DESC LIMIT 30;
```

**Confirmed orphans from mig 246** (all 9 have real purchase spend but no BOM refs):
`RAW-AUTO-b7ee4d39` `RAW-AUTO-71eeeaea` `RAW-AUTO-b5d98656` `RAW-AUTO-1fd316f7`
`RAW-AUTO-63af7a5f` `RAW-AUTO-37e9da70` `RAW-AUTO-57abef9e` `RAW-AUTO-efdbc7fa` `RAW-AUTO-c0c91c9b`

(ARO Bio boxes, PET lids, zipper bags — all awaiting Packaging-as-BOM Phase 2.)

---

## 8. Price Drift Alerts

Live query:
```sql
SELECT n.product_code, n.name, n.base_unit, n.cost_per_unit,
       sc.last_seen_price, sc.conversion_factor,
       ROUND(ABS(n.cost_per_unit - sc.last_seen_price) / NULLIF(n.cost_per_unit,0) * 100) AS drift_pct
FROM nomenclature n
JOIN supplier_catalog sc ON sc.nomenclature_id = n.id
WHERE n.is_available AND n.cost_per_unit > 0 AND sc.last_seen_price > 0
  AND ABS(n.cost_per_unit - sc.last_seen_price) / n.cost_per_unit > 0.2
ORDER BY drift_pct DESC LIMIT 20;
```

**Watch for drift_pct > 1000%** = broken conversion_factor (historical case: Olive Oil WAC=440/L, last_price=2200 for 5L bottle).
**Watch for `base_unit='g'` AND `cost_per_unit < 5`** = likely kg/g confusion (historical case: Gouda WAC=0.82/g → should be 820/kg).

---

## 9. Unlinked Barcodes

Live query:
```sql
SELECT pl.barcode, pl.raw_name,
       COUNT(*) AS purchase_count,
       ROUND(SUM(pl.quantity * pl.price_per_unit)) AS total_spent
FROM purchase_logs pl
WHERE pl.barcode IS NOT NULL AND pl.barcode <> ''
  AND pl.nomenclature_id IS NULL
GROUP BY pl.barcode, pl.raw_name
ORDER BY total_spent DESC LIMIT 20;
```

---

## 10. Missing Nutrition

Live query:
```sql
SELECT product_code, name FROM nomenclature
WHERE is_available AND product_code LIKE 'RAW-%'
  AND type = 'raw_ingredient' AND calories IS NULL
ORDER BY product_code;
```

**Known gaps from migration history:**
- `RAW-SHISHKA-MIX` has estimated values (mig 068) — not verified against actual blend
- New items from manakish seeding (mig 291-298) and smoothie ingredients (mig 230-238) likely missing

---

## 11. Unit Confusion (g vs kg) — Learned Pattern

```sql
SELECT product_code, name, base_unit, cost_per_unit
FROM nomenclature
WHERE is_available AND base_unit = 'g' AND cost_per_unit > 0 AND cost_per_unit < 5
ORDER BY cost_per_unit;
```

Historical case: Gouda cheese `base_unit='g'`, `WAC=0.82` → correct is `base_unit='kg'`, `WAC=820`. UoM lowercasing was applied in mig 068 but g/kg logic errors can recur on new OCR imports.

---

## 12. Recent Schema Risk Register (mig 210 → 298)

| migration | change | data health risk |
|-----------|--------|-----------------|
| 210 | `fn_nomenclature_auto_category` trigger | RAW inserts that fail trigger → `no_category` violations |
| 211 | BOM cost trigger | Cost not cascading if trigger fires out of order |
| 246 | NF-PKG per-piece normalization | 9 items now correctly priced but all orphaned (not in BOM) |
| 263 | `nomenclature.web_visibility` column | No health rule yet — NULL may not be intentional |
| 274-278 | Loyverse receipt enrichment + payouts | First Loyverse COGS receipts; food_items may not write to purchase_logs → `cogs_missing_food_items` will fire |
| 291-298 | Manakish stations + recipe flows | New SALE/PF items — BOM completeness unverified |

---

## 13. Prioritized Action Items

| priority | item | rule | owner |
|----------|------|------|-------|
| 🔴 HIGH | Fix 3 frozen/fresh SKU mismatches: create frozen SKUs + re-link purchase_logs | `PL_FROZEN_FRESH_MISMATCH` | /chef |
| 🔴 HIGH | Write migration to rename `RAW-WHITE VINEGAR 5%` → `RAW-WHITE-VINEGAR-5PCT` | `NOMENCLATURE_PRODUCT_CODE_HYGIENE` | /techlead |
| 🔴 HIGH | **Fix egress policy to allow Supabase** — 3 consecutive missed live audits | — | Lesia/ops |
| 🟠 MED | Run WAC recalc for zero-cost items (SQL in §4 above) | `zero_cost_with_purchases` | /techlead |
| 🟠 MED | Verify `nomenclature_duplicate_barcode` post-mig-209 — first clean run | mig 209 fix | Lesia |
| 🟠 MED | Review Loyverse COGS receipts for hub-spoke variance (first batches) | `cogs_missing_food_items` | /finance |
| 🟡 LOW | Wire 9 NF-PKG packaging items into dish BOMs (Phase 2, MC 2385d288) | orphan_items | /chef |
| 🟡 LOW | Validate BOM completeness for manakish + smoothie SALE items (mig 238-298) | empty_boms | /chef |
| 🟡 LOW | Add `web_visibility` health rule (NULL = draft? deprecated?) | new column mig 263 | /techlead |
| 🟡 LOW | Backfill nutrition for new smoothie + manakish RAW ingredients | `nutrition_missing` | /chef |
| 🟡 LOW | Review `unmatched_queue` — resolve pending items from Loyverse receipts | `unmatched_queue` | Lesia |

---

## 14. Fix the Network Block (Root Cause)

The audit has been blocked 3 consecutive weeks. `DATABASE_URL` is now set in the environment but **raw-TCP port 5432/6543 and HTTPS to `*.supabase.co` are both blocked** by the session's egress policy.

**To fix:** In Claude Code web settings → scheduled routine → network policy, add:
- Allow `qcqgtcsjoacuktcewpvo.supabase.co:443` (REST API + auth)
- OR allow `aws-0-ap-south-1.pooler.supabase.com:6543` (transaction pooler)

Reference: https://code.claude.com/docs/en/claude-code-on-the-web (Environment configuration)

---

## 15. Run the Live Audit (Once Network Fixed)

```sql
-- Full health dashboard
SELECT metric, severity, val, health_score FROM v_data_health ORDER BY severity, val DESC;

-- Per-rule detail
SELECT metric, product_code, name, extra_json FROM v_data_health_items LIMIT 100;

-- Summary
SELECT * FROM v_data_health_summary;

-- All rules
SELECT rule_code, title, severity, auto_apply, trigger_count
FROM data_health_rules WHERE is_active ORDER BY severity;
```

Or run the audit script (requires DB access):
```bash
python3 tools/reconcile-unmatched/sheriff_audit.py
```

---

*Generated by Data Health Sheriff · 2026-07-21 · Migration-analysis mode (live DB blocked — 3rd consecutive)*
*Next step: fix egress policy → re-run for live counts*
