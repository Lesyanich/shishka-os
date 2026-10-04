# Data Health Sheriff Report
*Generated: 2026-10-04T00:00:00Z (automated weekly run)*

## ⚠️ Health Score: UNKNOWN — Audit Blocked by Environment

---

## Environment Issue: DB Unreachable

This scheduled audit could **not execute** due to missing credentials in the remote execution environment.

### Root Cause

| Access Path | Status | Reason |
|-------------|--------|--------|
| Direct PostgreSQL (port 5432) | ❌ Blocked | Network policy blocks raw TCP to `aws-0-ap-south-1.pooler.supabase.com:5432` |
| Supabase transaction pooler (port 6543) | ❌ Blocked | Same network policy |
| MCP tools (shishka-chef / shishka-finance) | ❌ Error | `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables` |
| Supabase REST API | ❌ No key | `SUPABASE_SERVICE_ROLE_KEY` not present in session environment |

Only `DATABASE_URL` (PostgreSQL connection string) is available, but it requires direct TCP access which is blocked.

### Fix Required

Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the session environment in Claude Code settings.
Without these, **all scheduled DB audits fail silently** in cloud sessions.

The MCP servers (shishka-chef, shishka-finance, shishka-mission-control) also fail every tool call.

**Action needed:** Configure `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in the cloud session env vars at `https://code.claude.com`.

---

## What This Audit Would Have Checked

### Phase 1: data_health_rules (all active rules)
- Zero-cost items with purchase history → auto-apply WAC recalc
- Missing base_unit on RAW items
- Items with no supplier link
- Negative quantities in purchase_logs
- Stale items (>180 days no purchase, still available)

### Phase 2: Duplicate detection
- RAW items: same supplier + price ±20% + name similarity >0.5 (pg_trgm)
- OCR variant detection (Thai receipt names → multiple product codes per physical item)
- Known patterns: lamb variants (barcode 831436), frozen produce duplicates

### Phase 2b: Unit confusion g vs kg
- Items with `base_unit='g'` and `cost_per_unit < 5` → likely stored in wrong unit
- Known case: Gouda cheese (WAC=0.82/g should be 822/kg)

### Phase 3: Makro barcode audit
- `audit_makro_barcodes.py --limit 30` → compare DB names vs live Makro catalog
- Flags: NAME_DIFF, WEIGHT_DIFF, NOT_FOUND, BARCODE_ERROR

### Phase 4: Price drift & conversion sanity
- WAC vs `supplier_catalog.last_seen_price` drift >20%
- Drift >1000% = broken conversion_factor (known: Olive Oil 5L bottle)

### Phase 5: Orphans, empty BOM, nutrition
- RAW items purchased but not referenced in any BOM line
- SALE items with zero BOM lines (need /chef)
- SALE items missing calories

---

## Known Issues from Previous Sessions (reference only)

These were identified in prior manual sessions and may or may not be resolved:

1. **Lamb variants** — `RAW_AU_LAMB_SHOULDER`, `RAW_AU_LAMB_LEG`, `RAW_FROZEN_MINCED_LAMB` — possible duplicates, all mapped to barcode 831436. Check if merged.
2. **Olive Oil conversion** — 5L bottle: WAC may still reflect per-litre cost vs per-bottle last_seen_price → ~500% drift expected.
3. **Chili paste** — `product_code LIKE 'PF%'`, made in-house. Zero cost is intentional. notes should contain 'recipe'.
4. **Tahini** — Zero cost, free from supplier. notes should contain 'free'.

---

## Auto-Fixes Applied
_None — audit did not run._

## Errors
- ❌ Phase 1 skipped: no DB access
- ❌ Phase 2 skipped: no DB access
- ❌ Phase 3 skipped: no DB access
- ❌ Phase 4 skipped: no DB access
- ❌ Phase 5 skipped: no DB access

---

## Next Steps

1. **Immediate**: Add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to the cloud session environment via https://code.claude.com/docs/en/claude-code-on-the-web
2. **Re-run**: After credentials are available, re-trigger this scheduled task
3. **Alternative**: Run `python3 tools/reconcile-unmatched/run_sheriff_audit.py` locally from a machine with DB access

---
*Data Health Sheriff — automated weekly run | Shishka OS v6.0*
