/* ═══════════════════════════════════════════════════════════════════
   Real prod rows for the Stock control tab, read off the views on
   2026-10-17. Frozen, so incoming counts cannot drift the fixture.

   INVENTORY is the real `v_analytics_inventory_value` output with the
   columns this tab reads — location, class, canonical, qty, cost,
   value. Item identity is synthesised per row and no assertion reads
   it: spec §5 Tab 3 asks for a tile BY LOCATION, not an item list.

   VARIANCE and WASTE are deliberately EMPTY, because prod is:
   `v_analytics_stock_variance` needs two count days and has one
   (2026-09-01), and `waste_logs` has no rows at all (Phase 0.4).
   SYNTHETIC_VARIANCE exists so the variance arithmetic is tested
   before the first real interval arrives — it is NOT prod data and
   nothing presents it as such.

   Sources: v_analytics_inventory_value · _count_days · _stock_variance
   · _waste_weekly · _bom_coverage_weekly (migration 463), plus
   v_station_replenishment and v_stock_status as-is.
   ═══════════════════════════════════════════════════════════════════ */

import type {
  BomCoverageWeekRow,
  CountDayRow,
  InventoryValueRow,
  ReplenishmentRow,
  StockStatusRow,
  StockVarianceRow,
  WasteWeekRow,
} from '../analyticsStock'

export const TODAY = '2026-10-17'
/** The one count day prod has, in Asia/Bangkok. */
export const COUNT_DAY = '2026-09-01'

