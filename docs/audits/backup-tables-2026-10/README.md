# Leftover backup tables — October 2026

> MC task: `725371dd-124b-46c4-943e-3a20593a6087` · epic `7352e57c` Database reliability & ops
> Migration: `499_drop_leftover_backup_tables.sql` · **not applied until the CEO signs off the list**

Seven ad-hoc copies were sitting in `public`, 3.9 MB together, the oldest from April. Six are
leftovers. The seventh, `rpc_grant_snapshot_490`, is the live rollback for migration 490 and is
**not touched** — its own `COMMENT` says keep it until 490 is proven, and that work belongs to
another session (MC `f133850a`).

Only **one** of the six is traceable to a migration. The other five were created by hand against
production, which is `RULE-NO-DIRECT-DB-EDITS` and is the real reason this task exists. Hence the
new `backup` schema.

## The CSVs here

Every row was exported before anything was dropped, and each file was verified against production
three ways: row count, md5 of the sorted key list, and a value sum where the table has one.

| File | Rows | Verified |
|---|---|---|
| `expense_ledger_payout_dupes_bak_20260701.csv` | 10,136 | md5 `0336147384c9242286b695c81b0a175e`, `sum(amount_thb)` = 1,167,780.00 |
| `shifts_hours_backup_pre347.csv` | 173 | row count |
| `nomenclature_rename_backup_20260417.csv` | 113 | md5 `e891e3eb94ef8cc2a4e04f172a4f984e` |
| `sku_balances_bak_20260901.csv` | 266 | md5 `ace9a01d8c629f5dec3dedb6a62c780e`, `sum(quantity)` = 4,587.6214 |
| `coffee_roaster_reversal_bak_20260701.csv` | 7 | row count |
| `nomenclature_rename_backup_311dc7fe_5a79_4a32_83eb_4cd3ad8de079.csv` | 64 | md5 `ced161306355dc216cf8f57abf089a11` |

All six md5s and both sums matched production exactly.

> A note on the export, because it bit once: these were pulled through PostgREST with
> `Accept: text/csv` in 1,000-row pages. The first attempt joined pages without guaranteeing a
> trailing newline, which glued the last record of each page to the first of the next and lost 9
> of 10,136 rows — and `wc -l` could not see it, because several columns contain embedded
> newlines. Count CSV records with a CSV parser, never with `wc -l`.

## Verdicts

### Dropped — source operation proven complete

| Table | Created by | Proof the original job finished |
|---|---|---|
| `expense_ledger_payout_dupes_bak_20260701` | ad-hoc, 2026-07-01 | `expense_ledger` now has **0** duplicate `loyverse_cash_movement_id` across 263 linked rows |
| `shifts_hours_backup_pre347` | **mig 347**, applied 2026-07-03 | every shift reads `09:00-18:00` or `09:30-18:30`; none at the pre-347 `08:00-17:00` |
| `nomenclature_rename_backup_20260417` | ad-hoc, 2026-04-17 | **0** of its 113 rows still match the live name — every rename landed |
| `coffee_roaster_reversal_bak_20260701` | ad-hoc, 2026-07-01 | all 6 reversed rows are gone from `expense_ledger`, `capex_transactions`, `opex_items`, `receiving_records`. The 1 `receipt_inbox` row remains **on purpose**: the reversal removed the ledger entries, not the receipt |

### Quarantined in schema `backup`, not dropped

| Table | Why it survived | Due |
|---|---|---|
| `nomenclature_rename_backup_311dc7fe_…` | **16 of its 64 rows still carry the old name as the live name.** Migration 156's own note reads "50 auto + 14 CEO-reviewed + 1 skip", so part of that run never applied or was reverted later. This table is the only record of those names. Dropping the undo for a half-finished rename is not cleanup. | `drop after 2026-12-31` |
| `sku_balances_bak_20260901` | No migration created it and no doc mentions it, so the operation it protected is **unknown**. All 266 `sku_id`s still exist and all 266 quantities have since moved — six weeks of ordinary stock movement, which says nothing about whether the original job completed. Unknown provenance is not the same as safe. | `drop after 2026-12-31` |

If nothing has needed either by 2026-12-31, `fn_log_retention` drops them on its own. No further
migration, no further decision.

## The rule this installs

A temporary copy now has exactly one legal home: schema `backup`, with a `COMMENT` containing
`drop after YYYY-MM-DD`. `fn_log_retention` expires them. A copy in `public` is a bug, and the
weekly DB audit files a task the first week it sees one. See `CLAUDE.md` § Database hygiene.

## Reproducing the export

```sh
# per table, 1000-row pages, newline-safe join; see the note above
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Accept: text/csv" \
  "$SUPABASE_URL/rest/v1/<table>?select=*&order=<key>&limit=1000&offset=<n>"
```
