import { describe, it, expect } from 'vitest'
import { periodRange } from './analytics'
import {
  CANONICAL_PCT_TRUSTWORTHY,
  FOOD_COST_BAND,
  OTHER_SUPPLIER_NAME,
  coverageTotals,
  previousWeekWindow,
  priceWatchView,
  ratioSeries,
  supplierSlug,
  supplierTable,
  topSpendItems,
  weeklySpend,
  type AbcItemRow,
  type CoverageWeekRow,
  type FoodCostWeekRow,
  type PriceWatchRow,
  type PurchaseWeekRow,
} from './analyticsPurchases'

const RANGE = periodRange(4, '2026-10-16') // weeks 2026-09-21 … 2026-10-12

/* ─── Fixture builders ─── */

function purchase(week: string, over: Partial<PurchaseWeekRow> = {}): PurchaseWeekRow {
  return {
    week,
    nomenclature_id: 'n1',
    product_code: 'RAW-X',
    item_name: 'X',
    base_unit: 'kg',
    supplier_id: 's1',
    supplier_name: 'Alpha',
    lines: 1,
    qty_base: 1,
    thb: 100,
    last_price_per_unit: 100,
    last_unit_price_base: 100,
    last_invoice_date: week,
    cf_known: true,
    is_canonical: true,
    ...over,
  }
}

function coverage(week: string, over: Partial<CoverageWeekRow> = {}): CoverageWeekRow {
  return {
    week,
    lines_total: 10,
    canonical_lines: 2,
    stub_lines: 8,
    thb_total: 1000,
    thb_canonical: 200,
    canonical_pct: 20,
    canonical_lines_pct: 20,
    unmatched_open: 0,
    ...over,
  }
}

function foodCost(week: string, over: Partial<FoodCostWeekRow> = {}): FoodCostWeekRow {
  return {
    week,
    revenue: 1000,
    receipts: 10,
    cogs_theoretical: 200,
    purchases_thb_canonical: 100,
    purchases_thb_all: 300,
    inventory_close_thb: null,
    inventory_open_thb: null,
    inventory_delta_thb: null,
    cogs_actual: 100,
    cogs_actual_basis: 'purchases_based',
    fc_theoretical_pct: 20,
    fc_actual_pct: 10,
    gap_thb: null,
    ...over,
  }
}

function priceRow(over: Partial<PriceWatchRow> = {}): PriceWatchRow {
  return {
    nomenclature_id: 'p1',
    product_code: 'RAW-P',
    item_name: 'P',
    base_unit: 'kg',
    supplier_id: 's1',
    supplier_name: 'Alpha',
    last_unit_price: 110,
    median_unit_price_8w: 100,
    last_invoice_date: '2026-10-01',
    weeks_observed: 4,
    cf_known: true,
    count_class: 'A',
    delta_pct: 10,
    is_spike: false,
    ...over,
  }
}

function abcRow(over: Partial<AbcItemRow> = {}): AbcItemRow {
  return {
    nomenclature_id: 'a1',
    product_code: 'RAW-A',
    name: 'A',
    base_unit: 'kg',
    type: 'RAW',
    is_canonical: true,
    purchase_thb_8w: 100,
    lines_8w: 1,
    last_invoice_date: null,
    cum_share: null,
    count_class: 'A',
    has_bom: true,
    ...over,
  }
}

/* ─── previousWeekWindow ─── */

describe('previousWeekWindow', () => {
  it('returns the N whole ISO weeks before the period', () => {
    expect(previousWeekWindow(RANGE)).toEqual({ start: '2026-08-24', end: '2026-09-14' })
  })

  it('never overlaps the period itself', () => {
    const prev = previousWeekWindow(RANGE)
    expect(prev.end < RANGE.weekStarts[0]).toBe(true)
  })

  it('scales with the selector', () => {
    expect(previousWeekWindow(periodRange(13, '2026-10-16')).start).toBe('2026-04-20')
  })
})

