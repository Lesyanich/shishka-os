# Spec — purchase_logs historical repair (MC 00a81c22, item 6)

**Status:** DRAFT — awaiting CEO review. Migration `460` is written but **NOT APPLIED**.
**Depends on:** migration `459` (applied 2026-10-16; **PR #596 is now merged**). 460 lands after it.
**Sibling:** migration `461` fixes `fn_match_nomenclature` and is **in flight in another session**.
460 and 461 are independent in both directions — neither needs the other to have landed.
**Scope:** the damage already in the database. 459 stopped new damage and backfilled nothing.
**Out of scope:** item 7 (OpEx `supplier_id` backfill, 289/389 rows).

---

## 0. Why this needs the CEO and not just a migration

Three of the five defect classes below can be repaired deterministically — the evidence is a
receipt photograph that was read line by line for this spec. The other two cannot: they need a
human to confirm a pack size or name a product. The migration is split along exactly that line:

* **Part A (deterministic, ships in 460)** — 20 unit rows + 24 date rows + 11 duplicate rows +
  23 ladder-confirmed stub merges. Every one is backed by a receipt line or by a value already
  correct elsewhere in the same record.
* **Part B (CEO fills in, ships later)** — the remaining 365 stubs and the 72 drifted costs.
  460 ships these as an empty, commented map, so the CEO edits a table instead of writing SQL.

> ⛔ **Do not run `fn_recalc_wac_for_product` broadly before Part A lands.** On
> `RAW-COFFEE-ESPRESSO` today's history yields **241.67 THB/g** instead of ~0.66.
> Part A fixes the quantities that produce that number.

---

## 1. Measurements, as of 2026-10-16 (post-459, pre-460)

| metric | value |
|---|---|
| `purchase_logs` rows | 984 |
| rows on `RAW-AUTO-%` stubs | 415 (42%), **67,713.59 THB** |
| distinct stubs carrying those rows | 388 (18 already tombstoned, still carrying 22 rows) |
| `RAW-AUTO` items in `nomenclature` | 521 (372 active, 149 tombstoned) |
| rows where `quantity × price ≠ total` | 20 |
| rows with `invoice_date` outside 459's window | **24** (16 under the original audit's narrower window) |
| rows with **no** `expense_id` | 12 (11 of them one double-imported receipt) |
| canonical RAWs whose stored cost drifts >20% from their own log | 72, feeding **488 BOM links** |

The real purchase history starts **2026-02**. Every `invoice_date` before that is a mis-read year.

---

## 2. Defect class 1 — the 20 bad-unit rows

All 20 were checked against the receipt image where one exists. **17 of 20 are confirmed from a
photograph**; the remaining 3 are inferred from arithmetic inside the same record.

The money (`total_price`) is correct in every case — it reconciles to the receipt total. Only
`quantity` and/or `price_per_unit` are wrong. **Following migration 390: normalise the quantity,
leave `total_price` untouched, so no money moves.**

### 2.1 Confirmed from the receipt image

| # | row id | item (as stored) | now (qty / price / total) | proposed (qty / price) | evidence | conf |
|---|---|---|---|---|---|---|
| 1 | `b25d4357` | RAW-COFFEE-ESPRESSO "Boncafe 250G*1" | 500 / 180 / 180 | **250 g / 0.72** | Makro 07-04-2026, art. 8850287001700, QTY 1 × 250 g bag @ 180.00 | high |
| 2 | `5236a8d3` | RAW-COFFEE-ESPRESSO "Boncafe 600g" | 500 / 365 / 365 | **600 g / 0.608333** | Makro 20-04-2026, art. **8859485301568**, QTY 1 × 600 g bag @ 365.00 | high |
| 3 | `6853f530` | stub "Potato Pad 1 Kg" | 1 / 35 / 140 | **4 / 35** | Makro 23-05-2026, line `4 … มันฝรั่งแพ็ค 1 กก. @ 35.00 → 140.00` | high |
| 4 | `dc6e5f6e` | stub "Frozen Lamb Meat 1KG" | 1 / 420 / 840 | **2 / 420** | same receipt, line `2 … AU เนื้อแกะแช่แข็ง 1KG @ 420.00 → 840.00` | high |
| 5 | `149e28d9` | stub "Potatoes Pack 1 kg" | 1 / 35 / 280 | **8 / 35** | Makro 27-05-2026, line `8 … มันฝรั่งแพ็ค 1 กก. @ 35.00 → 280.00` | high |
| 6 | `74be1f02` | stub "KUP Frozen Lamb 1KG" | 1 / 420 / 840 | **2 / 420** | Makro 02-06-2026, line `2 … AU เนื้อแกะแช่แข็ง 1KG @ 420.00 → 840.00` | high |
| 7 | `bcb128bb` | stub "Potatoes 1kg pack" | 2 / 45 / 270 | **6 / 45** | same receipt, line `6 … มันฝรั่งแพ็ค 1 กก. @ 45.00 → 270.00` | high |
| 8 | `e444acb1` | stub "Beef Loin per kg" | 2.23 / 620 / 142.5 | **0.230 / 620** | Makro 11-06-2026, line `0.230 … AU สันนอกวัวตัดชิ้น กก. @ 620.00 → 142.50` | high |
| 9 | `d8a858de` | stub "Fresh Large White Shrimp 41-45" | 1 / 184 / 195 | **1.060 / 184** | Makro 17-06-2026, line `1.060 … สด_กุ้งขาวใหญ่ 41-45 @ 184.00 → 195.00` | high |
| 10 | `4f4a4b32` | stub "Large White Shrimp 41-45" | 2.09 / 247 / 517.75 | **2.096 / 247** | Makro 22-06-2026, line `2.096 … @ 247.00 → 517.75` | high |
| 11 | `014cda65` | stub "Chicken Breast Fillet Skinless" | 2.258 / 97 / 199.75 | **2.058 / 97** | Makro 01-07-2026, line `2.058 … อกไก่เนื้อล้วนลอกหนัง @ 97.00 → 199.75` | high |
| 12 | `318df5ef` | stub "Green Bell Pepper" | 2.606 / 129 / 78.25 | **0.606 / 129 + repoint** | see §2.2 below | high |
| 13 | `11e9ce95` | stub "Iceberg lettuce" | 1 / 89.68 / 65 | **1 / 65** | Phu Lae handwritten 19.9.69, `ผักสลัดแก้ว … 65`, total 65 | high |
| 14 | `d219a527` | stub "My Choice Avocado Pack 2 pcs" | 1 / 59 / 49 | **1 / 49** | Tops Daily 19/09/2026, `1 ลด10 *…อโวคาโดแพค 2ผล 49.00`, TOTAL 49 — 59 is the pre-discount shelf price | high |
| 15 | `af7c74cb` | stub "Naturel Coconut Oil 18" | 1 / 91 / 109 | **1 / 109** | Tops Daily 25/09/2026, `1 ลด8 *เนเชอเรลน้ำมันมะพร้าว 1ล 109.00`, TOTAL 109 | high |
| 16 | `c3798e9c` | stub "DS WholeWheat360" | 3 / 99 / 198 | **3 / 66** | Tops RAWAYANA 25.09.2026 — **B2G1 promo**: 3 units received, 198 paid. qty 3 is right; the unit price is 198/3 | high |
| 17 | `675442d4` | stub "ARO Frozen Sweet Corn Cobs 1 kg" | 2 / 79 / 79 | **1 / 79** | Makro tax invoice 08/10/2026, item 24 `821031 เอโร่ ข้าวโพดหวานเม็ดแช่แข็ง 1 กก. — 1 EACH @ 79.00 → 79.00`. It is sweet-corn **kernels**, not cobs — rename too | high |

