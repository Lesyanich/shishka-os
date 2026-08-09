# Data Health Sheriff Report
**Date:** 2026-08-09
**Run type:** Scheduled weekly audit
**Status:** ⛔ BLOCKED — 4th consecutive week. Root cause fully diagnosed.

---

## Infrastructure Diagnosis (Definitive)

This audit runs in a **remote Claude Code cloud container** (ap-south-1 region, isolated ephemeral sandbox). All DB access paths have been systematically tested:

| Access Method | Result | Notes |
|---|---|---|
| `DATABASE_URL` env var | ✅ Present | `postgresql://postgres.qcqgtcsjoacuktcewpvo:...@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` |
| Direct TCP port 5432 | ❌ Timeout | Network policy blocks outbound TCP to Supabase pooler |
| Transaction pooler port 6543 | ❌ Timeout | Same policy |
| Supabase REST API HTTPS | ❌ 403 Forbidden | Proxy blocks `*.supabase.co` |
| MCP shishka-chef / shishka-finance | ❌ Interrupted | MCP servers reconnect but tool calls fail in automated/scheduled context |
| macOS Keychain | ❌ N/A | Linux, no `security` CLI |

**Root cause:** The scheduled routine runs in a network-restricted container. The same `DATABASE_URL` credential works in interactive sessions (where MCP servers run stably), but not in headless/scheduled ones.

---

## Fix Required — Two Options (Pick One)

### Option A: Move audit to an MCP tool (recommended)
Have `/techlead` implement a `data_health_audit` tool inside `mcp-mission-control` that runs all the SQL checks server-side and stores results in a `data_health_runs` table. The scheduled prompt then calls the tool instead of running Python directly.

### Option B: Add Supabase REST API key to scheduled environment
In Claude Code web settings → this scheduled routine → Environment Variables, add:
```
SUPABASE_URL=https://qcqgtcsjoacuktcewpvo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase dashboard>
```
Then the Python audit scripts can use `supabase-py` (REST API, port 443) instead of `psycopg2`.

### Option C: Whitelist Supabase in network policy
Allow outbound TCP to `aws-0-ap-south-1.pooler.supabase.com:5432` and `qcqgtcsjoacuktcewpvo.supabase.co:443` in the scheduled routine's network policy.

---

## What Has Accumulated (4 Weeks Without Checks)

Based on learned patterns and codebase knowledge:

### High Risk — OCR Duplicate Accumulation
Every Makro receipt processed since 2026-07-12 has likely created new name variants. Known pattern:
- Same Thai product name → different English OCR on each receipt
- Same supplier + similar price (±20%) + overlapping dates = duplicate RAW item
- **Lamb example**: barcode 831436 produced ≥3 distinct nomenclature entries
- **Without dedup**: catalog grows noisier every week; recipe costs drift

### Medium Risk — WAC Not Recalculated
`auto_apply=true` rule for `zero_cost_with_purchases` has not run in 4 weeks. Items with `cost_per_unit=0` that now have `purchase_logs` with real prices are inflating recipe cost errors. **Exception**: items with `notes` containing `'free'` (tahini) or `'in-house'`/`'recipe'` (chili paste) should NOT be auto-updated — rule must check these.

### Medium Risk — Unit Confusion Accumulating
Pattern detected in code: items with `base_unit='g'` and `cost_per_unit < 5` are likely set to wrong unit (should be `kg`, `cost_per_unit` ≈ 1000x too low). Gouda cheese was the canonical example.

### Low Risk — Price Drift
Supplier prices change weekly. Olive Oil (5L bottle) had `cost_per_unit=440/L` vs `last_seen_price=2200` (drift >1000%) due to wrong `conversion_factor`. 4 weeks of undetected drift.

### Low Risk — Unlinked Makro Barcodes
New Makro purchases since July 12 may have barcodes in `purchase_logs` with no matching `supplier_catalog` entry.

---

## Phases Blocked

| Phase | Status | Notes |
|---|---|---|
| Phase 1: data_health_rules (all active) | ⛔ BLOCKED | No DB access |
| Phase 2: Smart duplicate detection | ⛔ BLOCKED | No DB access |
| Phase 3: Full Makro barcode audit (~222) | ⛔ BLOCKED | No DB + no macOS scraper |
| Phase 4: Price drift + conversion sanity | ⛔ BLOCKED | No DB access |
| Phase 5: Report | ⚠ PARTIAL | This file |

---

## Health Score
**N/A** — Unable to compute (no DB access, 4th consecutive week)

---

## Cumulative Risk Assessment

| Weeks Without Audit | Estimated Duplicate RAW Items Added | WAC Errors | Price Drift Items |
|---|---|---|---|
| 1 week | ~2-5 | ~3-8 | ~2-4 |
| 4 weeks (now) | **~8-20** | **~12-30** | **~8-16** |

The longer this runs undetected, the more BOM costs drift from reality, and the harder the manual cleanup session becomes.

---

## Immediate Action (Manual)

Until the automated audit is fixed, run a manual session:
```
# In an interactive Claude Code session:
/techlead
→ "Run data health audit: execute all data_health_rules, fix auto_apply=true rules, 
   report duplicates and price drift. Skip items with 'free'/'in-house'/'recipe' in notes."
```

Or directly:
```bash
cd tools/data-health
pip install -r requirements.txt
python run_rules.py preview
# Review preview.csv, then:
python run_rules.py apply --from preview.csv --actor lesia
```

---

## Consecutive Blocked Runs

| Date | Session | Reason |
|---|---|---|
| 2026-06-21 | claude-opus-session-? | No DATABASE_URL in env |
| 2026-07-12 | claude-opus-session-85e8f658 | No DATABASE_URL in env |
| 2026-07-?? | (missed run) | — |
| **2026-08-09** | **claude-opus-session-69e47454** | **DATABASE_URL present but TCP/REST blocked; MCP unstable in scheduled context** |

Note: As of this run, `DATABASE_URL` IS now in the environment — that part is fixed. The remaining blocker is outbound network policy + MCP server instability in headless mode.

---

_Report generated: 2026-08-09 | Session: claude-opus-session-69e47454 | Consecutive blocked runs: 4_
_Fix priority: HIGH — implement Option A (MCP tool) or Option B (REST API key) before next Sunday_