/* ─── Coverage ─── */

describe('coverageTotals', () => {
  it('sums only the weeks inside the period', () => {
    const t = coverageTotals(
      [coverage('2026-09-21'), coverage('2026-10-12'), coverage('2026-01-05', { thb_total: 9999 })],
      RANGE,
    )
    expect(t.weeksCovered).toBe(2)
    expect(t.thbTotal).toBe(2000)
  })

  it('recomputes canonical_pct from the summed THB, not by averaging weekly percentages', () => {
    // A tiny 100 %-canonical week must not drag the period average upward.
    const t = coverageTotals(
      [
        coverage('2026-09-21', { thb_total: 10_000, thb_canonical: 1_000, canonical_pct: 10 }),
        coverage('2026-09-28', { thb_total: 100, thb_canonical: 100, canonical_pct: 100 }),
      ],
      RANGE,
    )
    // Mean of 10 and 100 would be 55; the honest figure is 1100/10100.
    expect(t.canonicalPct).toBeCloseTo((1_100 / 10_100) * 100, 6)
    expect(t.canonicalPct).toBeLessThan(12)
  })

  it('never divides by zero on an empty period', () => {
    const t = coverageTotals([], RANGE)
    expect(t.canonicalPct).toBe(0)
    expect(t.thbTotal).toBe(0)
    expect(t.weeksCovered).toBe(0)
  })

  it('keeps the trustworthy threshold where the spec put it', () => {
    expect(CANONICAL_PCT_TRUSTWORTHY).toBe(90)
  })
})

/* ─── Supplier table ─── */

describe('supplierTable', () => {
  it('ranks by spend and computes each share', () => {
    const rows = supplierTable(
      [
        purchase('2026-09-21', { supplier_name: 'Alpha', thb: 300 }),
        purchase('2026-09-28', { supplier_name: 'Beta', thb: 100 }),
      ],
      RANGE,
    )
    expect(rows.map((r) => r.supplier)).toEqual(['Alpha', 'Beta'])
    expect(rows[0].sharePct).toBeCloseTo(75)
    expect(rows[1].sharePct).toBeCloseTo(25)
  })

  it('takes the latest invoice date, not the first seen', () => {
    const rows = supplierTable(
      [
        purchase('2026-09-21', { last_invoice_date: '2026-09-25' }),
        purchase('2026-09-28', { last_invoice_date: '2026-10-02' }),
      ],
      RANGE,
    )
    expect(rows[0].lastInvoice).toBe('2026-10-02')
  })

  it('compares against whole weeks before the period', () => {
    const rows = supplierTable(
      [
        purchase('2026-09-21', { thb: 200 }),
        // inside previousWeekWindow (2026-08-24 … 2026-09-14)
        purchase('2026-08-24', { thb: 100 }),
      ],
      RANGE,
    )
    expect(rows[0].prevThb).toBe(100)
    expect(rows[0].deltaPct).toBeCloseTo(100)
  })

  it('leaves the delta undefined for a supplier with no history', () => {
    const rows = supplierTable([purchase('2026-09-21')], RANGE)
    expect(rows[0].prevThb).toBe(0)
    expect(rows[0].deltaPct).toBeUndefined()
  })

  it('labels a missing supplier rather than dropping the spend', () => {
    const rows = supplierTable([purchase('2026-09-21', { supplier_name: null })], RANGE)
    expect(rows[0].supplier).toBe('(no supplier)')
    expect(rows[0].thb).toBe(100)
  })
})

/* ─── Weekly spend ─── */

describe('supplierSlug', () => {
  it('strips what recharts would read as a nested path', () => {
    // A dot in a dataKey makes recharts look for row["Supercheap Co"]["Ltd"].
    expect(supplierSlug('Supercheap Co., Ltd.')).toBe('supercheap_co_ltd')
    expect(supplierSlug('N Gas & Water Supplier')).toBe('n_gas_water_supplier')
    expect(supplierSlug('Tops (Rawaiyana)')).toBe('tops_rawaiyana')
  })

  it('never returns an empty key', () => {
    expect(supplierSlug('...')).toBe('supplier')
    expect(supplierSlug('')).toBe('supplier')
  })
})

