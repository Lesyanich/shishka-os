# RAW-AUTO stub merge map — review surface for MC 00a81c22 item 6

Generated 2026-10-16 from the live database. 388 stubs carrying 415 `purchase_logs` rows and
67,713.59 THB. Spec: [`../spec-purchase-logs-historical-repair.md`](../spec-purchase-logs-historical-repair.md)

Pipe-separated. `ladder_target` is what the LIVE `fn_match_nomenclature` resolved to (empty =
it refused to guess, which is 365 of 388 — see spec §5.1).

⚠️ **`fuzzy_candidate` is a `pg_trgm` hint, NOT an instruction.** It is wrong often enough to be
dangerous (*SAVE Frozen White Prawns* → `RAW-FROZEN-STRAWBERRIES` at 0.21). Migration 460 applies
nothing from it. Fill in a decision per row: a canonical code to merge into, `PROMOTE` to give
the stub a proper `RAW-*` code and keep its history, or `TOMBSTONE`.

Expect mostly **PROMOTE**: only 9 name-groups are duplicates of one another, so these are largely
368 real products that were never added to `nomenclature`.

```
stub_suffix|stub_name|base_unit|tombstoned|rows|thb|first_month|last_month|ladder_target|ladder_level|fuzzy_candidate|fuzzy_score
e2d609b8|Invoice 2606/957646|ea||1|1546.15|2026-06|2026-06||name:existing_stub|RAW-LETTUCE-ICEBERG|0.09
6eb5e77b|Extra Virgin Olive Oil 'Ybarra' / 5L Pail|pcs||1|1250.00|2026-09|2026-09||name:existing_stub|RAW-OLIVE-OIL|0.63
5c683281|Australian Crying Tiger Beef|kg||1|1054.75|2026-09|2026-09||name:existing_stub|RAW-BEEF-ANGUS|0.15
e104d9c7|Large White Shrimp 41-45 pcs/kg|kg||2|1047.25|2026-06|2026-07||name:existing_stub|RAW-SHRIMP|0.28
1e32cde2|Potatoes 1 kg pack|pcs||4|879.00|2026-05|2026-09||name:existing_stub|RAW-POTATO|0.78
6ec5635b|Beef Outside Round per kg|kg||1|865.75|2026-05|2026-05||name:existing_stub|RAW-BEEF-MINCE-BRAHMAN|0.22
13d581a7|AU Frozen Lamb 1KG|pcs||1|840.00|2026-05|2026-05||name:existing_stub|RAW-LAMB_MINCE|0.48
9a659e56|Frozen Lamb Meat 1KG|pcs||1|840.00|2026-05|2026-05||name:existing_stub|RAW-LAMB_MINCE|0.50
dd1bf505|KUP Frozen Lamb 1KG|pcs||1|840.00|2026-06|2026-06||name:existing_stub|RAW-LAMB_MINCE|0.46
f9d56227|AU Frozen Minced Lamb 1KG|pcs||1|840.00|2026-05|2026-05||name:existing_stub|RAW-LAMB_MINCE|0.63
d27f620d|CP Prawns (26-30 count) 5207|pcs||1|828.00|2026-09|2026-09||name:existing_stub|RAW-SHRIMP-PEELED|0.18
5874b02d|Boncafe Espresso Beans 600g X 1|pcs||1|758.00|2026-07|2026-07||name:existing_stub|RAW-COFFEE-ESPRESSO|0.77
677a770f|[NOT A PRODUCT - OpEx water payment] Water Delivery Payment|payment|T|1|700.00|2026-06|2026-06||none|RAW-WATER-DRINKING|0.14
4b587bbf|Potatoes 1kg pack|pcs||3|657.00|2026-06|2026-07||name:existing_stub|RAW-POTATO|0.55
aef8f2d4|2000 L Water|pcs|T|2|650.00|2021-04|2024-01||name:supplier_catalog|RAW-RO-WATER|0.38
85ca7969|Purple Cabbage 13 kg+, per kg|kg||1|634.75|2026-09|2026-09||name:existing_stub|RAW-RED_CABBAGE|0.41
672dbea6|ARO Shredded Parmesan 1 kg|bag||1|569.00|2026-05|2026-05|RAW-CHEESE-PARMESAN|name:supplier_catalog|RAW-CHEESE-PARMESAN|0.79
7261e4f6|ARO Frozen Smoked Sliced Salmon Trout 500g|pack||1|569.00|2026-10|2026-10||name:existing_stub|RAW-SMOKED_TROUT|0.81
9f4920b5|ARO FZ Smoked Sliced Salmon Trout 5oz|pcs||1|519.00|2026-05|2026-05||name:existing_stub|RAW-SMOKED_TROUT|0.60
2c4adb9a|ARO FZ Salmon Trout Smoked Sliced|pack||1|519.00|2026-07|2026-07||name:existing_stub|RAW-SMOKED_TROUT|0.62
042876d1|Drinking water, 19L bottle|pcs|T|2|510.00|2026-02|2026-09||name:supplier_catalog|RAW-WATER-DRINKING|0.58
67a60a1d|Large White Prawns 41-45 pcs/kg per kg|kg||1|493.25|2026-07|2026-07||name:existing_stub|RAW-6b5f5d4f|0.27
d0592da6|PET Bottle 250 CC. Round Smooth Tall Empty + Cap 13g. (Pack x150)|pcs||1|490.00|2026-06|2026-06||name:existing_stub|RAW-BOTTLE_PET_250|0.23
4022df30|ARO Black Coffee Beans 1000g x1|pcs||1|489.00|2026-05|2026-05||name:existing_stub|RAW-BEANS-BLACK|0.35
f562e9cb|Australian Frozen Minced Lamb 1 kg|pcs||1|485.00|2026-09|2026-09||name:existing_stub|RAW-LAMB_MINCE|0.47
e845f31e|CP Frozen Lamb Meat 1KG|pcs||1|485.00|2026-10|2026-10||name:existing_stub|RAW-LAMB_MINCE|0.45
80858736|CP Frozen Minced Lamb 1KG|pcs||1|485.00|2026-09|2026-09||name:existing_stub|RAW-LAMB_MINCE|0.63
ac6774da|Anchor Whipping Cream 1 Litre|pcs||1|458.00|2026-10|2026-10||name:existing_stub|RAW-CHEESE-CREAM|0.17
2c1b599d|Kraft side-open bag, brown 15*15 (95-100 pcs)|pcs||1|450.00|2026-05|2026-05||name:existing_stub|RAW-KRAFT_BAG_SMALL|0.26
bb286db5|Brown Kraft Paper Bag 15*15 (95-100 sheets)|pack||1|450.00|2026-05|2026-05||name:existing_stub|RAW-KRAFT_BAG_SMALL|0.26
9bf93ab3|Giuliano Truffle Mushroom Sauce 500g|bottle||1|399.00|2026-05|2026-05||name:existing_stub|RAW-TRUFFLE-SAUCE|0.42
615e2645|B002 2-Compartment Food Box 9/1000 ml.(150 10)|pcs||1|385.00|2026-08|2026-08||name:existing_stub|RAW-BOX_BIO_600|0.19
69679c09|Monin Caramel Syrup 700 ml|pcs||1|380.00|2026-06|2026-06|RAW-SYRUP_CARAMEL|name:supplier_catalog|RAW-SYRUP_CARAMEL|0.86
99ad9985|40x30 Square Container with Lid|set||1|375.00|2026-05|2026-05||name:existing_stub|RAW-EGG|0.16
45fddb3e|ARO FZ Salmon Sliced 4 pcs (4800)X1|pcs||1|369.00|2026-05|2026-05||name:existing_stub|RAW-ALMOND_SLICED|0.34
83bf4ed0|[JUNK-NO-MATCH] Powder 1|pcs|T|1|369.00|2026-05|2026-05||none|RAW-MATCHA-POWDER|0.31
cd6db537|Chicken breast, skinless, per kg|kg|T|2|365.75|2026-04|2026-06||none|RAW-CHICKEN-BREAST-DISCOUNT|0.51
402fc40e|Boncafe Espresso Coffee Beans 600g|pcs||1|365.00|2026-09|2026-09||name:existing_stub|RAW-COFFEE-ESPRESSO|0.61
e62258f6|Boncafe Espresso Beans 600 g|pcs||1|360.00|2026-09|2026-09||name:existing_stub|RAW-COFFEE-ESPRESSO|0.73
ed7b4bed|Anchor Unsalted Butter 227g|pcs||1|357.00|2026-06|2026-06|RAW-BUTTER|name:supplier_catalog|RAW-BUTTER-SALTED|0.80
b5b0622e|Naturesol Coconut Oil 1 L|liter||1|354.00|2026-06|2026-06||name:existing_stub|RAW-COCONUT-OIL|0.79
97fb7755|Ito En Matcha Green Tea Powder 100 g|pcs||1|350.00|2026-06|2026-06||name:existing_stub|RAW-MATCHA-POWDER|0.61
6bd87457|Water (30 X 9)|unit||1|350.00|2026-05|2026-05||name:existing_stub|RAW-RO-WATER|0.38
69961f11|FM Water 2000 L|pcs||1|350.00|2026-10|2026-10||name:existing_stub|RAW-RO-WATER|0.32
53ae5f17|(1*40)|pcs||1|350.00|2026-06|2026-06||name:existing_stub|RAW-POTATO|0.12
10f88f0e|Anchor Mozzarella Cheese Grade 1|pcs||1|349.00|2026-05|2026-05||name:existing_stub|RAW-CHEESE-MOZZARELLA|0.43
642000f9|Ice/water/Avocado/Iceberg lettuce|pcs||1|345.00|2024-07|2024-07||name:existing_stub|RAW-LETTUCE-ICEBERG|0.53
2ec7b438|Fresh Large White Shrimp 1x1|kg||1|345.00|2026-06|2026-06||name:existing_stub|RAW-SHRIMP|0.48
e6e4de40|Schweppes Tonic Water 330 ml x 24|pcs||1|341.00|2026-06|2026-06||name:existing_stub|RAW-TONIC_WATER|0.72
b2f2a0c5|ARO Shredded Mozzarella Frozen 1 kg|pcs||1|340.00|2026-06|2026-06||name:existing_stub|RAW-CHEESE-SHREDDED|0.49
2f126585|SAVE Frozen White Prawns Tail-on 48-540g 1x1|pack||1|335.00|2026-10|2026-10||name:existing_stub|RAW-FROZEN-STRAWBERRIES|0.21
13eb3180|SavePak Frozen White Shrimp Tail-on (48-54 pcs) 1 kg|pcs||1|335.00|2026-10|2026-10||name:existing_stub|RAW-FROZEN-STRAWBERRIES|0.33
ff2cc49c|ARO Shredded Mozzarella and Cheddar Cheese Blend 1 kg|pcs||1|330.00|2026-09|2026-09||name:existing_stub|RAW-MOZZARELLA_MIXED_CHEDDAR_CHEESE|0.63
94ac9da4|ARD Mixed Shredded Mozzarella|pcs||1|330.00|2026-09|2026-09||name:existing_stub|RAW-CHEESE-MOZZARELLA|0.57
33d0e47b|POP JAR 1000ML, Glass Lid (1*24)|pcs||1|330.00|2026-06|2026-06||name:existing_stub|RAW-LID_PET_1300|0.21
a49369f1|AROF Z Scallop Meat 16-20 pcs/pack X1|pack||1|329.00|2026-05|2026-05||name:existing_stub|RAW-FROZEN_SCALLOP_MEAT_16LB|0.50
36b1a798|Dairy Delights Sheredded|pcs||1|325.00|2026-10|2026-10||name:existing_stub|RAW-CHEESE-MOZZARELLA|0.16
c5b9070d|ARO Shredded Cheese Frozen 1 kg|pcs||1|319.00|2026-05|2026-05||name:existing_stub|RAW-CHEESE-SHREDDED|0.85
f5aee61a|Skinless Chicken Breast Fillet (kg)|kg||1|317.00|2026-09|2026-09||name:existing_stub|RAW-CHICKEN-BREAST|0.65
e14ec02b|ARO Gold Z AU Sliced Beef Pie 529g|pcs||1|315.00|2026-05|2026-05||name:existing_stub|RAW-SMOKED_TROUT|0.27
19307586|Sprite Can 325 ml x 24|pcs||1|315.00|2026-06|2026-06||name:existing_stub|RAW-SINGHA_SODA_325ML|0.22
1fd27d45|Coke Original Soft Drink Can 325 ml x 24|pcs||1|315.00|2026-06|2026-06||name:existing_stub|RAW-SINGHA_SODA_325ML|0.18
070926bc|Fanta Orange Can 325 ml x 24|pcs||1|315.00|2026-06|2026-06||name:existing_stub|RAW-ORANGE|0.24
03835443|ARO 100% Pure Honey 1 kg|pcs||2|310.00|2026-09|2026-10||name:existing_stub|RAW-HONEY-ARO|0.66
05170540|Vejpong Honey 760ml|pcs||1|307.00|2026-06|2026-06||name:existing_stub|RAW-HONEY|0.17
89739060|267 2000 L|pcs|T|1|300.00|2026-04|2026-04||name:supplier_catalog|RAW-CUMIN-POWDER|0.16
55f8bb2f|Water delivery|pcs|T|1|300.00|2026-04|2026-04||name:supplier_catalog|RAW-RO-WATER|0.33
f4cb9ce0|Drinking Water (Inferred), 20L|pcs|T|1|300.00|2026-03|2026-03||name:supplier_catalog|RAW-WATER-DRINKING|0.54
33353416|Water ., 2000 L|pcs|T|1|300.00|2026-03|2026-03||name:supplier_catalog|RAW-RO-WATER|0.38
81f542de|ARO Silicone Coated Parchment Paper 45cm x 5m|m||1|295.00|2026-03|2026-03||barcode:supplier_catalog|RAW-MEATLOAF_SLICED|0.16
0e56d4ea|IQF Mozzarella Cheese (Korea)|pcs||1|289.00|2026-05|2026-05||name:existing_stub|RAW-CHEESE-MOZZARELLA|0.49
fee08af9|ARO Gold Coffee Beans 500g x1|bag||1|289.00|2026-05|2026-05||name:existing_stub|RAW-PEPPER-BLACK|0.20
e69415a5|Kikkoman Soy Sauce Shoyu 1.6 L|pcs||1|286.00|2026-06|2026-06||name:existing_stub|RAW-SOY-SAUCE|0.31
ab794b73|Green Oak Lettuce (Hydroponic) Pack 500g|pcs||2|285.00|2026-06|2026-06||none|RAW-LETTUCE_GREEN_OAK|0.78
195837ea|Potatoes Pack 1 kg|pcs||1|280.00|2026-05|2026-05||name:existing_stub|RAW-POTATO|0.78
936d6679|ARO Frozen Half Avocado|pack||1|279.00|2026-07|2026-07||name:existing_stub|RAW-FROZEN_AVOCADO_HALVES|0.56
c69ceacf|ARD Scallop Meat 40-60 pcs/pack X1|pcs||1|279.00|2026-05|2026-05||name:existing_stub|RAW-FROZEN_SCALLOP_MEAT_16LB|0.34
bf2ca711|Babu Chia Seeds 450 g|pcs||1|275.00|2026-06|2026-06||name:existing_stub|RAW-CHIA-SEEDS|0.80
2134c5d2|Skin-on Chicken Breast Fillet 1 kg|kg||1|272.75|2026-10|2026-10||name:existing_stub|RAW-CHICKEN-BREAST|0.63
a832ce31|Chicken parts, skinless breast|kg||1|271.00|2026-09|2026-09||name:existing_stub|RAW-CHICKEN-BREAST-DISCOUNT|0.52
27bc55af|ARO Gold ZA Sliced Beef Belly 500g|pcs||1|269.00|2026-05|2026-05||name:existing_stub|RAW-SMOKED_TROUT|0.32
65ef021b|Sterilgarda Sour Cream 1 L|ea||1|269.00|2026-05|2026-05||name:existing_stub|RAW-SOUR-CREAM|0.30
9ef1fa5a|Boneless Chicken Breast with Skin 1 kg|kg||1|267.50|2026-09|2026-09||name:existing_stub|RAW-CHICKEN-BREAST-DISCOUNT|0.53
1a10b49d|Grace Simple 2-Compartment Food Container B002 1000ml. (50 pcs)|packs||1|267.00|2026-08|2026-08||name:existing_stub|RAW-SANITIZER_SURFACE|0.19
b3bb0493|Large Fresh Shiitake Mushrooms 300g per pack|pcs||2|266.75|2026-05|2026-09||none|RAW-MUSHROOM-SHIITAKE|0.57
d09a3238|Chai Dee Paper Bag (No.5) Kraft Brown 14.6*8.5*27 cm (1*50*40)|pcs||2|265.00|2026-04|2026-05||none|RAW-KRAFT_BAG_SMALL|0.17
d38fb525|Mission Wraps Wholegrain 320g|pcs||1|250.00|2026-09|2026-09||name:existing_stub|RAW-WRAP_WHOLEGRAIN|0.61
0df53347|ARO Frozen Lime Juice Ka|pcs||1|250.00|2026-07|2026-07||name:existing_stub|RAW-LIME|0.64
f7878373|Japanese Kabocha Pumpkin (PPP) per kg|kg||1|248.50|2026-05|2026-05||name:existing_stub|RAW-PUMPKIN-JAPANESE|0.62
279814ee|Chupa Chups The Best Of 9.5g (1*120)|pcs||1|240.00|2026-05|2026-05||name:existing_stub|RAW-CHEESE-LAUGHING-COW|0.17
52873647|137 Degrees Unsweetened Almond Milk 1 L|pcs||1|240.00|2026-06|2026-06||name:existing_stub|RAW-ALMOND_MILK|0.88
73cd1971|Large Red Chili Peppers (per kg)|kg||1|240.00|2026-06|2026-06||name:existing_stub|RAW-6b5f5d4f|0.70
fefd78ae|Nature's Coconut Oil 1L|pcs||1|236.00|2026-06|2026-06||name:existing_stub|RAW-COCONUT-OIL|0.66
479d0832|Boneless Chicken Breast with Skin|kg||2|233.50|2026-06|2026-09||name:existing_stub|RAW-CHICKEN-BREAST-DISCOUNT|0.59
684a585e|Chatr 100% New Jasmine Rice 5 kg|pcs||1|227.00|2026-07|2026-07||name:existing_stub|RAW-VINEGAR_RICE|0.33
5ef1d78b|Magnolia Pasteurized Milk 5 L|pcs||1|224.00|2026-06|2026-06||name:existing_stub|RAW-MILK-COW|0.84
f2b7f726|Miscellaneous Purchase Item|pcs|T|1|215.00|2026-12|2026-12||name:supplier_catalog|RAW-MATCHA-POWDER|0.12
7eaa9bb0|PET Dome Lid for L038 (50x20)|pack||1|210.00|2026-09|2026-09||name:existing_stub|RAW-LID_PET_750|0.34
0d29b634|Nutella Hazelnut Spread 350g|pcs||1|209.00|2026-06|2026-06||name:existing_stub|RAW-NUTELLA_HAZELNUT_CHOCOLATE_SPREAD|0.53
88212688|ARO Shredded Edam 500g|pcs||1|206.00|2026-05|2026-05||name:existing_stub|RAW-CHEESE-GOUDA-SHREDDED|0.42
29cf8e75|O-Rich Nishiki Rice SX1|pcs||1|205.00|2026-06|2026-06||name:existing_stub|RAW-RICE_BRAN_OIL|0.21
fda3ed7a|Chicken Breast Fillet Skinless|kg||1|199.75|2026-07|2026-07||name:existing_stub|RAW-CHICKEN-BREAST|0.71
3a11dda4|Halawi Dried Dates 600g|pcs||1|199.00|2026-06|2026-06||name:existing_stub|RAW-DRIED_PARSLEY|0.19
37e9da70|ARO Bio 2-Compartment Box 1000ml W.50|pcs||1|199.00|2026-03|2026-03||barcode:supplier_catalog|RAW-BOX_BIO_600|0.31
81812ca5|Green Stem Eggplant 1kg per pack|kg||1|198.00|2026-06|2026-06|RAW-THAI-EGGPLANT|name:supplier_catalog|RAW-DRIED-EGGPLANT|0.33
cd45c7e1|White Sauce Bottle with Lid 360ml|pcs||1|198.00|2026-06|2026-06||name:existing_stub|RAW-BOTTLE_PET_60|0.26
0c359fbc|DS WholeWheat360|pcs||1|198.00|2026-09|2026-09||name:existing_stub|RAW-FLOUR-WW|0.21
363023e1|Thai Avocado 1.5 kg|pcs||2|198.00|2026-09|2026-09||name:existing_stub|RAW-AVOCADO|0.40
b46463a4|Delichious Whole Wheat 360g|pcs||1|198.00|2026-09|2026-09||name:existing_stub|RAW-FLOUR-WW|0.22
1dc717ce|Fresh Large White Shrimp 41-45 pc/kg|pcs||1|195.00|2026-06|2026-06||name:existing_stub|RAW-SHRIMP|0.41
99f67a8a|EPP Transparent Paper Cup|packs||1|195.00|2026-06|2026-06||name:existing_stub|RAW-CUP_PAPER_8OZ|0.33
58cf8eb2|Whittaker's|pcs|T|1|195.00|2026-03|2026-03||barcode:supplier_catalog|RAW-SESAME-SEEDS-WHITE|0.21
2317957f|Skinless Boneless Chicken Breast per kg|kg||1|191.75|2026-05|2026-05||name:existing_stub|RAW-CHICKEN-BREAST-DISCOUNT|0.62
7b65a2dd|Baking Paper 60*40 cm (1*20*50)|pack||1|190.00|2026-03|2026-03||name:supplier_catalog|RAW-BOWL_PAPER_500|0.20
9a1a3517|Singha Soda Water 325 ml x 24|pcs||1|190.00|2026-06|2026-06||name:existing_stub|RAW-SINGHA_SODA_325ML|0.60
c997988c|PWC-1200K Kraft paper box with window lid 1200ml. (1*25*8)|pcs||1|190.00|2026-05|2026-05||name:existing_stub|RAW-BOWL_PAPER_1300|0.22
4b25fcc6|Aro Frozen Seedless Passion Fruit Juice 1 kg|pcs||1|189.00|2026-06|2026-06||name:existing_stub|RAW-PASSION-FRUIT|0.53
38e9c1d4|Singha Beer Bottle|pcs||1|188.00|2026-06|2026-06||name:existing_stub|RAW-BOTTLE_PET_60|0.26
21b79583|Imported Potatoes per kg|kg||1|186.75|2026-05|2026-05||name:existing_stub|RAW-POTATO|0.46
05806624|Savepak Frozen Seedless Passion Fruit Juice 1 kg|pcs||1|185.00|2026-06|2026-06||name:existing_stub|RAW-PASSION-FRUIT|0.71
3dcca01b|ARO Cup Carrier Bag 1x500|pcs||1|179.00|2026-05|2026-05||name:existing_stub|RAW-PEPPER-BLACK|0.20
e8063cd1|Mixed Fruit Salad Set A|pcs||1|179.00|2026-07|2026-07||name:existing_stub|RAW-5d2b58eb|0.38
62235d07|ARO Honey 100%|pcs||1|173.00|2026-07|2026-07||name:existing_stub|RAW-HONEY-ARO|0.56
cd8f864d|Chickpeas 500g|pcs||2|169.00|2026-05|2026-05|RAW-CHICKPEAS|name:supplier_catalog|RAW-CHICKPEAS|0.67
3290db91|FI White Shrimp Tail-on 67-77 pcs/bag 1x1|pcs||1|165.00|2026-06|2026-06||name:existing_stub|RAW-SHRIMP|0.29
743a263f|Cardamom Pods 100g|pcs||1|165.00|2026-09|2026-09||name:existing_stub|RAW-CARDAMOM|0.27
f03cebc3|Navel/Valencia Orange (Chinese), 1 kg|kg||1|165.00|2026-06|2026-06||name:existing_stub|RAW-GARLIC-CHINESE|0.24
6bc7fbd0|Fresh Large Shiitake Mushrooms per kg|kg||1|161.25|2026-05|2026-05||name:existing_stub|RAW-MUSHROOM-SHIITAKE|0.66
0b4e881a|Invoice 2606/957645|ea||1|160.00|2026-06|2026-06||name:existing_stub|RAW-LETTUCE-ICEBERG|0.09
39cae4b3|Chef Pad Frozen Strawberries (Korean)|pcs||1|159.00|2026-05|2026-05||name:existing_stub|RAW-FROZEN-STRAWBERRIES|0.35
21485b5f|Millac Gold Cream 1 L|pcs||1|159.00|2026-09|2026-09||name:existing_stub|RAW-CHEESE-CREAM|0.21
fe60df01|Red Apple #113 - Pack 10|pack||1|159.00|2026-07|2026-07||name:existing_stub|RAW-APPLE-GREEN|0.47
b211fb59|Artificial Banana Leaf, ARO, 12x12 1kg|kg||2|159.00|2024-01|2026-03|RAW-BANANA|name:nomenclature|RAW-FROZEN_SPINACH|0.19
32fa95f8|Amphawa Coconut Milk Bottle 1 L x 2|pcs||1|158.00|2026-06|2026-06||name:existing_stub|RAW-COCONUT-MILK|0.62
40e48be6|ARO Fresh Frozen Vegetables 1 Kg|pcs||1|156.00|2026-05|2026-05||name:existing_stub|RAW-FROZEN-VEG-MIXED|0.59
14d326d8|TGM Soso 190g|pack||1|155.00|2026-05|2026-05||name:existing_stub|RAW-SALAMI|0.18
b060a73e|Chao Koh Coconut Milk 1L|bottles||1|154.00|2026-06|2026-06||name:existing_stub|RAW-COCONUT-MILK|0.33
b57cfcb4|Amphawa Coconut Milk Bottle 250 ml x 6|pcs||1|152.00|2026-10|2026-10||name:existing_stub|RAW-COCONUT-MILK|0.43
c0c91c9b|Clear Zipper Bags 25*38 cm (1kg) 62pcs|pcs||1|150.00|2026-03|2026-03||barcode:supplier_catalog|RAW-BOX_OPS_HTP15|0.13
512e9be2|Clear Zipper Bags 23*35 cm (1kg)|pack||1|150.00|2026-03|2026-03||barcode:supplier_catalog|RAW-BOX_OPS_HTP15|0.16
86f19a9a|PC500K-CLO Kraft paper cup + OPS lid 500 ml. (1*25*12)|pcs||1|150.00|2026-05|2026-05||name:existing_stub|RAW-LID_PAPER_8OZ|0.20
0e28b220|Yellow Bell Pepper 1 Pack|pcs||2|149.00|2026-09|2026-10||name:existing_stub|RAW-BELL-PEPPER-RED|0.39
26d07257|Green Bell Pepper 1 Pack|pcs||2|149.00|2026-09|2026-10||name:existing_stub|RAW-de20f0de|0.45
261695e8|Red Bell Pepper 1 Pack|pcs||2|149.00|2026-09|2026-10||name:existing_stub|RAW-PEPPER_PASTE_RED|0.46
e22a0819|ARO Round Pudluk PET Bottle 215ml 1X4|pack||1|149.00|2026-03|2026-03||barcode:supplier_catalog|RAW-BOTTLE_PET_250|0.32
81166dd5|Red Onions 1 kg pack|bag||1|147.00|2026-05|2026-05||name:existing_stub|RAW-RED_ONION|0.64
e8b245d6|ARO Chicken Eggs No.1 with Lid 30 pcs|pcs||1|146.00|2026-09|2026-09||name:existing_stub|RAW-EGG|0.64
dd32d3fc|ARO Chicken Eggs No. 1 with Lid 30 Eggs|pcs||1|146.00|2026-09|2026-09||name:existing_stub|RAW-EGG|0.55
8fed1cba|Caroline Feta Cheese 200 g|pcs||1|145.00|2026-09|2026-09||name:existing_stub|RAW-CHEESE-FETA|0.37
4cb392cb|Beef Loin per kg|kg||1|142.50|2026-06|2026-06||name:existing_stub|RAW-KAFFIR-LIME|0.30
133845c7|TGY Italian Salami 100g x1|pack||1|140.00|2026-05|2026-05||name:existing_stub|RAW-SALAMI|0.63
79a94172|Potato Pad 1 Kg|pcs||1|140.00|2026-05|2026-05||name:existing_stub|RAW-POTATO|0.61
8a626f2f|Caroline Fresh Cream Cheese 250 g|pcs||1|139.00|2026-09|2026-09||name:existing_stub|RAW-CHEESE-CREAM|0.38
14e5e28d|Cucumber large bag 3kg per pack|pack||1|139.00|2026-06|2026-06||name:existing_stub|RAW-CHILI-BIRDSEYE-GREEN|0.30
f17d352f|White Sesame 500 g|bag||1|138.00|2026-05|2026-05||name:existing_stub|RAW-SESAME-SEEDS-WHITE|0.57
ffa7a8db|White Sesame 500g|bag||1|138.00|2026-06|2026-06||name:existing_stub|RAW-SESAME-SEEDS-WHITE|0.59
ca091f18|Boran Vietnamese Rice Paper Square 22cm300kg|kg||1|138.00|2026-06|2026-06||name:existing_stub|RAW-RICE_PAPER|0.39
5a357243|Red Giant Pepper per pack|pack||1|138.00|2026-07|2026-07||name:existing_stub|RAW-PEPPER_PASTE_RED|0.48
78ad0bb2|Sealect Sandwich Tuna in Mineral Water Fitt 650g x 4|pcs||1|135.00|2026-06|2026-06||name:existing_stub|RAW-TUNA_CANNED|0.22
688b201d|Me-O Adult Cat Food 1.1kg Gold|bag||1|135.00|2026-06|2026-06||name:existing_stub|RAW-GOLD_SHREDDED_CHEDDAR|0.20
de55626c|Lin Pure White Sugar 1 kg x 5|pcs||1|135.00|2026-09|2026-09||name:existing_stub|RAW-LIN_ICING_SUGAR|0.24
15a91171|Savepak Frozen Strawberries 1 kg|pcs||2|134.00|2026-06|2026-09||name:existing_stub|RAW-FROZEN-STRAWBERRIES|0.82
e4359e20|JT Double Wall Paper Cup|rows||1|134.00|2026-06|2026-06||name:existing_stub|RAW-CUP_PAPER_8OZ|0.34
72380150|S.A.V.I.O.N Thyme Leaves 200g|pcs||1|133.00|2026-06|2026-06||name:existing_stub|RAW-KAFFIR-LIME-LEAVES|0.20
3d122a5a|Smucker's Strawberry Jam 34 X1|bottle||1|132.00|2026-05|2026-05||name:existing_stub|RAW-JAM-STRAWBERRY|0.78
937e6af9|Smucker's Blueberry Jam 340g|bottle||1|132.00|2026-05|2026-05|RAW-JAM-BLUEBERRY|name:supplier_catalog|RAW-JAM-BLUEBERRY|0.84
5262585a|Dok Bua Coffee Stirring Spoons (10:10 code)|pcs||1|131.50|2026-06|2026-06||name:existing_stub|RAW-COFFEE-INSTANT|0.11
7507157e|Tamarind Paste with Stems 400g|pcs||1|129.00|2026-06|2026-06||name:existing_stub|RAW-TAMARIND-PASTE-SEEDS|0.60
a4bb2ef7|Super Save Round Container 3000ml with Lid|pcs||1|129.00|2023-04|2023-04||barcode:supplier_catalog|RAW-SANITIZER_SURFACE|0.15
5320f3ff|Mission Whole Grain Wraps 320 g|pcs||1|129.00|2026-09|2026-09||name:existing_stub|RAW-WRAP_WHOLEGRAIN|0.60
57abef9e|ARO Bio Burger Box W 50X1|pcs||1|129.00|2026-03|2026-03||barcode:supplier_catalog|RAW-BOX_BIO_600|0.31
abc48453|ARO Mixed Chicken Eggs Size 3-4, Box of 30 Eggs|pcs||1|129.00|2026-10|2026-10||name:existing_stub|RAW-EGG|0.36
1871de93|Blue Band Whipping Cream 1 L|pcs||1|129.00|2026-09|2026-09||name:existing_stub|RAW-CHEESE-CREAM|0.18
a37a2fa4|Thai Avocado 1kg|pcs||1|129.00|2026-07|2026-07||name:existing_stub|RAW-AVOCADO|0.47
1298593d|Banana A Thawila|pcs||1|129.00|2026-07|2026-07||name:existing_stub|RAW-BANANA|0.38
7c71d6a6|Natural Coarse Wheat Bran 1 kg|pcs||1|125.00|2026-05|2026-05||name:existing_stub|RAW-FLOUR-AP|0.27
646dc524|Gusseted bag FB-1425 14*25*7 cm. Brown (1*100*30)|pcs||1|125.00|2026-05|2026-05||name:existing_stub|RAW-COCOA-POWDER|0.14
2010f529|EPP Clear Box R4_PET_Internal Lock Round 50 pieces|pack||1|125.00|2026-08|2026-08||name:existing_stub|RAW-DIVIDER_PET_STRIP|0.15
117caac4|ARO Frozen Lime Juice|pcs||1|125.00|2026-06|2026-06||name:existing_stub|RAW-LIME|0.65
48bdb459|[MERGED->RAW-BEETROOT] Beetroot 1 kg per pack|kg|T|2|124.00|2026-06|2026-06||none|RAW-BEETROOT|0.27
72f33515|Thaweewong Frozen Bento Crab Sticks 500 g|pcs||1|123.00|2026-09|2026-09||name:existing_stub|RAW-WASABI-PASTE|0.22
dcd55eba|Tangerine (Ton Nam) Bag Reduced Price|pcs||1|120.00|2026-06|2026-06||name:existing_stub|RAW-VINEGAR-RED-WINE|0.14
0a8b8d84|ARO GOLD Frozen Minced Beef 120X2|pack||1|120.00|2026-05|2026-05||name:existing_stub|RAW-LAMB_MINCE|0.30
514a10ee|Banana 4 bunches|pcs||1|119.00|2026-06|2026-06||name:existing_stub|RAW-BANANA|0.40
d1a08e7f|Plum Tomatoes 3 kg per pack|pcs||1|119.00|2026-06|2026-06||name:existing_stub|RAW-TOMATO-ROMA|0.73
11116598|Cucumber Large Bag 3kg per pack|pack||1|115.00|2026-06|2026-06||name:existing_stub|RAW-CHILI-BIRDSEYE-GREEN|0.30
0ec24e65|Cucumber Large Bag 3 kg per pack|pack||1|115.00|2026-06|2026-06||name:existing_stub|RAW-CHILI-BIRDSEYE-GREEN|0.35
5143cc30|Natural Yogurt 200g|pcs||1|115.00|2026-05|2026-05||name:existing_stub|RAW-COCONUT-YOGURT|0.25
e2f87aaf|Oatside Oat Milk Unsweetened 1000ml x 1 pack|pcs||1|112.00|2026-06|2026-06||name:existing_stub|RAW-MILK-ALMOND|0.35
341caa32|Fruitmania Seedless Dates, 120 g x 3|pcs||1|110.00|2026-06|2026-06||name:existing_stub|RAW-GRAPES-RED|0.22
531ad893|Red Hawk Brand Pasta 345g|pcs||1|110.00|2026-07|2026-07||name:existing_stub|RAW-PEPPER_PASTE_RED|0.24
8a3c798b|Naturel Coconut Oil 18|pcs||1|109.00|2026-09|2026-09||name:existing_stub|RAW-COCONUT-OIL|0.81
cb10cdca|EPP Cup + Lid [U60-6]|rolls||1|108.00|2026-06|2026-06||name:existing_stub|RAW-SAUCE_CUP_LID_2OZ|0.29
73cef0f9|Icon Smoked Product|pack||1|105.00|2026-05|2026-05||name:existing_stub|RAW-PAPRIKA_SMOKED|0.30
23638213|Flying Dragon Brand Matcha Green Tea 100 g|pcs||1|105.00|2026-07|2026-07||name:existing_stub|RAW-MATCHA-POWDER|0.22
ed9fef6|Banana, Grade A, 1 bunch|pcs||1|105.00|2026-06|2026-06||name:existing_stub|RAW-BANANA-EGG|0.29
0299e9ca|Dipping Sauce Cup 2 oz. with Hinged Lid (1*50*40)|pcs||1|105.00|2026-06|2026-06||name:existing_stub|RAW-SAUCE_CUP_LID_2OZ|0.33
00cab3ac|Dragonfly Matcha Green Tea 100 g|pcs||1|105.00|2026-09|2026-09||name:existing_stub|RAW-MATCHA-POWDER|0.26
ed51b3fb|Plum Tomatoes 3 kg pack|pack||1|105.00|2026-05|2026-05||name:existing_stub|RAW-TOMATO-ROMA|0.63
4c9bd06c|Lays Rock Spicy Sriracha 440g x6|ea||1|103.00|2026-05|2026-05||name:existing_stub|RAW-6b5f5d4f|0.09
d6895930|Japanese Yellow Sweet Potato 1 kg|kg||1|102.25|2026-09|2026-09||name:existing_stub|RAW-SWEET-POTATO-JAPANESE|0.46
53242187|Me-O Adult Cat Food 80g Fish|pcs||1|102.00|2026-06|2026-06||name:existing_stub|RAW-BOX_BIO_600|0.14
3962cd23|Bowl 875 ml G Grace Simple (50x20)|pack||1|102.00|2026-09|2026-09||name:existing_stub|RAW-BOWL_PAPER_500|0.17
bc7d3fa9|Parsley 50 g per pack|pack||1|100.00|2026-07|2026-07||name:existing_stub|RAW-PARSLEY|0.43
5ecdd41b|Plum Tomato 3 kg per pack|pcs||1|100.00|2026-09|2026-09||name:existing_stub|RAW-TOMATO-ROMA|0.61
f348d834|Meiji Fresh Milk Plain 28|pcs||1|99.75|2026-09|2026-09||name:existing_stub|RAW-MILK-FRESH|0.65
ebf3d24c|Ground Cinnamon 200g|pcs||1|99.00|2026-06|2026-06|RAW-CINNAMON-POWDER|name:supplier_catalog|RAW-CINNAMON-POWDER|0.83
717dcc52|Grain Cube|pcs||1|99.00|2026-10|2026-10||name:existing_stub|RAW-ICE_CUBES|0.15
6ec465f5|Frozen Apricots|pcs||1|99.00|2026-05|2026-05||name:existing_stub|RAW-FROZEN_APRICOT|0.56
ac549d95|Cubic 19-Grain Whole Wheat Bread 360 g|pcs||1|99.00|2026-09|2026-09||name:existing_stub|RAW-WRAP_WHOLEGRAIN|0.26
0fa93fd8|Yellow Bell Pepper|kg||1|98.75|2026-07|2026-07||name:existing_stub|RAW-BELL-PEPPER-RED|0.38
bfbcee54|Yok 100% Coconut Oil 1 L|pcs||1|98.00|2026-09|2026-09||name:existing_stub|RAW-COCONUT-OIL|0.52
bdb3e7ef|NexTech Kraft Paper Cup PCS1100K-CLO+OPS Lid [1100 ml]. 25 sets|pack||1|96.00|2026-08|2026-08||name:existing_stub|RAW-LID_PAPER_8OZ|0.16
ec876c51|Green Oak Hydroponic Salad 500g Pack|pcs||1|95.00|2026-06|2026-06||name:existing_stub|RAW-LETTUCE_GREEN_OAK|0.51
bead5de1|Red Coral Hydroponic Salad 500g Bag|pcs||1|95.00|2026-06|2026-06||name:existing_stub|RAW-bc8e7fa0|0.29
c9cbb282|Red Coral Hydroponic Lettuce Bag 500g|pcs||1|95.00|2026-06|2026-06||name:existing_stub|RAW-bc8e7fa0|0.48
7e3e87f1|Green Oak Hydroponic Lettuce Pack 500g|pcs||1|95.00|2026-06|2026-06||name:existing_stub|RAW-LETTUCE_GREEN_OAK|0.78
1b10f546|Purple Cabbage 1 kg|kg||2|94.75|2026-09|2026-10||name:existing_stub|RAW-RED_CABBAGE|0.54
abb76340|Yellow Bell Pepper per kg|kg||1|93.75|2026-09|2026-09||name:existing_stub|RAW-BELL-PEPPER-RED|0.47
fb75ac70|EPP Cup + Lid [U75-9]|rows||1|93.50|2026-06|2026-06||name:existing_stub|RAW-SAUCE_CUP_LID_2OZ|0.29
4096c277|Imported Potatoes 1 kg|kg||1|93.50|2026-10|2026-10||name:existing_stub|RAW-POTATO|0.61
48b797a8|Dutch Mill UHT Plain Milk 2 Liters|pcs||1|93.00|2026-05|2026-05||name:existing_stub|RAW-MILK-FRESH|0.40
4dddd05e|TG1 Black Pepper Sliced (per kg)|kg||1|93.00|2026-06|2026-06||name:existing_stub|RAW-PEPPER-BLACK|0.35
2e7d3d84|Imported Avocado #30 PC|pcs||1|90.00|2026-08|2026-08||name:existing_stub|RAW-AVOCADO|0.35
fca861ea|Jasmine Green Tea 20 sachets x 50g|unit||1|90.00|2026-08|2026-08||name:existing_stub|RAW-VINEGAR_RICE|0.16
98f9966b|Large Pumpkin, Lid-shaped, per kg|kg||1|90.00|2026-09|2026-09||name:existing_stub|RAW-6b5f5d4f|0.35
d3bb2477|Black Tea 2g x 50 sachets|unit||1|90.00|2026-08|2026-08||name:existing_stub|RAW-SESAME-SEEDS-BLACK|0.25
94024b14|Cabbage per pack|pcs||1|90.00|2026-06|2026-06||name:existing_stub|RAW-CABBAGE|0.50
6994639c|Yellow Lemon Pack 6 pcs|pack||1|89.00|2026-07|2026-07||name:existing_stub|RAW-LEMON|0.56
5196e0e2|Round Container 10oz 1x25 pcs|unit||1|89.00|2026-08|2026-08||name:existing_stub|RAW-CORIANDER-POWDER|0.16
feac27b4|ARO Mustard 1000g x1|pcs||1|89.00|2026-09|2026-09||name:existing_stub|RAW-MUSTARD-DIJON|0.52
efdbc7fa|ARO Pizza Box 8 inch 10 pieces|pcs||1|88.00|2026-03|2026-03||barcode:supplier_catalog|RAW-BOX_BIO_600|0.19
bb234df2|Kochasan 3oz Dipping Cup with Separate Lid [50 sets] PET-U75-90|packs||1|87.00|2026-08|2026-08||name:existing_stub|RAW-SAUCE_CUP_LID_2OZ|0.15
92f44e08|Hmong Snack Cube|pcs||1|85.00|2026-10|2026-10||name:existing_stub|RAW-ICE_CUBES|0.13
58b2e749|ARO Seedless Passion Fruit Juice 1 Kg|pcs||1|85.00|2026-05|2026-05||name:existing_stub|RAW-PASSION-FRUIT|0.44
73631455|Taro per pack|pcs||1|85.00|2026-05|2026-05||name:existing_stub|RAW-OKRA|0.44
379011d0|Potato 1 kg|pcs||1|84.00|2026-09|2026-09||name:existing_stub|RAW-POTATO|0.73
956cc784|Brown Burger Wrapping Paper 12*12 inch 1*100*20|roll||1|80.00|2026-05|2026-05||name:existing_stub|RAW-RICE_PAPER|0.21
8f43d34d|Water|pcs||1|80.00|2026-09|2026-09|RAW-MORNING-GLORY|name:supplier_catalog|RAW-RO-WATER|0.67
6a6960a9|Doi Kham Fruit Juice 1000 ml Passion Fruit|box||1|80.00|2026-09|2026-09||name:existing_stub|RAW-PASSION_FRUIT_FRESH|0.34
cbbbdae1|Brown burger wrapping paper 12*12 inches 1*100*20|pcs||1|80.00|2026-05|2026-05||name:existing_stub|RAW-RICE_PAPER|0.20
7f8a41c9|Item N|pcs|T|1|80.00|2046-02|2046-02||name:supplier_catalog|RAW-SALT-PLAIN|0.09
6e80de20|Butternut Squash, per pack|pcs||1|79.00|2026-10|2026-10||name:existing_stub|RAW-SQUASH-BUTTERNUT|0.59
9554fd4e|ARO Frozen Fresh Vegetables 1 kg|pcs||1|79.00|2026-10|2026-10||name:existing_stub|RAW-FROZEN-VEG-MIXED|0.59
ac4f864b|Pineapple Juice CS|bottle||1|79.00|2026-05|2026-05|RAW-PINEAPPLE|name:supplier_catalog|RAW-JUICE-PINEAPPLE|1.00
1f110f5f|Chayote per pack|pack||1|79.00|2026-05|2026-05||name:existing_stub|RAW-OKRA|0.38
843744d6|Orange Juice CS|bottle||1|79.00|2026-05|2026-05||name:existing_stub|RAW-ORANGE|0.44
85f5c2ff|ARO Recycled Handle Bag G 6x11" 1kg|kg||1|79.00|2026-03|2026-03||barcode:supplier_catalog|RAW-CURRY-PASTE-RED|0.17
ac5654d5|Aro (incomplete product name)|pcs||1|79.00|2026-05|2026-05||name:existing_stub|RAW-CURRY-PASTE-RED|0.13
954a41af|ARO Recycled Handle Bag G 6x14" 1kg|kg||1|79.00|2026-03|2026-03||barcode:supplier_catalog|RAW-CURRY-PASTE-RED|0.17
c356b8fc|Cubic Multigrain Whole Wheat Sandwich Bread 360g|pcs||1|79.00|2026-09|2026-09||name:existing_stub|RAW-BREAD_CUBIC_19GRAIN|0.29
c8c61631|ARO Recycled Handle Bag G 12x20" 1kg|kg||1|79.00|2026-03|2026-03||barcode:supplier_catalog|RAW-CURRY-PASTE-RED|0.17
e6e17823|Fah Thong Butternut Squash (per pack)|ea||1|79.00|2026-09|2026-09||name:existing_stub|RAW-SQUASH-BUTTERNUT|0.44
581a3cc7|Aro Sliced Frozen Product 1 Kg|pcs||1|79.00|2026-05|2026-05||name:existing_stub|RAW-FROZEN_KIWI|0.66
76fe55b3|ARO Frozen Sweet Corn Cobs 1 kg|pcs||1|79.00|2026-10|2026-10||name:existing_stub|RAW-CORN_SWEET_RIBS|0.82
1f91331c|Thai Avocado Pack 1 kg|pcs||1|79.00|2026-10|2026-10||name:existing_stub|RAW-SWEET-POTATO|0.43
b3155e95|Green Bell Pepper|kg||1|78.25|2026-07|2026-07||name:existing_stub|RAW-BELL-PEPPER-RED|0.38
82d9d348|Pattavia Pineapple per piece|pcs||1|76.00|2026-07|2026-07||name:existing_stub|RAW-PINEAPPLE|0.62
6b5df138|Mint Leaves 100g per pack|pcs||3|75.00|2026-06|2026-06|RAW-MINT-LEAVES|name:nomenclature|RAW-MINT-LEAVES|0.82
29779bc2|Ready-made Art Card Tray White 4*4 inch BMK (1*100*24)|pack||1|75.00|2026-05|2026-05||name:existing_stub|RAW-RICE-WHITE|0.14
f70ecb06|Scallion and Coriander Set 300 g|pcs||1|75.00|2026-10|2026-10||name:existing_stub|RAW-CILANTRO|0.52
17c6cee3|Carrot|pcs||1|75.00|2026-09|2026-09|RAW-CARROT|name:nomenclature|RAW-CARROT|1.00
b43eb74e|Kraft Side-Opening Envelopes Brown 15*15 (95-100 pcs)|pack||1|75.00|2026-05|2026-05||name:existing_stub|RAW-KRAFT_BAG_SMALL|0.15
9fe023d0|Green Bell Pepper|kg||1|73.25|2026-07|2026-07||name:existing_stub|RAW-BELL-PEPPER-RED|0.38
0277a9da|Green Bell Pepper per kg|kg||1|71.75|2026-09|2026-09||name:existing_stub|RAW-BELL-PEPPER-RED|0.47
ea53170f|Radish Pack 500g|pack||1|69.00|2026-07|2026-07||name:existing_stub|RAW-RADISH|0.43
06db6a8a|Round Container 600ml 1x25 pcs|unit||1|69.00|2026-08|2026-08||name:existing_stub|RAW-CORIANDER-POWDER|0.15
350141f6|Red Oak Lettuce 300 g|pcs||1|69.00|2026-09|2026-09||name:existing_stub|RAW-LETTUCE-RED-OAK|0.57
2fd1c277|Indian Turmeric Powder, 250 g|pcs||1|69.00|2026-06|2026-06||name:existing_stub|RAW-TURMERIC|0.76
a2d3ead6|EPP PP Plastic Cup 32oz. Jumbo EICI Clear (50 pcs) Mouth 116|packs||1|68.00|2026-08|2026-08||name:existing_stub|RAW-PLASTIC_GLOVES|0.18
752481ec|Tipco 100% 1000ml Pomegranate Juice|box||1|67.00|2026-09|2026-09||name:existing_stub|RAW-POMEGRANATE|0.27
7a22b630|Chaowik Fermented Rice Noodle Basket|kg||1|66.00|2026-06|2026-06||name:existing_stub|RAW-RICE_NOODLE|0.26
93d94559|Pensapa Glass Noodles (Khanom Jeen) 1kg|pcs||1|66.00|2026-06|2026-06||name:existing_stub|RAW-NOODLE_KONJAC|0.17
0d198be2|Davit Fermented Rice Noodles Basket 2kg|kg||1|66.00|2026-06|2026-06||name:existing_stub|RAW-RICE_NOODLE|0.21
926b0aa8|Taiwanese Orange (per kg)|kg||1|65.75|2026-06|2026-06||name:existing_stub|RAW-MELON-CANTALOUPE|0.39
c458ae01|3 oz. PPN cup + lid/EPP (1*50*40)|pcs||1|65.00|2026-05|2026-05||name:existing_stub|RAW-CUP_PP_18OZ|0.28
b7e9a14c|Spring onion 300g per pack|pcs||1|65.00|2026-06|2026-06||name:existing_stub|RAW-SPRING-ONION|0.55
02d27c18|Iceberg lettuce|pcs||1|65.00|2026-09|2026-09|RAW-LETTUCE-ICEBERG|name:nomenclature|RAW-LETTUCE-ICEBERG|1.00
a51b875f|Spring Onion and Coriander 300g|pcs||1|65.00|2026-07|2026-07||name:existing_stub|RAW-SPRING-ONION|0.47
820b4554|ARO Frozen Blueberries (Korean)|pcs||1|65.00|2026-05|2026-05||name:existing_stub|RAW-FROZEN-BLUEBERRIES|0.56
3cd4f323|Cucumber Pack 500 g|pcs||1|64.00|2026-07|2026-07|RAW-CUCUMBER|name:supplier_catalog|RAW-CUCUMBER|0.58
3eaa6594|Hot bag 5"x7" (0.5kg)|kg||1|62.00|2026-06|2026-06||name:existing_stub|RAW-KRAFT_BAG_SMALL|0.13
79f149eb|Spring Onion and Coriander Set 300 g|pcs||1|62.00|2026-09|2026-09||name:existing_stub|RAW-SPRING-ONION|0.54
03de7981|Hot bag 6"x9" (0.5kg)|kg||1|62.00|2026-06|2026-06||name:existing_stub|RAW-KRAFT_BAG_SMALL|0.13
3c4297af|Finger Bags 12*20|pack||1|60.00|2026-05|2026-05||name:existing_stub|RAW-GINGER|0.19
f7ca4496|Chef Pack Frozen Strawberries|pcs||1|60.00|2026-07|2026-07||name:existing_stub|RAW-FROZEN-STRAWBERRIES|0.36
b26af09a|Iceberg lettuce|pcs||1|60.00|2024-04|2024-04|RAW-LETTUCE-ICEBERG|name:nomenclature|RAW-LETTUCE-ICEBERG|1.00
83fba884|Lanna Onion Cheese|pcs||1|59.00|2026-09|2026-09||name:existing_stub|RAW-ONION|0.32
177c2ac7|Spring Onion Coriander 300g per pack|bag||1|59.00|2026-06|2026-06||name:existing_stub|RAW-SPRING-ONION|0.42
5fbcf462|ARO Dome Lid 98mm PET with Hole 1x100|pcs||1|59.00|2026-05|2026-05||name:existing_stub|RAW-LID_DOME_98MM|0.37
65f99239|Carrot A 1.5 kg per pack|pcs||1|59.00|2026-06|2026-06||name:existing_stub|RAW-CARROT|0.29
8ce0b531|Lanna Onion Cheese|pcs||1|59.00|2026-09|2026-09||name:existing_stub|RAW-ONION|0.32
ec17aa16|Lanna Valley Original Flavor 1000g|pcs||1|59.00|2026-06|2026-06||name:existing_stub|RAW-TEA_THAI_POWDER|0.18
36e268e4|Hydroponic Green Oak Salad 250g|pcs||1|59.00|2026-06|2026-06||name:existing_stub|RAW-LETTUCE_GREEN_OAK|0.47
1c68ee99|MAKRO Shopping Bag 60x56 cm|pcs||2|59.00|2026-05|2026-07||name:existing_stub|RAW-RICE_NOODLE|0.14
9a53246b|Burmese Shallots 1 kg|pcs||1|59.00|2026-09|2026-09||name:existing_stub|RAW-SHALLOT|0.29
69fa368f|Spring Onion and Coriander 300g per pack|pack||1|59.00|2026-06|2026-06||name:existing_stub|RAW-SPRING-ONION|0.39
fedbb718|Easy UPP 18oz Drink Cup 1x50 Pcs|pcs||1|59.00|2026-05|2026-05||name:existing_stub|RAW-CUP_PP_18OZ|0.33
fc7df697|Seedless Limes for Juice, Pack of 10|pcs||1|59.00|2026-10|2026-10||name:existing_stub|RAW-LIME-FRESH|0.57
64ae91d8|Cucumber Pack 500 g|pcs||1|58.00|2026-06|2026-06|RAW-CUCUMBER|name:supplier_catalog|RAW-CUCUMBER|0.58
00949b2d|ARO Chicken Eggs No. 3 Pack 10 Eggs|pack||1|57.00|2026-06|2026-06||name:existing_stub|RAW-EGG|0.44
51ede2b1|Mitr Phol Brown Sugar for Bakery X1|pcs||1|57.00|2026-06|2026-06||name:existing_stub|RAW-SUGAR|0.47
c68813b8|Red onion|pcs||1|56.00|2026-06|2026-06||name:existing_stub|RAW-RED_ONION|0.67
6e39da5a|Pumpkin Custard (per kg)|kg||1|55.75|2026-06|2026-06||name:existing_stub|RAW-PUMPKIN-JAPANESE|0.40
7c143973|Large Black Straw 11.5*21 cm. Clear Bag Pack (1*100*20)|pcs||1|55.00|2026-06|2026-06||name:existing_stub|RAW-CHILI-BIRDSEYE-GREEN|0.18
410ca6a3|Japanese Pumpkin per piece|pack||1|55.00|2026-05|2026-05||name:existing_stub|RAW-PUMPKIN-JAPANESE|0.63
3fd9e94c|ARO Frozen Mixed Vegetables|box||1|55.00|2026-07|2026-07||name:existing_stub|RAW-FROZEN-VEG-MIXED|1.00
641cca01|FIN LINE JUICE 175ML. (1*72) Special 1 get 1 free|pcs||1|54.00|2026-06|2026-06||name:existing_stub|RAW-LIME-JUICE|0.23
7671f5a3|Shelled Peanuts 500 g|pcs||1|54.00|2026-10|2026-10||name:existing_stub|RAW-PEANUTS|0.30
b2f9905c|KS Paper Coffee Cup|rows||1|52.50|2026-06|2026-06||name:existing_stub|RAW-CUP_PAPER_8OZ|0.43
4cec0b11|[JUNK-NO-MATCH] Unknown item (verify from photo)|pcs|T|1|52.00|2026-04|2026-04||none|RAW-MATCHA-POWDER|0.14
991b9ead|Cabbage Pack 500-700 g|pcs||2|52.00|2026-09|2026-10||name:existing_stub|RAW-CABBAGE|0.36
8547deb8|[JUNK-NO-MATCH] #1P01964 CENTRA ROCK 200 ml.|pcs|T|1|51.00|2026-04|2026-04||none|RAW-COFFEE-INSTANT|0.13
3aea3f06|Red Onion|unit||1|50.00|2026-09|2026-09||name:existing_stub|RAW-RED_ONION|0.67
c98fad6b|Thin Plastic Piping Bags S 27 cm. (1*100)|pack||1|50.00|2026-05|2026-05||name:existing_stub|RAW-PLASTIC_GLOVES|0.24
6a23fe13|Mint and Coriander 150g per pack|pcs||1|50.00|2026-06|2026-06||name:existing_stub|RAW-DILL|0.34
b1227381|Paan Limes 10 pcs|pcs||1|49.00|2026-09|2026-09||name:existing_stub|RAW-LEMON|0.22
47041764|My Choice Avocado Pack 2 pcs|pcs||1|49.00|2026-09|2026-09||name:existing_stub|RAW-AVOCADO|0.29
9ac9cfa0|Kraft Bread 330g x1|pcs||1|49.00|2026-06|2026-06||name:existing_stub|RAW-KRAFT_BAG_SMALL|0.24
6cf76e22|White Clear Plastic Spoons (1*100*20)|pcs||1|48.00|2026-06|2026-06||name:existing_stub|RAW-PLASTIC_GLOVES|0.24
d2eb95dc|Chang Thai Half Lid 95|row||1|48.00|2026-06|2026-06||name:existing_stub|RAW-LID_DOME_95MM|0.19
70e73e3e|Chang Thai Dome Lid 95 mm|row||1|46.00|2026-06|2026-06||name:existing_stub|RAW-LID_DOME_95MM|0.43
19fa7cbe|Ruen Thai Carry Bag 0.5kg. 8x15 Green|packs||1|46.00|2026-08|2026-08||name:existing_stub|RAW-CHILI-BIRDSEYE-GREEN|0.19
704a566f|Onion|pcs||1|45.00|2024-04|2024-04|RAW-ONION|name:nomenclature|RAW-ONION|1.00
09f9b3dc|ARO Frozen Spinach (Korean)|pcs||1|45.00|2026-05|2026-05||name:existing_stub|RAW-FROZEN_SPINACH|0.49
6fdf66e7|Imported Onions 1 kg Pack|ea||1|45.00|2026-10|2026-10||name:existing_stub|RAW-ONION-YELLOW|0.89
9b27cc4e|Oregano 50 g|pcs||1|45.00|2026-05|2026-05|RAW-OREGANO-DRIED|name:supplier_catalog|RAW-OREGANO-DRIED|0.34
9c0e0709|Cubic Flaxseeds 1200(C|pcs||1|45.00|2026-10|2026-10||name:existing_stub|RAW-CUMIN-SEEDS|0.18
e4a14578|Hong Kong Kale 500g per pack|pack||1|45.00|2026-06|2026-06||name:existing_stub|RAW-OKRA|0.27
50b5021a|Discount 11 Masala Paste 1500g|pcs||1|44.00|2026-06|2026-06||name:existing_stub|RAW-CURRY-PASTE-MASSAMAN|0.17
9f94971f|Kidney Beans 500 g|pcs||1|43.00|2026-09|2026-09||name:existing_stub|RAW-RED-KIDNEY-BEANS|0.71
6ae5fe04|Aro Vinegar 4.5% 1 liter|pcs||1|43.00|2026-06|2026-06||name:existing_stub|RAW-VINEGAR_RICE|0.51
69805a23|EPP PP Plastic Cup|pack||1|42.75|2026-06|2026-06||name:existing_stub|RAW-CUP_PP_18OZ|0.32
72df37a0|Pumpkin|pcs||1|42.00|2024-04|2024-04|RAW-PUMPKIN|name:nomenclature|RAW-PUMPKIN|1.00
5dd2c593|J Quick Hard White Tofu 180 g|pcs||1|42.00|2026-09|2026-09||name:existing_stub|RAW-RICE-WHITE|0.17
ec292b9d|Red Chili Pepper Large per kg|kg||1|40.50|2026-05|2026-05||name:existing_stub|RAW-6b5f5d4f|0.74
71163630|Chang Thai Dome Lid 116mm. Round Hole [50 pcs]|packs||1|40.00|2026-08|2026-08||name:existing_stub|RAW-LID_DOME_95MM|0.21
da96d8ab|Water|pcs||1|40.00|2024-04|2024-04|RAW-MORNING-GLORY|name:supplier_catalog|RAW-RO-WATER|0.67
a050f7a7|Chef Pack Granulated Table Salt 10x1|bag||1|40.00|2026-06|2026-06||name:existing_stub|RAW-APPLE-GREEN|0.20
9f01a090|Chao Wik Fermented Rice Noodles Basket 1kg|kg||1|40.00|2026-06|2026-06||name:existing_stub|RAW-RICE_NOODLE|0.22
25b8b206|Fermented Flour Rice Vermicelli (Basket style)|kg||1|40.00|2026-06|2026-06||name:existing_stub|RAW-FLOUR-RICE|0.22
6e155790|Lettuce 300g per pack|pcs||1|39.00|2026-06|2026-06||name:existing_stub|RAW-OKRA|0.31
2bced1f1|Sriracha Medium Spicy Chili Sauce|pcs||1|39.00|2026-09|2026-09||name:existing_stub|RAW-SAUCE_CUP_2OZ|0.18
997ce46a|Potatoes 1 kg|bag||1|39.00|2026-10|2026-10|RAW-POTATO|name:supplier_catalog|RAW-POTATO|1.00
14445ad7|Oriental Super Creamer|pcs||1|39.00|2026-06|2026-06||name:existing_stub|RAW-CHEESE-CREAM|0.17
06e6f099|White Paper 10x10 (1110 code)|pcs||1|38.75|2026-06|2026-06||name:existing_stub|RAW-BOWL_PAPER_1300|0.35
20648396|Red Bell Pepper 1kg per pack|kg||1|38.50|2026-06|2026-06||name:existing_stub|RAW-PEPPER_PASTE_RED|0.43
72e386f6|Mitr Phol Gold Sugar 1 kg|bag||1|38.25|2026-06|2026-06||name:existing_stub|RAW-SUGAR|0.52
54ac3021|Purple cabbage, per kg|kg||1|38.00|2026-06|2026-06||name:existing_stub|RAW-RED_CABBAGE|0.41
295d26c7|Half Whipped Cream Lid 9.5 CM (16/20/22 oz) PET/Bee (1*50*40 pack)|pcs||1|35.00|2026-08|2026-08||name:existing_stub|RAW-LID_PET_750|0.15
a6f8b633|Half Whip Cream Lid 9.5 CM. (16/20/22 oz.) PET/Bee (1*50*40)|pcs||1|35.00|2026-08|2026-08||name:existing_stub|RAW-LID_PET_750|0.16
10d79dd2|MMP Double Cup Glass Carrier Bag|pack||1|34.00|2026-06|2026-06||name:existing_stub|RAW-CUP_PAPER_8OZ|0.12
aac0c7c3|Mahachai Large Rice Noodles|pcs||1|34.00|2026-06|2026-06||name:existing_stub|RAW-RICE_NOODLE|0.29
928264bc|Myanmar Shallots 500 g|pcs||1|33.00|2026-10|2026-10||name:existing_stub|RAW-CUCUMBER|0.22
452579fb|Old Ginger, small size, 1 kg|kg||1|32.50|2026-06|2026-06||name:existing_stub|RAW-GINGER|0.27
05764dbf|Water|pcs||1|30.00|2026-09|2026-09|RAW-MORNING-GLORY|name:supplier_catalog|RAW-RO-WATER|0.67
63c8779f|Cucumbers 500 g|pcs||1|29.00|2026-10|2026-10||name:existing_stub|RAW-CUCUMBER|0.61
a8fc66e2|Me-O Adult Cat Food 80g Tuna|pcs||1|29.00|2026-06|2026-06||name:existing_stub|RAW-BOX_BIO_600|0.13
8bc57b95|Coriander (Sawtooth) 150g per pack|pcs||1|29.00|2026-06|2026-06||name:existing_stub|RAW-DILL|0.33
3245327b|[JUNK-NO-MATCH] Lychee Flavored Gelatin|pcs|T|1|28.00|2026-03|2026-03||barcode:supplier_catalog|RAW-WHEY_PROTEIN|0.15
6dd0424e|[JUNK-NO-MATCH] Imperial Orange Flavor (Jelly)|pcs|T|1|28.00|2026-03|2026-03||barcode:supplier_catalog|RAW-6ecf6d76|0.20
b396f44a|Indian Red Onion 500g|bag||1|27.00|2026-07|2026-07||name:existing_stub|RAW-RED_ONION|0.37
2fc43a27|Venbow Star Coffee Stirring Sticks|pack||1|27.00|2026-06|2026-06||name:existing_stub|RAW-COFFEE-INSTANT|0.15
7236023e|Kachasarn Dipping Sauce Cup 3oz with Built-in Lid [50 sets] PET-U75-90|pack||1|26.00|2026-08|2026-08||name:existing_stub|RAW-SAUCE_CUP_LID_2OZ|0.21
a66e1857|Mung Bean Sprouts Regular Pack 1 kg|pack||1|25.00|2026-06|2026-06||name:existing_stub|RAW-SWEET-POTATO|0.21
54275308|Kitchen Carrot|pcs||1|25.00|2026-09|2026-09||name:existing_stub|RAW-CARROT|0.47
607d6ab5|EPP Super Ice Cream Cup|rows||1|25.00|2026-06|2026-06||name:existing_stub|RAW-CHEESE-CREAM|0.21
7efff515|Regular Bean Sprouts 1kg Pack|bag||1|25.00|2026-06|2026-06||name:existing_stub|RAW-SWEET-POTATO-JAPANESE|0.20
41210348|Flat Lid 95 16/22GPS Perforated/EPP (1*50*40)|pcs||1|25.00|2026-08|2026-08||name:existing_stub|RAW-LID_PET_750|0.16
725f7a7b|Flat Lid 95 16/22OZ.GPPS Perforated/EPP (1*50*40 pack)|pcs||1|25.00|2026-08|2026-08||name:existing_stub|RAW-LIME-FRESH|0.15
ad676c02|Culantro 150g|pcs||1|25.00|2026-06|2026-06||name:existing_stub|RAW-CULANTRO|0.64
e9ba5d0c|My Choice Golden Banana Pack 3|pack||1|24.00|2026-09|2026-09||name:existing_stub|RAW-BANANA|0.20
f053227f|Imported Carrots (China, Vietnam) 1 kg|kg||1|23.50|2026-09|2026-09||name:existing_stub|RAW-ONION-YELLOW|0.30
b0429cf7|S&C Flat Drinking Lid 8.|row||1|23.00|2026-06|2026-06||name:existing_stub|RAW-WATER-DRINKING|0.30
7198d1c7|Imported Carrot China per kg|kg||1|20.80|2026-07|2026-07||name:existing_stub|RAW-ONION-YELLOW|0.33
b427de38|Chor Chang Full Size Glass Carrier Bag|pcs||1|19.00|2026-06|2026-06||name:existing_stub|RAW-CHILI-BIRDSEYE-GREEN|0.14
1b8fc6e2|Cabbage, 700g Pack|pcs||1|19.00|2026-09|2026-09||name:existing_stub|RAW-CABBAGE|0.44
3b9f3fe1|MMP Glass Carrier Bag with Handle|pack||1|18.50|2026-06|2026-06||name:existing_stub|RAW-CARDAMOM|0.17
0846ee2c|Imported Carrot China/Vietnam 1 kg|kg||1|18.00|2026-09|2026-09||name:existing_stub|RAW-ONION-YELLOW|0.31
73bf58ea|JT Super Ice Cream Cup (12 pcs)|pcs||1|16.50|2026-06|2026-06||name:existing_stub|RAW-CUP_PAPER_8OZ|0.19
d6f3b73a|Import carrots|Kg||1|14.14|2026-07|2026-07||name:existing_stub|RAW-CARROT|0.38
d2b08e0a|Mixed Color Spoon-Tip Straws 6 mm*21cm (1*100*100)|pcs||1|13.00|2026-06|2026-06||name:existing_stub|RAW-STRAW_ECO_21CM|0.21
a61c48c0|Haribo Happy Cola 25g|pcs||1|12.00|2026-05|2026-05||name:existing_stub|RAW-NUTELLA_HAZELNUT_CHOCOLATE_SPREAD|0.12
7315782e|Savepak Table Salt Granular 1 kg|pcs||1|12.00|2026-09|2026-09||name:existing_stub|RAW-FROZEN-STRAWBERRIES|0.27
70338a55|Imported Carrot per kg|kg||1|6.25|2026-06|2026-06||name:existing_stub|RAW-ONION-YELLOW|0.37
312e71f8|Disney Shopping Bag 46x40cm #2|pcs||1|5.00|2026-03|2026-03||name:supplier_catalog|RAW-KRAFT_BAG_SMALL|0.12
da4702ba|Free Lanna Valley BBQ Flavor 1000g|pcs||1|0.00|2026-06|2026-06||name:existing_stub|RAW-HONEY-ARO|0.13
0c38f14e|Product return (barcode 8850332162240)|pcs|T|1|-419.00|2026-02|2026-02|RAW-BUTTER|barcode:supplier_catalog|RAW-GOOSEBERRY-CAPE|0.08
```
