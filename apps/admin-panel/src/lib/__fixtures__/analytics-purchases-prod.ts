/* ═══════════════════════════════════════════════════════════════════
   Real prod rows for the Purchases tab, read off the v_analytics_*
   views on 2026-10-17.

   Shared by analyticsPurchases.prod-parity.test.ts (aggregation vs
   hand-written SQL) and PurchasesTab.test.tsx (the same numbers as
   rendered). Absolute windows with a frozen `today`, so incoming
   purchases cannot drift the fixture.

   PURCHASES is the real `v_analytics_purchases_weekly` output collapsed
   to (week, supplier, is_canonical, cf_known) — a faithful input,
   because every aggregation that reads it groups by exactly those
   dimensions. The per-item identity columns are synthesised per group
   and are NOT used by any assertion; item-level facts come from
   ABC_ITEMS, which is real row by row.

   Sources: v_analytics_purchases_weekly · _purchase_coverage_weekly ·
   _price_watch · _abc_items · _food_cost_weekly (migration 463), plus
   has_bom from bom_structures (CEO-approved sixth source).
   ═══════════════════════════════════════════════════════════════════ */

import type {
  AbcItemRow,
  CoverageWeekRow,
  FoodCostWeekRow,
  PriceWatchRow,
  PurchaseWeekRow,
} from '../analyticsPurchases'

export const TODAY = '2026-10-17'
/** The 8-week default window for a frozen today of 2026-10-16. */
export const WINDOW_8W_START = '2026-08-24'
export const WINDOW_8W_END = '2026-10-16'

/* ─── v_analytics_purchases_weekly ───
   week | supplier | canonical | cf_known | lines | thb | last_invoice */
const PURCHASES_RAW = `
2026-06-29|Makro|0|0|24|4199.25|2026-07-03
2026-06-29|Makro|1|0|4|386.00|2026-07-03
2026-06-29|Makro|1|1|6|747.00|2026-07-03
2026-07-06|Makro|0|0|6|812.00|2026-07-07
2026-07-06|Makro|1|0|4|518.00|2026-07-07
2026-07-06|Makro|1|1|3|500.00|2026-07-07
2026-07-13|Makro|0|0|14|1658.19|2026-07-17
2026-07-13|Makro|1|0|5|564.75|2026-07-17
2026-07-13|Makro|1|1|4|423.00|2026-07-17
2026-08-17|GO Wholesale|0|0|6|594.25|2026-08-18
2026-08-17|GO Wholesale|1|0|1|54.75|2026-08-18
2026-08-17|Saeng Damrong Co., Ltd.|0|0|2|60.00|2026-08-17
2026-08-17|Sang Damrong Co., Ltd.|0|0|3|445.00|2026-08-17
2026-08-17|Supercheap Co., Ltd.|0|0|5|508.00|2026-08-21
2026-08-17|Supercheap Co., Ltd.|1|0|1|37.75|2026-08-21
2026-08-24|Supercheap Co., Ltd. Branch 0078|0|0|3|247.00|2026-08-24
2026-08-31|Local Market|0|0|1|30.00|2026-09-06
2026-08-31|Makro|0|0|2|1138.75|2026-09-04
2026-08-31|Makro|1|0|1|89.00|2026-09-04
2026-08-31|Makro|1|1|1|214.00|2026-09-04
2026-09-07|Local Market|1|0|1|50.00|2026-09-11
2026-09-14|Local Market|0|0|1|50.00|2026-09-15
2026-09-14|Local Market|1|0|2|155.00|2026-09-20
2026-09-14|Makro|0|0|25|4044.75|2026-09-20
2026-09-14|Makro|1|0|5|635.75|2026-09-20
2026-09-14|Makro|1|1|4|396.75|2026-09-20
2026-09-14|N Gas & Water Supplier|0|0|1|50.00|2026-09-17
2026-09-14|Supercheap Co., Ltd. Branch 0078|0|0|3|418.00|2026-09-17
2026-09-14|Tops Daily|0|0|3|98.00|2026-09-19
2026-09-14|Tops Daily|1|0|1|99.75|2026-09-14
2026-09-21|Local Market|0|0|1|80.00|2026-09-21
2026-09-21|Local Market|1|0|2|85.00|2026-09-26
2026-09-21|Makro|0|0|10|2270.50|2026-09-27
2026-09-21|Makro|1|0|2|111.50|2026-09-27
2026-09-21|Makro|1|1|1|75.00|2026-09-27
2026-09-21|Tops (Rawaiyana)|0|0|3|316.00|2026-09-21
2026-09-21|Tops (Rawaiyana)|1|0|1|106.00|2026-09-21
2026-09-21|Tops Daily|0|0|3|247.75|2026-09-25
2026-09-21|Tops RAWAYANA|0|0|1|198.00|2026-09-25
2026-09-28|Biodegradable Packaging for Environment Public Company Limited|0|0|2|312.00|2026-09-30
2026-09-28|FARANG FOOD PARADISE|0|0|1|1250.00|2026-09-28
2026-09-28|Makro|0|0|24|4367.75|2026-10-03
2026-09-28|Makro|1|0|6|621.25|2026-10-03
2026-09-28|Makro|1|1|3|520.00|2026-09-28
2026-09-28|Tops RAWAYANA|1|0|1|198.00|2026-10-03
2026-10-05|Makro|0|0|21|2091.75|2026-10-08
2026-10-05|Makro|1|0|5|682.25|2026-10-08
2026-10-05|Makro|1|1|1|39.00|2026-10-08
2026-10-05|Supercheap Co., Ltd.|0|0|1|325.00|2026-10-06
2026-10-05|Tops Daily|0|0|1|45.00|2026-10-09
2026-10-05|Tops RAWAYANA|0|0|2|184.00|2026-10-09
2026-10-05|Tops RAWAYANA|1|0|2|792.00|2026-10-09
2026-10-05|Water delivery|0|0|1|350.00|2026-10-08
`

