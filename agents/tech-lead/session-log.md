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

- [19:33] CEO approved the DROP list (4 drop, 2 quarantine) and the 23:00 apply. Re-verified all
          four DROP verdicts against live data: still hold. Quarantine case still 16/64 old-named.
          Numbers 496-499 still reserved to me; 500/501/502 went to other sessions, 502 applied
- [19:35] Captured the pre-apply baseline for the 24h check (see MC 2a0ad979 comment) and set a
          one-shot trigger for 23:07 Phuket. Caveat told to the CEO: CronCreate is session-only
- [19:57] CEO asked "это логи? а они нам нужны?" — checked writers in code against row counts.
          Only 2 of the 8 enabled rows are live: loyverse_sync_log (19,180 rows, written today,
          3 edge fns) and api_cost_log (354 rows, 6 call sites, dashboard). FIVE are dead or
          frozen: access_audit_log has 0 rows and ZERO code references, syrve_sync_log /
          syrve_sync_queue / chef_feedback_queue are empty with no live code, brain_query_log
          last written 2026-04-10. Logged as MC c0ec41b0 (drop-or-finish is a product decision,
          not cleanup) rather than acting on it — RULE-BACKLOG-FIRST
- [20:05] CEO cut loyverse_sync_log 30d -> 14d. Patched 496 (policy row, COMMENT, header count,
          migration_log note), left syrve_sync_log at 30d since only loyverse was named, and
          rewrote its reason so it no longer claims a shared horizon. New first purge ~17.9k
          (17,191 from sync_log instead of 14,798). Re-verified on the fixture: boundary exact —
          800 rows older than 14d deleted, 300 within 14d untouched, 0 stale left
- [20:08] Answered the liveness question durably in the policy doc (§ Are these even logs we
          need?) so it is not rediscovered next audit — RULE-COMPOUND-ENGINEERING

- [21:50] CEO: "#9 — 5 нормально если сам считаешь так". Set job #9 to */5 in 497 with the
          measured justification in cron_job_catalog. Recomputed the post-change command-text
          volume exactly instead of estimating: 28.1 kB/day across the five jobs (job #9 alone
          10.7 kB/day, down from ~1.2 MB/day) — a factor of 49, not the ~18 I projected at the
          1-minute cadence. Job #10 untouched: its 5-min stuck threshold is about how long a
          push may stay in flight, not about drain cadence, so they do not interact. Noted the
          one real trade-off in the migration: throughput falls 300 -> 60 rows/hour at
          p_batch = 5, which is still 4.6x the busiest hour ever seen, and the knob for a bulk
          push is the batch size (a parameter now, because the body is a function)
- [21:55] CEO: "syrve больше нет — тестово по апи подключали и отказались в пользу лойверс."
          This was bigger than the two empty tables. Inventory against prod: 5 tables
          (syrve_config 6 rows, syrve_sales, syrve_sync_log, syrve_sync_queue, syrve_uom_map),
          3 functions, 6 columns on LIVE tables (nomenclature x2, suppliers, equipment,
          expense_ledger.syrve_doc_id + syrve_synced), 2 admin panels + a hook + Settings
          wiring, and the syrve-poc edge function
- [21:56] Checked syrve_config for credentials WITHOUT printing values: api_login,
          organization_id, store_id, default_tax_category_id all EMPTY; only base_url and
          vat_rate=7 set. No exposure, nothing to rotate
- [21:58] **Corrected the constitution** — operational-rules.md § Systems of Record had SYRVE
          as "System of Record (SoR) — Inventory, BOM, Sales" and Supabase as merely a System
          of Engagement. False, and read by every agent at session start. Now Supabase is the
          SSoT, Loyverse is the System of Record for the till, with an explicit "SYRVE is not
          in use" note. Also fixed the SYRVE mentions in RULE-UUID-COMPLIANCE and
          RULE-SOCRATIC-GATE. RULE-COMPOUND-ENGINEERING
- [22:00] 496: both syrve journals now get NO retention — registry rows stating they are
          retired, COMMENTs to match. Enabled rows 8 -> 6 of 19. Removal is MC 9afb9af2
          (created with the full inventory; supersedes the SYRVE half of c0ec41b0)
- [22:02] Caught myself citing a task id in the docs before the task existed — created it
          first, then replaced the placeholder with the real 9afb9af2 in both the doc and 496
- [22:04] Re-verified all four migrations on a clean PG14 fixture: all apply, 6 enabled of 19,
          both syrve rows disabled with keep_days NULL, drain rationale carries the 5-min
          decision

### Session Close: 2026-10-17 (open)
**Worked on:** 44278890, 2a0ad979, 725371dd, 37f5dcaa
**Status:** partial — all four built and verified offline, none applied to prod
**Handoff:** DROP list approved; loyverse_sync_log at 14d; job #9 at */5; SYRVE retired in
the registry and the constitution (removal is MC 9afb9af2). Nothing is waiting on the CEO. Trigger set for
23:07 Phuket to apply 496→499 in order, run `fn_log_retention` and `scripts/db-audit.sh`
manually, create the Monday 02:00 UTC scheduled task; then verify after 24h that
`cron.job_run_details` grew < 1 MB. CronCreate is session-only — if the session closes before
23:00 the apply must be triggered by hand.
