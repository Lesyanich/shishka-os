# Spec — Supplier catalog ingest: one sink, many front-ends

> MC Task: c3289714-3933-46a8-8fe5-3358786d47a5
> Epic: Procurement & Inventory (8b709aa0) — W2 of the sequencing in MC `31c5715e`
> Status: **awaiting CEO approval** (packet Step 1). No migration or UI code is written until this is approved.
> Author: claude-opus-session-9f66ebd8, 2026-07-29
> Branch: `feature/procurement/supplier-catalog-ingest`

---

## 1. The problem, restated in one line

A supplier sends a price list of 200–700 items. There is no way to turn it into
rows. So it becomes a file, a markdown table, or a chat message — and the Price
Book compares nothing.

Every existing write path into `supplier_catalog` refuses this case:

| Path | Why it cannot take a price list |
|---|---|
| `fn_record_supplier_quote` (mig 318) | one row per call, **and** `p_nomenclature_id` is mandatory — an item we have never bought cannot be recorded at all |
| `fn_approve_receipt` | only writes what we already bought |
| `update_tops_prices` (mcp-chef) | Tops only, keyed by EAN, needs playwright, writes raw `.insert()` |
| `useSupplierMapping.ts` (admin) | one row at a time during receipt-line matching |
| hand-written INSERTs in migrations | an agent improvising, which is the bug |

Measured on prod today: **1378** rows, **545** linked, 318 with a barcode,
**41** distinct free-text `source` values.

---

## 2. CEO decisions this spec implements

Recorded on the MC task 2026-07-29. Not re-opened here.

- **Q1 — format:** «может быть фото, пдф, может быть сат, может парсер от макро
  или лайн». → **One sink, interchangeable front-ends.** The RPC is the only
  thing that writes; each format is a caller.
- **Q2 — unknown items:** **orphan**, into `v_catalog_match_queue` (mig 389).
  No `RAW-AUTO` auto-creation.
- **Q3 — re-import:** **merge**. Prices update in place; rows absent from a new
  list are never delisted or deleted. Cost accepted: discontinued items linger.
  Mitigated by stamping `verified_at` on every touched row and by reporting
  `inserted` / `updated` separately.

---

## 3. The sink

### 3.1 Signature

```sql
fn_import_supplier_catalog(
  p_supplier_id   uuid    DEFAULT NULL,   -- when the caller already knows it
  p_supplier_name text    DEFAULT NULL,   -- resolved via fn_resolve_supplier otherwise
  p_source        text    DEFAULT 'manual',
  p_source_detail text    DEFAULT NULL,   -- free-form provenance: 'laadthai_pricelist_2026-07-29'
  p_rows          jsonb   DEFAULT '[]'::jsonb,
  p_dry_run       boolean DEFAULT false
) RETURNS jsonb
```

`p_dry_run = true` runs the whole classification pass and returns the same
payload **without writing anything** — that is what the UI preview calls, and
what makes `p_create = false` on the resolver meaningful (see §3.4).

Callable from SQL, from PostgREST (admin UI), from an Edge Function, and from an
MCP tool. The payload is deliberately dumb — a jsonb array — so every caller
shapes the same thing.

### 3.2 Row shape

```jsonc
{
  "name":              "ข้าวหอมมะลิ 5kg",   // REQUIRED — the supplier's own name
  "name_en":           "Jasmine rice 5kg",   // optional
  "sku":               "MK-11234",
  "barcode":           "8850123456789",
  "price":             320.00,
  "package_qty":       5,
  "package_unit":      "kg",
  "conversion_factor": 5,        // base units per purchase unit. OMIT if unknown.
  "purchase_unit":     "bag",
  "brand":             "Royal Umbrella",
  "external_url":      "https://…",
  "image_url":         "https://…",
  "nomenclature_id":   null      // optional; when the caller already knows the link
}
```

Only `name` is required. A row with no `name` and no `barcode` is rejected into
`errors[]` — it cannot be deduped, so writing it would guarantee a duplicate on
the next import.

### 3.3 Dedupe — precedence, and why it is a lookup, not `ON CONFLICT`

Precedence per row:

1. `(supplier_id, barcode)` — the only unique index that actually exists
   (`idx_sc_supplier_barcode`, partial `WHERE barcode IS NOT NULL`)
2. `(supplier_id, supplier_sku)`
3. `(supplier_id, lower(trim(name)))`

