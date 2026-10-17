# Log retention policy — October 2026

> MC task: `44278890-f3bd-4fbb-ab5f-a11ffafc8e3b` · epic `7352e57c` Database reliability & ops
> Migrations: `496_log_retention_policy.sql`, `498_db_audit_snapshots.sql`, `499_drop_leftover_backup_tables.sql`
> Baseline: Claude Doc "DB audit baseline 2026-10-17" · Post-mortem: "Postmortem: Supabase DB outage 2026-10-16"

## Why this exists

On 2026-10-16 the database was down about 14 hours. `cron.job_run_details` had grown unchecked
since June to 328 MB of a 419 MB Nano instance. It now has a cleaner (cron job #15, 7 days),
and the database is back to 76 MB.

Every other journal in the database still had no cleaner at all. `loyverse_sync_log` held
19,153 rows and had never seen a single `DELETE` — `n_tup_del = 0` since 2026-05-18.

## Inventory

Every log-shaped table in `public`, `net` and `cron`, with who writes it, who reads it, and the
retention decided. All 19 rows live in `public.log_retention_policy`; this table is the readable
copy of it.

### Purged nightly by `fn_log_retention`

| Table | Age column | Keep | Writes | Reads | Rows at audit | First purge |
|---|---|---|---|---|---|---|
| `loyverse_sync_log` | `started_at` | 30d | Loyverse pull/push edge fns, cron #1–#3, #9 | incident triage only | 19,153 | ~14,771 |
| `api_cost_log` | `ts` | 90d | receipt OCR + brain wrappers | `/admin/api-costs` | 354 | 268 |
| `brain_query_log` | `ts` | 90d | lightrag-server wrapper | `/admin/brain-cost` | 5 | 5 |
| `access_audit_log` | `created_at` | 90d | admin auth layer | security review | 0 | 0 |
| `syrve_sync_log` | `created_at` | 30d | SYRVE sync | incident triage | 0 | 0 |
| `loyverse_push_queue` | `requested_at` | 14d, `status IN ('done','error')` | admin panel / chef MCP | cron #9 drain | 421 (400 done, 21 error) | 396 |
| `syrve_sync_queue` | `created_at` | 14d, `status IN ('done','error')` | SYRVE sync | SYRVE drain | 0 | 0 |
| `db_audit_snapshots` | `run_at` | 365d | `fn_db_audit_snapshot` (weekly) | `fn_db_audit_delta` | new in 498 | — |

Only terminal rows are purged from the queues. `pending` and `processing` are live work and are
never touched, whatever their age — a stuck row is the watchdog's business, not retention's.

### Registered, deliberately not purged

| Table | Why not |
|---|---|
| `cron.job_run_details` | Owned by cron job #15 (7d). This is the table that filled the disk, so it keeps a cleaner independent of `fn_log_retention` being healthy. Exactly one owner, and it is not us. |
| `net._http_response` | `UNLOGGED`; pg_net trims it itself on `pg_net.ttl = 6 hours`. 34,577 inserts have left 3 live rows. Nothing to do. |
| `net.http_request_queue` | `UNLOGGED`; managed by the pg_net background worker. |
| `purchase_logs` | **Never.** Input to WAC/COGS — deleting history silently rewrites product costs. |
| `migration_log` | **Never.** Registry of applied migrations and the authority for migration numbering. |
| `shifts_audit` | **Never without legal sign-off.** Labour-law evidence (LEG-004). Intent is 365 days minimum; purging stays off until a lawyer confirms the floor. |
| `value_change_audit` | **Never.** Audit trail of value changes. |
| `haccp_logs` | **Never.** Immutable HACCP checkpoint trail, append-only by design. |
| `task_comments` | Not a log — Mission Control discussion history. Raised as a candidate in the MC task; rejected here so the question stays closed. |
| `stock_movements` | Not a log — the stock ledger. Same. |
| `chef_feedback_queue` | Empty, and its terminal status vocabulary is unverified. Off until a real row confirms it. |

A log-shaped table **missing** from `log_retention_policy` is the bug the registry exists to
catch: it means nobody decided. That is why the never-purge tables get rows too, with
`keep_days NULL` and `enabled = false`, instead of being left out.

## How the cleaner works

`fn_log_retention(p_max_batches => 20, p_pause_s => 0.1)`, called by cron job `log-retention`
at 03:10 UTC (10:10 Phuket), ten minutes after job #15 so the two never overlap.

Two passes:

1. **Row retention** — for each enabled policy row, `DELETE` in `batch_size` chunks (5,000) via
   a `ctid` sub-select, looping until a short batch or the batch cap. Records
   `last_run_at` / `last_deleted` / `last_capped` per table, and raises a `WARNING` if a backlog
   survived the cap.
2. **Backup expiry** — drops any table in schema `backup` whose `COMMENT` carries a past
   `drop after YYYY-MM-DD`. A copy with no parseable date is **warned about, never dropped**, so
   a missing date fails safe and loud.

### The honest limit of the batching

Batching bounds each *statement*: locks and WAL per statement stay small, and a per-statement
timeout kills one 5,000-row batch instead of the whole purge. That is what a single large
`DELETE` failed to do on Nano on 2026-10-16.

It does **not** make the run multi-transactional. A plpgsql `FUNCTION` cannot `COMMIT`, so the
whole call is one transaction and a failure in batch N discards batches 1..N-1. With a 100,000
row ceiling per run and a real daily delta near 100 rows, that is an acceptable trade. If a
table ever carries a backlog where it is not, the fix is a `PROCEDURE` with `COMMIT` per batch
invoked as `CALL` — a one-line change to the cron body. This is a known, chosen limitation, not
an oversight.

## Verification

Verified on a local PostgreSQL 14 fixture before any production apply (`scripts/` has no fixture
harness; the database is Homebrew `postgresql@14`). Seven behavioural tests, all passing:

| Test | Result |
|---|---|
| Capped run: 12,000 rows, 2 batches of 5,000 | exactly 10,000 deleted, `last_capped = true`, `WARNING` raised |
| Full run finishes the backlog | 0 rows older than the horizon remain |
| Queue filter | all 50 `done` + 20 `error` purged, **all 30 `pending` survived** |
| Second run | 0 rows deleted — idempotent |
| Injection-shaped `status_filter` | rejected by `CHECK` |
| `enabled` row with no `ts_column`/`keep_days` | rejected by `CHECK` |
| Policy row pointing at a dropped table | skipped, run continues |

Backup-expiry pass: past date → dropped; future date → kept; missing date → warned and kept.

## Follow-ups not done here

- `shifts_audit` needs a lawyer to confirm the labour-law retention floor before it is ever
  purged. Until then it is off.
- `chef_feedback_queue` needs one real row to confirm its terminal statuses.
- The new functions are `SECURITY INVOKER` where their cron siblings are `SECURITY DEFINER`.
  Deliberate for `fn_log_retention`, which deletes rows and drops tables. Worth a look when
  MC `f133850a` finishes the RPC-grant work.