export const PURCHASES: PurchaseWeekRow[] = PURCHASES_RAW.trim()
  .split('\n')
  .map((line, i) => {
    const [week, supplier, canonical, cfKnown, lines, thb, lastInvoice] = line.split('|')
    return {
      week,
      // Synthesised identity — no assertion reads these (see the header).
      nomenclature_id: `grp-${i}`,
      product_code: `GRP-${i}`,
      item_name: `group ${i}`,
      base_unit: 'kg',
      supplier_id: `sup-${supplier}`,
      supplier_name: supplier,
      lines: Number(lines),
      qty_base: 0,
      thb: Number(thb),
      last_price_per_unit: null,
      last_unit_price_base: null,
      last_invoice_date: lastInvoice,
      cf_known: cfKnown === '1',
      is_canonical: canonical === '1',
    }
  })

/* ─── v_analytics_purchase_coverage_weekly ───
   week | lines_total | canonical_lines | stub_lines | thb_total | thb_canonical | canonical_pct | unmatched_open */
const COVERAGE_RAW = `
2026-08-17|18|2|16|1699.75|92.50|5.44|0
2026-08-24|3|0|3|247.00|0.00|0.00|0
2026-08-31|5|2|3|1471.75|303.00|20.59|0
2026-09-07|1|1|0|50.00|50.00|100.00|0
2026-09-14|45|12|33|5948.00|1287.25|21.64|4
2026-09-21|24|6|18|3489.75|377.50|10.82|0
2026-09-28|37|10|27|7269.00|1339.25|18.42|0
2026-10-05|34|8|26|4509.00|1513.25|33.56|57
`

export const COVERAGE: CoverageWeekRow[] = COVERAGE_RAW.trim()
  .split('\n')
  .map((line) => {
    const [week, lt, cl, sl, tt, tc, pct, unmatched] = line.split('|')
    return {
      week,
      lines_total: Number(lt),
      canonical_lines: Number(cl),
      stub_lines: Number(sl),
      thb_total: Number(tt),
      thb_canonical: Number(tc),
      canonical_pct: Number(pct),
      canonical_lines_pct: Number(cl) > 0 ? (Number(cl) / Number(lt)) * 100 : 0,
      unmatched_open: Number(unmatched),
    }
  })

/* ─── v_analytics_food_cost_weekly ───
   week | revenue | purchases_all | purchases_canonical | cogs_theoretical | fc_theoretical_pct | fc_actual_pct */
const FOOD_COST_RAW = `
2026-07-20|2924.00|0.00|0.00|578.46|19.78|0.00
2026-07-27|4915.00|0.00|0.00|1138.15|23.16|0.00
2026-08-03|2340.00|0.00|0.00|445.72|19.05|0.00
2026-08-10|2201.00|0.00|0.00|456.70|20.75|0.00
2026-08-17|6297.00|1699.75|92.50|1103.70|17.53|1.47
2026-08-24|4742.00|247.00|0.00|925.64|19.52|0.00
2026-08-31|8690.00|1471.75|303.00|1825.93|21.01|3.49
2026-09-07|13794.00|50.00|50.00|3267.72|23.69|0.36
2026-09-14|11805.00|5948.00|1287.25|2867.62|24.29|10.90
2026-09-21|12259.00|3489.75|377.50|3071.70|25.06|3.08
2026-09-28|9393.00|7269.00|1339.25|1814.57|19.32|14.26
2026-10-05|17128.00|4509.00|1513.25|4258.48|24.86|8.83
2026-10-12|8717.00|0.00|0.00|2088.17|23.96|0.00
`

