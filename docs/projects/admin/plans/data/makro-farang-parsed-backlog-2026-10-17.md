# Makro / Farang parsed-receipt backlog — plan and outcome (MC 00a81c22)

Session `claude-opus-session-c85f5920`, 2026-10-17. Scope: the 11 `receipt_inbox` rows with
`status='parsed'` and supplier SIAM MAKRO / FARANG FOOD PARADISE (dated 2026-07-14 .. 2026-08-05).
Out of scope: the ~23 non-food parsed rows, the 315 RAW-AUTO stubs, 28 no-BOM dishes, OpEx supplier backfill.

## Baseline (before anything is approved)

| metric | value |
|---|---|
| THB on RAW-AUTO stubs / stubs with live rows | 38,885.09 / 315 |
| purchase_logs rows / THB | 984 / 164,590.344 |
| expense_ledger rows | 602 |
| opex_items rows / THB | 621 / 257,100.09 |
| open unmatched_items | 309 |
| trust (live sellable dishes, 133) | verified 12 · manual 4 · estimated 33 · unverified 49 · no_cost 8 · no_bom 26 · deleted 1 |

## Findings that change how this must be approved

1. **The parsed payloads carry stale `nomenclature_id`s.** Approving as-is (admin /receipts) would book:
   "Potatoes 1 kg" (4 lines on 3 receipts) onto soft-deleted `[MERGED->RAW-POTATO]` stubs, and on
   receipt 9ebd1331 onto **RAW-SWEET-POTATO**; "Mint Leaves" onto a deleted stub; frozen mango onto the
   deleted RAW-MANGO. Every approval here passes explicit, checked ids instead.
2. **fn_approve_receipt multiplies quantity by a `supplier_catalog.conversion_factor` looked up by
   (supplier, nomenclature_id) even when the id is explicit**, picking `ORDER BY match_count DESC LIMIT 1`.
   Several canonicals carry conflicting factors at equal match_count (RAW-ONION: 10 / 1 / 1;
   RAW-CUCUMBER: 0.5 / 1 / 0.5). Payload quantities are therefore computed as `base_qty / factor`
   against the factor the function will actually pick, so the stored quantity is in base_unit regardless.
3. **OCR errors found against the photographs** (all on the receipts below):
   - 9ebd1331: "Indian Red Onion 8.732 kg" is **0.732 kg** (33.00 / 45); "Indian Tomato 500g" is an **onion**
     (หอมแขกอินเดีย 500 กรัม, art. 28592709); chickpea barcode typo (8351… → 8851583014869, 500 g confirmed).
   - 38b7a0a3: "Indian Separation Tomatoes 500 g x3" are **onions** (same article 28592709); "Srinew 3 450 g"
     is **tri-colour quinoa** (ครีนิว 3 สี, BABOO 8858915001504, not chia).
   - 8062: "glass lettuce 2.994 kg" is **0.994 kg**.
   - 8e1f: five OCR food lines are right but "Cherry Tomatoes 250 g" is Queen tomato 250 g (art. 858006).
   - Parsley promo (6 x 100 g, -10 THB/pack, -60) is a per-line discount: net 174 for 6 packs, 29 each.
4. **supplier_catalog row `barcode='917475'` points at RAW-DRIED_PARSLEY** (match_count 3) while the sku row
   points at fresh RAW-PARSLEY; the Makro article 917475 is fresh parsley 100 g. A line carrying 917475 in the
   barcode field is booked on DRIED parsley by the ladder (receipt 38b7a0a3 would have done so).
5. No receipt of the 11 has a counterpart in `expense_ledger` (supplier Makro/Farang, +-3 days, amount +-3 THB; also
   searched by invoice number). Dates are all inside [today-2y, today+7d]. Mont Fleur: no line, no opex item,
   and no OCR text on any of the 11 mentions it — confirmed absence.

## Per-receipt plan