describe('weeklySpend', () => {
  it('emits one point per ISO week even when nothing was bought', () => {
    const spend = weeklySpend([purchase('2026-10-12')], RANGE)
    expect(spend.points).toHaveLength(4)
    expect(spend.points[0].total).toBe(0)
    expect(spend.points[3].total).toBe(100)
  })

  it('splits a supplier into canonical and stub series', () => {
    const spend = weeklySpend(
      [
        purchase('2026-10-12', { thb: 70, is_canonical: true }),
        purchase('2026-10-12', { thb: 30, is_canonical: false }),
      ],
      RANGE,
    )
    const wk = spend.points[3]
    expect(wk.alpha__canonical).toBe(70)
    expect(wk.alpha__stub).toBe(30)
    expect(wk.total).toBe(100)
  })

  it('folds suppliers past the cap into one wedge, losing no THB', () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n, i) =>
      purchase('2026-10-12', { supplier_name: n, thb: 100 - i }),
    )
    const spend = weeklySpend(rows, RANGE, 3)
    expect(spend.suppliers).toEqual(['A', 'B', 'C', OTHER_SUPPLIER_NAME])
    expect(spend.grandTotal).toBe(rows.reduce((s, r) => s + r.thb, 0))
    expect(spend.points[3].total).toBe(spend.grandTotal)
  })

  it('does not fold when the suppliers already fit', () => {
    const spend = weeklySpend([purchase('2026-10-12', { supplier_name: 'Solo' })], RANGE, 3)
    expect(spend.suppliers).toEqual(['Solo'])
  })

  it('ignores purchases outside the period', () => {
    const spend = weeklySpend([purchase('2026-01-05', { thb: 9999 })], RANGE)
    expect(spend.grandTotal).toBe(0)
  })
})

/* ─── Purchases ÷ revenue ─── */

describe('ratioSeries', () => {
  it('divides ALL purchases by revenue, keeping the canonical figure apart', () => {
    const s = ratioSeries([foodCost('2026-10-12')], RANGE)
    const wk = s[3]
    expect(wk.pctAll).toBeCloseTo(30) // 300 / 1000
    expect(wk.pctCanonicalOnly).toBeCloseTo(10) // the view's own, understated
  })

  it('returns null rather than zero for a week with no revenue', () => {
    const s = ratioSeries([foodCost('2026-10-12', { revenue: 0 })], RANGE)
    expect(s[3].pctAll).toBeNull()
  })

  it('smooths lumpy purchasing into a rolling mean', () => {
    // One big buy, then three quiet weeks: the weekly line spikes, the mean does not.
    const s = ratioSeries(
      [
        foodCost('2026-09-21', { purchases_thb_all: 4000, revenue: 1000 }),
        foodCost('2026-09-28', { purchases_thb_all: 0, revenue: 1000 }),
        foodCost('2026-10-05', { purchases_thb_all: 0, revenue: 1000 }),
        foodCost('2026-10-12', { purchases_thb_all: 0, revenue: 1000 }),
      ],
      RANGE,
    )
    expect(s[0].pctAll).toBeCloseTo(400)
    expect(s[3].pctAll).toBeCloseTo(0)
    // 4000 bought across 4000 of revenue → 100 %, far more readable than 400/0.
    expect(s[3].rollingPct).toBeCloseTo(100)
  })

  it('excludes revenue-less weeks from the mean instead of counting them as 0 %', () => {
    const s = ratioSeries(
      [
        foodCost('2026-10-05', { purchases_thb_all: 300, revenue: 1000 }),
        foodCost('2026-10-12', { purchases_thb_all: 0, revenue: 0 }),
      ],
      RANGE,
    )
    // The closed week must not halve the mean.
    expect(s[3].rollingPct).toBeCloseTo(30)
  })

  it('is null across a period with no revenue at all', () => {
    expect(ratioSeries([], RANGE).every((p) => p.rollingPct === null)).toBe(true)
  })

  it('keeps the target band where the spec put it', () => {
    expect(FOOD_COST_BAND).toEqual({ low: 28, high: 35 })
  })
})