`idx_sc_sku` and `idx_sc_name` are **not unique**, and prod already holds 15
duplicate SKU keys and 123 duplicate name keys. So `ON CONFLICT` is not
available for keys 2 and 3, and adding the unique indexes would fail on live
data. The function therefore does an explicit lookup per row and updates the
**freshest** match (`ORDER BY updated_at DESC`), leaving pre-existing duplicates
alone rather than trying to merge them — de-duplicating the existing table is
`4275cd89`'s job, not the importer's.

Barcode is scoped to the supplier, matching the existing unique index. Two
suppliers selling the same barcode are two legitimate offers; that is the whole
point of a price book.

**Within one payload**, two rows can collapse to the same key. Rows are
processed in order, so the second occurrence updates the row the first one just
wrote, and the count is reported as `duplicates_in_payload` rather than silently
inflating `inserted`.

### 3.4 Supplier resolution

- `p_supplier_id` given → used as-is (existence checked).
- else `fn_resolve_supplier(p_supplier_name, NULL, NOT p_dry_run)`.

`p_create` is tied to `p_dry_run`: the **preview never creates a supplier, never
learns an alias, never bumps a counter**. Only the commit call does. Without
this, clicking "preview" on a misspelled name would fork the supplier before the
human ever confirmed — the exact failure `aac8cecb` was opened for.

`fn_resolve_supplier` is called, never reimplemented or copied.

### 3.5 What is never invented

`conversion_factor` is written **only** when the caller supplied it and it is
`> 0`. Absent → the column stays `NULL`, the row is counted in `pack_unknown`,
and it surfaces in `v_catalog_pack_missing`.

Migration 388 removed the `COALESCE(conversion_factor, 1)` that priced a 5 kg
sack as if it were one base unit (68 of 296 view rows carried an invented unit
price). An importer that defaults the factor to 1 re-introduces exactly that.
This is the single most important line in the spec.

Where `package_qty` + `package_unit` are supplied and `package_unit` equals the
linked item's `base_unit`, `conversion_factor` **may** be derived as
`package_qty` — that is arithmetic on two facts the supplier stated, not an
assumption. Where the units differ (`bag` vs `kg`), nothing is derived.

### 3.6 Linking

- `nomenclature_id` supplied by the caller → used, after checking the item exists
  and is not deleted.
- Otherwise, on **insert**, an exact barcode match against `sku.barcode` links
  the row (a shared barcode is proof, the same rule `fn_suggest_catalog_matches`
  already uses with score 1.0).
- No name-similarity auto-linking. A guessed link is a wrong number in the Price
  Book; the matching queue exists to have a human decide.
- On **update**, an existing `nomenclature_id` is never overwritten with NULL and
  never re-guessed.
- `match_reviewed_at` is never cleared by an import: a human's "not ours" verdict
  survives the next price list.

### 3.7 Return payload

```jsonc
{
  "ok": true,
  "dry_run": false,
  "supplier_id": "…",
  "supplier_created": false,
  "source": "pricelist",
  "received": 612,
  "inserted": 74,
  "updated": 531,
  "skipped": 7,                    // rejected rows, detailed in errors[]
  "duplicates_in_payload": 3,
  "unlinked": 402,                 // landed with nomenclature_id IS NULL
  "pack_unknown": 388,             // landed with conversion_factor IS NULL
  "linked_by_barcode": 12,
  "errors": [ {"row": 41, "name": "…", "reason": "no name and no barcode"} ]
}
```

`inserted` and `updated` are separate because that is the CEO's only signal that
a 600-line list parsed correctly: 600 received / 4 updated means the parse or the
supplier is wrong, and it must not pass quietly. `errors[]` is capped at 50
entries with an `errors_truncated` count, so a badly mapped column does not
return a 600-element array.

### 3.8 Authorization

`SECURITY DEFINER`, `SET search_path = public`, in-handler guard:

```sql
IF auth.uid() IS NOT NULL THEN
  IF NOT fn_has_app_role(ARRAY['owner','task_manager']) THEN  -> refuse
ELSIF current_user NOT IN ('service_role','postgres') THEN     -> refuse
END IF;
```

Rationale: the admin UI arrives as `authenticated` with a `staff.app_role`, so
`fn_has_app_role` (already in prod) is the right gate — this is stricter than
migs 389's functions, which only check `auth.uid() IS NOT NULL`. The MCP
scraper arrives as `service_role`, where `auth.uid()` is NULL by definition; the
guard used in mig 389 would reject it outright, which is why that clause exists
here. Direct `postgres` is what a migration test runs as.