/* ─── v_analytics_inventory_value: location | class | canonical | qty | cost | value ─── */
const INVENTORY_RAW = `
Bar||0|24.0000|79.0000|1896.0000
Bar|C|1|946.0000|0.5429|513.5400
Bar|C|1|766.0000|0.6412|491.1600
Bar|C|1|828.0000|0.5429|449.4900
Bar|A|1|0.1130|3500.0000|395.5000
Bar|B|1|2.0360|175.0000|356.3000
Bar|C|1|621.0000|0.5429|337.1100
Bar|C|1|621.0000|0.5429|337.1100
Bar|C|1|22.0000|13.8300|304.2600
Bar|B|1|1.0000|279.0000|279.0000
Bar|A|1|0.4120|602.2727|248.1400
Bar|C|1|2.0000|108.9000|217.8000
Bar|B|1|0.4730|266.4000|126.0100
Bar|B|1|0.1990|495.0000|98.5100
Bar|B|1|0.3000|305.5556|91.6700
Bar|C|1|1.0000|66.0000|66.0000
Bar|C|1|1.0510|60.0000|63.0600
Bar|C|1|1.0000|59.0000|59.0000
Bar|B|1|0.2000|250.0000|50.0000
Bar|A|1|0.0350|788.8889|27.6100
Bar|B|1|0.0590|99.0000|5.8400
Bar|C|1|0.0580|81.3334|4.7200
Bar||1|22.0000|0.0000|0.0000
Bar|C|1|11.0000|0.0000|0.0000
Bar||1|12.0000|0.0000|0.0000
Bar||1|12.0000|0.0000|0.0000
Bar||1|11.0000|0.0000|0.0000
Bar||1|12.0000|0.0000|0.0000
Bar||1|13.0000|0.0000|0.0000
Bar|C|1|0.9460|0.0000|0.0000
Bar|C|1|16.0000|0.0000|0.0000
Chocolate Counter||1|3.0000|0.0000|0.0000
Chocolate Counter||1|7.0000|0.0000|0.0000
Chocolate Counter||1|3.0000|0.0000|0.0000
Chocolate Counter||1|7.0000|0.0000|0.0000
Chocolate Counter||1|9.0000|0.0000|0.0000
Freezer||1|17.0000|31.8621|541.6600
Freezer||1|19.0000|19.9264|378.6000
Freezer||1|20.0000|12.0203|240.4100
Freezer||1|22.0000|10.5622|232.3700
Freezer||1|9.0000|16.8318|151.4900
Freezer||1|12.0000|8.8413|106.1000
Freezer||1|0.0000|21.4264|0.0000
Fridge|B|1|2.6560|480.1000|1275.1500
Fridge|C|1|13.0000|96.5000|1254.5000
Fridge|A|1|0.7090|775.0000|549.4800
Fridge|A|1|0.4900|1038.0000|508.6200
Fridge|A|1|4.0000|117.6444|470.5800
Fridge|A|1|0.5120|772.2222|395.3800
Fridge|B|1|2.4550|123.0321|302.0400
Fridge|A|1|4.0000|74.5555|298.2200
Fridge|A|1|0.7130|401.2626|286.1000
Fridge|B|1|0.8520|315.0000|268.3800
Fridge||1|0.4110|623.3800|256.2100
Fridge|A|1|0.3630|688.3525|249.8700
Fridge|C|1|4.0000|53.5282|214.1100
Fridge|C|1|0.4000|460.0000|184.0000
Fridge|A|1|0.3660|498.3643|182.4000
Fridge|A|1|0.1460|1245.0000|181.7700
Fridge|B|1|0.4110|427.3583|175.6400
Fridge|C|1|1.6080|108.9000|175.1100
Fridge|C|1|0.6350|245.2100|155.7100
Fridge|A|1|1.2360|124.3675|153.7200
Fridge|A|1|0.2560|600.0000|153.6000
Fridge|A|1|1.9000|77.7382|147.7000
Fridge|B|1|0.4950|294.0000|145.5300
Fridge|B|1|1.1880|120.0000|142.5600
Fridge|A|1|0.5990|229.2214|137.3000
Fridge|B|1|0.3120|422.5000|131.8200
Fridge|B|1|0.3610|318.1334|114.8500
Fridge|A|1|0.1870|569.0000|106.4000
Fridge|B|1|0.9160|115.6818|105.9600
Fridge|B|1|0.5810|178.0000|103.4200
Fridge|A|1|0.0820|1240.0000|101.6800
Fridge|B|1|0.3580|275.0000|98.4500
Fridge|B|1|0.2590|352.5000|91.3000
Fridge|B|1|0.3520|251.7647|88.6200
Fridge|B|1|0.5030|170.0000|85.5100
Fridge|C|1|1.2500|67.0000|83.7500
Fridge|B|1|0.7640|109.0000|83.2800
Fridge|B|1|0.2770|290.0000|80.3300
Fridge|A|1|1.2440|63.8893|79.4800
Fridge|B|1|0.2640|299.0000|78.9400
Fridge||1|0.3880|189.0000|73.3300
Fridge|C|1|0.8080|89.0000|71.9100
Fridge|A|1|0.0660|968.6275|63.9300
Fridge|B|1|0.4250|143.3333|60.9200
Fridge|A|1|0.6760|89.4518|60.4700
Fridge|B|1|0.4210|138.0000|58.1000
Fridge|C|1|0.5740|99.0000|56.8300
Fridge|C|1|0.7170|78.0000|55.9300
Fridge|A|1|0.0610|890.0000|54.2900
Fridge||1|0.8640|62.5000|54.0000
Fridge|B|1|0.2140|215.0000|46.0100
Fridge|C|1|0.9100|45.0000|40.9500
Fridge|C|1|0.3200|122.2927|39.1300
Fridge|C|1|0.3070|123.8240|38.0100
Fridge|C|1|0.2960|125.0000|37.0000
Fridge|C|1|0.6880|50.0000|34.4000
Fridge||0|0.2250|129.0000|29.0300
Fridge|B|1|0.0720|399.0000|28.7300
Fridge|C|1|0.6220|45.0000|27.9900
Fridge||1|0.2760|99.0000|27.3200
Fridge|B|1|0.1230|212.0000|26.0800
Fridge|A|1|0.4390|57.5790|25.2800
Fridge|C|1|0.6700|37.2877|24.9800
Fridge|B|1|0.0640|352.9508|22.5900
Fridge|B|1|0.1280|175.2066|22.4300
Fridge|C|1|0.3790|52.0000|19.7100
Fridge|C|1|0.2980|57.2000|17.0500
Fridge|C|1|0.3940|43.0000|16.9400
Fridge||0|0.1310|129.0000|16.9000
Fridge||1|0.0360|429.8655|15.4800
Fridge|C|1|0.8410|18.1600|15.2700
Fridge|C|1|0.2050|74.0000|15.1700
Fridge|B|1|0.0520|225.0000|11.7000
Fridge|C|1|0.4000|27.2807|10.9100
Fridge||0|0.3020|33.0000|9.9700
Fridge|C|1|0.2250|43.9796|9.9000
Fridge||1|0.0400|149.0000|5.9600
Fridge|C|1|0.1390|30.9667|4.3000
Fridge||1|0.0000|368.5714|0.0000
`

export const INVENTORY: InventoryValueRow[] = INVENTORY_RAW.trim()
  .split('\n')
  .map((line, i) => {
    const [location, cls, canonical, qty, cost, value] = line.split('|')
    return {
      nomenclature_id: `inv-${i}`,
      product_code: `ITEM-${i}`,
      item_name: `item ${i}`,
      base_unit: 'kg',
      location_id: `loc-${location}`,
      location_name: location,
      counted_qty: Number(qty),
      cost_per_unit: cost === '' ? null : Number(cost),
      value_thb: Number(value),
      counted_on: COUNT_DAY,
      days_since_count: 46,
      count_class: cls === '' ? null : cls,
      is_canonical: canonical === '1',
    }
  })

/* ─── v_analytics_count_days: 121 items on the single count day, 23 of them A ─── */
export const COUNT_DAYS: CountDayRow[] = Array.from({ length: 121 }, (_, i) => ({
  count_day: COUNT_DAY,
  nomenclature_id: `cd-${i}`,
  product_code: `ITEM-${i}`,
  item_name: `item ${i}`,
  base_unit: 'kg',
  // 23 A-class, matching prod.
  count_class: i < 23 ? 'A' : i < 60 ? 'B' : 'C',
  counted_qty: 1,
  locations_counted: 1,
  locations_expected: 1,
  stations_counted: 1,
  is_complete: true,
  counted_thb: 10,
}))

