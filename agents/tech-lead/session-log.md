# Tech Lead — Session Log

> Tier 2 worklog (see `operational-rules.md` § Two-Tier Tracking). Append-only.
> Business outcomes go to Mission Control, not here. Rotate past 200 lines.

## 2026-10-17 10:17 — DB hygiene: retention, cron bodies, backup tables, weekly audit
Session `claude-opus-session-8fb73fdb` · branch `feature/tooling/db-hygiene-retention-audit`
Epic `7352e57c` db-reliability. Parallel session owns MC f133850a / 9b0dad9b (grants, RLS,
search_path, security_invoker) — untouched here.

- [10:17] Read operational-rules + technical-rules (DB/git/migration sections) · claimed MC 44278890
- [10:18] Inventory: 45 largest relations across public/net/cron/storage/auth + pattern sweep
          for *_log/_queue/_audit/_events/_history/_bak. db at 76 MB; `cron.job_run_details` 12 MB
- [10:19] `loyverse_sync_log` 19,153 rows, `n_tup_del = 0` since 2026-05-18 — never cleaned
- [10:19] `net._http_response` is UNLOGGED and `pg_net.ttl = 6h`: 34,577 inserts → 3 live rows.
          Nothing to do; registered disabled so the decision is written down
- [10:20] Measured the real cause of the outage from the 7 days of surviving history:
          9,629 kB of cron command text, 8,484 kB of it job #9 (88%) ≈ 1.2 MB/day
- [10:20] Queue rate for the interval question: 38 rows in 30 days, max 13 in one hour,
          0.05/hour average — job #9 runs 1,440×/day for ~1.3 rows/day
- [10:21] Verified each backup table's source operation. Four provably complete; TWO not:
          `nomenclature_rename_backup_311dc7fe` has 16/64 rows still carrying the old live name
          (mig 156 note: "50 auto + 14 CEO-reviewed + 1 skip"), and `sku_balances_bak_20260901`
          has no migration or doc at all
- [10:22] Claimed migration numbers 496-499 via allocator (`migration-number.sh claim`)
- [10:25] Wrote 496 (registry + fn_log_retention + cron 03:10) · 497 (cron bodies → functions +
          cron_job_catalog) · 498 (db_audit_snapshots + collect/delta) · 499 (backup schema,
          4 DROPs, 2 quarantined)
- [10:28] No local PG fixture in scripts/ and Docker daemon off → used Homebrew `postgresql@14`.
          Built a stub fixture (vault, net.http_post recorder, cron.job/job_run_details, storage)
- [10:30] 496 behavioural tests, 7/7: batch cap exact (10,000 = 2×5,000), capped flag + WARNING,
          queue filter kept all 30 `pending`, idempotent, injection filter rejected by CHECK,
          incomplete enabled row rejected, missing target skipped without breaking the run
- [10:33] 497 A/B against the ORIGINAL inline cron SQL on identical seeds: zero diff in queue
          state and zero diff in http_post payloads (url/headers/body/timeout). Vault-missing
          path raises instead of passing NULL — fails loud, stays visible in job_run_details
- [10:35] CSV export of 6 backup tables. First attempt lost 9 of 10,136 rows: pages joined
          without a guaranteed trailing newline glued records at every boundary, and `wc -l`
          could not see it because columns contain embedded newlines. Redid it newline-safe;
          all 6 verified against prod by count + md5 of sorted keys + value sums
- [10:38] 498 delta tests caught a real design flaw: `table_size` was reported as "new" whenever
          a table entered the top-20, which would file a finding every week — the exact inventory
          noise that killed Data Sheriff and Data Health. Fixed three false-positive sources
          (top-20 rank churn, fresh unused index, single cron blip). Quiet week now returns 0 rows
- [10:40] Found the post-490 house pattern in prod (owner postgres, search_path `public, pg_temp`,
          PUBLIC revoked, service_role granted) and aligned all 6 new functions to it rather than
          shipping defaults that would have re-opened what mig 490 just closed. Boundary note:
          grants are the parallel session's zone, so this touches only functions created here
- [10:42] Clean-fixture run of 496→497→498→499 in order: all OK. 19 policy rows (8 enabled),
          14 catalog rows, 2 tables in `backup`, 0 leftover copies in public, PUBLIC execute false
- [10:45] `scripts/db-audit.sh` + report formatter unit-tested on both findings and quiet-week cases
- [10:47] Docs: policy doc, backup-tables README, CLAUDE.md § Database hygiene, Schema.md
          (3 tables + 6 functions + schema `backup`)
- [10:48] **NOTHING APPLIED TO PRODUCTION.** Awaiting CEO sign-off on the DROP list and the
          job #9 interval, then apply after 23:00 Phuket per the session brief

### Session Close: 2026-10-17 (open)
**Worked on:** 44278890, 2a0ad979, 725371dd, 37f5dcaa
**Status:** partial — all four built and verified offline, none applied to prod
**Handoff:** CEO decisions needed: (1) DROP list, (2) job #9 interval 1 min → 5 min.
Then apply 496→499 in order after 23:00 Phuket, run `scripts/db-audit.sh` manually, create the
Monday 02:00 UTC scheduled task, and verify after 24h that `job_run_details` grew < 1 MB.
