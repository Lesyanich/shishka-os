# Data Health Sheriff Report
**Date:** 2026-08-02
**Run type:** Scheduled weekly audit
**Status:** BLOCKED — All DB connection paths unavailable (Run #4)

---

## Progress vs. Prior Runs

| Credential / Connection | 2026-06-21 | 2026-07-12 | 2026-08-02 |
|------------------------|-----------|-----------|-----------|
| `DATABASE_URL` env var | Not set | Not set | **SET** ✓ |
| Port 5432 (pooler) | — | — | Blocked (timeout) |
| Port 6543 (session pooler) | — | — | Blocked (timeout) |
| Supabase HTTPS REST | — | — | Blocked (403 from egress proxy) |
| `SUPABASE_URL` env var | Not set | Not set | Not set |
| `SUPABASE_SERVICE_ROLE_KEY` | Not set | Not set | Empty (set but blank) |
| MCP tools (shishka-chef, etc.) | — | — | Error: missing SUPABASE_URL |

**Good news:** `DATABASE_URL` is now configured. One blocker removed.
**Remaining blockers:** 2 independent issues (see below).

---

## Root Cause Analysis

### Blocker 1 — Egress Policy (network)

The scheduled routine runs in a remote cloud environment with a restrictive egress proxy at `http://127.0.0.1:43913`. All outbound TCP goes through it. Supabase infrastructure is **not on the allowlist**:

- `aws-0-ap-south-1.pooler.supabase.com:5432` → timeout
- `aws-0-ap-south-1.pooler.supabase.com:6543` → timeout
- `https://qcqgtcsjoacuktcewpvo.supabase.co` → `403 CONNECT tunnel failed`

This blocks all direct `psycopg2` connections regardless of credentials.

### Blocker 2 — Missing MCP credentials (environment)

The MCP servers (`shishka-chef`, `shishka-finance`, `shishka-mission-control`) connect independently of the egress proxy — but they require:

- `SUPABASE_URL` = `https://qcqgtcsjoacuktcewpvo.supabase.co` → **not set**
- `SUPABASE_SERVICE_ROLE_KEY` = `<service role JWT>` → **set but empty**

Without these, all MCP tools return: `"Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"`.

---

## Two-Step Fix (complete both)

### Step 1 — Add MCP credentials to scheduled routine environment

In Claude Code web → Environment settings for this scheduled routine, add:

```
SUPABASE_URL=https://qcqgtcsjoacuktcewpvo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your service role key from Supabase dashboard>
```

The service role key is in: **Supabase Dashboard → Project Settings → API → service_role (secret)**

This will unblock MCP tools (`/chef`, `/finance`, data health rules via MCP), even without fixing the egress policy.

### Step 2 (optional) — Allow Supabase in egress policy

If direct `psycopg2` connection is also needed (for the audit script), additionally allow:

```
aws-0-ap-south-1.pooler.supabase.com:5432
aws-0-ap-south-1.pooler.supabase.com:6543
*.supabase.co:443
```

Reference: https://code.claude.com/docs/en/claude-code-on-the-web

---

## What Is Accumulating Without Checks

4 consecutive weeks without data quality validation. Based on learned patterns:

### High Risk — OCR Duplicate Accumulation
Every week Makro receipts are OCR-processed, creating name variants of the same physical product.
- Pattern: same supplier + similar price (±20%) + overlapping dates → duplicate RAW items
- Known case: lamb shoulder / leg / minced lamb all mapped to barcode 831436
- **Catalog grows noisier each unaudited week**

### Medium Risk — Zero-Cost Items With Purchases
Items with `cost_per_unit = 0` that now have real `purchase_logs` prices. WAC auto-recalc has not run in 4+ weeks. Dish costs computed from these items are understated.

### Medium Risk — Price Drift / Broken Conversions
Supplier prices change. If `conversion_factor` is wrong, `cost_per_unit` can be >1000% off.
Known pattern: Olive Oil WAC=440/L, `last_seen_price`=2200 (for 5L bottle) → 400% drift.

### Low Risk — Unlinked Barcodes
New Makro purchases may have barcodes never linked to nomenclature. Spend not tracked.

---

## Health Score
**N/A** — unable to compute (no DB access; 4 consecutive blocked runs)

Last successful full audit: **never**

---

## Recommended Manual Workaround (until fixed)

From any interactive Claude Code session with working DB credentials, run:

```
/techlead
→ Run full data health audit:
   1. SELECT rule_code, detect_sql FROM data_health_rules WHERE is_active
   2. Execute each detect_sql, report counts
   3. Run WAC recalc for zero-cost items
   4. Run duplicate similarity check on RAW items
   5. Report price drift from supplier_catalog vs nomenclature
```

Or `/chef` → check for items with cost_per_unit = 0 or duplicate names.

---

_Report generated: 2026-08-02 | Session: claude-opus-session-6ee1a1e1 | Consecutive blocked runs: 4_
_`DATABASE_URL` is set. Add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to unblock MCP audit path._