/* ─── Price watch ─── */

describe('priceWatchView', () => {
  it('only surfaces spikes', () => {
    const v = priceWatchView([priceRow({ is_spike: false }), priceRow({ is_spike: true })])
    expect(v.comparableSpikes).toHaveLength(1)
  })

  it('separates spikes whose unit price is not comparable', () => {
    const v = priceWatchView([
      priceRow({ product_code: 'RAW-KNOWN', is_spike: true, cf_known: true }),
      priceRow({ product_code: 'RAW-UNKNOWN', is_spike: true, cf_known: false }),
    ])
    expect(v.comparableSpikes.map((r) => r.product_code)).toEqual(['RAW-KNOWN'])
    expect(v.unknownPackSpikes.map((r) => r.product_code)).toEqual(['RAW-UNKNOWN'])
  })

  it('sorts spikes by how far the price moved', () => {
    const v = priceWatchView([
      priceRow({ item_name: 'small', is_spike: true, delta_pct: 11 }),
      priceRow({ item_name: 'big', is_spike: true, delta_pct: 90 }),
    ])
    expect(v.comparableSpikes.map((r) => r.item_name)).toEqual(['big', 'small'])
  })

  it('counts rows whose median rests on a single observation', () => {
    const v = priceWatchView([priceRow({ weeks_observed: 1 }), priceRow({ weeks_observed: 5 })])
    expect(v.noMedianYet).toBe(1)
  })

  it('handles a null delta without crashing the sort', () => {
    const v = priceWatchView([
      priceRow({ is_spike: true, delta_pct: null }),
      priceRow({ is_spike: true, delta_pct: 5 }),
    ])
    expect(v.comparableSpikes).toHaveLength(2)
  })
})

/* ─── Top spend ─── */

describe('topSpendItems', () => {
  it('ranks by 8-week spend and caps the list', () => {
    const view = topSpendItems(
      [
        abcRow({ product_code: 'RAW-SMALL', purchase_thb_8w: 10 }),
        abcRow({ product_code: 'RAW-BIG', purchase_thb_8w: 900 }),
      ],
      1,
    )
    expect(view.items.map((i) => i.product_code)).toEqual(['RAW-BIG'])
  })

  it('counts stubs, classed rows and items nothing consumes', () => {
    const view = topSpendItems([
      abcRow({ product_code: 'RAW-GOOD', is_canonical: true, count_class: 'A', has_bom: true }),
      abcRow({ product_code: 'RAW-AUTO-1', is_canonical: false, count_class: null, has_bom: false }),
      abcRow({ product_code: 'RAW-AUTO-2', is_canonical: false, count_class: null, has_bom: false }),
    ])
    expect(view.stubCount).toBe(2)
    expect(view.classedCount).toBe(1)
    expect(view.noBomCount).toBe(2)
  })

  it('does not call an item BOM-less while the BOM set is still loading', () => {
    const view = topSpendItems([abcRow({ has_bom: undefined })])
    expect(view.items[0].hasBom).toBeUndefined()
    expect(view.noBomCount).toBe(0)
  })

  it('breaks ties deterministically', () => {
    const view = topSpendItems([
      abcRow({ product_code: 'RAW-B', purchase_thb_8w: 485 }),
      abcRow({ product_code: 'RAW-A', purchase_thb_8w: 485 }),
    ])
    expect(view.items.map((i) => i.product_code)).toEqual(['RAW-A', 'RAW-B'])
  })
})