`GRANT EXECUTE … TO authenticated, service_role`. `REVOKE … FROM anon`.

The function returns `{ok:false, error:…}` rather than raising, matching
`fn_link_catalog_row` / `fn_set_catalog_pack`. Per-row failures never abort the
batch: a bad row lands in `errors[]` and the other 599 still import.

---

## 4. `source` — 41 values collapsed to 5, with provenance kept

### 4.1 Vocabulary

`quote | receipt | scrape | pricelist | manual` — mig 388's `source_family`
plus `pricelist`, enforced by a CHECK constraint.

### 4.2 Provenance is not lost

New column `supplier_catalog.source_detail text`. The free text moves there
(`makro_pro_scrape_2026-07-23`, `fruitbound_wholesale_2026-07-21`, …) and
`source` becomes the classification. Nothing is thrown away.

### 4.3 Backfill, verified against prod before writing the migration

Ladder = mig 388's, with one `pricelist` branch inserted after `receipt`:

| new `source` | rows | old distinct values |
|---|---:|---:|
| pricelist | 710 | 2 |
| receipt | 224 | 3 |
| scrape | 174 | 25 |
| manual | 159 | 8 |
| quote | 111 | 3 |

1378 rows, 41 → **5**. Acceptance criterion 6 satisfied by construction.

### 4.4 The one place the ladder would contradict itself — proposed deviation

After the backfill, `v_price_comparison`'s ILIKE ladder maps
`source = 'pricelist'` to `source_family = 'manual'` (it has no pricelist
branch). 710 rows — over half the table — would then be labelled "manual" in the
Price Book when they came from a supplier's own price list. That is a
contradiction, and the addendum asked for redundancy.

The packet forbids changing `v_price_comparison`'s behaviour. **Proposed minimal
deviation, flagged for the reviewer rather than taken silently:** wrap the
existing ladder instead of editing it —

```sql
CASE WHEN r.source IN ('quote','receipt','scrape','pricelist','manual')
     THEN r.source
     ELSE <the mig 388 ladder, verbatim>
END AS source_family
```

The ladder is preserved character-for-character as the fallback; the constrained
vocabulary simply becomes authoritative when present. No column is added,
removed, or reordered, and `unit_cost` / `pack_known` are untouched.

**If the reviewer prefers zero changes to that view**, the fallback is to ship
the vocabulary without `pricelist` (4 values) and file the mislabel as a
follow-up. Say which; do not assume.

---

## 5. Front-ends

| Front-end | This task? | Notes |
|---|---|---|
| Paste a table (TSV/CSV) | **yes** | the fast path — copy out of LINE/WhatsApp and paste |
| CSV file upload | **yes** | same parser, file reader instead of clipboard |
| Single-item add | **yes** (folded in from `2c9d0906`) | one-row form → the same RPC |
| PDF / photo price list | **no — deferred** | reuse the Catalog Inbox + digitize runbook specced as Phase C/F of `6df2f888`. Building a second uploader here would be the duplication the sequencing task explicitly warned about. When it is built, it parses to the same jsonb and calls this RPC. |
| Makro / LINE / Tops scrapers | **partly** — see §6 | |

Deferring PDF/photo is the one place this spec does not fully close Q1 in a
single task. Flagged, not hidden: the sink is built so the vision path is a
caller and not a rewrite, and the Catalog Inbox is already scoped elsewhere.

### Parser (pure, unit-tested, no DB)

Lives in `apps/admin-panel/src/types/catalogImport.ts` — repo convention is pure
logic + `*.test.ts` under `types/` (`stockSheet.ts`, `shopping.ts`,
`catalogMatch.ts`). The packet suggested the hook; the hook stays thin and only
calls the RPC.

Must handle, with a test each:
- Tab-separated (clipboard from Sheets/LINE) and comma-separated
- Thai **and** English headers (`ชื่อสินค้า`/`name`, `ราคา`/`price`, `บาร์โค้ด`/`barcode`, `ขนาด`/`size`)
- `฿1,234.50`, `1 234,50`, `฿ 320`, `320.-` → 320
- Blank rows, trailing whitespace, a header row that is not row 1
- Duplicate SKUs within the paste
- A pack cell like `5 kg` / `500g` / `12x1L` → `package_qty` + `package_unit`;
  anything it cannot parse confidently yields **no** pack size rather than a guess

