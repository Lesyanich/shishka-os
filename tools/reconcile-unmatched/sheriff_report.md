# Data Health Sheriff Report
**Date:** 2026-06-21  
**Run type:** Scheduled weekly audit  
**Status:** ⛔ BLOCKED — No database credentials available

---

## AUDIT BLOCKED: Missing Credentials

The weekly data health audit **could not run** because no database credentials
are available in the cloud execution environment (Linux, `IS_SANDBOX=yes`).

### What was tried

| Method | Result |
|--------|--------|
| `DATABASE_URL` env var | Not set |
| macOS Keychain `shishka-database-url` | Unavailable (Linux, no `security` CLI) |
| `SUPABASE_SERVICE_ROLE_KEY` env var | Not set |
| `.env` / `services/lightrag/db-url.local` files | Gitignored — not present in clone |

### What needs to be done

**To fix this for future scheduled runs**, add the following to the scheduled
routine's environment variables in the Claude Code web settings:

```
DATABASE_URL=postgresql://postgres.[project-id]:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```
or
```
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase dashboard>
SUPABASE_URL=https://qcqgtcsjoacuktcewpvo.supabase.co
```

See: https://code.claude.com/docs/en/claude-code-on-the-web (environment configuration)  
Supabase project: `qcqgtcsjoacuktcewpvo` (ap-south-1 / Mumbai)

---

## Phases Attempted

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: data_health_rules | ⛔ BLOCKED | Requires DB connection |
| Phase 2: Duplicate detection | ⛔ BLOCKED | Requires DB connection |
| Phase 3: Makro barcode audit | ⛔ BLOCKED | Requires DB connection |
| Phase 4: Price drift + conversion sanity | ⛔ BLOCKED | Requires DB connection |
| Phase 5: Report generation | ⚠ PARTIAL | This file only |

---

## What the Audit Would Have Checked

Based on learned patterns from previous manual cleanup sessions:

### Active data_health_rules (from schema)
All active rules in `public.data_health_rules` where `is_active = TRUE`,
ordered by severity. Auto-fix rules (e.g. `zero_cost_with_purchases`) would
have recalculated WAC for zero-cost items with purchase history, excluding
items with `notes` containing `'free'` / `'in-house'` / `'recipe'`.

### Duplicate detection (learned patterns)
- **OCR name variants**: Multiple RAW/RAW-AUTO items with same supplier +
  similar price (±20%) + overlapping purchase dates → likely same physical
  product (e.g. the lamb case: AU Frozen Lamb Shoulder / Leg / Minced Lamb,
  barcode 831436).
- **Unit confusion g vs kg**: Items with `cost_per_unit < 5` AND
  `base_unit = 'g'` — likely misclassified (Gouda cheese pattern).
- **Conversion factor drift >1000%**: `last_seen_price` vs `cost_per_unit`
  ratio > 10x (Olive Oil 5L pattern: WAC=440/L but last_price=2200 for bottle).

### Known safe zero-cost items (do NOT flag)
- Tahini: supplied free from friend's factory (check `notes LIKE '%free%'`)
- Chili paste: PF made in-house from recipe (check `notes LIKE '%in-house%'`)

### Makro barcode audit
Would have run `tools/reconcile-unmatched/audit_makro_barcodes.py` against
~222 barcodes in `supplier_catalog` + `purchase_logs` for Makro supplier
(`c548db19-8a70-4f34-96af-d66162793cbf`), checking for NAME_MISMATCH /
NAME_DIFF / NOT_FOUND against live Makro Typesense API.

---

## Health Score
**N/A** — could not compute (no DB access)

Last known report: none (first run, blocked before any data fetched)

---

## Action Required

1. **Add `DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` to the scheduled routine environment** — see fix above
2. Re-run this audit after credentials are configured
3. The audit will then run all 5 phases and produce a full report with health score

_Report generated: 2026-06-21 | Session: claude-opus-session-a261e2ff_
