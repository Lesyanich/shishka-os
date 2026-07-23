# Spec: Procurement v2 — CEO↔Mint Order Workflow

> MC Task: 6df2f888-bbcf-4d20-8a51-cf15aa88d9da
> Status: **APPROVED by CEO 2026-07-23** (design preview v6, 7 screens, reviewed
> iteratively; all SOCRATIC-GATE questions answered — see §6).
> Implementation: NOT started — handed off to a fresh session (see §8).
> Author: coo session 2026-07-23 · Branch: claude/great-leavitt-c9d1a4
> Epic: procurement (8b709aa0 — "Procurement & Inventory — connected stock
> model (station-aware)"). CEO directive 2026-07-23: ALL procurement tasks
> and specs attach to this epic.
> Design preview: `docs/projects/admin/plans/preview-procurement-v2.html`

## 1. Goal

Both CEO **and** Mint (task_manager) create purchase orders and hand them to each
other. The receiver sees the order, quantities, cost, and supplier quick-links
(contacts, catalog files, digitized catalog with price-freshness date), can edit
qty/price/delivery time, executes the order, reports delivery, and checks the
received goods against the order.

Key clarification (CEO, 2026-07-23): the section must support **order building
from a categorized product catalog with price comparison** — not just manual
line entry — because Mint composes orders herself too.

## 2. What already exists (verified against code + prod DB, 2026-07-23)

| Piece | State |
|---|---|
| `/procurement` hub, 8 tabs, brand DS (`shk-*`), `minRole="task_manager"` | shipped, **untested** |
| PO lifecycle enum `draft→submitted→confirmed→shipped→partially_received→received→reconciled/cancelled` | in DB (`purchase_orders`, `po_lines`); **0 rows ever created** |
| Create PO: `fn_create_purchase_order` + `PurchaseOrderForm` (prefill from Stock/Requests) | shipped |
| PO detail: read-only lines, status advance, cancel (`PODetail.tsx`) | shipped — **no line editing** |
| Receiving: `/receive` ReceivingStation → `fn_pending_deliveries` / `fn_receive_goods` (qty received/rejected + reject reasons) | shipped |
| Reconcile & approve: `ReconciliationPanel` → `fn_approve_po` → expense_ledger + purchase_logs + sku_balances | shipped (irreversible; QA statically only) |
| Suppliers tab: inline-edit contacts, delivery days/window, lead time, min order, payment terms; lazy "sells N products" | shipped |
| Price Book: `v_price_comparison_summary` / `v_price_comparison` (best/worst/spread, `verified_at`), record quote, set canonical cost | shipped |
| `supplier_catalog`: ~1,470 rows and growing (parallel session import `supplier_price_list_2026-07`); has `external_url` (107), `image_url` (3), `verified_at`, `category_code`/`sub_category_code`, `product_name_th` | live |
| Storage buckets | no supplier-files bucket yet |

## 2.5 v1 usage audit & tab disposition (CEO directive 2026-07-23)

CEO: "он оказался не юзер-френдли, мы им ни разу не пользовались". Verified
against prod data: **0 purchase orders ever created, 0 stock requests ever
submitted, sku_balances last counted 2026-05-30** (stale ~2 months). Alive:
suppliers (80 rows, inline-edited) and supplier_catalog (~1,470 rows,
actively imported).

**Root cause of non-use:** v1 surfaced DB plumbing as 8 admin-grade table
tabs instead of the two real workflows (compose an order / execute an
order). Orders couldn't be edited after creation, there was no catalog to
pick from, no author/handoff signals, and the Stock tab sat behind a
passcode. v2 is workflow-first — that is the redesign's thesis.

| v1 tab | Verdict | Why |
|---|---|---|
| Purchase Orders | **KEEP — rebuilt** | Core of v2 (Order Desk + editable PO Detail); v1 create-only UX replaced |
| Suppliers | **KEEP — upgraded** | Data alive; becomes the links hub (§4.4) |
| Price Book | **KEEP — upgraded** | Data layer actively fed by imports; + supplier filter, freshness, thumbnails |
| Stock Requests | **KEEP concept — rebuilt** | 0 usage because no station/author/status loop; becomes Requests v2 (§4.7) |
| Shelf Life | **RELOCATE** | Product reference, not a procurement workflow; move to `/menu` (backlog task), remove tab here |
| Stock | **RETIRE here** | Superseded by connected-stock epic (station stock, other session); stale since May |
| Sheet Items | **RETIRE here** | Curation for the old stock-sheet model; parked with connected-stock |
| Quick Purchase | **RETIRE** | Already "legacy" in code; superseded by order → receipt → reconcile chain (§4.6) |

**v2 tab set (6):** Orders · Catalog · Requests · Suppliers · Price Book ·
Catalog Inbox. Legacy components are removed from tabs in Phase B; unreferenced
component files are deleted in the same PR (ShelfLifeEditor deletion waits for
the `/menu` relocation task). No data is dropped anywhere.

## 3. Gaps → scope

1. **PO editing** — after creation nobody can change qty/price/expected date.
   Mint must correct them during execution.
2. **Handoff signal** — no author display, no "new order for you" badge.
3. **Supplier links hub** — suppliers have phone/contact text but no LINE/website
   links, no catalog files (PDF/images), no deep link to the digitized catalog.
4. **Catalog order-builder** — no "browse by category → compare prices → add to
   order" flow; Price Book is analysis-only, Sheet-based PO form is manual.
5. **Receiving discoverability** — `/receive` not linked from PO detail.
6. **Nothing is tested end-to-end.**

## 4. Design (preview sent to CEO 2026-07-23)

Four surfaces, all inside the existing `/procurement` hub (tab set reshuffled):

1. **Order Desk** (replaces Purchase Orders tab layout) — orders grouped by
   stage: *Draft / Waiting (submitted) / In delivery (confirmed+shipped) / To
   receive / Done*. Card: PO number, supplier, author chip (Lesia/Mint), line
   count, total THB, expected date, "NEW" badge for orders submitted by the
   other person and not yet opened by me (localStorage seen-set; realtime
   already wired via `useCoalescedRealtimeRefetch`).
2. **Order Builder** (new tab `catalog`) — search + category chips (from
   `product_categories` of matched nomenclature; fallback supplier category
   codes), rows show item, unit, per-supplier price chips with freshness dot
   (`verified_at` age: green <30d, yellow <90d, red older/estimate), best price
   highlighted. `+` adds to cart at chosen supplier+price. Cart drawer groups
   lines by supplier → creates **one PO per supplier** via existing
   `fn_create_purchase_order`, prefills `unit_price_expected` from catalog.

   **Post-cart flow (CEO question 2026-07-23):** orders are created as
   `draft`s — nothing is handed off yet. After create: confirmation with the
   created PO list → navigate to Order Desk with the new drafts on top (a
   single order opens its detail directly). Drafts are fully editable
   (PO Detail v2) and invisible to the other party; each is handed off
   individually via its **Submit** button (draft → submitted → NEW badge for
   the receiver). If an open draft for the same supplier already exists, the
   cart offers "add lines to existing draft" instead of creating a second PO.
3. **PO Detail v2** — editable while status ∈ draft/submitted/confirmed:
   qty stepper, unit price, expected date+time, add/remove line (line picker =
   mini order-builder scoped to this supplier); supplier quick-links strip
   (call, LINE, **copy-order-as-text**, files, digitized catalog); **Copy
   order** puts a ready-to-paste message on the clipboard (PO number, delivery
   date/window, lines with qty + Thai name when present, total) so the order
   can be sent via LINE without retyping (CEO amendment 2026-07-23); status
   timeline (who/when); primary
   action per role/status; "Receive delivery" CTA → `/receive?po=<id>` when
   shipped; discrepancy summary after receiving (ordered vs received vs
   rejected per line) before Reconcile.
4. **Supplier Card v2** — contact block with tap-to-call `tel:`, LINE deep
   link, and **website link** opening in a new tab (CEO amendment 2026-07-23);
   **Files** block (upload PDF/photo of price lists to new private
   Storage bucket, list with title + upload date, open via signed URL);
   **Digitized catalog** link → Price Book pre-filtered by supplier showing
   items + `verified_at` freshness; delivery info as now.

5. **Catalog Inbox** (new tab, CEO addition 2026-07-23) — Mint uploads
   supplier catalogs (PDF / photos) from the admin, for an existing supplier
   or a **new** one (free-text name, find-or-create at digitize time). Upload
   creates a queue row: `new` (badge for CEO) → CEO reviews → CEO manually
   triggers Claude ("digitize catalogs") → Claude reads the files from
   Storage, parses them, inserts rows into `supplier_catalog` with
   `verified_at` = parse date and a per-file `source` tag → row becomes
   `digitized (+N items)` (or `rejected`). **No external/paid parsing APIs**
   — recognition runs only on the CEO's command, in batches.

   **Storage layers (aligned with the parallel catalog session, 2026-07-23):**
   - Supabase Storage `supplier-files` bucket = operational inbox (what Mint
     uploads via admin; RLS, signed URLs, statuses in DB).
   - Google Drive `01_Business/Suppliers/{Supplier}/` = long-term archive
     (existing convention). Digitize runbook archives a copy there after
     parsing — same pattern as finance `archive_receipt_gdrive`.
   - `supplier_catalog` (DB) = SSoT of digitized data (RULE-SUPABASE-SSOT).
   - `supplier-catalogs.md` (repo) = human-readable summary maintained by the
     catalog session; digitize runbook appends a pointer, never a data copy.

6. **Order ↔ Receipt ↔ Expense unification** (CEO addition 2026-07-23):
   - **Paid delivery in the order cost:** `purchase_orders` already carries
     `delivery_fee` / `discount_total` / `vat_amount` / `grand_total`, and
     `fn_approve_po` accepts them. PO Detail v2 exposes an editable
     **Delivery fee** row (Subtotal + Delivery − Discount + VAT = Grand
     total). Optional `suppliers.default_delivery_fee` prefills it.
   - **Attach receipt on the order:** after delivery, an "Attach receipt"
     button on PO Detail uploads the photo to the existing `receipts` bucket
     and creates a `receipt_inbox` row pre-linked via new
     `receipt_inbox.po_id`. The REGULAR finance pipeline parses it (no second
     pipeline); parsed actuals (prices, VAT, discount, delivery fee, invoice
     number) PRE-FILL the reconciliation screen.
   - **Single-writer rule (no double count):** `fn_approve_po` remains the
     only expense writer for PO purchases; the linked inbox row is closed
     with the same `expense_id` and excluded from the standalone receipt
     flow. Ad-hoc purchases without a PO keep the old inbox path unchanged.
   - Cross-links both ways: inbox row shows its PO number; the PO shows
     receipt thumbnails and, after reconcile, its expense.

7. **Department needs → orders** (CEO addition 2026-07-23): the existing
   `stock_requests` / `stock_request_lines` flow (Requests tab already feeds
   PO prefill) is the vehicle — extended, not duplicated. Any active staff
   submits needs from their station (mobile-friendly): "Kitchen: chicken
   2 kg", "Bar: oranges 3 kg". New: `requested_by` + `station_id` on the
   request, and `po_line_id` linkage on request lines, so the requester sees
   live status per line: requested → in PO-xxxx → shipped → delivered.
8. **Locations & delivery split** (CEO addition 2026-07-23): every PO line
   carries a `destination_station_id` (auto-inherited from the request;
   station = warehouse per the connected-stock model, station.floor = L1/L2);
   the order carries `deliver_to_station_id`. In the cart, when one
   supplier's lines target different destinations, the user picks:
   **Split into N orders** (one per destination — e.g. Makro delivers to
   both) OR **One order → one delivery point, internal transfer for the
   rest** (e.g. butcher with a ฿3,000 minimum). The existing
   `suppliers.min_order_thb` powers the guard: the split option warns when a
   partial order would fall below the supplier's minimum.
9. **Ordering role** (CEO addition 2026-07-23): new per-user toggle
   `staff.can_create_orders` — grants the ordering workflow (build cart,
   create/edit/submit POs, receive deliveries) WITHOUT the full task_manager
   tier. Example: a new chef orders for the kitchen himself. Managed from
   the User Management UI (coordinate with task 6e4b56bf). Submitting
   *requests* needs no toggle — open to all active staff. Mint (task_manager)
   keeps everything as before.
10. **Stock inflow contract** (CEO addition 2026-07-23): received lines feed
    stock per station — `fn_approve_po` already writes `sku_balances`; with
    per-line destination stations captured, the receiving chain passes
    `destination_station_id` through so the connected-stock epic (8b709aa0,
    other session) can post per-station inflow. The stock-control section
    itself is designed by that session — this spec only guarantees the data
    contract.

## 5. Implementation plan

### Phase A — DB migration (one file)
- `suppliers` + `line_id text`, `website text`, `default_delivery_fee numeric`.
- `purchase_orders` + `delivery_window text` (time window shown next to
  `expected_date`).
- `receipt_inbox` + `po_id uuid REFERENCES purchase_orders(id)` (receipt↔PO
  link; linked rows are excluded from the standalone receipt flow).
- `purchase_orders` + `deliver_to_station_id uuid REFERENCES stations(id)`;
  `po_lines` + `destination_station_id uuid REFERENCES stations(id)`
  (defaults to the order's deliver_to). ⚠ Depends on `stations` (station-stock
  S1, task 72950d62 / PR 479 — table already live in prod; coordinate).
- `stock_requests` + `requested_by uuid REFERENCES staff(id)`, `station_id
  uuid REFERENCES stations(id)`; `stock_request_lines` + `po_line_id uuid
  REFERENCES po_lines(id)` (need→order linkage drives requester-visible
  status).
- `staff` + `can_create_orders boolean NOT NULL DEFAULT false`.
- New table `supplier_files (id uuid pk, supplier_id fk NULLABLE,
  supplier_name_raw text — for new-supplier uploads, kind text check in
  ('pdf','image','link'), title text, storage_path text, url text — Drive or
  external link, uploaded_by uuid, created_at)` + ingest workflow columns:
  `ingest_status text check in ('library','new','to_digitize','digitized',
  'rejected') default 'library'`, `reviewed_at`, `digitized_at`,
  `digitized_rows int`, `review_note text`. RLS: authenticated read/write
  (flat, as the rest of the schema).
- New private Storage bucket `supplier-files` + authenticated read/insert
  policies (audit policy qual, not name — gotcha_storage_policy_name_lies).
- `fn_update_po(p_po_id, p_patch jsonb)` — updates expected_date/notes and
  upserts/deletes lines with totals recompute; guard: only while status ∈
  draft/submitted/confirmed; SECURITY DEFINER + in-fn auth check.
- View `v_order_builder`: supplier_catalog ⋈ nomenclature ⋈ product_categories
  (+ `verified_at`, unit_cost per base_unit) for the builder tab.

### Phase B — Order execution UI
- PODetail v2: inline edit via `fn_update_po`, timeline, quick-links strip
  incl. copy-order-as-text (clipboard, Thai names as secondary), editable
  delivery fee in totals, "Attach receipt" (→ receipts bucket +
  `receipt_inbox` row with `po_id`), reconcile screen pre-filled from the
  parsed receipt, receive CTA + discrepancy summary. Author chip on POHistory
  cards; Order Desk grouping + NEW badge.
- `/receive` accepts `?po=` preselect.
- Tab disposition per §2.5: remove Stock / Sheet Items / Quick Purchase /
  Shelf Life tabs from `/procurement`; delete now-unreferenced legacy
  components (ShelfLifeEditor stays until the `/menu` relocation task lands).

### Phase C — Supplier hub + Catalog Inbox + Price Book links
- SupplierManager v2: contacts links (tel / LINE / website), Files
  upload/list, digitized-catalog deep link (`?tab=pricebook&supplier=<id>`);
  Price Book gains supplier filter param + freshness dots (it already loads
  `verified_at`) + `image_url` thumbnails.
- Catalog Inbox tab: upload form (supplier picker OR new-supplier name, file
  drop, note) → Storage + queue row; queue list with status pills; NEW badge
  for CEO. Digitizing itself is NOT app code — see Phase F.

### Phase D — Order Builder + cart
- New tab `catalog`, cart state (localStorage), per-supplier split on create.
  English-only display (decision §6.4); `image_url` thumbnails (decision §6.5).
- Cart lines carry destination-station chips (inherited from requests);
  per-supplier delivery choice: split-per-destination vs one-delivery +
  internal transfer, with the `min_order_thb` guard (§4.8).
- Requests tab v2: submit form scoped to the requester's station; per-line
  status chips driven by the `po_line_id` linkage (§4.7).

### Phase E — E2E verification (QA harness method, PR os#437 style)
- Playwright MCP against local dev + prod Supabase, task_manager login: create
  → edit → submit → confirm → ship → receive with a deliberate shortage →
  discrepancy → cancel path. `fn_approve_po` reviewed statically only.
- Full `npm run build`; Vercel preview link + "what to click" to CEO
  (feedback_preview_before_pr).

### Phase F — Catalog digitize runbook (agent-side, no app code)
- Runbook `docs/operations/runbook-catalog-digitize.md`: query
  `supplier_files` where ingest_status in ('new','to_digitize') → signed URL
  → vision-parse → find-or-create supplier → insert `supplier_catalog` rows
  (source tag `catalog_upload_<file-id8>_<date>`, `verified_at = now()`) →
  update file row (`digitized`, rows count) → archive copy to Drive
  `01_Business/Suppliers/{Supplier}/` → append pointer to
  `supplier-catalogs.md`.
- Future: `/digitize-catalogs` skill + ADVISOR-MAP row (RULE-SKILL-ADVISOR
  compound engineering). Not built in v2 — CEO triggers by chat message.

Estimated: A+B one PR, C one PR, D one PR, E rides along, F is docs-only.
Each phase lands independently usable.

## 6. Decisions (SOCRATIC-GATE answered by CEO, 2026-07-23)

1. **One PO = one supplier** confirmed; the cart auto-splits into several POs.
2. **Permissions:** Mint (task_manager) can BOTH edit lines/dates (until
   `received`) AND cancel orders. No owner-only gate here. (RBAC-at-DB stays a
   separate known gap, 79f3e983.)
3. **Catalog files:** manual upload for now, Drive import later.
4. **Language:** Thai product names are CAPTURED in `supplier_catalog`
   (`product_name_th`) as groundwork for a future Thai admin locale, but the
   admin UI DISPLAYS English only — no Thai secondary lines in builder/detail.
   Exception: the **Copy order** clipboard text keeps Thai names — it is a
   message to the (Thai) supplier, not UI.
5. **Images:** the digitized catalog should show product images where
   available — `supplier_catalog.image_url` thumbnails in Order Builder rows,
   Price Book comparison, and the supplier digitized-catalog view; graceful
   no-image fallback. Image coverage grows via the ongoing catalog imports.
6. **Catalog ingestion (CEO, 2026-07-23):** Mint uploads catalogs via admin;
   they go to CEO for review; CEO periodically triggers Claude to digitize.
   No automated/paid parsing APIs for now. Design phase only — no
   implementation started yet.
7. **Paid delivery (CEO, 2026-07-23):** delivery fee is part of the order
   cost — editable on PO Detail, flows into `fn_approve_po` → expense.
8. **Receipt unification — CONFIRMED Option A (CEO, 2026-07-23):** receipt
   attached from the PO rides the regular receipt-inbox pipeline and
   pre-fills reconcile; single expense writer = `fn_approve_po`; linked inbox
   rows are closed with the PO's `expense_id`.
9. **Ordering role — CONFIRMED (CEO, 2026-07-23):** `staff.can_create_orders`
   per-user toggle as designed in §4.9.

## 7. Out of scope

- Stock/reorder logic and the stock-control section (connected-stock epic /
  other session owns the design). This spec only captures per-line
  destination stations and passes them through receiving as the inflow
  contract (§4.10).
- Role-tier rework beyond the `can_create_orders` toggle (User Management UI
  task 6e4b56bf owns the roles surface).

---

## 8. Implementation handoff (detailed plan for the executing session)

### 8.0 Bootstrap
1. Claim MC task `6df2f888` (claim-gate fields), branch
   `feature/admin/procurement-v2-core` in a fresh worktree, **own `npm ci`
   from `apps/admin-panel`** (never symlink node_modules — gotcha).
2. Context: this spec + `operational-rules.md` + `technical-rules.md`. The
   design preview `preview-procurement-v2.html` (same dir) is the UI canon —
   brand tokens `shk-*`, no default-Tailwind styling.
3. Verify `stations` table is live before Phase A (it is, S1/PR 479; FKs OK).

### 8.1 Phase A — one migration `NNN_procurement_v2_phase_a.sql`
(next free number at apply time; MCP `apply_migration` + self-register into
`migration_log` with `checksum = NULL` per RULE-MIGRATION-TRACKING)

DDL checklist — §5 Phase A list is the source of truth. Function contracts:

**`fn_update_po(p_po_id uuid, p_patch jsonb) → jsonb`** (new, SECURITY
DEFINER, EXCEPTION-trapped, mirror `fn_create_purchase_order` style):
- Guards: `auth.uid()` NOT NULL; PO exists; status ∈
  draft/submitted/confirmed — else `{ok:false, error}`.
- Header keys, applied only if present: `expected_date`, `delivery_window`,
  `notes`, `delivery_fee`, `deliver_to_station_id`.
- `lines_upsert[]`: `{id?}` → update qty/unit/price/destination/notes of an
  existing line; no `id` → insert with `sort_order = max+1`. `qty_ordered>0`
  validated BEFORE any write.
- `lines_delete[]`: uuid[].
- Totals: recomputed by existing `trg_po_lines_rollup`. ⚠ VERIFY
  `fn_po_rollup_totals` folds `delivery_fee` into `grand_total`; if it
  doesn't, extend it in this same migration.
- Returns `{ok, po_id, line_count, subtotal, grand_total}`.

**`fn_create_purchase_order`** — extend via CREATE OR REPLACE, backward
compatible: optional `deliver_to_station_id`, `delivery_window`,
`delivery_fee`, per-line `destination_station_id`, and optional
`request_line_ids uuid[]` per line → sets `stock_request_lines.po_line_id`.

Acceptance A: migration applies; `check_migrations` shows it; SQL asserts
prove every new column/table/policy exists (incl. storage policy **quals**,
not names); smoke test create→update→delete a throwaway PO (reversible ops
only); `get_advisors` security scan clean.

### 8.2 Phase B — order execution UI
Modify: `pages/Procurement.tsx`, `components/procurement/POHistory.tsx`,
`PODetail.tsx`, `hooks/usePurchaseOrders.ts`, `types/procurement.ts`,
`pages/ReceivingStation.tsx` (accept `?po=` preselect).
New: `components/procurement/POTimeline.tsx`, `POLineEditor.tsx`.

- Order Desk: stage groups draft → waiting → in delivery → to receive →
  done; author chip (created_by → staff via auth_user_id); NEW badge =
  submitted-by-other ∧ not in localStorage seen-set (realtime refetch
  already wired).
- PO Detail v2: inline editing via `fn_update_po`; totals block with
  editable delivery fee; quick-links strip — `tel:{phone}`,
  `https://line.me/R/ti/p/~{line_id}`, website, Files, Price Book deep link;
  **Copy order** clipboard template:
  `Order {po_number} — Shishka / Delivery: {date}, {window} / • {name}
  ({name_th if present}) — {qty} {unit} … / Total: ฿{grand_total}`;
  Receive CTA when shipped; post-receive discrepancy summary; reconcile
  screen pre-filled from the linked parsed receipt (`receipt_inbox.po_id`).
- Attach receipt: upload to `receipts` bucket + `receipt_inbox` row with
  `po_id` (decision §6.8).

Acceptance B: `npm run build` (tsc -b && vite build) + lint pass; QA-harness
E2E (§8.5) covers create→edit→submit→confirm→ship→receive-with-shortage→
discrepancy→prefilled-reconcile-screen; **`fn_approve_po` reviewed
statically, never executed in tests.**

### 8.3 Phase C — supplier hub + Catalog Inbox + Price Book
Modify: `SupplierManager.tsx`, `PriceBook.tsx` (+`?supplier=` filter,
freshness dots on `verified_at`, `image_url` thumbnails), `Procurement.tsx`.
New: `SupplierFilesPanel.tsx` + `useSupplierFiles.ts`,
`CatalogInboxPanel.tsx` + `useCatalogInbox.ts`.
Private bucket → signed URLs; mobile upload (`<input capture>`).
Acceptance C: upload lands with `ingest_status='new'` + CEO badge count;
supplier deep-link filters Price Book; links are real tap targets.

### 8.4 Phase D — Order Builder + cart + Requests v2
New: `OrderBuilder.tsx`, `CartDrawer.tsx`, `useOrderBuilder.ts` (reads
`v_order_builder`), `useCart.ts` (localStorage). Modify:
`StockRequestsPanel.tsx` (station select from active `stations`,
`requested_by`, per-line status chips via po_line linkage).
- Category chips from `product_categories` of matched nomenclature;
  English-only display (§6.4); Thai only inside copy-order text.
- Cart: destination chips per line; per-supplier delivery choice
  split-vs-one-delivery with `min_order_thb` guard (§4.8); merge-into
  existing draft offer; create → drafts → Order Desk redirect (§4.2).
Acceptance D: request→cart carries station; created drafts linked back
(`po_line_id` set); split warning fires on the butcher case.

### 8.5 Phase E — verification & CEO delivery gate
QA harness method (PR os#437): Playwright MCP on local `npm run dev` against
prod Supabase, task_manager login; **reversible ops only** on prod
(create→verify→delete). Full build, then **Vercel preview link + "what to
click"** to CEO — mandatory closure artifact (RULE-HANDOFF-PACKET CEO gate).

### 8.6 Phase F — digitize runbook (docs only)
`docs/operations/runbook-catalog-digitize.md` per §5 Phase F + bilingual
ADVISOR-MAP row ("оцифруй каталоги" / "digitize catalogs").

### 8.7 PR plan
PR1 = A+B (`feature/admin/procurement-v2-core`), PR2 = C
(`…-supplier-hub`), PR3 = D (`…-builder`); F rides PR2 or PR3. Conventional
commits, e.g. `feat(admin): procurement v2 phase A — migration + fn_update_po
(MC 6df2f888)`. MC task updated at every phase boundary (RULE-TASK-CLOSURE).

### 8.8 FORBIDDEN
- Executing `fn_approve_po` in any test (irreversible prod writes).
- `vercel deploy` CLI; commits to `main`.
- Touching `stations`/`station_par` schema (S1 epic owns), Loyverse code,
  connected-stock counting flows, or the standalone receipt pipeline beyond
  the `po_id` linkage/exclusion.
- Dropping/recreating existing RPCs (CREATE OR REPLACE only); renaming
  existing tab URL params (deep links in use).
- New npm dependencies without CEO discussion.

### 8.9 Dependencies & coordination
- `stations` live (S1, PR 479) — coordinate merge order, don't duplicate.
- User Management UI (6e4b56bf): Ordering-toggle admin surface lands there;
  here we only add the column and read it for gating.
- Parallel catalog-import session keeps writing `supplier_catalog` — Order
  Builder is read-only over it.
- Connected-stock epic (8b709aa0) + expiry/variance (a305ef50) consume the
  `destination_station_id` inflow contract (§4.10).
- Loyverse/Syrve sync, notifications beyond in-app badge (no Telegram push yet
  — can be a follow-up via existing telegram-webhook).
- RBAC-at-DB hardening (task 79f3e983).