export const FOOD_COST: FoodCostWeekRow[] = FOOD_COST_RAW.trim()
  .split('\n')
  .map((line) => {
    const [week, revenue, all, canonical, cogs, fcTheo, fcActual] = line.split('|')
    return {
      week,
      revenue: Number(revenue),
      receipts: 0,
      cogs_theoretical: Number(cogs),
      purchases_thb_canonical: Number(canonical),
      purchases_thb_all: Number(all),
      inventory_close_thb: null,
      inventory_open_thb: null,
      inventory_delta_thb: null,
      cogs_actual: Number(canonical),
      cogs_actual_basis: 'purchases_based',
      fc_theoretical_pct: Number(fcTheo),
      fc_actual_pct: Number(fcActual),
      gap_thb: null,
    }
  })

/* ─── v_analytics_price_watch ───
   code | name | base_unit | supplier | last_price | median_8w | delta_pct | spike | cf_known | class | weeks | last_invoice */
const PRICE_WATCH_RAW = `
RAW-CUCUMBER|Short Cucumber 500 g|kg|Makro|156.0000|108.0000|44.44|1|1|B|3|2026-10-08
RAW-LETTUCE-ICEBERG|Iceberg Lettuce|kg|Makro|88.9957|78.9527|12.72|1|0|A|5|2026-10-08
RAW-BEETROOT|Beetroot|kg|Makro|79.0000|77.0000|2.60|0|0|A|2|2026-10-08
RAW-MILK-FRESH|Meiji Fresh Milk Plain 5 Liters|pack|Tops Daily|99.7500|99.7500|0.00|0|0|B|1|2026-09-14
RAW-PARSLEY|Parsley 100 g|kg|Makro|3500.0000|3500.0000|0.00|0|1|B|1|2026-09-20
RAW-ONION-YELLOW|Imported Onion pack 1 kg|pack|Makro|32.0000|32.0000|0.00|0|0|C|1|2026-09-27
RAW-BELL-PEPPER-RED|Tricolor Bell Pepper 1 kg|kg|Makro|125.0000|125.0000|0.00|0|0|C|1|2026-09-27
RAW-LIME-FRESH|Seedless lime, 25 fruits for juice, per pack|pcs|Makro|99.0000|99.0000|0.00|0|0|B|1|2026-09-20
RAW-ONION|Onion|kg|Makro|45.0000|45.0000|0.00|0|0|C|1|2026-09-28
RAW-POTATO|Potatoes 1 kg|kg|Makro|39.0000|39.0000|0.00|0|0|A|3|2026-10-03
RAW-BANANA|Banana|kg|Local Market|90.0000|90.0000|0.00|0|0|B|1|2026-09-20
RAW-RADISH|Red Radish 500 g|kg|Makro|300.0000|300.0000|0.00|0|1|C|1|2026-09-27
RAW-CABBAGE|Cabbage|kg|Supercheap Co., Ltd.|24.0446|24.0446|0.00|0|0|C|1|2026-08-21
RAW-BUTTER|ALLOWRIE Unsalted Compound Butter 2 kg|kg|Makro|107.0000|107.0000|0.00|0|1|A|1|2026-09-04
RAW-SWEET-POTATO|Thai Sweet Potato Pack 1 kg|kg|Makro|59.0000|59.0000|0.00|0|0|A|2|2026-10-08
RAW-CHESTNUTS-ROASTED|Roasted Chestnuts|pcs|Tops (Rawaiyana)|53.0000|53.0000|0.00|0|0|B|1|2026-09-21
RAW-CHEESE-MOZZARELLA|Shredded Mozzarella Cheese|kg|Makro|438.0000|438.0000|0.00|0|0|A|1|2026-10-03
RAW-MUSHROOM-SHIITAKE|Shiitake Mushrooms (Fresh)|kg|Makro|496.8270|496.8270|0.00|0|1|A|1|2026-09-20
RAW-CORIANDER-POWDER|Ground Coriander 200 g|kg|Local Market|10.0000|10.0000|0.00|0|0|C|1|2026-09-26
RAW-LEMON|Lemon Pack 4 pcs|pcs|Makro|79.0000|79.0000|0.00|0|0|A|2|2026-10-08
RAW-BREAD_CUBIC_19GRAIN|Multigrain Bread (Yellow Pack)|kg|Makro|763.8889|763.8889|0.00|0|1|A|2|2026-09-28
RAW-FROZEN_APRICOT|ARO Frozen Apricot 1 kg|kg|Makro|99.0000|99.0000|0.00|0|0|B|1|2026-10-08
RAW-CHICKPEAS|Chickpeas|kg|Makro|236.0000|236.0000|0.00|0|1|A|1|2026-09-28
RAW-WRAP_DELISUN_CHIA_FLAX|DELI SUN Chia & Flax Wraps Tortillas 360 g (6 x 60 g)|kg|Tops RAWAYANA|99.0000|99.0000|0.00|0|0|A|2|2026-10-09
RAW-CARROT|Carrot|kg|Local Market|75.0000|75.0000|0.00|0|0|A|3|2026-09-26
`

