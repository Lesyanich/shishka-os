# Data Health Sheriff Report
**Date:** 2026-07-12  
**Run type:** Scheduled weekly audit  
**Status:** ⛔ BLOCKED — No database credentials available (2nd consecutive missed run)

---

## ⚠️ URGENT: Audit Has Now Missed 2 Consecutive Weeks

Previous blocked run: **2026-06-21**  
This run: **2026-07-12**  
Total weeks without data quality checks: **3 weeks**

The audit **cannot run** until `DATABASE_URL` is added to the scheduled routine's environment variables.

---

## Root Cause

| Method | Result |
|--------|--------|
| `DATABASE_URL` env var | Not set |
| `SUPABASE_SERVICE_ROLE_KEY` env var | Not set |
| `SUPABASE_URL` env var | Not set |
| `POSTGRES_URL` env var | Not set |
| macOS Keychain `shishka-database-url` | Unavailable (Linux, no `security` CLI) |
| `.env` files in repo | Gitignored — not present in clone |

---

## Fix Required (One Time)

Add to the **scheduled routine environment** in Claude Code web settings:

```
DATABASE_URL=postgresql://postgres.[project-id]:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Supabase project: `qcqgtcsjoacuktcewpvo` (ap-south-1 / Mumbai)

Instructions: https://code.claude.com/docs/en/claude-code-on-the-web (Environment configuration section)

---

## Phases Blocked

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: data_health_rules (all active rules) | ⛔ BLOCKED | Needs DB |
| Phase 2: Smart duplicate detection | ⛔ BLOCKED | Needs DB |
| Phase 3: Full Makro barcode audit (~222 barcodes) | ⛔ BLOCKED | Needs DB + Makro API |
| Phase 4: Price drift + conversion sanity | ⛔ BLOCKED | Needs DB |
| Phase 5: Report | ⚠ PARTIAL | This file only |

---

## What Is Accumulating Without Checks

Based on learned patterns, the following issues are growing undetected:

### High-Risk: OCR Duplicate Accumulation
Every week Makro receipts are processed, OCR creates new name variants for the same physical product.  
- Pattern: same supplier + similar price (±20%) + overlapping purchase dates → duplicate RAW items  
- Known example: lamb shoulder/leg/minced lamb all barcode 831436  
- **Without weekly dedup, the catalog grows noisier each week**

### Medium-Risk: Zero-Cost Items With Purchases
Items that had cost_per_unit = 0 but now have purchase_logs with real prices — WAC should be recalculated automatically (auto_apply rule). This has not run in 3 weeks.

### Medium-Risk: Price Drift
Supplier prices change; if conversion_factor is wrong, cost_per_unit may be wildly off (>1000% drift pattern from Olive Oil case). Undetected for 3 weeks.

### Low-Risk: Unlinked Makro Barcodes
New purchases may have barcodes not yet linked to nomenclature. Makro barcode audit would catch these.

---

## Health Score
**N/A** — unable to compute (no DB access)

Last successful audit: **never** (all runs blocked since this routine started)

---

## Action Required

1. **Add `DATABASE_URL` to scheduled routine environment** (see fix above) — this unblocks everything
2. Re-run the audit after credentials are configured
3. Consider also running a manual `/techlead` session to catch up on 3 weeks of unaudited procurement data

_Report generated: 2026-07-12 | Session: claude-opus-session-85e8f658 | Consecutive blocked runs: 2_