/* ─── Empty on prod, and that is the point ─── */
export const VARIANCE: StockVarianceRow[] = []
export const WASTE: WasteWeekRow[] = []

/* ─── v_analytics_bom_coverage_weekly ─── */
const BOM_RAW = `
2026-08-24|77.78
2026-08-31|84.72
2026-09-07|85.71
2026-09-14|91.95
2026-09-21|88.31
2026-09-28|71.64
2026-10-05|84.82
2026-10-12|89.83
`

export const BOM_COVERAGE: BomCoverageWeekRow[] = BOM_RAW.trim()
  .split('\n')
  .map((line) => {
    const [week, pct] = line.split('|')
    return { week, deducted_units_pct: pct === '' ? null : Number(pct) }
  })

/* ─── v_station_replenishment: exactly one item below par on prod ─── */
export const REPLENISHMENT: ReplenishmentRow[] = [
  {
    nomenclature_id: 'rep-1',
    product_code: 'RAW-CHIA-SEEDS',
    name: 'Chia Seeds',
    base_unit: 'kg',
    location_name: 'Bar',
    on_hand: 0,
    min_stock: 1,
    par_stock: null,
    suggested_qty: 1,
    stock_status: 'out',
    replenish_action: 'purchase',
  },
]

/* ─── v_stock_status: nothing expiring or expired on prod today ─── */
export const STOCK_STATUS: StockStatusRow[] = []

/* ─── Synthetic two-count interval — NOT prod data ───
   Exists only so the variance arithmetic and the threshold colouring from
   spec section 6 are exercised before the first real interval lands. Opening
   quantities come from real prod counts; the closing count is invented. */
export const SYNTHETIC_VARIANCE: StockVarianceRow[] = [
  {
    // Red on both counts: 20 percent of usage AND THB 120 over a 7-day interval.
    opening_day: '2026-09-01',
    closing_day: '2026-09-08',
    days_in_interval: 7,
    nomenclature_id: 'syn-red',
    product_code: 'RAW-CHEESE-MOZZARELLA',
    item_name: 'Shredded Mozzarella Cheese',
    base_unit: 'kg',
    count_class: 'A',
    is_complete: true,
    opening_qty: 4,
    purchases_qty: 2,
    purchases_thb: 876,
    usage_qty: 1.5,
    waste_qty: 0,
    expected_closing_qty: 4.5,
    closing_qty: 4.2,
    variance_qty: 0.3,
    variance_thb: 120,
    variance_pct_of_usage: 20,
  },
  {
    // Watch: 12 percent of usage, small money.
    opening_day: '2026-09-01',
    closing_day: '2026-09-08',
    days_in_interval: 7,
    nomenclature_id: 'syn-watch',
    product_code: 'RAW-LETTUCE-ICEBERG',
    item_name: 'Iceberg Lettuce',
    base_unit: 'kg',
    count_class: 'A',
    is_complete: true,
    opening_qty: 2,
    purchases_qty: 3,
    purchases_thb: 267,
    usage_qty: 2.5,
    waste_qty: 0,
    expected_closing_qty: 2.5,
    closing_qty: 2.2,
    variance_qty: 0.3,
    variance_thb: 24,
    variance_pct_of_usage: 12,
  },
  {
    // Fine: 4 percent of usage.
    opening_day: '2026-09-01',
    closing_day: '2026-09-08',
    days_in_interval: 7,
    nomenclature_id: 'syn-ok',
    product_code: 'RAW-POTATO',
    item_name: 'Potatoes 1 kg',
    base_unit: 'kg',
    count_class: 'A',
    is_complete: true,
    opening_qty: 10,
    purchases_qty: 5,
    purchases_thb: 195,
    usage_qty: 5,
    waste_qty: 0,
    expected_closing_qty: 10,
    closing_qty: 9.8,
    variance_qty: 0.2,
    variance_thb: 8,
    variance_pct_of_usage: 4,
  },
  {
    // Incomplete: counted at one location but not every one it stocks, so it
    // would read as a phantom shortage and must be excluded (spec section 8).
    opening_day: '2026-09-01',
    closing_day: '2026-09-08',
    days_in_interval: 7,
    nomenclature_id: 'syn-incomplete',
    product_code: 'RAW-ONION',
    item_name: 'Onion',
    base_unit: 'kg',
    count_class: 'B',
    is_complete: false,
    opening_qty: 5,
    purchases_qty: 0,
    purchases_thb: 0,
    usage_qty: 2,
    waste_qty: 0,
    expected_closing_qty: 3,
    closing_qty: 0.5,
    variance_qty: 2.5,
    variance_thb: 112,
    variance_pct_of_usage: 125,
  },
]
