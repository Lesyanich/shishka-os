# Spec — Product links & photos: from stored-but-invisible to usable

> Status: **spec, unbuilt**. Authored 2026-07-29 by the procurement agent from a live prod audit.
> Owner epic: `Procurement & Inventory — connected stock model` (`8b709aa0`).
> Origin: CEO, 2026-07-29 — *"I want to open the supplier's page and see the photo, especially while building an order."*
> Measurements below were taken against prod on 2026-07-29 and will drift — re-measure before quoting them.

---

## 1. What the schema already gives us

The data model is **not** the problem, and needs no redesign.

`supplier_catalog` is the `(supplier × product)` junction table. A link stored there is therefore already scoped per-supplier-per-product, which is exactly what is wanted: the same bread carries a different URL on each channel.

| Column | Holds | Scope |
|---|---|---|
| `supplier_catalog.external_url` | product page at that supplier | supplier × product |
| `supplier_catalog.image_url` | product photo at that supplier | supplier × product |
| `suppliers.website` | storefront root | supplier |
| `nomenclature.image_url` | our own item photo | product |

Worked example — one loaf, three live links, all present in prod today:

| Row | `external_url` |
|---|---|
| Cubic Bread (LINE) | `shop.line.me/@rsp7183n/product/320134147` |
| Tops | `tops.co.th/en/cubic-original-wheat-loafc-8858894100014` |
| Makro | `makro.pro/en/c/search?q=8858894100014` |

A secondary benefit the CEO called out: writing the link on the same row as the price is also the cheapest thing for a scraper to maintain — it already holds the URL at the moment it reads the price.

---

## 2. The gaps

### GAP-1 — No admin surface reads either column *(the blocking one)*

```
grep -rn "external_url\|image_url" apps/admin-panel/src   # → zero hits for the catalog columns
```

Not in `PriceBookTable.tsx`, not in the order builder, not in `CatalogMatchQueue.tsx`. Every stored link and photo is unreachable from the UI. The **only** consumer anywhere in the repo is the generated PDF shopping list, `services/mcp-chef/src/tools/makro-shopping-list.ts:245`.

Consequence: filling the columns in has no visible effect until this is fixed, so GAP-1 gates everything else in this document.

### GAP-2 — Coverage is near-zero

| | rows | share |
|---|---|---|
| `supplier_catalog` total | 1431 | — |
| with `external_url` | 172 | **12.0%** |
| with `image_url` | 41 | **2.9%** |

Per item type (active items only):

| type | items | ever purchased | item has a catalog URL | item has a catalog photo | `nomenclature.image_url` |
|---|---|---|---|---|---|
| `raw_ingredient` | 354 | 230 | 47 | 2 | 7 |
| `good` | 242 | 235 | 8 | 1 | 0 |
| `semi_finished` | 107 | 1 | 0 | 0 | 4 |
| `dish` | 175 | — | — | — | 121 |
| `modifier` | 41 | — | — | — | 0 |

Dishes are well covered because the menu had its own photo pipeline. Everything we *buy* is not.

### GAP-3 — Only one writer populates links

`services/mcp-chef/src/tools/update-tops-prices.ts:100` is the sole code path that writes `external_url`. The Makro, LINE, HomePro and Sangdamrong scrapers all discard the product URL they already hold, which is the direct cause of GAP-2.

### GAP-4 — No manual entry path

There is no way to paste a URL for a product by hand. `fn_record_supplier_quote` (mig 318) does not accept one, and no form exposes the field. A human who simply *has* the link cannot give it to the system.

### GAP-5 — Link freshness has no owner

Nothing validates a stored URL, ever. `verified_at` records when the **price** was last seen, not whether the link still resolves, so a delisted product page sits in the table indefinitely and the "open product page" button will quietly 404 at the worst moment — mid-order.

### GAP-6 — Identity columns are collected then dropped by the views

`v_price_comparison` selects none of `brand`, `package_weight`, `package_qty`, `package_unit`, `barcode`, `image_url`, `external_url`, `category_code`. Tracked in full on MC `25a0d5c8`; repeated here because links and photos are two of the dropped columns.

