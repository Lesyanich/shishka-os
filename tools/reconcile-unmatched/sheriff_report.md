# Data Health Sheriff Report
**Date:** 2026-06-28  
**Run type:** Scheduled weekly audit  
**Status:** ⛔ BLOCKED — No database credentials available (2nd consecutive week)

---

## AUDIT BLOCKED: Missing Credentials

The weekly data health audit **could not run** because no database credentials
are available in the cloud execution environment (Linux, remote cloud container).

### What was tried

| Method | Result |
|--------|--------|
| `DATABASE_URL` env var | Not set |
| macOS Keychain `shishka-database-url` | Unavailable (Linux, no `security` CLI) |
| `SUPABASE_SERVICE_ROLE_KEY` env var | Not set |
| `SUPABASE_URL` env var | Not set |
| `.env` files in repo root | Gitignored — not present in clone |
| `services/lightrag/db-url.local` | Gitignored — not present in clone |

### Fix Required (Action for Owner)

**Add the following to the scheduled routine's environment variables**
in Claude Code web settings at https://code.claude.com:

**Option A — Direct Postgres connection:**
```
DATABASE_URL=postgresql://postgres.qcqgtcsjoacuktcewpvo:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

**Option B — Supabase service role (allows REST API fallback):**
```
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase dashboard → Settings → API>
SUPABASE_URL=https://qcqgtcsjoacuktcewpvo.supabase.co
```

Supabase project: `qcqgtcsjoacuktcewpvo` (ap-south-1 / Mumbai)  
Docs: https://code.claude.com/docs/en/claude-code-on-the-web

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

## What the Audit Will Check (Once Credentials Are Configured)

### Phase 1 — data_health_rules
All active rules in `public.data_health_rules` where `is_active = TRUE`, ordered by severity.  
Auto-fix rule `zero_cost_with_purchases` will recalculate WAC for zero-cost items with purchase history,
**skipping** items where `notes` contains `'free'` / `'in-house'` / `'recipe'` (tahini, chili paste etc).

### Phase 2 — Smart duplicate detection (OCR patterns)
- **OCR name variants**: Multiple RAW/RAW-AUTO items with same supplier + similar price (±20%)
  + overlapping purchase dates → likely same physical product
  (e.g. the lamb case: AU Frozen Lamb Shoulder / Leg / Minced Lamb, barcode 831436)
- **Unit confusion g vs kg**: Items with `cost_per_unit < 5` AND `base_unit = 'g'`
  (Gouda cheese pattern: WAC=0.82/g should be 822/kg)
- **Conversion factor drift >1000%**: `last_seen_price` vs `cost_per_unit` ratio > 10x
  (Olive Oil 5L pattern: WAC=440/L but last_price=2200 for bottle)

### Phase 3 — Makro barcode audit
`tools/reconcile-unmatched/audit_makro_barcodes.py` against ~222 barcodes, checking
NAME_MISMATCH / NAME_DIFF / NOT_FOUND against live Makro Typesense API.

### Phase 4 — Price drift + conversion sanity
Top 20 items with WAC vs last_seen_price drift >20%. Drift >1000% = broken conversion factor.

### Known safe zero-cost items (will NOT be flagged)
- Tahini: supplied free from friend's factory (`notes LIKE '%free%'`)
- Chili paste: PF made in-house from recipe (`notes LIKE '%in-house%'`)

---

## Health Score
**N/A** — could not compute (no DB access)

Previous run: 2026-06-21 — also blocked (credentials missing)  
Consecutive blocked weeks: **2**

---

_Report generated: 2026-06-28 | Session: claude-opus-session-640769a4_