Column mapping is auto-detected from headers and **editable by the user** before
preview — auto-detection that cannot be corrected is how a price column becomes a
weight column silently.

---

## 6. Scrapers — what was actually found

The CEO decision said the scrapers bypass everything and should be rewired. The
audit is narrower than the packet assumed, and the difference matters:

| Tool | Writes to `supplier_catalog`? |
|---|---|
| `update-tops-prices.ts` | **yes** — `.delete()` then `.insert()`, plus its own `suppliers` insert |
| `search-makro-catalog.ts` | no — read-only search |
| `search-line-catalog.ts` | no |
| `search-sangdamrong-catalog.ts` | no |
| `search-homepro-catalog.ts` | no |
| `search-tops-catalog.ts` | no (fetch layer only) |

So the rewiring is **one tool**, and it is worth doing for reasons beyond
consistency:

1. `ensureTopsSupplier()` inserts into `suppliers` directly — the exact pattern
   `fn_resolve_supplier` exists to stop (Makro ×3, HomePro ×3).
2. **Delete-then-insert destroys human work.** Every Tops sweep deletes the
   supplier's rows by barcode and re-inserts them, discarding `conversion_factor`
   and `package_qty` a human entered via `fn_set_catalog_pack`, and
   `match_reviewed_at` — a "not ours" verdict — set via `fn_dismiss_catalog_row`.
   Migrations 388 and 389 shipped those surfaces two days ago; the next sweep
   would quietly wipe them.
3. It writes `source: 'tops'`, which the new CHECK constraint would reject —
   so it must change regardless, and should change to a merge, not a
   re-insert.

Change: `updateTopsPrices` maps its rows to the payload shape and calls the RPC
with `p_supplier_name: 'Tops'`, `p_source: 'scrape'`,
`p_source_detail: 'tops_sweep_<date>'`. `ensureTopsSupplier` and the delete/insert
block are removed; `dry_run` maps to `p_dry_run`. Its existing tests
(`update-tops-prices.test.ts`) cover `barcodeVariants` and `buildRows`, both of
which survive.

---

## 7. Admin UI

Route: `/procurement?tab=suppliers` → expand a supplier → **Import catalog**.

`SupplierManager.tsx` is display-only today; it gains a mount point only. New
component `CatalogImportPanel.tsx` in the expanded supplier detail, next to the
existing "Sells N catalogued products" panel.

Flow:

1. **Input** — paste box, or drop/choose a `.csv`/`.tsv` file, or "Add one item"
   (a single-row form using the same shape).
2. **Mapping** — detected columns shown as dropdowns, user-correctable.
3. **Preview** — the RPC with `p_dry_run = true`. A table with a per-row status:
   `new` / `update` / `cannot parse`, plus three counters stated plainly:
   *N will link to an item we stock · N will land unlinked · N have no pack size
   and cannot be price-compared.* The third counter is not a warning to be
   dismissed; it is the honest description of what is about to be stored.
4. **Commit** — the same call with `p_dry_run = false`. Result counts shown:
   inserted / updated / skipped, and a link to the matching queue for the
   unlinked ones.

Styling matches the surrounding file (`--s-1`/`--line` surfaces, `cream`,
`forest-soft`, `brick-*`), not the `.shk-*` primitives — the admin panel has not
been migrated to the brand DS yet and mixing the two mid-page would look broken.
Noted as a deliberate deviation from the packet's DS line.

---

## 8. Migration

**Number: `393_supplier_catalog_ingest.sql`.** Prod `migration_log` max is 392
(390 is claimed twice, by `390_rls_role_gating_mc_tables` and
`390_mango_canonicalization_and_peanut_removal`, then 391 and 392) — the packet's
387 and the addendum's 390 are both stale. Re-verified immediately before the
file is written.

Contents, in order:

1. `ALTER TABLE supplier_catalog ADD COLUMN source_detail text`
2. Backfill: `source_detail := source`, then `source := <ladder>` (§4.3)
3. `ALTER TABLE … ADD CONSTRAINT supplier_catalog_source_check CHECK (source IN (…))` — validated, not `NOT VALID` (backfill runs first, so it holds; a `NOT VALID` check would still block later UPDATEs of untouched rows — see `gotcha_not_valid_constraint_blocks_edits`)
4. `CREATE OR REPLACE FUNCTION fn_import_supplier_catalog(…)`
5. Grants / revokes
6. §4.4 wrapper on `v_price_comparison.source_family` — **only if the reviewer approves the deviation**
7. `migration_log` self-registration
8. DOWN block (commented, per repo convention)