---

## 3. Target state

### 3.1 Surfaces (CEO-specified — all three)

| Surface | Where | What to show |
|---|---|---|
| **Procurement** | Price Book supplier rows, order builder lines, catalog match queue | thumbnail + "open at supplier ↗" per supplier row. This is the ordering moment: the CEO decides quantity while looking at the pack. |
| **BOM** | `pages/BOMHub.tsx`, `components/bom/*` | thumbnail on each ingredient line, so a BOM is recognisable at a glance instead of being a list of names. |
| **Menu** | `components/menu/*` | thumbnail on ingredient/composition rows. Dish photos already exist (`nomenclature.image_url`, 121 of 175); this is about the *ingredients* behind the dish. |

### 3.2 Photo resolution order

An item may have our own photo, or only a supplier's. Resolve in this order and never silently show a supplier photo as if it were ours:

1. `nomenclature.image_url` — our own photo, wins when present
2. freshest `supplier_catalog.image_url` for that item — label it as the supplier's
3. no photo — render a neutral placeholder, never a broken `<img>`

### 3.3 Write rules

1. **Every supplier, not just Tops.** Any parser that has a product URL persists `external_url` on the same write as the price. Same for `image_url` where the source exposes one.
2. **Refresh on every run.** A price refresh rewrites the link. It is free — the scraper already has it — and it is what keeps a renamed or reslugged URL alive.
3. **Manual paste must work.** A human pastes a URL into the item's supplier row and it is stored. No scraper required, no ceremony. This is explicitly wanted: *"I can just throw the link in by hand, it should record it."*
4. **A dead link is a signal, not a nuisance.** If a refresh finds the product page 404s, do not just blank the field — record it. A delisted SKU is stock intelligence and belongs on the same surface that shows availability.

### 3.4 Backfill scope

Do **not** sweep all 1431 rows. Scope to what we actually buy:

- **465 items** have at least one `purchase_logs` row (230 `raw_ingredient` + 235 `good`).
- Of those, ~55 currently carry a link.
- Makro first — it is the highest-volume supplier and `search_makro_catalog` already returns `product_url` and `image_url`, so the backfill is a re-run of an existing scraper, not new work.

Everything outside that set gets filled opportunistically, as products are touched.

---

## 4. Implementation notes

**`assets.tops.co.th` returns 403 to server-side requests.** Cloudflare, and a browser UA + referer does not defeat it (verified with curl 2026-07-29). The same URL renders fine in a real browser (confirmed, 800×800). Therefore Tops thumbnails must be plain client-side `<img>` tags — any server-side proxy, prefetch or image-optimisation pass over Tops URLs will fail. `obs-ect.line-scdn.net` (LINE) and `images.mango-prod.siammakro.cloud` (Makro) both answer 200 server-side and are safe either way.

**Write through `fn_import_supplier_catalog`** (migration 394, applied 2026-07-29) rather than raw INSERT. Note that the same migration constrained `source` to `quote|receipt|scrape|pricelist|manual` and moved free text to `source_detail` — a backfill that writes a legacy free-text source will now be rejected by `supplier_catalog_source_check`.

**Reference fixture already in prod.** `WHERE brand = 'CUBIC'` returns 52 rows across 4 suppliers (Cubic Bread LINE, Tops, Makro, Gourmet Market), every row with `external_url` and 37 with `image_url` — a ready-made multi-supplier, multi-channel test case for all three surfaces.

---

## 5. Related

- MC `25a0d5c8` — Price Book: no weight normalisation; brand/pack/barcode/photo stored but never rendered (GAP-1, GAP-6). Carries a detailed addendum comment on links and photos.
- MC `31c5715e` — procurement epic sequencing; this spec belongs after W1 (stop showing wrong numbers) and alongside W3 (repair existing rows).
- `docs/projects/admin/plans/spec-procurement-v2-mint-handoff.md` — Phases A–F; the supplier hub in Phase C is the natural home for the per-supplier link.
- `docs/constitution/technical-rules.md` § RULE-CATALOG-LANDS-IN-DB.
