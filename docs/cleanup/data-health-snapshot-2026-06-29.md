# DB Data-Health Snapshot — 2026-06-29

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 5.1 (`fec6cde7`)
> Read-only snapshot of `v_dangling_bom` + `v_data_health_summary` (prod `qcqgtcsjoacuktcewpvo`).
> Coordinates with the in-progress RAW-AUTO dedup `e9b9e2a3` — **does not touch its stubs**.

## Headline: `v_dangling_bom = 0` → acceptance criterion MET ✅

```
SELECT count(*) FROM public.v_dangling_bom;  -- → 0
```

The epic's acceptance criterion *"`v_dangling_bom` shows no active BOM line pointing at a soft-deleted
RAW"* is **already satisfied** — the RAW-AUTO dedup (`e9b9e2a3`, migration 325) and prior soft-delete
cleanup resolved all dangling references. **Phase 5.2 (`fb7dbb18`) has nothing to resolve** — it
reduces to a verify-only check + ongoing coordination with `e9b9e2a3`.

## ⚠ Meta-finding: 3 data-health RULES are broken (false positives)

`v_data_health_summary` reports `dead_bom_ref=1`, `orphan_raw=1`, `stale_auto_item=1`. Drilling into
`v_data_health_items`, these are **not data rows** — they are **rule execution errors**:

```
metric=dead_bom_ref  → "ERROR in rule bom_deactivated_ingredient: column x.product_code does not exist" (42703)
metric=orphan_raw    → "ERROR in rule raw_orphan_no_bom: column x.product_code does not exist"
metric=stale_auto_item → "ERROR in rule nomenclature_stale_raw_auto: column x.product_code does not exist"
```

A schema rename broke the `x.product_code` reference in these 3 rules. They **silently inflate** the
health summary with phantom counts and — more importantly — `dead_bom_ref` and `orphan_raw` are
**exactly the checks that would catch dangling/orphan BOM refs**, so they are currently **blind**.
`v_dangling_bom` (the authoritative view) is independent and confirms 0, but the rule layer should be
fixed so monitoring is trustworthy. **→ data-health backlog (coordinate with `e9b9e2a3`).**

## Broader data-health summary (the real backlog — out of this epic's scope)

| Metric | Count | Entity |
|---|---|---|
| stale_prices | 226 | nomenclature |
| orphan_items | 162 | nomenclature |
| name_has_weight_tail | 156 | nomenclature |
| unmatched_queue | 141 | unmatched_items |
| missing_pack_info | 71 | nomenclature |
| invalid_base_unit | 22 | nomenclature |
| no_category | 10 | nomenclature |
| duplicate_names | 8 | nomenclature |
| purchase_frozen_fresh_mismatch | 5 | purchase_logs |
| misclassified_cogs | 5 | expense |
| _(≈18 more, each 1–2)_ | | |

These are pre-existing data-quality items (pricing, naming, pack-info, categorization). They are
**not** "dangling soft-deleted RAW" and are **out of scope** for this epic (which targets only the
BOM-dangling criterion). They belong to the broader data-health / nomenclature-cleanup track
(`e9b9e2a3`, `f72d4a71`, the `RAW-AUTO` work) — logged here for visibility only.

## Conclusion

- **Criterion 6 (`v_dangling_bom` clean): ✅ MET** (0 rows).
- **Phase 5.2**: verify-only — no dangling rows to fix; keep coordinating with `e9b9e2a3`.
- **Follow-up (data-health track)**: repair the 3 broken rules (`bom_deactivated_ingredient`,
  `raw_orphan_no_bom`, `nomenclature_stale_raw_auto`) — `x.product_code` no longer resolves.
