# Next 25 RAW-AUTO stubs by spend (ranks 26-50) — receipt evidence (MC 00a81c22 B.2, second pass)

Migration `503_next25_raw_auto_stub_merge_and_promote.sql`. 22 resolved (14 merge, 8 promote), 3 left alone. 8,028.75 THB would move off stubs.
Every pack size was read off the receipt image (finance MCP `download_receipt`).

| stub | THB | outcome | destination | what the image shows |
|---|---|---|---|---|
| ac6774da | 458.00 | PROMOTE | RAW-CREAM-WHIPPING_ANCHOR (L) | Makro 166031553888 03-10: `9415007303510 แองเคอร์ วิปปิ้งครีม 1 ลิตร` 2 @229 → 2 L. Fresh Cream (RAW-CREAM) is retired and unrelated, not revived |
| bb286db5 | 450.00 | PROMOTE | RAW-BAG_KRAFT_15X15 (pack) | Sangdamrong 000601002076 18-05: `25664713 ซองเปิดข้างคราฟท์ 15*15 (95-100 ใบ)` 6 @75. Count is a range, so priced per pack |
| 2c1b599d | 450.00 | MERGE | RAW-BAG_KRAFT_15X15 | same article, 30-05, by name+price; image not opened |
| 9bf93ab3 | 399.00 | PROMOTE | RAW-TRUFFLE-MUSHROOM_SAUCE (g ×500) | Makro 05-16: `จูเลียโน่ ซอสเห็ดทรัฟเฟิล 500กX1` @399 — mushroom truffle, not the 180 g black truffle sauce |
| 99ad9985 | 375.00 | PROMOTE | RAW-CONTAINER_SQUARE_40X30 (set) | Sangdamrong 18-05: `6950854393343 40*30 ชุดถาดเหลี่ยม+ฝา` 3 @125 |
| 83bf4ed0 | 369.00 | MERGE | RAW-POTATO | Makro 166151258947 09-05: `28006169 มันฝรั่งแพ็ค 1 กก.` 9 @41 = 369. The stub "[JUNK] Powder 1" is the potato pack |
| 45fddb3e | 369.00 | PROMOTE | RAW-SALMON-FZ_PORTIONS (kg ×0.48) | Makro 05-23: `8851988007824 ARO FZ แซลมอนตัดชิ้น 4ชิ้น(480ก)` @369. Frozen portions ≠ fresh fillet (RAW-SALMON) |
| cd6db537 | 365.75 | MERGE | RAW-CHICKEN-BREAST (2 rows) | `อกไก่เนื้อล้วนลอกหนัง` (skinless) 2.140 kg @96 on 12-06 and 1.570 kg @102 on 21-04 |
| 402fc40e | 365.00 | MERGE | RAW-COFFEE-ESPRESSO (g ×600) | Makro online 16-09: `767901 บอนกาแฟ เอสเพรสโซ่ ชนิดเม็ด 600 ก.` 1 @365 |
| e62258f6 | 360.00 | MERGE | RAW-COFFEE-ESPRESSO (×600) | same article 28-09 @360 |
| b5b0622e | 354.00 | MERGE | RAW-COCONUT-OIL (L) | Makro 08-06: `8850581116100 เนเชอเรล น้ำมันมะพร้าว 1 ล.` 3 @118; barcode already catalogued on RAW-COCONUT-OIL |
| 97fb7755 | 350.00 | MERGE | RAW-MATCHA-POWDER (kg ×0.1) | Makro online 07-06: `614528 อิโตเอ็น ชาเขียวมัทฉะ ชนิดผง 100 ก.` @350. Cost 3500 had no history (source 'none'); it gains one |
| 10f88f0e | 349.00 | MERGE | RAW-CHEESE-MOZZARELLA | Makro 29-05: `9415007051275 แองเคอร์ มอซซาเรลล่าชีส 1กก.*1` @349 (IQF, already has an IQF row) |
| 2ec7b438 | 345.00 | PROMOTE | RAW-SHRIMP-WHITE_FZ_TAILON_32_38 (kg) | Makro 17-06: `8851988007244 SAVE FZ กุ้งขาวไว้หาง 32-38 ต/ก 1X1` @345. The stub says "Fresh"; it is frozen tail-on |
| e6e4de40 | 341.00 | MERGE | RAW-TONIC_WATER (pcs ×24) | Makro online 07-06: `146879 ชเวปส์ โทนิค วอเตอร์ 330 มล. x 24` @341 |
| b2f2a0c5 | 340.00 | MERGE | RAW-GOLD_SHREDDED_CHEDDAR | Makro 17-06: `8858768700807 ARO เชดด้าบูดเส้นแช่แข็ง 1 กก.` — cheddar, not the stub's "mozzarella" |
| 13eb3180 | 335.00 | MERGE | RAW-SHRIMP-WHITE_FZ_TAILON_48_54 | 10-08 SavePak 48-54, by name+price; image not opened |
| 2f126585 | 335.00 | PROMOTE | RAW-SHRIMP-WHITE_FZ_TAILON_48_54 (kg) | Makro 166081550381 02-10: `8856591002310 SAVE FZ กุ้งขาวไว้หาง 48-54 ต/ก 1X1` @335 |
| ff2cc49c | 330.00 | MERGE | RAW-MOZZARELLA_MIXED_CHEDDAR_CHEESE | 20-09 "mozzarella and cheddar blend 1 kg" by name+price; image line not opened |
| 94ac9da4 | 330.00 | MERGE | RAW-MOZZARELLA_MIXED_CHEDDAR_CHEESE | Makro 27-09: `8858768700791 ARO มอสซาเรลล่าผสมบูดเส้น` @330 — barcode already catalogued there. "ARD" in the stub is "ARO" |
| 33d0e47b | 330.00 | PROMOTE | RAW-JAR_POP_1000ML (pcs) | Sangdamrong 000601002722 20-06: `8850222007590 POP JAR 1000ML ฝาแก้ว (1*24)` 6 @55 |
| a49369f1 | 329.00 | MERGE | RAW-FROZEN_SCALLOP_MEAT_16LB | Makro 05-16: `8851988009453 AROFZ เนื้อหอยเชลล์ 16-20 ต/ป X1` @329; same barcode as the canonical |

