# Data Health Sheriff Report
**Generated:** 2026-10-11 (4th consecutive blocked run)
**Run type:** Scheduled weekly audit
**Status:** ⛔ BLOCKED — Supabase host blocked by egress policy

---

## Progress vs Last Run

| Blocker | 2026-07-12 | 2026-10-11 |
|---------|-----------|-----------|
| `DATABASE_URL` not set | ❌ Missing | ✅ **FIXED** |
| Supabase host reachable | ❌ DNS fail | ❌ **Egress policy blocks it** |

`DATABASE_URL` is now correctly set — the previous fix worked. The remaining blocker is the session's egress policy.

---

## Root Cause (This Run)

The proxy status endpoint confirms:

```json
{
  "recentRelayFailures": [{
    "kind": "connect_rejected",
    "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
    "host": "qcqgtcsjoacuktcewpvo.supabase.co:443"
  }]
}
```

The CCR egress gateway returns **403 Forbidden** when this session tries to reach any Supabase endpoint. Port 5432 (PostgreSQL) also silently drops after CONNECT (no data flows). Both paths blocked.

| Method | Result |
|--------|--------|
| PostgreSQL TCP (port 5432) via HTTP CONNECT proxy | 200 tunnel opened, but no data — upstream silently dropped |
| HTTPS (port 443) to `qcqgtcsjoacuktcewpvo.supabase.co` | 403 Forbidden from egress gateway |
| MCP tools (`shishka-chef`, `shishka-finance`) | SUPABASE_SERVICE_ROLE_KEY not set in environment |

---

## Fix Required

### Option A — Allowlist Supabase in session environment (recommended)

In Claude Code web settings for this scheduled routine, add the Supabase host to the network allowlist:

```
SUPABASE_URL=https://qcqgtcsjoacuktcewpvo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_supabase_dashboard>
```

This also unblocks the MCP tools (`shishka-chef`, `shishka-finance`) which use `SUPABASE_SERVICE_ROLE_KEY` for their own DB access.

Docs: https://code.claude.com/docs/en/claude-code-on-the-web (Environment configuration section)

### Option B — Run audit from local machine

From any machine with Supabase network access:

```bash
cd shishka-os
DATABASE_URL="postgresql://..." python3.13 tools/reconcile-unmatched/audit_runner.py
```

This will connect directly without the egress restriction.

---

## Phases Blocked

| Phase | Status | Blocker |
|-------|--------|---------|
| Phase 1: data_health_rules | ⛔ BLOCKED | DB unreachable |
| Phase 2: Smart duplicate detection | ⛔ BLOCKED | DB unreachable |
| Phase 3: Makro barcode audit | ⛔ BLOCKED | DB + Makro API unreachable |
| Phase 4: Price drift + conversion | ⛔ BLOCKED | DB unreachable |
| Phase 5: Report | ⚠ PARTIAL | This file only |

---

## What Is Accumulating Without Checks

The following risk categories are growing undetected (4 weeks):

### 🔴 High Risk: OCR Duplicate Accumulation
Every Makro receipt processed creates potential name variants for the same product.
- Pattern: same supplier + similar price ±20% + overlapping dates → duplicate RAW items
- Known example: lamb shoulder/leg/minced lamb all barcode 831436
- **4 weeks of unaudited procurement = estimated 10-20 new duplicate candidates**

### 🟡 Medium Risk: Zero-Cost Items With Purchases
Items where `cost_per_unit = 0` but `purchase_logs` contains real prices.
Auto-apply WAC recalculation (rule `zero_cost_with_purchases`) has not run in 4 weeks.

### 🟡 Medium Risk: Price Drift
Supplier prices change weekly. If `conversion_factor` is wrong, `cost_per_unit`
may be >1000% off (known pattern: Olive Oil WAC=440/L but last_price=2200 for 5L bottle).
Undetected drift accumulates silently in BOM costs.

### 🟢 Lower Risk: Unlinked Barcodes
New Makro receipts may have barcodes not yet linked to nomenclature.
Estimated 2-5 new unlinked barcodes per week of receipts.

---

## Health Score

**N/A** — unable to compute without DB access.

Last successful audit: **never** (all runs blocked).  
Consecutive missed runs: **4** (starting 2026-06-21)

---

## Action Summary

**One fix needed to unblock everything:**

Add `SUPABASE_SERVICE_ROLE_KEY` to the scheduled routine environment.  
`DATABASE_URL` is already set ✅ — that blocker is gone.

_Report generated: 2026-10-11 | Session: claude-opus-session-a21d47bd | Consecutive blocked: 4_