### 2.2 The bell-pepper row is a wrong-item mapping, not only a unit bug

Receipt (Makro 07-07-2026, expense `1f3350c3`) has exactly three pepper lines:

```
0.606  พริกยักษ์แดง  (RED)     129.00 →  78.25
0.568  พริกยักษ์เขียว (GREEN)  129.00 →  73.25
0.766  พริกยักษ์เหลือง(YELLOW) 129.00 →  98.75
```

`purchase_logs` holds green 0.568/73.25 ✓ and yellow 0.766/98.75 ✓ — and a **second** row named
"Green Bell Pepper" carrying 78.25, the RED line's money, with quantity 2.606 instead of 0.606.
So `318df5ef` is the red pepper: quantity `2.606 → 0.606` **and** repoint off stub
`RAW-AUTO-b3155e95` onto the red-pepper canonical. Canonical `RAW-BELL-PEPPER-RED` exists
(migration 325). High confidence — the other two lines are already accounted for.

### 2.3 Inferred, not photographed

| # | row id | item | now | proposed | evidence | conf |
|---|---|---|---|---|---|---|
| 18 | `e3f2760c` | stub "Water delivery" | 1 / **0** / 300 | 1 / **300** | handwritten delivery note, one line @ 300, total 300. `price_per_unit = 0` is simply missing | high |
| 19 | `9a7fd43b` | **RAW-MORNING-GLORY** "Water" | 2000 / 30 / 300 | **repoint + 1 / 300** | cash bill 11-04-69 reads `น้ำ 2000 L` — bulk **water delivery**, 300 THB. Morning glory was never bought. See §2.4 | high |
| 20 | `0eef5137` | RAW-COFFEE-ESPRESSO "Boncafe 250G*1" | 500 / 180 / 180 | **delete / void** | duplicate of row 1 with `expense_id IS NULL`. See §4 | high |

Note on how this set maps to the migration: row 20 is repaired by the void in §4, not by a
quantity edit, and one *extra* row joins the quantity map — `4d71c9b6` ("Item N"), whose
`40 × 2 = 80` is arithmetically consistent but has quantity and price swapped against the
receipt (§3.1). So `tmp_unit_fix` in 460 holds 20 rows, just not quite the same 20.

### 2.4 `RAW-MORNING-GLORY` is priced as water

Its **only** purchase row is the 2000 L water delivery above, which is why its stored cost is
30.00/kg. 460 repoints that row onto the active `FM Water 2000 L` stub — the same product — so
the water stops being counted as a vegetable. That is the one repoint in this migration that
moves a row *onto* a stub, on purpose: parking it is better than leaving it.

Afterwards morning glory has **no purchase history at all** and its 30.00/kg becomes unsourced.
**CEO decision needed:** set a manual cost, or mark it `cost_source='none'` until the next real
purchase. 460 does not touch its cost.

There is a second half to this: a `supplier_catalog` row still maps this supplier's "Water" onto
`RAW-MORNING-GLORY`, so post-459 the importer would re-create the error on the next water
delivery. See §5.1a.

---

## 3. Defect class 2 — out-of-range `invoice_date`

459's accepted window is `[today-2y, today+7d]` = `[2024-10-16 .. 2026-10-23]`. **24** rows fall
outside it; the audit's narrower query (`> CURRENT_DATE OR < '2024-01-01'`) saw 16 of them.

### 3.1 Deterministic — `expense_ledger.transaction_date` is already correct (15 rows)

For these, the parent expense carries the right date and only `purchase_logs.invoice_date` was
mangled. The repair is a join, not a guess.

