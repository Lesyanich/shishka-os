# Lazada Email Parser

One-shot pipeline that turns Gmail Lazada order-confirmation emails into
`fn_approve_receipt` payloads, so RAW ingredients bought on Lazada (e.g.
`RAW-ZAATAR`) get a non-zero `cost_per_unit`.

Built for MC task `e39dcf23` (Lazada food import — za'atar + 1-3 month backfill).

---

## Why this exists

- Some ingredients are bought on Lazada through a personal account
  (`basalsaleem@gmail.com` — Bas's Gmail, not `lesia@shishka.health`). No
  Gmail MCP is connected.
- Building Gmail/IMAP integration for what may be a low-volume supplier is
  speculative. Instead, the receipt-owner runs a one-time Google Takeout
  export filtered to the `Lazada` Gmail label, drops the resulting `.mbox`
  somewhere the agent can read it, and this script does the rest.
- For the long term, see "When to upgrade to automation" at the bottom.

---

## End-to-end flow

**Two export paths, pick one.** Option A is recommended — no Takeout, tight
filter that excludes Alibaba/promo noise, and it extracts product photos.
Option B (Takeout) is a fallback for the rare case where Apps Script is
blocked on the account.

**Account, either path**: log in as the Gmail account that *actually receives
Lazada order emails*. For Shishka today that is **`basalsaleem@gmail.com`**
(Bas's personal Gmail), NOT `lesia@shishka.health`.

---

### Option A — Google Apps Script (recommended)

**One-time setup (~5 min):**

1. Open https://script.google.com (signed into Bas's account) → **New project**.
2. Replace the default `Code.gs` contents with [`gmail-export.gs`](gmail-export.gs)
   from this folder. Save (⌘-S). Name the project "Lazada Exporter".
3. Click **Run** → `exportLazadaOrders`. First run prompts for permission to
   read Gmail + write to Drive — accept.
4. When the run finishes (1-3 min for 100s of orders), the **Execution log**
   (View → Logs) prints a Drive folder URL like
   `https://drive.google.com/drive/folders/<id>`.
5. Open that folder in Drive → right-click → **Share** → add
   `lesia@shishka.health` (and `agent@…` if applicable). Paste the folder URL
   as a comment on MC task `e39dcf23`.

**Why this is better than Takeout:**
- Tight filter: only emails from `@lazada.co.th` / `@my.lazada.co.th` etc.
  that contain a 16+ digit order ID in subject or body. Skips Alibaba (different
  domain), shipping pings, review nags, and promos automatically.
- Extracts inline product photos (`images/<order_id>_<n>.jpg`) for later
  linking to `nomenclature.image_url` (parked as separate task).
- No permission to your full mailbox — only Gmail readonly + Drive write.
- Re-runnable: each invocation creates a fresh timestamped folder.

**Folder layout produced:**
```
Lazada-export-<YYYY-MM-DD_HHMM>/
  orders/<order_id>_<msgIdPrefix>.html   -- full email HTML per order
  images/<order_id>_<n>.<ext>            -- every inline product image
  index.json                             -- metadata: order_id, slug, images, date
```

**Agent picks up from there.** Once you paste the folder URL on the MC task,
the agent reads it through the Drive MCP and continues with the parsing
pipeline below — no further action needed from you for the import itself.

---

### Option B — Google Takeout (fallback, when Apps Script doesn't work)

Only use this path if you can't run Apps Script (e.g. domain admin disabled
it). Slower, captures everything matching a label, and misses inline images.

1. In Gmail (signed into Bas's account), search:
   ```
   from:(@lazada.co.th OR @my.lazada.co.th OR @mail.lazada.co.th) newer_than:120d
   ```
2. "Show search options" → **Create filter** → **Apply the label** `Lazada` →
   tick **Also apply filter to matching conversations** → **Create filter**.
3. Go to https://takeout.google.com.
4. **Deselect all** → tick **Mail** only.
5. **All Mail data included** → **Include selected labels only** → tick
   `Lazada` → **OK**.
6. Delivery: **Add to Drive**, **Export once**, **.zip** format.
7. **Create export**. Google emails a Drive link in 5-20 min.
8. Move the resulting archive into a GDrive folder named
   `Inbox/Lazada-export-<YYYY-MM-DD>/` and paste the URL on MC task `e39dcf23`.

---

### Step 3 — Agent: convert export to the parser's input format

For **Option A** (GAS folder, locally downloaded):
```sh
python from_gas.py /path/to/Lazada-export-2026-05-18_1430
# → extracted/<order_id>.{json,html}
```

For **Option B** (Takeout `.mbox`):
```sh
python extract.py /path/to/All\ mail\ Including\ Spam\ and\ Trash.mbox
# → extracted/<order_id>.{json,html}
```

Both scripts produce the same `extracted/` layout. Order ID is auto-discovered
(16+ digit number); falls back to a hash-derived UID when missing.

### Step 4 — Agent: run parse.py

DB URL comes from macOS Keychain:

```sh
export DATABASE_URL="$(security find-generic-password -s 'shishka-database-url' -w)"
python parse.py            # full run with nomenclature matching
# OR
python parse.py --skip-db  # skip DB, drop everything to unmatched.csv
```

Outputs (all gitignored):
- `payloads/<order_id>.json` — one `fn_approve_receipt` payload per order
- `unmatched.csv` — items whose name didn't map to existing nomenclature
- `summary.md` — order count, totals, warnings table

### Step 5 — Review and apply

1. Open `summary.md` and scan for warnings (especially `amount_original=0`,
   `no items extracted`).
2. For each payload, eyeball food vs non-food, fix `quantity` units (Lazada
   sells za'atar in 100g/250g packs, not kg).
3. For items in `unmatched.csv`:
   - **food** → either map to an existing nomenclature manually OR let
     `fn_approve_receipt` auto-create a `RAW-AUTO-<hash>` row (set
     `nomenclature_id: null` in the payload).
   - **non-food** → move from `food_items` to `opex_items` in the payload.
4. For each approved payload:
   ```sh
   psql "$DATABASE_URL" -c "SELECT fn_approve_receipt('$(cat payloads/<id>.json)'::jsonb);"
   ```
   Or run via Supabase MCP `execute_sql` with the same RPC call.

The function is atomic: failure rolls back. WAC trigger
`fn_update_cost_on_purchase` auto-fires on each `purchase_logs` insert.

### Step 6 — Verify

```sql
-- RAW-ZAATAR now has a cost
select id, product_code, base_unit, cost_per_unit
from nomenclature
where id = '96f3081a-40d7-4a11-855a-9a5cbfb479f3';

-- All Lazada food purchases
select n.product_code, n.cost_per_unit, count(pl.id) as purchases
from nomenclature n
join purchase_logs pl on pl.nomenclature_id = n.id
join suppliers s on s.id = pl.supplier_id
where s.name = 'Lazada'
group by 1, 2
order by 3 desc;
```

---

## Critical gotchas (from `agents/finance/guidelines/lazada.md`)

1. **Per-shop shipping.** Lazada bills shipping per shop, not per order. The
   parser sums every `Shipping Fee` / `ค่าจัดส่ง` occurrence into `delivery_fee`.
2. **VAT 7% is inclusive.** Lazada prices include VAT. `vat_amount` is
   *extracted* via `amount × 7 / 107`, never added on top.
3. **Pack size ≠ base unit.** RAW-ZAATAR `base_unit = kg`, but Lazada sells in
   pack (100 g, 250 g, …). For the price-per-kg roll-up to work, the
   `supplier_catalog` row for `(Lazada, za'atar)` must carry
   `conversion_factor` (= kg per pack). Without it, `fn_approve_receipt`
   stores raw per-pack price, and the WAC trigger sets `cost_per_unit` in
   pack units — wrong.
4. **One Lazada order = one receipt payload** even with multiple shops. Shop
   names are metadata; `supplier_id = Lazada` regardless.
5. **`fn_update_cost_on_purchase` is *last-in*, not WAC.** Process orders in
   chronological order so the most recent price wins.

---

## Skeleton parts that need real samples

`parse.py::extract_line_items` returns `[]` today. Lazada email HTML structure
isn't public — once the first real `.mbox` arrives, open one `extracted/<id>.html`
in a browser, find the repeating item block, and replace the function body with
a `BeautifulSoup` selector. The rest of the pipeline (totals, shipping,
discount, VAT, payload shape) is already in place and tested against the
`fn_approve_receipt` signature in
`services/supabase/migrations/049_supplier_catalog.sql:259`.

---

## Product photos — current state

The Apps Script saves every inline product image from each order email into
`images/<order_id>_<n>.<ext>` inside the export folder, plus the filenames
into `index.json`. That solves the export side.

The *import* side — uploading each photo to Supabase Storage and writing the
URL onto a `nomenclature` row — is parked as a separate MC task (search
MC for `Lazada product photos → nomenclature`). The wiring depends on which
photo column nomenclature uses (verify against the post-merge schema) and
how the admin-panel MagicDropzone photo upload Edge Function is structured.

---

## When to upgrade further

This manual flow is right for: ≤ 1 Lazada order / week, one-off historic backfill.

Upgrade to a Gmail OAuth daemon or Gmail MCP (if one ships) when:
- ≥ 1 Lazada order / week sustained for 4 weeks, AND
- The Apps Script "re-run + share folder" step starts feeling like friction.

There is a parked MC task for this — search MC for `Lazada email auto-ingest`.

---

## Files

- `gmail-export.gs` — Google Apps Script, runs in Bas's Gmail account, writes a Drive folder
- `from_gas.py` — GAS folder → `extracted/<uid>.{json,html}` (bridge to parse.py)
- `extract.py` — `.mbox` → `extracted/<uid>.{json,html}` (Takeout fallback path)
- `parse.py` — `extracted/` → `payloads/` + `unmatched.csv` + `summary.md`
- `requirements.txt` — `beautifulsoup4`, `psycopg`
- `.gitignore` — keeps export artefacts out of git
