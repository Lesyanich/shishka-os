# Data Health Sheriff Report
**Date:** 2026-07-05  
**Run type:** Scheduled weekly audit  
**Status:** ⛔ BLOCKED — No database credentials available (2nd consecutive week)

---

## AUDIT BLOCKED: Missing Credentials

The weekly data health audit **could not run** because no database credentials
are available in the cloud execution environment (Linux, no macOS Keychain).

**This is the second consecutive week the audit has been blocked.** Previous blocked run: 2026-06-21.

### What was tried

| Method | Result |
|--------|--------|
| `DATABASE_URL` env var | Not set |
| macOS Keychain `shishka-database-url` | Unavailable (Linux, no `security` CLI) |
| `SUPABASE_SERVICE_ROLE_KEY` env var | Not set |
| `.env` file in repo root | Gitignored — not present in clone |
| `apps/admin-panel/.env.local` | Gitignored — not present in clone |

### Fix Required

Add **one** of the following to the scheduled routine's environment variables
in the Claude Code web settings (https://code.claude.com):

**Option A — Direct Postgres URL (preferred for psycopg2 tools):**
```
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

**Option B — Supabase REST API key (if psycopg2 replaced with supabase-py):**
```
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase dashboard>
SUPABASE_URL=https://qcqgtcsjoacuktcewpvo.supabase.co
```

Supabase project ref: `qcqgtcsjoacuktcewpvo` (ap-south-1 / Mumbai)  
Dashboard: https://supabase.com/dashboard/project/qcqgtcsjoacuktcewpvo/settings/database

---

## Phases Attempted

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: data_health_rules | ⛔ BLOCKED | Requires DB connection |
| Phase 2: Duplicate detection (enhanced) | ⛔ BLOCKED | Requires DB connection |
| Phase 3: Makro barcode audit | ⛔ BLOCKED | Requires DB connection (`audit_makro_barcodes.py` also uses macOS Keychain) |
| Phase 4: Price drift + conversion sanity | ⛔ BLOCKED | Requires DB connection |
| Phase 5: Report generation | ⚠ PARTIAL | This file only |

---

## What the Audit Would Have Checked

Based on learned patterns from previous manual cleanup sessions:

### Active data_health_rules
All active rules in `public.data_health_rules` where `is_active = TRUE`,
ordered by severity. Auto-fix rule `zero_cost_with_purchases` would recalculate
WAC for zero-cost items with purchase history, excluding items with `notes`
containing `'free'` / `'in-house'` / `'recipe'`.

### Duplicate detection (learned patterns)
- **OCR name variants**: Multiple RAW/RAW-AUTO items, same supplier + similar
  price (±20%) + overlapping purchase dates → same physical product
  (lamb shoulder / leg / minced from barcode 831436).
- **Unit confusion g vs kg**: `cost_per_unit < 5` AND `base_unit = 'g'` →
  likely misclassified (Gouda cheese pattern: WAC=0.82/g vs correct 822/kg).
- **Conversion factor drift >1000%**: `last_seen_price` vs `cost_per_unit`
  ratio > 10× (Olive Oil 5L: WAC=440/L but last_price=2200 for bottle).

### Known safe zero-cost items (excluded from zero-cost checks)
- Tahini: supplied free from partner factory (`notes LIKE '%free%'`)
- Chili paste: PF made in-house from recipe (`notes LIKE '%in-house%'` or `'%recipe%'`)

### Makro barcode audit
~222 barcodes in `supplier_catalog` + `purchase_logs` for Makro supplier
(`c548db19-8a70-4f34-96af-d66162793cbf`). Also needs fixing: `get_db_url()` in
`audit_makro_barcodes.py` uses macOS Keychain — needs an env-var fallback for
cloud runs.

---

## Health Score
**N/A** — could not compute (no DB access)

---

## Action Required

1. **Add `DATABASE_URL` to the scheduled routine environment** (see fix above)
2. **Update `get_db_url()` in audit scripts** to fall back to `DATABASE_URL` env var when Keychain unavailable (Linux/cloud):
   ```python
   def get_db_url() -> str:
       env_url = os.environ.get("DATABASE_URL")
       if env_url:
           return env_url
       result = subprocess.run(
           ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
           capture_output=True, text=True,
       )
       url = result.stdout.strip()
       if not url:
           raise RuntimeError("DATABASE_URL not found in env or Keychain")
       return url
   ```
3. Re-run this audit after credentials are configured

_Report generated: 2026-07-05 | Session: claude-opus-session-dec13efc | 2nd consecutive blocked run_