| rows | stored `invoice_date` | expense `transaction_date` | evidence | conf |
|---|---|---|---|---|
| 13 rows, expense `90914f2f` | 2023-04-03 | **2026-04-03** | GO Wholesale receipt header reads `Date 03/04/20…`, 15 lines, total 2,681.00 — matches the expense exactly. Year mis-OCR'd at import on 2026-04-13 | high |
| `8fac1ee8` "Miscellaneous Purchase Item" | 2026-12-23 | **2026-02-23** | handwritten bill `23/2/69` **plus a red paid-stamp spelling out `23 ก.พ. 2569`**. Unambiguous | high |
| `4d71c9b6` "Item N" | 2046-02-26 | 2026-02-26 → **2026-02-28** | delivery bill reads `28-2-69` = 28 Feb 2569 BE. The expense's `-26` is also a day typo. **Also: qty/price are swapped** — receipt says 2 × 40 = 80, DB says 40 × 2 = 80 | high (year) / med (day) |

> Note the audit text said "12 rows dated 2023-04-03". It is **13**.

### 3.2 Read from the receipt image (3 rows)

| row | stored | proposed | evidence | conf |
|---|---|---|---|---|
| `ec93dcc9` "2000 L Water" | 2021-04-24 | **2026-04-24** | cash sale, handwritten `24/4/69` (BE 2569). Expense is wrong too — fix both | high |
| `8050f994` "Banana" | 2024-01-10 | **2026-09-20** | handwritten `20/09/69`, one line `กล้วยหอม` (Hom banana) @ 90. *Also a wrong-item mapping — see §3.4* | high |
| `2fe96063` "Iceberg lettuce" | 2024-06-11 | **2026-09-11** | handwritten `?.9.69` — month 9, year 2026 legible, day not. Keeping DB day 11 lands before the 2026-09-15 import | med (day) |

### 3.3 Needs a human (6 rows)

| rows | stored | what the receipt shows | ask |
|---|---|---|---|
| `0f4f03f5`, `5a2d1ba9`, `d1121e11`, `fbe38f93` (expense `908943d6`) | 2024-04-18 | vendor cash bill, date ends in `69` (= 2026); month glyph illegible. 4 lines — pumpkin 42, iceberg 60, onion 45, water 40, total 187 — match the rows exactly | confirm the month. Proposal: **2026-04-18** (keep day+month, fix the year) |
| `ae55a9e3` "2000 L Water" | 2024-01-01 | **the date field on the bill is blank**. 2024-01-01 is a fallback default, not a reading | pick a date. Imported 2026-04-14 alongside the 2026-04-07 / 2026-04-11 water bills |
| `17d16cf5` "Ice/water/Avocado/Iceberg lettuce" | 2024-07-07 | date is an illegible scrawl ending `69`. 4 lines bundled into one row: ice 30, water 40, avocado 230, iceberg 45, total 345 | pick a date **and** decide whether to split the bundle into 4 lines (mig 325 called this class `hold`) |

### 3.4 Two wrong-item mappings surfaced by the date work

* `8050f994` — stored as **"Artificial Banana Leaf, ARO, 12x12 1kg"**; the receipt says
  `กล้วยหอม`, i.e. **bananas**. Repoint to `RAW-BANANA`. (The live ladder agrees — it returns
  `RAW-BANANA` at level `name:nomenclature`.)
* `2fe96063` — stored against **`RAW-JUICE-MIXED-FRUIT`**; the receipt and the row's own `notes`
  both say **iceberg lettuce**. Repoint to `RAW-LETTUCE-ICEBERG`.

---

## 4. Defect class 3 (new) — one receipt imported twice, 11 orphan rows

12 rows have `expense_id IS NULL`. **Eleven of them are a byte-for-byte duplicate of the Makro
2026-04-07 receipt** (expense `77460cc2`, 2,288 THB): same products, same quantities, same prices,
created at `2026-04-13 06:33` against the expense-linked set's `2026-04-13 11:36`.

**2,219 THB is double-counted into WAC** across RAW-COFFEE-INSTANT, RAW-FLOUR-WW,
RAW-CORIANDER-POWDER, RAW-BUTTER, RAW-COFFEE-ESPRESSO, RAW-TAMARIND-PASTE-WET,
RAW-COCONUT-OIL, RAW-PARSLEY, RAW-HONEY, RAW-ONION, RAW-NUTMEG.

The duplicate even split one product across two canonicals: the orphan tamarind line landed on
`RAW-TAMARIND-PASTE-WET`, the real one on `RAW-TAMARIND-PASTE-SEEDS`.

The twelfth orphan (`0d037b68`, RAW-CHEESE_GOAT, 0.2 kg @ 1245) is **deliberate** — its note says
*"Initial purchase to establish WAC"*. Keep it.

### 4.1 How they are voided — and a correction to the first draft

The first draft of 460 zeroed `quantity`, `price_per_unit` and `total_price`. **Review from the
session that wrote 459 showed that was wrong twice over, and both points stand:**

1. **It cannot run.** `purchase_logs` carries a validated `CHECK (quantity <> 0)` —
   `purchase_logs_quantity_check`. Verified independently: the UPDATE raises `23514` and aborts
   the migration at §8, after §5–§7 have already run. Nothing would corrupt (it all rolls back),
   but it would never complete. The draft reasoned "there is no soft-delete column, so zero it"
   and never asked whether zero was legal. It isn't.
2. **Zeroing destroys the evidence it claimed to preserve.** Afterwards only a `notes` tag would
   survive and the original quantity/price/total would be gone — the opposite of migration 325's
   never-destroy rule. And "void" would mean "the numbers were erased", not something the cost
   path understands.

**So 460 adds the column the table was missing** rather than working around its absence:

```sql
ALTER TABLE public.purchase_logs
  ADD COLUMN voided_at timestamptz, ADD COLUMN void_reason text;
```

The 11 rows get `voided_at` and a reason, **keep every original value**, and
`fn_recalc_wac_for_product` gains `AND voided_at IS NULL`. That clears the constraint, keeps the
audit trail, and makes "voided" a concept the cost path actually respects.

