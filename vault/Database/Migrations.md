---
title: Database Migrations
type: page
tags: [database, migrations]
date: 2026-04-29
status: active
related:
  - "[[Database/]]"
  - "[[Database/Schema]]"
---

# Database Migrations

The 164 sequential SQL files at `services/supabase/migrations/` that built the current schema from empty Postgres. Migrations are **the only allowed way** to change schema in production — no psql, no Supabase studio for DDL.

## Where migrations live

```
services/supabase/migrations/
├── 001_*.sql
├── 002_*.sql
├── ...
├── 163_fix_equipment_status_constraint.sql
└── 164_approve_receipt_auto_capex_assets.sql        ← latest at time of writing
```

Per `RULE-MIGRATIONS-PATH` (Auto Memory `feedback_migrations_path.md`): new migrations always to `services/supabase/migrations/`, sequentially numbered. Older fork at `database/` is dead — don't add new files there.

## Naming convention

```
NNN_short_snake_case_description.sql
```

- `NNN` — three-digit sequential number (zero-padded)
- Description in English (per `RULE-LANGUAGE-CONTRACT`)
- One concept per file — easier to revert, easier to review

## Recent migrations (last 10 at time of writing)

| # | File | Purpose |
|---|---|---|
| 164 | `164_approve_receipt_auto_capex_assets.sql` | `fn_approve_receipt` auto-creates `capex_assets` rows for CAPEX line items |
| 163 | `163_fix_equipment_status_constraint.sql` | Adds `'pending_setup'` to the equipment status check constraint |
| 162 | `162_delete_stale_capex_placeholders.sql` | Cleanup of pre-launch placeholder rows |
| 161 | `161_nomenclature_launch_phase.sql` | New `launch_phase` column on `nomenclature` |
| 160 | `160_business_tasks_critical_path.sql` | `is_critical_path` boolean on `business_tasks` |
| ... | ... | ... |

## How to apply migrations

### Local / development

Migrations apply automatically when the dev environment is set up — checked by the test suite + admin app on first connect.

### Production

Apply via Supabase CLI (or directly via psql with the production connection string from Keychain):

```bash
DATABASE_URL=$(security find-generic-password -s "shishka-database-url" -w)
psql "$DATABASE_URL" -f services/supabase/migrations/164_approve_receipt_auto_capex_assets.sql
```

`shishka-database-url` is the Keychain entry — see [[Tech/]] for secret-management conventions.

### Order matters

Migrations are **sequential** — running `164` requires `163` already applied. The Husky pre-commit hook includes a migration canary check; it warns if a non-sequential file is committed (e.g., `164` exists, someone tries to add `164b` instead of `165`).

## How to add a new migration

1. Find the highest-numbered file: `ls services/supabase/migrations/ | sort | tail -1` → say it's `164_*`
2. Create `165_my_new_change.sql`
3. Use guarded DDL — `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE` — so the file is idempotent
4. **Check column existence before referencing** (`RULE-MIGRATION-COLUMN-EXISTENCE`):

   ```sql
   DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'nomenclature' AND column_name = 'launch_phase'
     ) THEN
       UPDATE nomenclature SET launch_phase = 'phase-1' WHERE launch_phase IS NULL;
     END IF;
   END $$;
   ```

   Production may have skipped intermediate migrations — never assume a column exists in your migration unless you've added it earlier in the same file.

5. Test locally → commit → PR → CEO approves → merge → apply in production
6. Update `migration_log` (auto-tracked) so production state is visible

## Migration types

| Type | Examples | Notes |
|---|---|---|
| **Schema** | New table, new column, constraint, index | Most common |
| **Function / RPC** | `CREATE OR REPLACE FUNCTION fn_*` | See [[Database/RPC Catalog]] |
| **RLS** | `CREATE POLICY` / `ALTER TABLE ENABLE ROW LEVEL SECURITY` | See [[Database/RLS Policies]] |
| **Trigger** | Auto-update timestamps, audit log, derived state | E.g. `bible_page_history` (proposed in archived spec) |
| **Data backfill** | One-time `UPDATE` to populate new column | Mark intent in filename — `*_backfill.sql` |
| **Cleanup** | Delete placeholder rows, drop deprecated tables | Rare; e.g. `162_delete_stale_capex_placeholders.sql` |

## Reverting

> Never `DROP COLUMN` in production without a recovery plan.

For schema changes:

- Forward-only is the default — write a follow-up migration that introduces the inverse change
- For data-destructive operations (DROP TABLE, DROP COLUMN with data), require an explicit CEO sign-off + a backup tagged in [[Milestones/]]

## See Also

- [[Database/Schema]] — what migrations have produced
- [[Database/RPC Catalog]] — functions defined in migrations
- [[Database/RLS Policies]] — security policies
- Auto Memory: `feedback_migrations_path.md`, `feedback_migration_safety.md`
