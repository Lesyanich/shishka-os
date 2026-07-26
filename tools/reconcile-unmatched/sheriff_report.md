# Data Health Sheriff Report
**Date:** 2026-07-26  
**Run type:** Scheduled weekly audit  
**Status:** ⛔ BLOCKED — Network policy denies Supabase (3rd consecutive missed run)

---

## Progress Since Last Run (2026-07-12)

✅ `DATABASE_URL` is now set in the scheduled environment — that blocker is resolved!

❌ **New blockers found** (two remaining issues):

| Blocker | Diagnosis | Fix |
|---------|-----------|-----|
| Proxy denies `qcqgtcsjoacuktcewpvo.supabase.co:443` | HTTP 403 from egress proxy — policy denial | Add host to network allowlist |
| `SUPABASE_URL` not set | MCP tools (Chef/Finance) need this to init Supabase client | Add env var to scheduled routine |
| `SUPABASE_SERVICE_ROLE_KEY` not set | MCP tools check for this too | Add env var to scheduled routine |

**Proxy proof:** `recentRelayFailures: [{"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT (policy denial)","host":"qcqgtcsjoacuktcewpvo.supabase.co:443"}]`

---

## Fix Required (One Time)

### Step 1 — Add environment variables to scheduled routine

In Claude Code web settings → this scheduled session → Environment:

```
SUPABASE_URL=https://qcqgtcsjoacuktcewpvo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key_from_supabase_dashboard>
```

DATABASE_URL is already set correctly — don't change it.

### Step 2 — Add Supabase to network allowlist

In the environment settings, add `qcqgtcsjoacuktcewpvo.supabase.co` to the outbound allowlist.  
See: https://code.claude.com/docs/en/claude-code-on-the-web (Environment configuration → network policy)

Once both steps are done, this audit will run fully on the next scheduled fire.

---

## What Has Been Accumulating (4+ Weeks Unaudited)

### High-Risk: OCR Duplicate Accumulation
Every Makro receipt creates OCR name variants for the same physical product. Based on learned patterns:
- **Thai produce & meat**: potatoes, chicken, lamb — each receipt generates a slightly different transliteration
- **Known example barcode 831436**: lamb shoulder / lamb leg / minced lamb — all same product
- Without weekly dedup, the catalog grows noisier every procurement cycle

### High-Risk: Zero-Cost WAC Recalculation Not Running
Items with `cost_per_unit = 0` that now have paid `purchase_logs` haven't had their Weighted Average Cost auto-calculated for 4+ weeks. This breaks:
- BOM cost calculations
- Dish margin reports
- Profit & Loss accuracy

### Medium-Risk: g vs kg Confusion (Gouda pattern)
Any item with `base_unit='g'` and `cost_per_unit < 5` is likely misconfigured as grams instead of kilograms. Cost appears to be per-gram (e.g., WAC=0.82) instead of per-kg (WAC=820). Affects all weight-priced items.

### Medium-Risk: Price Drift / Broken Conversion Factors
Supplier prices change monthly. Items like Olive Oil (known: WAC=440/L, last_price=2200 for 5L) show >1000% "drift" when `conversion_factor` is wrong. Every week without the audit adds more undetected conversion errors.

### Low-Risk: Unlinked Makro Barcodes
New purchased barcodes that aren't linked to any nomenclature item. These cause manual matching work during next receipt processing.

---

## Phases Blocked

| Phase | Status | Blocker |
|-------|--------|---------|
| Phase 1: Execute all active data_health_rules | ⛔ BLOCKED | Network policy |
| Phase 1a: Auto WAC recalculation | ⛔ BLOCKED | Network policy |
| Phase 2: Smart duplicate detection (similarity) | ⛔ BLOCKED | Network policy |
| Phase 2b: g vs kg unit confusion detection | ⛔ BLOCKED | Network policy |
| Phase 3: Full Makro barcode audit (~222 barcodes) | ⛔ BLOCKED | Network policy + Makro API |
| Phase 4: Price drift + conversion sanity | ⛔ BLOCKED | Network policy |
| Phase 5: Report | ⚠️ PARTIAL | This file only |

---

## Health Score
**N/A** — unable to compute (no DB access)

Last successful audit: **never** (all runs blocked since routine started)  
Consecutive blocked runs: **3**  
Weeks of unaudited data: **5+ weeks**

---

## Diagnostic Log (this run)

```
DATABASE_URL:           ✅ SET  (postgresql://postgres.qcqgtcsjoacuktcewpvo:...@aws-0-ap-south-1.pooler.supabase.com:5432/postgres)
SUPABASE_URL:           ❌ NOT SET
SUPABASE_SERVICE_ROLE_KEY: ❌ NOT SET

psycopg2 direct connect: TIMEOUT (TCP to port 5432 not routed through HTTPS proxy)
Supabase REST API:       403 FORBIDDEN (egress policy denies *.supabase.co)
MCP Chef tools:          ERROR: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
MCP Finance tools:       ERROR: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"

Proxy status: selective=false, standalone=false
Recent relay failure: connect_rejected for qcqgtcsjoacuktcewpvo.supabase.co:443
```

Per proxy README §"403/407 from the proxy":
> "The destination host is not allowed by your organization's egress policy for this session. Do not retry or route around it — report the blocked host."

---

_Report generated: 2026-07-26 | Session: claude-opus-session-5d286ad5 | Consecutive blocked runs: 3_