Two details worth recording. The function already carried `AND quantity > 0`, which is *why* the
zeroing draft looked like it worked — it excluded the rows by erasing them. With the values kept,
the filter has to be explicit. And `fn_update_cost_on_purchase` is deliberately **not** changed:
it is `AFTER INSERT` and reads only `NEW`, so a historical voided row never reaches it. Checked,
not assumed.

**Hard DELETE is not on the table.** It was offered in the first draft as the simple alternative;
migration 325 explicitly forbids it, so offering it was a mistake.

### 4.2 The filter bites — measured on the fixture

Nine of the eleven affected items move once voided rows stop counting:

| item | WAC if the duplicate counts | after 460 |
|---|---|---|
| `RAW-ONION` | 62.8571 | **50.7692** |
| `RAW-HONEY` | 300.0000 | **280.2260** |
| `RAW-CORIANDER-POWDER` | 34.1667 | **31.7500** |
| `RAW-BUTTER` | 168.5000 | **175.8750** |
| `RAW-COFFEE-ESPRESSO` | 0.5370 | **0.6412** |
| `RAW-PARSLEY` | 59.5103 | **60.1587** |
| `RAW-FLOUR-WW` | 80.9643 | **81.1250** |
| `RAW-COCONUT-OIL` | 109.5000 | **109.2500** |
| **`RAW-TAMARIND-PASTE-WET`** | 62.0000 | **no purchase history at all** |

`RAW-COFFEE-INSTANT` and `RAW-NUTMEG` are unchanged — their duplicate was identical, so the
average did not move even though the volume was double-counted.

**`RAW-TAMARIND-PASTE-WET` is a new finding.** Its *only* purchase row is the duplicate, so its
entire cost derives from an import that never happened. After 460 it has no purchase history.
**CEO: this item may not be real** — the genuine line from that receipt landed on
`RAW-TAMARIND-PASTE-SEEDS`. Worth checking whether wet tamarind paste is a product we buy at all,
or an artefact of the double import.

---

## 5. Defect class 4 — the 415 stub-bound rows

### 5.1 The live ladder refuses to guess for 94% of them, by design

`fn_match_nomenclature(supplier_id, barcode, supplier_sku, name, original_name)` was run (it is
`STABLE`, it writes nothing) over all 388 stubs, using the most recent purchase row's supplier,
barcode and line text. Result:

| ladder outcome | stubs | rows | THB |
|---|---|---|---|
| **resolved to a canonical item** | **23** | **27** | 2,441 |
| resolved to the stub itself | 349 | 365 | 61,563 |
| resolved to a *different* stub | 7 | 9 | 1,231 |
| no match at all | 9 | 14 | 2,479 |

Three secondary passes were tried and returned **zero** extra hits: normalized-name equality
against canonical-only candidates, the same against the row's OCR line text, and
`supplier_catalog` lookup by the row's barcode. The ladder is exhaustive for exact matching.

**This is the honest, expected answer, not a failure.** 459's ladder requires *normalized exact
equality* and deliberately refuses to choose between two canonical candidates. These 365 stubs
*are* the nomenclature rows their names match, so there is nothing stricter left to find. The
merge map for them must come from a human.

### 5.1a ⚠️ Four of the 23 ladder hits are wrong — and 459 made two of them worse

Hand-checking the 23 found that the ladder is faithfully reproducing **poisoned
`supplier_catalog` rows**. Two catalog rows map a product onto the wrong canonical:

| `supplier_catalog.id` | supplier | catalog name | points at | should be |
|---|---|---|---|---|
| `6ed27304-…` | Water delivery | `Water` | **`RAW-MORNING-GLORY`** | a water item |
| `9544d609-…` | Makro | `Pineapple Juice _CS` | **`RAW-PINEAPPLE`** | `RAW-JUICE-PINEAPPLE` |
| `7c830126-…` | Makro | `Green Stem Eggplant 1 kg per pack` | **`RAW-THAI-EGGPLANT`** (soft-deleted) | `RAW-EGGPLANT` |
| `98718b35-…` | Makro | `Green Stem Eggplant per kg` | **`RAW-THAI-EGGPLANT`** (soft-deleted) | `RAW-EGGPLANT` |

The first is the root cause of §2.4: morning glory costs 30.00/kg because the only thing ever
booked against it is a water delivery.

**This is a live bug, not history.** Before 459 a "Water" line from that supplier minted a
harmless stub. After 459 the ladder resolves it at level `name:supplier_catalog` — confidently,
onto morning glory, with `conversion_factor 1`. 459 did not create the bad catalog row, but it
turned a visible mess into a silent wrong answer.

460 nulls `nomenclature_id` on the first two (the ladder skips rows where it is NULL), which
removes them from matching without destroying the price history; the right canonical for each is
a CEO call (§5.5). The two eggplant rows get a deterministic answer instead — `RAW-EGGPLANT`,
which migration 325 already chose for this exact product name — so no decision is needed there.

The rejected hits are therefore **not** in T1: `RAW-AUTO-8f43d34d`, `da96d8ab`, `05764dbf` (all
"Water") and `ac4f864b` ("Pineapple Juice CS"). `RAW-AUTO-81812ca5` stays in T1 but merges into
`RAW-EGGPLANT`, not the ladder's answer.

**And the eggplant case exposed a gap in 459's ladder itself:** `RAW-THAI-EGGPLANT` is
`is_deleted = true`, yet `fn_match_nomenclature` returned it. Only the `name:nomenclature` level
filters `is_deleted = false`; the `supplier_catalog` levels and the `sku` level do not.

**That gap is far wider than these four rows**, as 459's author measured after this spec first
flagged it — reproduced independently here:

| | count |
|---|---|
| `supplier_catalog` rows pointing at a soft-deleted item | **58** |
| of those, barcode-reachable (level 1a, the highest-confidence level) | **26** |
| `sku` rows pointing at a soft-deleted item | **40** |
| of those, mig-325 `[MERGED->]` tombstones | **0** |