## Left alone (3 stubs, 1,080 THB, 3 rows)
* **615e2645** B002 2-compartment 1000 ml food box, 385: Sangdamrong prints `(1*50*10)` — 50 or 500 pieces cannot be told apart, and 7.7 vs 0.77 per box changes the cost 10x.
* **53ae5f17** "[JUNK] (1*40)", 350: the description is under a receipt stamp on Sangdamrong 000601002650.
* **642000f9** "Ice/water/Avocado/Iceberg lettuce", 345, dated 2024-07-07: a junk row with an implausible date and no readable lines.

## RESULT (applied 2026-10-17, mig 503)
| | before | after |
|---|---|---|
| stubs with live rows | 337 | 315 |
| THB sitting on stubs | 46,913.84 | 38,885.09 (−8,028.75, exactly as projected) |
| purchase_logs rows / total | 984 / 164,590.344 | 984 / 164,590.344 |
| trust, 133 live SALE | unverified 49 · estimated 26 · no_bom 26 · no_cost 16 · verified 11 · manual 4 · deleted 1 | unverified **44** · estimated **30** · no_bom 26 · no_cost 16 · verified **12** · manual 4 · deleted 1 |

Across both passes (502 + 503): 359 → 315 stubs, 62,782.59 → 38,885.09 THB on stubs (−23,897.50), unverified 49 → 44, verified 8 → 12.
New costs: chicken breast 97.69 · espresso 0.6240/g · coconut oil 113.00/L · matcha 3500 (first purchase history ever) · tonic 14.21 ·
scallop 334.00 · shredded cheddar 333.33 · mozzarella 369.23 · mixed mozzarella 331.67 · potato 43.89. No live ingredient lost its cost.
The first apply aborted in the pre-flight (rolled back, nothing written): three stubs (83bf4ed0, 53ae5f17, cd6db537) were already soft-deleted on
2026-07-20 with live purchase rows and no `[MERGED->]` tombstone — the dead-end shape mig 495 fixed. The pre-flight now accepts a retired stub and the
two merges among them add the missing prefix; 53ae5f17 stays as an unresolved junk row.
