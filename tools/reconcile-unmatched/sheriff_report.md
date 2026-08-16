# Data Health Sheriff Report
**Date:** 2026-08-16  
**Run type:** Scheduled weekly audit  
**Status:** ⛔ BLOCKED — Network egress policy denies `supabase.co` (3rd consecutive missed run)

---

## Progress Since Last Week ✅ + ⛔

| Issue | Last Week | This Week |
|-------|-----------|-----------|
| `DATABASE_URL` missing from env | ⛔ Missing | ✅ **FIXED** — credentials are now set |
| Network access to `supabase.co` | (untested) | ⛔ **NEW BLOCKER** — 403 policy denial |
| PostgreSQL TCP (port 5432/6543) | ⛔ Blocked | ⛔ Blocked (raw TCP not proxied) |

**One step forward, one step left.** The DATABASE_URL fix is confirmed working — the credential is present and parseable. But the outbound egress proxy (`http://127.0.0.1:45609`) blocks all connections to `qcqgtcsjoacuktcewpvo.supabase.co` with HTTP 403.

---

## Root Cause

```
Proxy: http://127.0.0.1:45609 (policy-enforcing egress proxy)
Domain blocked: qcqgtcsjoacuktcewpvo.supabase.co:443
Error: HTTP/1.1 403 Forbidden on CONNECT tunnel
Policy: Organization egress policy for this session does not allow supabase.co
```

Confirmed via:
- `curl -v --proxy "$HTTPS_PROXY" https://qcqgtcsjoacuktcewpvo.supabase.co/rest/v1/nomenclature` → 403
- `psycopg2.connect(DATABASE_URL, connect_timeout=10)` → timeout (raw TCP, not proxied at all)
- Proxy README: "403 from the proxy = destination host not allowed by egress policy. Do not retry or route around it — report the blocked host."

---

## Fix Required (One Time — Admin Action)

**Add `supabase.co` to the egress allowlist for the scheduled routine environment.**

This is configured in Claude Code web settings for the scheduled environment. 
See: https://code.claude.com/docs/en/claude-code-on-the-web (Environment configuration → Network policy)

The domain to allowlist:
```
*.supabase.co
```

This covers:
- `qcqgtcsjoacuktcewpvo.supabase.co` — REST API + direct PostgreSQL host
- `aws-0-ap-south-1.pooler.supabase.com` — connection pooler (may also need allowlisting)

---

## Audit History

| Date | Status | Blocker |
|------|--------|---------|
| 2026-06-21 | ⛔ BLOCKED | `DATABASE_URL` not set in env |
| 2026-07-12 | ⛔ BLOCKED | `DATABASE_URL` not set in env |
| 2026-08-16 | ⛔ BLOCKED | `supabase.co` blocked by egress policy (DATABASE_URL is now set ✅) |

**Total weeks without data quality checks: 8+ weeks**

---

## What Is Accumulating Without Checks

### Critical: OCR Duplicate Accumulation (~8 weeks unchecked)
Every Makro receipt run creates new name variants for the same physical product.
- Pattern: same supplier + similar price (±20%) + overlapping purchase dates → duplicate RAW items
- Known example: lamb shoulder/leg/minced lamb all barcode 831436
- **Each week of procurement adds more potential duplicates**

### High: Zero-Cost WAC Backfill Not Running
The `zero_cost_with_purchases` auto-apply rule recalculates WAC for items that have
purchase_logs but still show `cost_per_unit = 0`. This hasn't run in 8 weeks.
BOM cost calculations are degraded for every dish using affected items.

### High: Price Drift Undetected
Supplier prices change weekly. Items with broken `conversion_factor` can show
>1000% drift (Olive Oil pattern: WAC=440/L but last_price=2200 for 5L bottle).
Without the check, recipe costs are materially wrong.

### Medium: Unlinked Makro Barcodes
New procurement may have barcodes not yet linked to nomenclature.
Each unlinked barcode = a product with no cost tracking.

---

## Phases Blocked

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: data_health_rules | ⛔ BLOCKED | Needs DB (network blocked) |
| Phase 2: Smart duplicate detection | ⛔ BLOCKED | Needs DB |
| Phase 3: Full Makro barcode audit | ⛔ BLOCKED | Needs DB + Makro API (also blocked) |
| Phase 4: Price drift + conversion sanity | ⛔ BLOCKED | Needs DB |
| Phase 5: Report | ⚠ PARTIAL | This file only |

---

## Health Score
**N/A** — unable to compute (no DB access)

Last successful audit: **never** (all runs blocked since routine started)

---

## Action Required

**Priority 1 (Unblocks everything):**
Add `*.supabase.co` and `*.pooler.supabase.com` to the egress allowlist for the
scheduled routine's environment in Claude Code web settings.

**Priority 2 (After network is unblocked — auto-runs next Sunday):**
The audit will run fully automatically. No other action needed.

**Priority 3 (Optional — immediate data check):**
Run `/techlead` or `/finance` in an interactive session with the correct DATABASE_URL
to manually check for duplicate accumulation and zero-cost WAC issues.

---

_Report generated: 2026-08-16 | Session: claude-opus-session-6369812b | Consecutive blocked runs: 3_
