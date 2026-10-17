import { describe, it, expect } from 'vitest'
import { periodRange } from './analytics'
import {
  coverageTotals,
  previousWeekWindow,
  ratioSeries,
  supplierTable,
  weeklySpend,
  priceWatchView,
  topSpendItems,
} from './analyticsPurchases'
import {
  ABC_ITEMS,
  COVERAGE,
  FOOD_COST,
  PRICE_WATCH,
  PURCHASES,
  WINDOW_8W_END,
  WINDOW_8W_START,
} from './__fixtures__/analytics-purchases-prod'

/* ═══════════════════════════════════════════════════════════════════
   Prod parity — the acceptance proof for the Purchases tab.

   Real rows from the five views, with every expected figure computed
   independently by hand-written SQL (GROUP BY in Postgres, not this
   code). If a number the owner sees stops matching SQL, one of these
   fails.

   Frozen today = 2026-10-16, so the 8-week default window is
   2026-08-24 … 2026-10-16 and nothing drifts.
   ═══════════════════════════════════════════════════════════════════ */

const RANGE = periodRange(8, '2026-10-16')

describe('the frozen window matches the one SQL was run over', () => {
  it('spans 2026-08-24 … 2026-10-16 with 8 ISO weeks', () => {
    expect(RANGE.start).toBe(WINDOW_8W_START)
    expect(RANGE.end).toBe(WINDOW_8W_END)
    expect(RANGE.weekStarts).toHaveLength(8)
  })

  it('compares against eight WHOLE ISO weeks, not an equal number of days', () => {
    // The day-grain window PeriodRange carries would start 2026-07-01, which
    // excludes the 2026-06-29 bucket entirely and understated Makro's baseline
    // by 5,332.25 THB. Week-grain rows need whole weeks.
    expect(previousWeekWindow(RANGE)).toEqual({ start: '2026-06-29', end: '2026-08-17' })
    expect(RANGE.prevStart).toBe('2026-07-01')
  })
})

describe('coverage strip vs SQL', () => {
  const t = coverageTotals(COVERAGE, RANGE)

  it('matches on lines, THB and the canonical split', () => {
    expect(t.linesTotal).toBe(149)
    expect(t.canonicalLines).toBe(39)
    expect(t.stubLines).toBe(110)
    expect(t.thbTotal).toBeCloseTo(22_984.5, 2)
    expect(t.thbCanonical).toBeCloseTo(4_870.25, 2)
  })

  it('reproduces canonical_pct to four decimals — 21.1893 %', () => {
    expect(t.canonicalPct).toBeCloseTo(21.1893, 4)
  })

  it('counts 7 weeks with purchases inside the 8-week window', () => {
    // 2026-08-17 carries purchases but falls before the window.
    expect(t.weeksCovered).toBe(7)
  })

  it('sums unmatched lines for the period only, not the whole queue', () => {
    // SQL: 61 inside the window; 281 across all weeks; 309 genuinely open.
    expect(t.unmatchedInPeriod).toBe(61)
  })

  it('stays far below the trustworthy threshold, as prod genuinely is', () => {
    expect(t.canonicalPct).toBeLessThan(90)
  })
})