Not touched: `fn_record_supplier_quote`, `fn_set_canonical_cost`,
`v_price_comparison_summary`, migrations 375–392, the orphan queue,
`v_catalog_health`, `useSupplierMapping.ts`, anything under `PODetail*` /
`POLineEditor*` / `ReconciliationPanel*` / `StockRequestsPanel*`.

**Contract check:** `node scripts/contract-check.mjs` green before and after. The
migration touches `supplier_catalog` and admin-only views; `menu_public`,
`nomenclature_tags`, `site_content`, `menu_modifiers` and `price_tiers` are not
referenced, and nothing here writes to `nomenclature`.

---

## 9. Acceptance criteria

From the packet (1–10) and the addendum (11–13), plus two this spec adds.

1. `SELECT proname FROM pg_proc WHERE proname='fn_import_supplier_catalog'` → 1 row.
2. A 3-row fixture against a supplier that does not exist creates it via
   `fn_resolve_supplier` and returns `{ok:true, inserted:3}`; `SELECT count(*)
   FROM suppliers WHERE name ILIKE '<fixture>%'` = 1.
3. Re-running the identical import returns `{inserted:0, updated:3}` and the row
   count is unchanged.
4. A fixture row matching nothing in nomenclature imports with
   `nomenclature_id IS NULL`.
5. A row with no pack size lands with `conversion_factor IS NULL` (not 1) and is
   counted in `pack_unknown`.
6. `SELECT count(DISTINCT source) FROM supplier_catalog` ≤ 5 (from 41).
7. `npm run build` = full `tsc -b && vite build`; lint clean.
8. Parser tests: Thai + English headers, `฿`/comma numbers, blank rows,
   duplicate SKUs — green.
9. PR carries a live Vercel preview link + what to click.
10. `migration_log` row for 393 with `status='success'`; `vault/Database/Migrations.md` updated.
11. A pack-less fixture row appears in `v_catalog_pack_missing`, and
    `SELECT count(*) FROM v_price_comparison WHERE unit_cost IS NOT NULL AND pack_known = false` is still **0**.
12. An unmatched fixture row appears in `v_catalog_match_queue`; no `RAW-AUTO`
    nomenclature row is created.
13. `p_dry_run = true` leaves `count(*) FROM suppliers` and
    `SUM(times_applied) FROM supplier_aliases` unchanged.
14. **New —** importing a row whose `match_reviewed_at` is already set does not
    clear it, and importing over a row with a human-set `conversion_factor` does
    not blank it.
15. **New —** `update_tops_prices --dry_run` returns the same shape as before the
    rewire, and a real sweep no longer deletes rows (row count for the Tops
    supplier is non-decreasing).

Criteria 2–5 and 11–14 are proven against a **temporary fixture supplier on
prod, cleaned up in the same session**, since there is no staging DB. The
fixture supplier name is prefixed `ZZ-TEST-` and deleted after; the evidence
(actual JSON returned) goes in the closing MC comment.

---

## 10. Carried-forward risk from the previous session

Migrations 387–389 shipped RPC guards that were verified only as "the function
exists, `authenticated` can execute it, the auth guard refuses under
service-role". **None was exercised under a real browser session** — `auth.uid()`
is NULL from service-role, so every call stopped at the guard before reaching its
logic. Unverified in practice: draft delete, archive/unarchive,
`fn_link_catalog_row`, `fn_dismiss_catalog_row`, `fn_set_catalog_pack`.

This spec's UI work lands on the same preview. The five minutes to click those
through will be spent while verifying the import panel, and what was actually
observed will be reported — not inherited silently.

---

## 11. What needs a CEO / reviewer answer before code

1. **§4.4** — approve the `source_family` wrapper on `v_price_comparison`
   (preserves the mig-388 ladder verbatim as a fallback), or drop `pricelist`
   from the vocabulary and let 710 price-list rows read as "manual"?
2. **§5** — PDF/photo deferred to the Catalog Inbox (Phase C/F of `6df2f888`)
   rather than built here. Confirm that is the right split, or say it must ship
   in this task.

Everything else in this spec is a direct consequence of decisions already
recorded on the MC task.
