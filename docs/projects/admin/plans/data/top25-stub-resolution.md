# Top-25 RAW-AUTO stubs by spend — receipt evidence (MC 00a81c22, item 6 Part B.2)

Migration `502_top25_raw_auto_stub_merge_and_promote.sql`. Measured live 2026-10-17: 359 stubs hold
62,782.59 THB of 164,590.344 recorded (984 rows); the top 25 hold 18,624.90 THB; 0 BOM lines reference any of them.
Every pack size was read off the receipt IMAGE (finance MCP `download_receipt`), never OCR text.

| # | stub | THB | outcome | destination | what the image shows |
|---|---|---|---|---|---|
| 1 | e2d609b8 | 1546.15 | LEFT | — | Farang Food Paradise payment slip QO-9823 lists only "Invoice 2606/957645 160.00, 2606/957646 1,546.15". No lines anywhere. Needs the invoice itself. |
| 2 | 6eb5e77b | 1250.00 | MERGE | RAW-OLIVE-OIL, qty 1→5 L | 2609/000693, 28-09-2026: `6VR006 EVOO 'Ybarra' / 5L Pail` 1 @1,250 → 250/L |
| 3 | 5c683281 | 1054.75 | PROMOTE | RAW-BEEF-CRYING_TIGER (kg) | Makro 66031495105 04-09: `AU เสือร้องไห้วัว กก.ละ` 3.196 kg @330 |
| 4 | e104d9c7 | 1047.25 | MERGE | RAW-SHRIMP (kg) | Makro 66111346474 22-06: `กุ้งขาวใหญ่ 41-45 ตัว/กก.` 2.096 kg @247. 01-07 row by name + weighed qty; image not opened |
| 5 | 1e32cde2 | 879.00 | MERGE | RAW-POTATO (1 pack = 1 kg) | art 28006169 `มันฝรั่งแพ็ค 1 กก.` read 20-05, 24-09; 14-05/29-05 rows by article name |
| 6 | 6ec5635b | 865.75 | MERGE | RAW-BEEF-STRIPLOIN (revived) | Makro 66071280841 20-05 sheet 1: `AU สันนอกวัว กก.ละ` 1.924 kg @450. สันนอก = striploin, the stub's "Outside Round" is wrong |
| 7–10 | 13d581a7 dd1bf505 9a659e56 f9d56227 | 4×840 | MERGE | RAW-LAMB_MINCE | art **831436** `AU เนื้อแกะบดแช่แข็ง 1KG` (บด = minced) on 16-05, 02-06, 23-05, 20-05 |
| 11 | d27f620d | 828.00 | PROMOTE | RAW-SHRIMP-WHITE_FZ_26_30 (kg, ×0.5) | Makro 166041535091 24-09: `CP กุ้งขาวถุงตาข่าย(26-30) 500ก` 4 @207. Peeled/shell-on not printed → kept apart, not guessed |
| 12 | 5874b02d | 758.00 | MERGE | RAW-COFFEE-ESPRESSO (g, ×600) | Makro 66151368350 03-07: `บอนกาแฟ เอสเพรสโซ่ เม็ด 600 ก X1` 2 @379 |
| 13 | 677a770f | 700.00 | LEFT | — | Water-delivery PAYMENT: an OpEx item in purchase_logs, not a product. Void/reclass belongs to the OpEx backfill |
| 14 | 4b587bbf | 657.00 | MERGE | RAW-POTATO | art 28006169 read 02-06; 08-06, 17-07 by article name |
| 15 | 85ca7969 | 634.75 | MERGE | RAW-RED_CABBAGE (kg) | Makro 166901037788 20-09: `373997 กะหล่ำปลีม่วง 13 กก.ขึ้นไป กก.ละ` 14.104 kg @45 |
| 16 | 7261e4f6 | 569.00 | MERGE | RAW-SMOKED_TROUT (kg, ×0.5) | Makro 166081550381 02-10: `8851988009170 ARO FZ แซลมอนเทราต์รมควันสไลซ์500ก` @569 |
| 17 | 9f4920b5 | 519.00 | MERGE | RAW-SMOKED_TROUT (×0.5) | same article 23-05 @519 — **500 g, the stub's "5oz" is wrong** |
| 18 | 2c4adb9a | 519.00 | MERGE | RAW-SMOKED_TROUT (×0.5) | 01-07 @519, same article by name+price; image not opened |
| 19 | 042876d1 | 510.00 | LEFT | — | 24-02 delivery bill handwritten "2 × 230", no volume. 17-09 gas/water slip handwritten "50", no unit. Neither supports 19 L |
| 20 | 67a60a1d | 493.25 | MERGE | RAW-SHRIMP | Makro 66071396986 17-07: `กุ้งขาวใหญ่ 41-45 ตัว/กก.` 1.934 kg @255 |
| 21 | d0592da6 | 490.00 | MERGE | RAW-BOTTLE_PET_250 (pcs, ×150) | Sangdamrong 000601002468: `25643800 ขวด PET 250 CC… (แพ็คx150)` 1 pack @490 = 150 bottles |
| 22 | 4022df30 | 489.00 | PROMOTE | RAW-COFFEE-ARO_BLACK (g, ×1000) | Makro 062111301131 30-05: `8859603300299 ARO เมล็ดกาแฟแบล็ค 1000ก` @489. House brand ≠ Boncafe espresso |
| 23–25 | 80858736 f562e9cb e845f31e | 3×485 | MERGE | RAW-LAMB_MINCE | art 831436 on 14-09, 28-09 (line 20), 02-10 |

## The lamb question
Minced lamb is **not** the same product as a lamb cut for costing (RAW-LAMB-SHOULDER is boned shoulder at 450/kg).
Names could not justify lumping. The images do: all seven stubs are Makro article 831436, printed as minced, seen on
six chits. One SKU → one product → no split. The stub names lost "minced" (or gained "Lamb Meat") in the importer's
abbreviation. RAW-LAMB_MINCE also carries two older 420 rows labelled "Lamb Leg"/"Lamb Shoulder" that are probably the
same article — not touched (out of scope).

## Left alone (3 stubs, 2,756.15 THB, 4 rows) — documented unknowns
Payment slip with no lines (#1) · OpEx water payment (#13) · handwritten water bills with no volume (#19).

## Found along the way (not fixed)
* Makro 20-05-2026 (`66071280841`): `receipt_supplier_url` points at the BLANK continuation sheet; the item sheet
  `inbox/1783069717215_1_cswupo.webp` exists in storage but `receipt_pages` is `[]`. Link lost.
* No `supplier_catalog` row exists for Makro articles 831436 / 28006169 / 373997 / 8851988009170, so the next receipt
  resolves only by NAME (tombstone / alias levels), not by article number. Adding them is the cheapest next step.