export const PRICE_WATCH: PriceWatchRow[] = PRICE_WATCH_RAW.trim()
  .split('\n')
  .map((line) => {
    const [code, name, unit, supplier, last, median, delta, spike, cf, cls, weeks, invoice] =
      line.split('|')
    return {
      nomenclature_id: `pw-${code}`,
      product_code: code,
      item_name: name,
      base_unit: unit,
      supplier_id: `sup-${supplier}`,
      supplier_name: supplier,
      last_unit_price: Number(last),
      median_unit_price_8w: Number(median),
      last_invoice_date: invoice,
      weeks_observed: Number(weeks),
      cf_known: cf === '1',
      count_class: cls,
      delta_pct: Number(delta),
      is_spike: spike === '1',
    }
  })

/* ─── v_analytics_abc_items, top 22 by 8-week spend, + has_bom ───
   code | name | base_unit | canonical | thb_8w | lines_8w | class | has_bom */
const ABC_RAW = `
RAW-AUTO-6eb5e77b|Extra Virgin Olive Oil 'Ybarra' / 5L Pail|pcs|0|1250.00|1||0
RAW-AUTO-5c683281|Australian Crying Tiger Beef|kg|0|1054.75|1||0
RAW-WRAP_DELISUN_CHIA_FLAX|DELI SUN Chia & Flax Wraps Tortillas 360 g (6 x 60 g)|kg|1|990.00|3|A|1
RAW-AUTO-d27f620d|CP Prawns (26-30 count) 5207|pcs|0|828.00|1||0
RAW-LETTUCE-ICEBERG|Iceberg Lettuce|kg|1|701.25|5|A|1
RAW-AUTO-85ca7969|Purple Cabbage 13 kg+, per kg|kg|0|634.75|1||0
RAW-AUTO-7261e4f6|ARO Frozen Smoked Sliced Salmon Trout 500g|pack|0|569.00|1||0
RAW-AUTO-f562e9cb|Australian Frozen Minced Lamb 1 kg|pcs|0|485.00|1||0
RAW-AUTO-80858736|CP Frozen Minced Lamb 1KG|pcs|0|485.00|1||0
RAW-AUTO-e845f31e|CP Frozen Lamb Meat 1KG|pcs|0|485.00|1||0
RAW-AUTO-ac6774da|Anchor Whipping Cream 1 Litre|pcs|0|458.00|1||0
RAW-THAI-EGGPLANT|Thai Eggplant|kg|0|377.00|2||0
RAW-AUTO-402fc40e|Boncafe Espresso Coffee Beans 600g|pcs|0|365.00|1||0
RAW-AUTO-e62258f6|Boncafe Espresso Beans 600 g|pcs|0|360.00|1||0
RAW-AUTO-69961f11|FM Water 2000 L|pcs|0|350.00|1||0
RAW-AUTO-2f126585|SAVE Frozen White Prawns Tail-on 48-540g 1x1|pack|0|335.00|1||0
RAW-AUTO-13eb3180|SavePak Frozen White Shrimp Tail-on (48-54 pcs) 1 kg|pcs|0|335.00|1||0
RAW-AUTO-94ac9da4|ARD Mixed Shredded Mozzarella|pcs|0|330.00|1||0
RAW-AUTO-ff2cc49c|ARO Shredded Mozzarella and Cheddar Cheese Blend 1 kg|pcs|0|330.00|1||0
RAW-AUTO-36b1a798|Dairy Delights Sheredded|pcs|0|325.00|1||0
RAW-AUTO-f5aee61a|Skinless Chicken Breast Fillet (kg)|kg|0|317.00|1||0
RAW-LEMON|Lemon Pack 4 pcs|pcs|1|316.00|2|A|1
`

export const ABC_ITEMS: AbcItemRow[] = ABC_RAW.trim()
  .split('\n')
  .map((line) => {
    const [code, name, unit, canonical, thb, lines, cls, hasBom] = line.split('|')
    return {
      nomenclature_id: `abc-${code}`,
      product_code: code,
      name,
      base_unit: unit,
      type: 'RAW',
      is_canonical: canonical === '1',
      purchase_thb_8w: Number(thb),
      lines_8w: Number(lines),
      last_invoice_date: null,
      cum_share: null,
      count_class: cls === '' ? null : cls,
      has_bom: hasBom === '1',
    }
  })
