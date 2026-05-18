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

### Step 1 — tag Lazada emails in Gmail (~3 min, one-time)

**Which account?** The Gmail account that *actually receives the Lazada order
confirmations*. For Shishka today that is `basalsaleem@gmail.com` (Bas's
personal Gmail — Lazada purchases for the business go through this account),
**not** `lesia@shishka.health`. If Bas doesn't run Steps 1-2 personally,
Lesia needs to be signed into Bas's Gmail in a browser for this and the
Takeout export.

1. Open Gmail (signed in to the *purchase* account) → search bar → paste:
   ```
   from:(noreply@lazada.co.th OR tracking@lazada.co.th OR no-reply@mail.lazada.co.th) newer_than:90d
   ```
2. Click the "Show search options" arrow → **Create filter**.
3. Tick **Apply the label** → choose/create a label called `Lazada` → tick
   **Also apply filter to matching conversations** → **Create filter**.

Every historic Lazada order in the last 90 days is now under the `Lazada` label,
and any new Lazada email will be auto-labelled.

### Step 2 — CEO: export the label via Google Takeout (~5-15 min)

1. Go to https://takeout.google.com.
2. Click **Deselect all** → scroll down → tick **Mail** only.
3. Click **All Mail data included** → switch to **Include selected labels only**
   → tick `Lazada` → **OK**.
4. **Next step** → delivery method **Add to Drive** → frequency **Export once**
   → file type **.zip** (Google still returns a `.mbox` inside).
5. **Create export**. Google emails a Drive link in 5-20 min depending on volume.
6. Move the resulting archive into a GDrive folder like `Inbox/Lazada-export-<YYYY-MM-DD>/`
   and paste the folder URL into the MC task `e39dcf23` as a comment.

### Step 3 — Agent: run extract.py

```sh
cd tools/lazada-parser
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python extract.py /path/to/All\ mail\ Including\ Spam\ and\ Trash.mbox
# → extracted/<order_id>.json + extracted/<order_id>.html
```

The script filters to Lazada `From:` addresses and dumps each message's plain
body + HTML body + metadata. Order ID is auto-discovered (16+ digit number);
falls back to a hash-derived UID when missing.

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

## When to upgrade to automation

This manual flow is right for: ≤ 1 Lazada order / week, one-off historic backfill.

Upgrade to a Google Apps Script + GDrive watcher (or a proper Gmail OAuth
integration) when:
- ≥ 1 Lazada order / week sustained for 4 weeks, AND
- CEO complains about the Takeout step.

There is a parked MC task for this — search MC for `Lazada email auto-ingest`.

---

## Files

- `extract.py` — `.mbox` → `extracted/<uid>.{json,html}`
- `parse.py` — `extracted/` → `payloads/` + `unmatched.csv` + `summary.md`
- `requirements.txt` — `beautifulsoup4`, `psycopg`
- `.gitignore` — keeps export artefacts out of git