describe('supplier table vs SQL', () => {
  const rows = supplierTable(PURCHASES, RANGE)

  it('reproduces the ranking, THB, lines and last delivery', () => {
    expect(
      rows.slice(0, 6).map((r) => [r.supplier, Number(r.thb.toFixed(2)), r.lines, r.lastInvoice]),
    ).toEqual([
      ['Makro', 17_298, 111, '2026-10-08'],
      ['Tops RAWAYANA', 1_372, 6, '2026-10-09'],
      ['FARANG FOOD PARADISE', 1_250, 1, '2026-09-28'],
      ['Supercheap Co., Ltd. Branch 0078', 665, 6, '2026-09-17'],
      ['Tops Daily', 490.5, 8, '2026-10-09'],
      ['Local Market', 450, 8, '2026-09-26'],
    ])
  })

  it('lists every supplier SQL found in the period', () => {
    expect(rows).toHaveLength(11)
  })

  it('sums to the period purchase total SQL reports', () => {
    expect(rows.reduce((s, r) => s + r.thb, 0)).toBeCloseTo(22_984.5, 2)
  })

  it('has shares summing to 100', () => {
    expect(rows.reduce((s, r) => s + r.sharePct, 0)).toBeCloseTo(100, 6)
  })

  it('computes Makro delta against the previous window SQL measured', () => {
    // SQL previous 8 whole weeks: Makro 9,808.19.
    const makro = rows.find((r) => r.supplier === 'Makro')!
    expect(makro.prevThb).toBeCloseTo(9_808.19, 2)
    expect(makro.deltaPct).toBeCloseTo(((17_298 - 9_808.19) / 9_808.19) * 100, 6)
    expect(makro.deltaPct).toBeCloseTo(76.3628, 4)
  })

  it('leaves delta undefined for a supplier that is new this period', () => {
    // FARANG FOOD PARADISE bought nothing in the previous window.
    const farang = rows.find((r) => r.supplier === 'FARANG FOOD PARADISE')!
    expect(farang.prevThb).toBe(0)
    expect(farang.deltaPct).toBeUndefined()
  })
})

describe('weekly spend vs SQL', () => {
  const spend = weeklySpend(PURCHASES, RANGE)

  it('totals to the same period THB as the supplier table and SQL', () => {
    expect(spend.grandTotal).toBeCloseTo(22_984.5, 2)
    expect(spend.points.reduce((s, p) => s + (p.total as number), 0)).toBeCloseTo(22_984.5, 2)
  })

  it('emits one point per ISO week, zero weeks included', () => {
    expect(spend.points).toHaveLength(8)
    expect(spend.points.map((p) => p.week)).toEqual(RANGE.weekStarts)
    // 2026-10-12 had no purchases at all on prod.
    expect(spend.points.find((p) => p.week === '2026-10-12')!.total).toBe(0)
  })

  it('caps the suppliers and folds the rest into one wedge', () => {
    // 11 suppliers in the period, capped at 6 + Other.
    expect(spend.suppliers).toHaveLength(7)
    expect(spend.suppliers[0]).toBe('Makro')
    expect(spend.suppliers.at(-1)).toBe('Other suppliers')
  })

  it('splits each supplier into a canonical and a stub series', () => {
    expect(spend.series).toHaveLength(spend.suppliers.length * 2)
    expect(spend.series.filter((s) => s.kind === 'stub')).toHaveLength(spend.suppliers.length)
  })

  it("reproduces Makro's canonical/stub split for the biggest week", () => {
    // SQL, week 2026-09-28: Makro stub 4,367.75; canonical 621.25 + 520.00 = 1,141.25.
    const wk = spend.points.find((p) => p.week === '2026-09-28')!
    expect(wk.makro__stub).toBeCloseTo(4_367.75, 2)
    expect(wk.makro__canonical).toBeCloseTo(1_141.25, 2)
  })

  it('never emits a dataKey recharts would read as a nested path', () => {
    // "Supercheap Co., Ltd." must not reach a dataKey with its dots intact.
    for (const s of spend.series) expect(s.key).not.toMatch(/[.\s,()]/)
  })
})