Zero tombstones means past *merges* are not being bypassed — what is exposed is **retired
canonicals**. Their example: barcode `8853478002111` (ARO Frozen Mango Puree) resolves at level
1a onto `RAW-MANGO`, which migration **390 retired** in favour of `RAW-MANGO_FRESH`. The next
receipt carrying that barcode silently undoes 390's canonicalization. Same shape for `RAW-CREAM`
and `RAW-CHICKEN-THIGH`.

**Migration 461, in flight in another session, fixes the function.** 460 does not touch it and
does not depend on it; it only repairs the four catalog rows it diagnosed.

**One interaction between the two migrations, worth stating plainly.** 460 tombstones 31 stubs.
§9 repoints `supplier_catalog` off the 18 *merged* ones onto their canonical (mig 325's pattern),
but a *junk* stub has no canonical to repoint to — so without care 460 would leave live catalog
rows pointing at items it had just tombstoned, i.e. it would **add** to the population 461 is
fixing. Measured: 7 `supplier_catalog` rows (4 barcode-reachable) and 6 `sku` rows (3
barcode-reachable).

§10b disconnects the 7 catalog rows (`nomenclature_id → NULL`), and the migration asserts that
none is left. NULL is the right answer rather than a pointer: junk has no correct target, so the
line belongs in the unmatched queue. Note these stubs are tagged `[JUNK-NO-MATCH]`, **not**
`[MERGED->CODE]` — there is deliberately no pointer for 461 to follow.

The 6 `sku` rows **cannot** be handled the same way: `sku.nomenclature_id` is `NOT NULL`. They
will keep pointing at a tombstoned item, which is exactly 461's case — the ladder must refuse a
soft-deleted target. Flagged to 461's author rather than worked around here.

### 5.1b A deterministic stub code can collide two unrelated products

`RAW-AUTO-b211fb59` ("Artificial Banana Leaf, ARO, 12x12 1kg") carries **two** rows: a genuine
banana purchase (2024-01-10, 90 THB — §3.4) and a genuine ARO artificial banana **leaf** purchase
(2026-03-13, 69 THB).

**This is a design trade-off in 459, not a regression.** Its author chose one shared stub over
breeding a fresh stub per receipt — which is what the old random suffix did, and why 118 distinct
stubs appeared in a single October. The deliberate cost is that a genuine collision needs a human
to split. The code keys on the *name the OCR produced*, so two different products that OCR to the
same name share a stub. Here the merge is **partial**: only the banana row
moves to `RAW-BANANA`; the stub survives for the leaf. Worth knowing before the T3–T5 map is
written — "one stub, one product" is not guaranteed.

### 5.2 These are mostly not duplicates — they are missing products

Only **9 name-groups (20 stubs)** are duplicates of one another: *Cucumber Large Bag 3 kg* ×3,
*Water* ×3, *Potatoes 1 kg pack* ×2, *White Sesame 500 g* ×2, *Green Bell Pepper* ×2,
*Iceberg lettuce* ×2, *Cucumber Pack 500 g* ×2, *Lanna Onion Cheese* ×2, *Red Onion* ×2.

The other 368 stubs are 368 distinct products that were simply never added to `nomenclature`.
That reframes the work: migration 325's dominant action was `merge`; here it will be **`promote`**
(give the stub a proper `RAW-*` code and keep its history) and a long tail of `tombstone`.

### 5.3 Proposed tiers

Full per-stub table: [`data/stub-merge-map.md`](data/stub-merge-map.md) — 388 rows, pipe-separated,
columns `stub_suffix | stub_name | base_unit | tombstoned | rows | thb | first_month | last_month |
ladder_target | ladder_level | fuzzy_candidate | fuzzy_score`.

| tier | rule | stubs | rows | THB | who decides |
|---|---|---|---|---|---|
| **T1 auto-merge** | `ladder_target` non-empty, hand-checked | **18** | **21** | ~1,750 | ships in 460 |
| — rejected from T1 | poisoned catalog rows, §5.1a | 4 | 5 | 229 | CEO (§5.5) |
| — partial merge | one row only, §5.1b | 1 | 1 of 2 | 90 | ships in 460 |
| **T2 junk / not a product** | OCR artefacts and non-ingredients | **13** | 13 | 3,203 | ships in 460 as tombstone-only |
| **T3 review shortlist** | `fuzzy_score ≥ 0.65` | 40 | 48 | 8,119 | **CEO**, one line each |
| **T4 plausible family** | `0.45 ≤ fuzzy_score < 0.65` | 87 | 95 | 19,891 | **CEO** |
| **T5 promote or decide** | `fuzzy_score < 0.45` | 238 | 245 | 37,263 | **CEO** |

**The fuzzy column is a hint, never an instruction.** It is `pg_trgm` similarity against canonical
names and it is wrong often enough to be dangerous: *SAVE Frozen White Prawns* → `RAW-FROZEN-STRAWBERRIES`
(0.21), *Fanta Orange Can* → `RAW-ORANGE` (0.24), *40x30 Square Container with Lid* → `RAW-EGG` (0.16).
460 applies **nothing** from T3–T5.

### 5.4 Tier 2 — the junk list (proposed tombstone-only, no canonical)

| stub | name | rows | THB |
|---|---|---|---|
| `e2d609b8` | `Invoice 2606/957646` | 1 | **1,546.15** |
| `0b4e881a` | `Invoice 2606/957645` | 1 | 160.00 |
| `53ae5f17` | `(1*40)` | 1 | 350.00 |
| `89739060` | `267 2000 L` | 1 | 300.00 |
| `f2b7f726` | `Miscellaneous Purchase Item` | 1 | 215.00 |
| `58cf8eb2` | `Whittaker's` | 1 | 195.00 |
| `7f8a41c9` | `Item N` | 1 | 80.00 |
| `ac5654d5` | `Aro (incomplete product name)` | 1 | 79.00 |
| `83bf4ed0` | `[JUNK-NO-MATCH] Powder 1` | 1 | 369.00 |
| `4cec0b11` | `[JUNK-NO-MATCH] Unknown item (verify from photo)` | 1 | 52.00 |
| `8547deb8` | `[JUNK-NO-MATCH] #1P01964 CENTRA ROCK 200 ml.` | 1 | 51.00 |
| `3245327b` | `[JUNK-NO-MATCH] Lychee Flavored Gelatin` | 1 | 28.00 |
| `6dd0424e` | `[JUNK-NO-MATCH] Imperial Orange Flavor (Jelly)` | 1 | 28.00 |
| `0c38f14e` | `Product return (barcode 8850332162240)` | 1 | **−419.00** |

Both "Invoice …" rows are from FARANG FOOD PARADISE and are the supplier's own invoice number
parsed as a line item — **1,706 THB of COGS that is not a purchase at all**.

The last row is different: it is a **genuine Makro return** (quantity −1, −419.00, barcode
8850332162240 = ALLOWRIE Unsalted Compound Butter 2 kg). It belongs on `RAW-BUTTER`, where it
correctly *reduces* the butter cost. 460 merges it there rather than tombstoning it, so T2 is
**13 stubs**, not 14.

⚠️ **CEO: confirm the 13 carry no real spend before 460 tombstones them.**

### 5.5 Classes the CEO will recognise while reviewing T3–T5

* **Water / bulk delivery** — at least 10 stubs (`aef8f2d4`, `55f8bb2f`, `33353416`, `69961f11`,
  `6bd87457`, `042876d1`, `f4cb9ce0`, `677a770f`, plus the three `Water` stubs). These are
  **OpEx deliveries, not a COGS ingredient**. One canonical, or move them out of COGS entirely?
* **Packaging / disposables** — roughly 60 stubs (cups, lids, bags, boxes, straws, containers).
  Canonical packaging codes already exist (`RAW-CUP_PAPER_8OZ`, `RAW-LID_PET_750`,
  `RAW-KRAFT_BAG_SMALL`, `RAW-BOX_BIO_600`, …). Per `project_packaging_as_bom`, these belong
  under `NF-PKG%`.
* **Not food at all** — Me-O cat food ×3, Haribo, Chupa Chups, Lays, Whittaker's. Staff purchases?
  They should not sit in COGS.
* **Lamb** — 7 stubs at 485–840 THB each. `AU Frozen Lamb 1KG` / `Frozen Lamb Meat 1KG` is whole
  meat; `AU Frozen Minced Lamb` / `CP Frozen Minced Lamb` is mince. One canonical or two?
* **Two canonicals have hash-shaped codes** — `RAW-6b5f5d4f`, `RAW-5d2b58eb`, `RAW-bc8e7fa0`,
  `RAW-de20f0de`, `RAW-6ecf6d76`. They are not `RAW-AUTO-%` so no cleanup has ever caught them.
  Worth renaming separately (logged, not in this spec's scope).

---

## 6. Defect class 5 — the 72 drifted costs, and the `cost_source` question

### 6.1 The drift is almost always a quantity error, not a cost error

72 canonical RAWs have a stored `cost_per_unit` that disagrees by >20% with
`SUM(total_price)/SUM(quantity)` over their own purchase history. They feed **488 BOM links**
across 55+ parents. By `cost_source`: `wac` 66, `manual` 3, `none` 2, `catalog_estimate` 1.

**None of these 72 appears in the 20 bad-unit rows** — their arithmetic is internally consistent
(1 pack @ 99 = 99). The error is the *unit*: a pack booked as one kilogram. The arithmetic guard
cannot see it, which is why it is its own defect class.

The ratio `stored / log` lands on a plausible pack size with striking regularity:

| item | stored | log-derived | ratio | reads as |
|---|---|---|---|---|
| `RAW-CARDAMOM` | 1,980/kg | 99 | ×20 | 50 g pack booked as 1 kg |
| `RAW-FENUGREEK` | 380/kg | 19 | ×20 | 50 g pack |
| `RAW-ROSEMARY` | 750/kg | 75 | ×10 | 100 g pack |
| `RAW-THYME` | 968.63/kg | 88.63 | ×10.9 | 100 g pack |
| `RAW-CINNAMON-POWDER` | 495/kg | 99 | ×5 | 200 g pack |
| `RAW-NUTMEG` | 545/kg | 109 | ×5 | 200 g pack |
| `RAW-SALT-SEA` | 50/kg | 25 | ×2 | 500 g pack |
| `RAW-SESAME-SEEDS-WHITE` | 138/kg | 69 | ×2 | 500 g pack |
| `RAW-RED-KIDNEY-BEANS` | 78/kg | 39 | ×2 | 500 g pack |
| `RAW-DRIED-CRANBERRIES` | 290/kg | 145 | ×2 | 500 g pack |
| `RAW-FLOUR-SEMOLINA` | 185.2/kg | 92.6 | ×2 | 500 g pack |
| `RAW-PEPPER_WHITE` | 430/kg | 215 | ×2 | 500 g pack |
| `RAW-MILK-COW` | 45.02/L | 86.46 | ÷~5 | 5 L carton booked as 1 |
| `RAW-LID_PET_1300` | 2.58/pcs | 129 | ÷50 | pack of 50 booked as 1 |
| `RAW-BOWL_PAPER_1300` | 5.18/pcs | 259 | ÷50 | pack of 50 |
| `RAW-LID_PET_750` | 2.38/pcs | 119 | ÷50 | pack of 50 |
| `RAW-BOWL_PAPER_500` | 3.18/pcs | 159 | ÷50 | pack of 50 |
| `RAW-TAMARIND-PASTE-SEEDS` | 0.155/g | 62 | ÷400 | 400 g pack |
| **`RAW-RICE_PAPER`** | **2.76/pcs** | **69** | **÷25** | **25-sheet pack — MC 9b091b1f's hand-fix** |

**So the stored costs are right and `purchase_logs` is the corrupt source**, exactly as the
2026-10-16 audit concluded. The repair is to divide the quantity by the pack factor — after which
a WAC recompute reproduces the stored cost instead of destroying it.

### 6.2 Proposed procedure (Part B, needs CEO confirmation of pack sizes)

For each drifted item, in one transaction per item:

1. Propose `factor = stored_cost / log_cost` (or its reciprocal) and **round to a real pack size**
   — 0.05, 0.1, 0.2, 0.25, 0.5, 1, 5 kg/L, or an integer piece count.
2. **CEO confirms the pack size.** This is the human gate; nothing proceeds without it.
3. `UPDATE purchase_logs SET quantity = quantity * factor` for that item's rows. `total_price`
   untouched — no money moves (migration 390's rule).
4. Re-derive `SUM(total_price)/SUM(quantity)` and **assert it is now within 5% of the stored
   cost**. If it is not, the factor was wrong — roll that item back and send it to review.
5. Only for items that pass step 4, run `fn_recalc_wac_for_product`. Items that fail are skipped.

Step 4 is the safety net: a wrong pack size cannot reach `cost_per_unit`, because the recompute
only runs on items where the normalized log already agrees with the number a human set.

### 6.3 `cost_source` — recommendation (do NOT flip silently)

`RAW-RICE_PAPER`'s hand-fixed 2.76/pcs carries `cost_source='wac'`, so 459's manual-cost
protection does **not** cover it. The question is how many others are like it.

There is **no reliable signal** that separates "a human typed this" from "a trigger computed it":
`updated_at` moves on every unrelated edit, and a round number proves nothing (`RAW-OLIVE-OIL` is
440.0000 and was certainly computed at some point). Any heuristic sweep would mislabel rows.

**Recommendation — three parts:**

1. **Do not mass-flip.** Flipping 66 rows to `manual` on a guess freezes costs that *should* track
   purchases, and the provenance field stops meaning anything.
2. **The §6.2 normalization makes the question mostly moot.** Once a pack factor is applied, the
   log-derived cost agrees with the stored cost, so `fn_update_cost_on_purchase` will not move it
   on the next receipt. Protection by correctness beats protection by flag.
3. **Flip exactly the rows the CEO names**, for items that must stay frozen regardless. Our
   shortlist to put in front of them is the 19 in §6.1 plus `RAW-RICE_PAPER`. 460 ships this as a
   commented, empty list.

**`RAW-RICE_PAPER` specifically:** we recommend **both** — normalize its one purchase row by ÷25
(the 22 cm square sheets come 25 to a pack) *and* set `cost_source='manual'`, because that number
was established by hand under MC `9b091b1f` and should not be revised by a single future receipt.
It is one row and the CEO already owns the decision. **460 leaves it alone pending a yes.**

---

## 7. What migration 460 does

Written as `services/supabase/migrations/460_purchase_logs_historical_repair.sql`. **Not applied.**

Patterned on 325 (cost-frozen repoint + tombstone, never hard-delete) and 390 (normalize to the
base unit first, `total_price` untouched, then recompute).

| § | action | rows |
|---|---|---|
| 1 | snapshot every `nomenclature` cost — proof surface for the freeze assert | — |
| 2 | pre-flight: every id in the map must exist and still hold the stated values; abort otherwise | — |
| 3 | disable the four cost triggers around the data edits | — |
| 4 | normalize the 20 bad-unit rows from the confirmed map | 20 |
| 5 | repoint the 3 wrong-item rows (red pepper, banana, iceberg) + the water row | 4 |
| 6 | fix `invoice_date` on the 18 deterministic + image-read rows; leave the 6 human ones | 18 |
| 8 | void the 11 duplicate rows: add `voided_at`/`void_reason`, set them, keep every value, and add `AND voided_at IS NULL` to `fn_recalc_wac_for_product` | 11 |
| 8 | T1 auto-merge: repoint 21 rows onto 18 canonicals, tombstone those stubs `[MERGED->CODE]` | 21 |
| 9b/9c | fix the 4 poisoned `supplier_catalog` rows from §5.1a — 2 set to NULL (CEO decides), 2 repointed to `RAW-EGGPLANT` | 4 |
| 10 | T2: tombstone 13 junk stubs `[JUNK-NO-MATCH]` (the −419 return goes to `RAW-BUTTER` in §8) | 13 |
| 10b | clean up after our own tombstones: disconnect the 7 `supplier_catalog` rows that pointed at those junk stubs | 7 |
| 11 | re-enable triggers | — |
| 12 | asserts: **zero** `cost_per_unit` / `cost_source` drift vs the §1 snapshot; row counts unchanged; still exactly 12 orphans; 0 **live** rows violating the arithmetic rule; exactly 11 voided rows, none of which lost its values; exactly 6 violating the date rule; exactly 393 rows left on stubs; every merged stub tombstoned and empty; the Water→morning-glory catalog row no longer resolves — else ABORT | — |
| — | **commented-out** Part B skeletons: the pack-factor table (§6.2) and the `cost_source` list (§6.3) | — |

It does **not**: change any `cost_per_unit`, run `fn_recalc_wac_for_product`, touch the 365
unresolved stubs, delete anything, or touch OpEx `supplier_id`.

### Verified on a local fixture — it runs clean and commits

Built a throwaway PostgreSQL 14 cluster, loaded the real schema from `information_schema`, then
**all 984 `purchase_logs` rows, all 596 `expense_ledger` rows and the 629 referenced
`nomenclature` rows copied from production**. The fixture reproduced the four measurements
exactly (984 / 415 on stubs / 20 arithmetic / 12 orphans) before the migration ran.

| metric | before | after 460 |
|---|---|---|
| `purchase_logs` rows | 984 | **984** (nothing created or deleted) |
| rows on `RAW-AUTO` stubs | 415 | **393** |
| THB parked on stubs | 67,713.59 | **65,792.34** |
| `quantity × price ≠ total` (live rows) | 20 | **0** |
| `invoice_date` outside 459's window | 24 | **6** (the unreadable ones, §3.3) |
| orphan rows | 12 | **12**, 11 of them now `voided_at`-tagged with values intact |
| `quantity × price ≠ total` among **voided** rows | — | **1**, preserved on purpose as evidence |
| `RAW-AUTO` items tombstoned | — | **+21** (17 merged, 4 junk; 9 junk were already) |
| **`RAW-COFFEE-ESPRESSO` log-derived cost** | **241.67 THB/g** | **0.6412 THB/g** |
| `RAW-MORNING-GLORY` purchase rows | 1 (a water delivery) | **0** |
| any `cost_per_unit` / `cost_source` moved | — | **0** (in-transaction assert) |
| items whose WAC the void filter corrects | — | **9 of 11** (§4.2); one loses its history entirely |
| `supplier_catalog` rows left pointing at a stub 460 tombstoned | — | **0** (asserted) |
| `sku` rows left pointing at a tombstoned stub | 6 | **6** — cannot be fixed here, see below |

The espresso line is the point of the whole exercise: **0.6412 against the ~0.66 the audit
expected**. The landmine that made a blanket WAC recompute unsafe is defused by Part A alone,
without touching a single cost.

The stub count falls by 22 and rises by 1 — the water row is parked on the "FM Water 2000 L"
stub on purpose. A repair that only ever made that number fall would have had to leave morning
glory priced as water. The assert hard-codes 393 for exactly that reason.

**The fixture earned its keep twice.** The CHECK constraint that blocked §8 slipped through the
first round because that fixture was built from `information_schema.columns` alone, which carries
column definitions but **not constraints**. The rebuilt fixture copies
`purchase_logs_quantity_check` and `purchase_logs_price_per_unit_check` from production verbatim,
and now reproduces the blocker: the old zeroing statement fails there with the same `23514` the
reviewer saw against live data. **Lesson for the recipe: pull `pg_constraint`, not just columns.**

And in the first round it caught a different defect: `RAW-AUTO-81812ca5`
("Green Stem Eggplant") was mapped to the ladder's answer, `RAW-THAI-EGGPLANT` — which is
**soft-deleted**, and is a different vegetable (มะเขือเปราะ, small round) from green-stem
aubergine. Migration 325 had already merged two identically-named stubs into `RAW-EGGPLANT`.
460 now follows that precedent, and §9c repoints the two catalog rows behind it.

**That surfaced a real gap in 459's ladder:** only the `name:nomenclature` level filters
`is_deleted = false`. The `supplier_catalog` levels do not, so `fn_match_nomenclature` can and
does resolve a live import onto a soft-deleted canonical. One line to fix; logged in §9 below,
not widened into this change.

> Reusable recipe (also in the session hand-over note): build the fixture from
> `information_schema` plus the **live** function bodies via `pg_get_functiondef`, never the repo
> copies — they drift, and that drift is the premise of this whole task. Put the socket under a
> short path (`/tmp/<tag>/sock`); the scratchpad path exceeds the 103-byte unix-socket limit.

---

## 8. Questions for the CEO, in order

0. **§5.1a, most urgent** — two `supplier_catalog` rows point at the wrong canonical
   (`Water` → morning glory, `Pineapple Juice` → whole pineapple). Since 459 the importer acts on
   them *confidently*. 460 disconnects both; what should each point at instead?
1. **§4** — the 11 duplicates are now soft-deleted with their values intact (zeroing was impossible, DELETE is forbidden by mig 325). Confirm the approach, and see §4.2: **`RAW-TAMARIND-PASTE-WET` may not be a real product** — its only purchase row is the phantom one.
2. **§5.4** — are the 13 junk stubs really empty of spend? The `Invoice 2606/957646` row alone is
   1,546 THB sitting in COGS as a product.
3. **§3.3** — three dates we cannot read: the Asia Gas receipt's month (proposal 2026-04-18), the
   blank-dated water bill, and the ice/avocado bundle. And should that bundle be split into 4 lines?
4. **§6.1** — confirm the pack sizes. This is the gate on the whole WAC recompute.
5. **§6.3** — flip `RAW-RICE_PAPER` to `cost_source='manual'`? Any others from the §6.1 list?
6. **§2.4** — `RAW-MORNING-GLORY` loses its only purchase row. Manual cost, or `none`?
7. **§5.5** — water deliveries and packaging: how do you want them classified before we write the
   T3–T5 map?

---

## 9. Not done here, logged for later

* ~~`fn_match_nomenclature` can resolve onto a soft-deleted canonical.~~ **Now in flight as
  migration 461** in another session — not a follow-up for later. See §5.1a; 460 touches only the
  four catalog rows it diagnosed, never the function.
* Item 7 — OpEx `supplier_id` backfill (289/389). Deliberately out of scope.
* The `unmatched_items` queue still has no reader (317 legacy rows with no context).
* `_shared/nomenclature.ts` still falls back to `ILIKE '%name%'`, looser than the DB ladder — the
  swapped rice-paper/rice-noodle mapping came from exactly that fallback.
* Five canonical items carry hash-shaped codes (`RAW-6b5f5d4f` and friends) and no cleanup has
  ever caught them, because they are not `RAW-AUTO-%`.
* `fn_approve_receipt` inserts the `expense_ledger` row before validating any line, so
  `amount_original = 0` dies on a constraint before the actionable line guard is reached.
