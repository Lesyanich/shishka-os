# Data Health Sheriff Report
**Date:** 2026-09-27  
**Run type:** Scheduled weekly audit  
**Status:** ⛔ BLOCKED — Network policy prevents direct PostgreSQL connections (4th missed run)

---

## ⚠️ CRITICAL: Audit Has Now Missed 4 Consecutive Weeks

| Run Date | Status | Root Cause |
|----------|--------|------------|
| 2026-06-21 | ❌ Blocked | DATABASE_URL not set |
| 2026-07-12 | ❌ Blocked | DATABASE_URL not set |
| 2026-08-?? | ❌ Blocked | (skipped, same issue) |
| **2026-09-27** | ❌ Blocked | DATABASE_URL ✅ present; TCP port 5432/6543 unreachable |

---

## Root Cause (this run)

DATABASE_URL **is now set** in the scheduled environment. Progress!  
But the cloud execution environment's **network policy blocks outbound TCP** to non-HTTPS ports.

| Method | Result |
|--------|--------|
| `DATABASE_URL` env var | ✅ Present (`postgresql://postgres.qcqgtcsjoacuktcewpvo:…@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`) |
| TCP port 5432 (Supabase pooler) | ❌ Unreachable — `nc -zv` timeout |
| TCP port 6543 (PgBouncer) | ❌ Unreachable — `nc -zv` timeout |
| MCP shishka-chef tools | ❌ `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY` |
| MCP shishka-finance tools | ❌ `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY` |
| Python psycopg2 script | ⛔ Blocked by automode classifier (credential-access policy) |

---

## What Needs to Be Fixed

There are **two independent blockers** — both must be resolved:

### Blocker 1: MCP Server credentials (highest ROI)
Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the scheduled session's environment.  
The MCP tools (shishka-chef, shishka-finance) work over HTTPS via the proxy — they **don't** need raw TCP.  
Once these are set, the entire audit can run through MCP without needing direct PostgreSQL access.

**Where to add them:**  
Cloud session environment variables → add `SUPABASE_URL=https://qcqgtcsjoacuktcewpvo.supabase.co` and `SUPABASE_SERVICE_ROLE_KEY=<key>`.

### Blocker 2: Network policy for direct DB access (fallback)
If MCP approach is preferred as a backup: the Supabase project uses `ap-south-1`. The pooler hostnames to allowlist:
- `aws-0-ap-south-1.pooler.supabase.com:5432`  
- `aws-0-ap-south-1.pooler.supabase.com:6543`

---

## What Was Audited (without DB access)

No DB queries could run. The following checks were **planned** but **not executed**:

### Phase 1: data_health_rules
- [ ] Execute all active rules' `detect_sql`
- [ ] Update `trigger_count` for each rule
- [ ] Auto-apply WAC recalc for zero-cost items (skip free/in-house/recipe)

### Phase 2: Duplicate detection
- [ ] Same supplier + similar price (±20%) + same base_unit pairs
- [ ] OCR name variant detection for Thai-language receipts
- [ ] Unit confusion: `cost_per_unit < 5 AND base_unit='g'` (likely should be kg)

### Phase 3: Makro barcode audit
- [ ] DB-side: barcoded items without `supplier_catalog` entry
- [ ] External: compare vs Makro Typesense API (run `audit_makro_barcodes.py` separately)

### Phase 4: Price drift
- [ ] Items with >1000% WAC vs `last_seen_price` (broken conversion factor)
- [ ] Items with 20–1000% drift (check unit/package mismatch)

### Additional checks
- [ ] Empty BOM dishes (SALE/MOD/PF with no BOM lines)
- [ ] Orphan purchased items (in `purchase_logs` but not in any BOM)
- [ ] Missing nutrition on SALE items
- [ ] Unintentional zero-cost RAW items

---

## Known Learned Patterns (unverified this run)

Based on prior manual cleanup sessions — these patterns need to be checked when DB access is restored:

1. **OCR name variants** — Thai ingredient names translating to different English strings per receipt (especially lamb, produce, bulk items). Same supplier + same barcode + different name = merge candidate.
2. **g vs kg confusion** — Any `cost_per_unit < 5` with `base_unit='g'` is suspect. Gouda was WAC=0.82/g when it should be 822/kg.
3. **Conversion drift >1000%** — `last_seen_price` (package price) vs `cost_per_unit` (per base_unit) differing >10× means wrong/missing `conversion_factor`.
4. **Tomato paste misclassification** — Canned tomato product ≠ fresh tomato. Check `product_code` prefix.
5. **Tahini** — intentionally zero cost (from partner factory). Notes should contain 'free'. Do not flag.
6. **Chili paste** — PF item (made in-house). Do not flag zero cost.
7. **Весовые товары** (bulk/weight goods: potatoes, meat, produce) — no barcode on Makro receipt → highest duplicate risk per receipt cycle.

---

## Recommended Immediate Actions (by Lesia)

1. **Add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`** to the scheduled session environment. This one change unblocks the audit entirely (MCP tools work over HTTPS, not direct TCP).
2. After adding credentials, **manually trigger** one audit run to clear the backlog (4 weeks of unchecked data).
3. Optionally: also run `tools/reconcile-unmatched/audit_makro_barcodes.py` locally for the full Makro barcode comparison.

---

## Stats
*No data available — DB unreachable.*

---

## Health Score
**⬜ N/A** — Cannot calculate without DB access.

---

*Previous report: 2026-07-12 | Next scheduled run: 2026-10-04*