describe('purchases ÷ revenue vs SQL', () => {
  const series = ratioSeries(FOOD_COST, RANGE)

  it('reproduces the weekly all-purchases ratio SQL computed', () => {
    expect(series.map((p) => [p.week, p.pctAll === null ? null : Number(p.pctAll.toFixed(2))])).toEqual(
      [
        ['2026-08-24', 5.21],
        ['2026-08-31', 16.94],
        ['2026-09-07', 0.36],
        ['2026-09-14', 50.39],
        ['2026-09-21', 28.47],
        ['2026-09-28', 77.39],
        ['2026-10-05', 26.33],
        ['2026-10-12', 0],
      ],
    )
  })

  it('keeps the view\'s canonical-only figure separate and far lower', () => {
    // The reason the rolling mean, not fc_actual_pct, is drawn against the band.
    const wk = series.find((p) => p.week === '2026-09-28')!
    expect(wk.pctCanonicalOnly).toBeCloseTo(14.26, 2)
    expect(wk.pctAll).toBeCloseTo(77.39, 2)
  })

  it('smooths the lumpiness into a rolling mean that is actually comparable', () => {
    // Trailing 4 weeks to 2026-10-05: purchases 5948 + 3489.75 + 7269 + 4509
    // = 21,215.75 over revenue 11805 + 12259 + 9393 + 17128 = 50,585 → 41.94 %.
    const wk = series.find((p) => p.week === '2026-10-05')!
    expect(wk.rollingPct).toBeCloseTo((21_215.75 / 50_585) * 100, 6)
    expect(wk.rollingPct).toBeCloseTo(41.94, 2)
  })

  it('shows how far the raw weekly line swings — why the band needs the mean', () => {
    const pcts = series.map((p) => p.pctAll ?? 0)
    expect(Math.min(...pcts)).toBeLessThan(1)
    expect(Math.max(...pcts)).toBeGreaterThan(70)
  })
})

describe('price watch vs SQL', () => {
  const view = priceWatchView(PRICE_WATCH)

  it('finds the two spikes prod actually has', () => {
    expect(view.comparableSpikes.length + view.unknownPackSpikes.length).toBe(2)
  })

  it('separates the spike that can be acted on from the one that cannot', () => {
    // RAW-CUCUMBER +44.44 % with a known pack; RAW-LETTUCE-ICEBERG +12.72 % without.
    expect(view.comparableSpikes.map((r) => r.product_code)).toEqual(['RAW-CUCUMBER'])
    expect(view.unknownPackSpikes.map((r) => r.product_code)).toEqual(['RAW-LETTUCE-ICEBERG'])
  })

  it('counts the rows whose price is comparable at all', () => {
    // 7 of 25 on prod carry cf_known.
    expect(view.comparableRows).toBe(7)
    expect(view.totalRows).toBe(25)
  })

  it('counts rows where the median is just the one observed price', () => {
    // SQL: 16 of 25 rows have weeks_observed < 2 (and 22 of 25 show delta 0).
    expect(view.noMedianYet).toBe(16)
  })
})

describe('top spend items vs SQL', () => {
  const view = topSpendItems(ABC_ITEMS)

  it('leads with the biggest 8-week purchase lines, in order', () => {
    expect(view.items.slice(0, 4).map((i) => [i.product_code, i.thb])).toEqual([
      ['RAW-AUTO-6eb5e77b', 1_250],
      ['RAW-AUTO-5c683281', 1_054.75],
      ['RAW-WRAP_DELISUN_CHIA_FLAX', 990],
      ['RAW-AUTO-d27f620d', 828],
    ])
  })

  it('reports the uncomfortable truth: most of the spend is on stubs', () => {
    expect(view.items).toHaveLength(20)
    expect(view.stubCount).toBe(18)
    expect(view.classedCount).toBe(2)
  })

  it('flags the items nothing consumes', () => {
    // Every stub reaches no BOM; the canonical pair does.
    expect(view.noBomCount).toBe(18)
    const wrap = view.items.find((i) => i.product_code === 'RAW-WRAP_DELISUN_CHIA_FLAX')!
    expect(wrap.hasBom).toBe(true)
    expect(wrap.countClass).toBe('A')
  })

  it('breaks ties on product_code so the order is stable', () => {
    // Three lamb stubs sit at exactly 485.00 — the same duplicate-item problem
    // the RAW-AUTO backfill (MC 00a81c22) exists to fix.
    const lamb = view.items.filter((i) => i.thb === 485)
    expect(lamb).toHaveLength(3)
    expect(lamb.map((i) => i.product_code)).toEqual([...lamb.map((i) => i.product_code)].sort())
  })
})
