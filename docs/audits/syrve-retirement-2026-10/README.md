# SYRVE retirement — pre-drop data dump (2026-10-17)

MC task `9afb9af2` (epic `7352e57c` — Database reliability & ops).

SYRVE was connected over its API as a test in March 2026 and rejected in favour of
Loyverse (CEO, 2026-10-17). This directory is the **only undo** for the drop: production
has no backups (MC `4405c6e9`). Taken against prod `qcqgtcsjoacuktcewpvo` before the
migration was applied.

## What was found

| Object | Rows | Dump |
|---|---|---|
| `syrve_config` | 6 | `syrve_config.csv` — full contents |
| `syrve_sales` | 0 | none needed |
| `syrve_sync_log` | 0 | none needed |
| `syrve_sync_queue` | 0 | none needed |
| `syrve_uom_map` | 0 | none needed |

The 6 columns on live tables (`table-row-counts.csv`, `column-data-check.csv`) hold **no
SYRVE data at all** — see `column-data-check.csv`. Two of them are on `expense_ledger`
(financial): `syrve_doc_id` is NULL in all 602 rows, and `syrve_synced` is non-null in all
602 rows only because the column carries `DEFAULT false` — zero rows are TRUE. Both carry
zero information, so there is nothing to preserve beyond this record.

No view, materialized view, function body, index, constraint, RLS policy or trigger
referenced any of the 6 columns, and no inbound foreign key pointed at the 5 tables, so
the drop needed no `CASCADE`.

## No credential exposure

`syrve_config` holds only `base_url` (`https://api-eu.syrve.live/api/1`) and `vat_rate=7`.
`api_login`, `organization_id`, `store_id` and `default_tax_category_id` are all empty
strings. Nothing to rotate — which is why this CSV is safe to track in git.

## Verification against prod

`syrve_config.csv` was verified by row count **and** md5, computed on the prod side with
`string_agg(... ORDER BY key)` and locally over the same CSV body (header excluded):

| Check | Value | Result |
|---|---|---|
| Row count | 6 | match |
| md5 of sorted `key` list | `938a50c841b19187e06ec23b1c376453` | match |
| md5 of sorted `key,value,updated_at` rows | `133d854617105ee804ad7f4f27f948e2` | match |

Reproduce the local side with:

```sh
tail -n +2 syrve_config.csv | sort | awk 'NR>1{printf "\n"}{printf "%s",$0}' | md5
```

## Not in this retirement

`expense_ledger_payout_dupes_bak_20260701` also carries `syrve_doc_id` and `syrve_synced`
(10136 rows, both empty — 0 non-null / 0 TRUE). It is a backup table owned by MC
`725371dd` on the db-hygiene branch, which quarantines it into the `backup` schema. Left
untouched here on purpose.