Legend: OK = resolves to an existing product with verified pack size. NEW = no suitable product exists (CEO).
IMG = photograph opened and lines read; OCR = decided from OCR text only (not opened — held anyway).

### 1. 9ebd1331 — Makro 2026-07-27, 1,200.00 (IMG, both sheets) — APPROVE
Sheet 2 is payment/VAT summary only (842.00 VAT-exempt food + 358.00 VAT'd non-food = 1,200).
| line (receipt) | decision | base qty | total |
|---|---|---|---|
| สลัดแก้วนอก (imported iceberg) 0.346 kg | RAW-LETTUCE-ICEBERG | 0.346 kg | 23.75 |
| หอมแขกอินเดีย kg 0.732 (OCR said 8.732) | RAW-ONION | 0.732 kg | 33.00 |
| หอมแขกอินเดีย kg 1.008 | RAW-ONION | 1.008 kg | 45.25 |
| มันฝรั่ง 1 kg pack x4 | RAW-POTATO (payload id was RAW-SWEET-POTATO) | 4 kg | 156.00 |
| แตงกวา 500 g (830433) | RAW-CUCUMBER | 0.5 kg | 29.00 |
| หอมแขกอินเดีย 500 g bag (28592709; OCR "tomato") | RAW-ONION | 0.5 kg | 27.00 |
| ถั่วลูกไก่ 500 g x6 (8851583014869) | RAW-CHICKPEAS | 3 kg | 354.00 |
| พาร์สเลย์ 100 g x6 (917475), promo -60 | RAW-PARSLEY | 0.6 kg | 174.00 net |
| opex: floor cleaner 5 L 169, Sawitri gloves L 189 | opex_items | | 358.00 |

### 2. 38b7a0a3 — Makro 2026-07-31, 2,611.25 (IMG) — HOLD (one line)
All 15 other food lines resolve (milk 5 L -> RAW-MILK-COW; red cabbage -> RAW-RED_CABBAGE; iceberg 1.378 kg;
Roma 3 kg -> RAW-TOMATO-ROMA; eggplant 2 kg; potato 5 kg; discounted chicken breast 2.132 kg ->
RAW-CHICKEN-BREAST-DISCOUNT; chia 450 g -> RAW-CHIA-SEEDS 0.45 kg; quinoa 450 g x2 -> RAW-QUINOA 0.9 kg; spring onion
300 g; cucumber 500 g; Indian onion 500 g x3 -> RAW-ONION 1.5 kg; parsley x6 net 174; tri-colour pepper 500 g ->
RAW-BELL-PEPPER-RED 0.5 kg), plus opex bag x2 = 40.
**Blocker:** กะหล่ำปลีพันธุ์เบา "per pack" art. 28692744, 32.00 — the receipt prints no weight. Stub history says
"Cabbage Pack 500-700 g". Needs the pack weight; then this receipt approves cleanly.

### 3. 8e1f45d0 — Makro 2026-07-21, 1,336.00 (IMG sheet 1) — HOLD (one line)
Lines: frozen apricot 1 kg -> RAW-FROZEN_APRICOT OK; tri-colour pepper 1 kg (194147) -> RAW-BELL-PEPPER-RED OK;
cucumber 500 g x2 OK; Queen tomato 250 g (858006) -> RAW-CHERRY-TOMATO 0.25 kg OK; opex: ARO nitrile gloves
M x2, S, blue S = 836.
**Blocker:** ARO frozen diced Nam Dok Mai mango 1 kg (8853478002104), 189.00. Only `RAW-FROZEN_MANGO_CHUNKS`
exists and it is "[RETIRED 390]" / is_deleted; RAW-MANGO is deleted. Mapping it to RAW-MANGO_FRESH (66.85/kg) would
contaminate fresh-mango cost. CEO: revive RAW-FROZEN_MANGO_CHUNKS (kg, 189 catalog estimate) or name another target.

### 4. 8062 — Makro 2026-07-22, 1,022.25 (IMG sheet 1) — HOLD (one line)
chicken breast 2.106 kg -> RAW-CHICKEN-BREAST OK; milk OK; iceberg 0.994 kg (OCR 2.994) OK; spring onion 300 g OK;
parsley x6 net 174 OK.
**Blocker:** พรากาตาแดงดอง 935 ก. art. 8410134301300, 270.00 — the printed name has no noun (OCR has called it red
cabbage pickle, red onion and red olives). Identity cannot be settled from the paper. Same SKU is on 07-14 (both
copies) and 07-25. CEO: what is in the jar (physically check the jar / photo of label)?

### 5. 1f8d3d04 — Makro 2026-07-25, 3,545.50 (OCR) — HOLD
26 lines. Resolvable: McCormick Garlic Salt -> RAW-GARLIC-POWDER (alias, mig 514; replaces its catalog_estimate),
mozzarella, feta x2 (needs 180 g pack factor check), capers 335 g -> RAW-CAPERS, jalapeno sliced 290 g ->
RAW-PICKLED_JALAPENO, butternut -> RAW-SQUASH-BUTTERNUT, Japanese pumpkin -> RAW-PUMPKIN-JAPANESE, pomegranate,
beetroot, mint, parsley, coriander, spring onion, garlic, limes.
NEW or unsettled: pickle jar (see 4), Heinz ketchup 570 g and 300 g x3, CRISPI stuffed green olives 997 g,
Maemae lentils / red beans in brine, "MC chili sauce 5 kg", perilla leaf 0.976 kg (487), MAKRO shopping bag (opex).
Receipt is also "unbalanced" by 2.00 in the OCR sum.

### 6. 9283 — Makro 2026-07-27, 2,992.00 (OCR) — HOLD
Deli: sliced smoked ham, meatloaf ham x2, beef pastrami, mortadella; cubed Kanya beef 1.394 kg (499/kg, cut
unknown); Doi Kham passion juice 50% and mixed-berry 98% 1 L; Kraft provolone 220 g; Mainland vintage cheese 470 g;
Nutella 350 g (existing stub only; RAW-NUTELLA is 1 kg). Resolvable: Cubic multigrain bread -> RAW-BREAD_CUBIC_19GRAIN,
chicken breast. Many NEW.

### 7. 44073b85 and a87dfdbe — Makro 2026-07-14, 867.25 — DUPLICATE PAIR, HOLD both
Same date, total, nine lines (invoice number OCR'd 66151799656 vs 6151390656; a87dfdbe's own warnings record a
page-1/page-2 digit mismatch). One receipt entered twice (different uploads). Approve at most one, after review.
Lines: Kraft bread 330 g, red pickle jar (see 4), meatloaf ham x2, pork liver, potatoes 1 kg, eggs 10-pack
(-> RAW-EGG, base pcs, qty 10 OK), Indian onion 500 g, Hellmann's mayonnaise 460 g. NEW: ham, liver, mayonnaise, bread.

### 8. 0ceb7e90 — Makro 2026-07-20, 1,260.25 (OCR) — HOLD
Pork tenderloin, meatloaf ham, pepperloin, AROGOLD wagyu block 120 g x2: NEW. Resolvable: Kraft bread (stub only),
Zespri kiwi pack 6 / green apples pack 10 (RAW-KIWI-GREEN / RAW-APPLE-GREEN, pack-unit check), onions 1 kg,
crab sticks 1 kg -> RAW-CRABSTICK, tomatoes.

### 9. 85c7e5db — Farang Food Paradise 2026-07-29, 6,708.70 incl. 438.89 VAT (OCR) — HOLD
Parmigiano Reggiano 24 m 1.46 kg (catalog factor 1.5 would book 2.19 kg; target RAW-CHEESE-PARMESAN is ARO
shredded, a different grade), Emmental 2.978 kg -> RAW-CHEESE-EMMENTAL OK, Mueloliva EVOO 5 L pail -> RAW-OLIVE-OIL
5 L (219/L) OK, Kalamata olives 5 kg drum (only `[ARCHIVED] RAW-OLIVES_KALAMATA`), whole jalapeno 2.6 kg can (existing
RAW-PICKLED_JALAPENO is per drained kg). The Bangkok Bank slip 96b8e052 (6,708.70, 07-30) is this invoice's payment
counterpart: approve only one of them.

### 10. 40f39f1a — Makro 2026-08-05, 1,920.75 (OCR) — HOLD
McGarrett baking powder 200 g x3 (RAW-BAKING-SODA is soda: NEW), ARO passion juice x2 (RAW-PASSION-FRUIT is SAVEPAK
seedless — needs a decision), Makro bag + ARO bag, Amphawa coconut milk OK, potatoes 4 kg OK, cucumber OK, Indian onion
x4 OK, pomegranate 0.962 kg (Chinese red flesh vs RAW-POMEGRANATE Indian: confirm), parsley OK.

## Outcome (Phase 2) — only 9ebd1331 approved

Approved through the finance MCP (`fn_approve_receipt_with_learning`), supplier_id and every food `nomenclature_id`
explicit; inbox row set `processed`. expense_id `2d12596c-2e78-4288-b5d4-1f992bfb07c8`.

| assertion | expected | measured |
|---|---|---|
| purchase_logs rows / THB | +8 / +842.00 | 984 -> 992 / 164,590.344 -> 165,432.344 |
| expense_ledger | +1 (1,200.00) | 602 -> 603 (2,787,468.34 -> 2,788,668.34) |
| opex_items | +2 (358.00) | 621 -> 623 (257,100.09 -> 257,458.09) |
| RAW-AUTO stubs with live rows / THB | unchanged | 315 / 38,885.09 -> 315 / 38,885.09 (0 minted) |
| unmatched_items open | unchanged | 309 -> 309 |
| trust distribution (133 live dishes) | no movement expected | identical: verified 12, manual 4, estimated 33, unverified 49, no_cost 8, no_bom 26, deleted 1 |

Stored quantities are in base_unit (cucumber 0.5 kg, chickpeas 3 kg, parsley 0.6 kg, onion 0.732/1.008/0.5 kg, potato 4 kg).

**Side effect to know about.** `fn_update_cost_on_purchase` blends the new line cost with *stock on hand*; with no stock it
takes the new price outright. So costs moved to the last paid price: RAW-CUCUMBER 49.1943 -> 58.0000 (reconciled in mig 488),
RAW-POTATO 43.8881 -> 39.0000, RAW-ONION 45.0000 -> 54.0000 (500 g bag pack price), RAW-PARSLEY 352.9508 -> 296.0675,
RAW-CHICKPEAS 117.6444 -> 117.7968, RAW-LETTUCE-ICEBERG 77.7382 -> 76.3369. This is the designed behaviour, not a
defect of this approval, but cucumber/onion now swing on a single small pack.

## Held — what the CEO has to decide (RULE-SOCRATIC-GATE: nothing created here)

Answers that unlock a receipt outright:
1. **Cabbage pack weight** (Makro art. 28692744 "light cabbage per pack", 32.00): weight? Stub history says 500-700 g.
   Answer -> 38b7a0a3 approves cleanly (15 other lines already mapped).
2. **Frozen diced mango** (art. 8853478002104, 189.00/kg): revive `RAW-FROZEN_MANGO_CHUNKS` (kg)? -> 8e1f45d0 approves.
3. **Pragata 935 g jar** (art. 8410134301300, 270.00): what is in it? -> unlocks 8062 (and 07-14, 07-25).

Proposed new products (code / name / base_unit / evidence = receipt line, price):
- `RAW-MEATLOAF_SLICED` (revive archived) / Sliced meatloaf ham / kg — 530/kg, 5 lines on 07-14, 07-20, 07-27.
- `RAW-HAM_SMOKED_SLICED` / Sliced smoked ham / kg — 730/kg (07-27).
- `RAW-BEEF_PASTRAMI_SLICED` / Sliced beef pastrami / kg — 1,180/kg (07-27).
- `RAW-MORTADELLA` / Mortadella / kg — 530/kg (07-27).
- `RAW-PEPPERLOIN_SLICED` / TG1 black pepperloin sliced / kg — 830/kg (07-20).
- `RAW-PORK_LIVER` / Sliced pork liver / kg — 112/kg (07-14).
- `RAW-PORK_TENDERLOIN` / Pork tenderloin / kg — 153/kg; OCR qty 2.53 does not match 88.75 (07-20; image needed).
- `RAW-BEEF_CUBES_KANYA` / Cubed beef / kg — 499/kg, 1.394 kg (07-27; cut unknown, image needed — or map to an existing beef item).
- `RAW-MAYONNAISE` / Hellmann's real mayonnaise 460 g / kg — 177 per jar (07-14).
- `RAW-KETCHUP` / Heinz tomato ketchup / kg — 570 g @163, 300 g x3 pack @88 (07-25).
- `RAW-BAKING-POWDER` / McGarrett baking powder 200 g / kg — 32 per pack (08-05).
- `RAW-OLIVES_KALAMATA` (revive archived) / Black pitted Kalamata olives / kg — 5 kg drum 1,850 (Farang 07-29).
- `RAW-OLIVES_GREEN_STUFFED` / CRISPI green olives stuffed with pepper 997 g / kg — 189 (07-25).
- `RAW-LENTILS_BRINE`, `RAW-RED_BEANS_BRINE` / Maemae lentils / red beans in brine 400 g / kg — 69 / 20 (07-25).
- `RAW-CHILI_SAUCE` / "MC chili pepper sauce" / kg — 73 (07-25; pack size unreadable from OCR).
- `RAW-PERILLA_LEAF` / Perilla leaf / kg — 499/kg, 0.976 kg (07-25).
- `RAW-PROVOLONE`, `RAW-CHEESE_MAINLAND_VINTAGE` / Kraft provolone 220 g / Mainland vintage cheddar 470 g — 79 / 259 (07-27).
- `RAW-BREAD_KRAFT` / Kraft bread 330 g / pcs — 64 (07-14, 07-20; today only a stub).
- `RAW-WAGYU_BLOCK_FROZEN` / AROGOLD wagyu beef block 120 g x2 — 135 (07-20).
- Drinks (Doi Kham passion 50% / mixed berry 98% 1 L, ARO passion juice 1 kg x2): decide RAW ingredient vs resale GOODS-*.
- Farang: Parmigiano Reggiano 24 m is not the ARO shredded RAW-CHEESE-PARMESAN (and catalog factor 1.5 mis-books 1.46 kg as
  2.19 kg); whole jalapeno 2.6 kg can needs a gross-weight product (RAW-PICKLED_JALAPENO is per drained kg).

Other things for the CEO, found in passing and not touched:
- `supplier_catalog` barcode `917475` -> RAW-DRIED_PARSLEY (poisons fresh parsley); several RAW-ONION/RAW-CUCUMBER catalog
  rows carry conflicting conversion factors.
- Payload `nomenclature_id`s on the remaining parsed receipts are stale (soft-deleted stubs, RAW-SWEET-POTATO for potatoes,
  RAW-MANGO): do not approve them through /receipts without re-resolving.
- Duplicates to dispose of: 07-14 pair (44073b85 / a87dfdbe); Farang invoice 85c7e5db vs Bangkok Bank slip 96b8e052.
- Mont Fleur: no purchase evidence on any of the 11 receipts; the 25 bottles sold have no purchase record anywhere.
