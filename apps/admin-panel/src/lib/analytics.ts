/* ═══════════════════════════════════════════════════════════════════
   Analytics — row types, ISO-week math and pure aggregations.

   Backs /analytics (spec docs/plans/spec-stock-control-analytics.md §5).
   Everything here is a pure function over view rows so the aggregation
   can be unit-tested without a database — see analytics.test.ts.

   Timezone: the v_analytics_* views already bucket in Asia/Bangkok and
   hand us plain `YYYY-MM-DD` dates. All date math below therefore runs
   in UTC on those strings, so it cannot drift with the browser's own
   timezone. The only place we need a real clock is "what is today in
   Bangkok" — bangkokToday().
   ═══════════════════════════════════════════════════════════════════ */

/* ─── Row shapes (mirror the S1 views, migration 463 + 473) ─── */

/** `v_analytics_sales_daily` — one row per trading day. */
export interface SalesDailyRow {
  day: string
  week: string
  receipts: number
  gross_revenue: number
  refunds_thb: number
  refund_receipts: number
  net_revenue: number
  discounts_thb: number
  tax_thb: number
  tips_thb: number
  avg_check: number
  cash_thb: number
  card_thb: number
  other_payment_thb: number
  dine_in_receipts: number
  takeaway_receipts: number
  takeaway_thb: number
}

/**
 * `v_analytics_item_sales_daily` — one row per day × sold item.
 *
 * `is_modifier = true` rows are POS modifier lines and MUST NOT be summed
 * together with dish lines, or the top-10 counts a sauce as a dish. Every
 * aggregation below drops them; `analytics.test.ts` pins that.
 */
export interface ItemSalesRow {
  day: string
  week: string
  nomenclature_id: string
  product_code: string
  item_name: string
  is_modifier: boolean
  category_id: string | null
  category_code: string | null
  category_name: string | null
  units: number
  revenue: number
}

/**
 * `v_analytics_hourly_heat` — one row per ISO week × day-of-week × hour.
 *
 * `week` was appended by migration 473 (CREATE OR REPLACE VIEW can only
 * append), so it is the LAST column. Always select and filter it by name.
 */
export interface HourlyHeatRow {
  iso_dow: number
  dow_label: string
  hour_local: number
  receipts: number
  revenue: number
  week: string
}

/* ─── Date helpers (UTC-based, on `YYYY-MM-DD` strings) ─── */

const DAY_MS = 86_400_000
const BANGKOK_OFFSET_MS = 7 * 3_600_000

function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function toDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Today's calendar date in Asia/Bangkok, regardless of where the browser is. */
export function bangkokToday(now: Date = new Date()): string {
  return toDay(new Date(now.getTime() + BANGKOK_OFFSET_MS))
}

export function addDays(iso: string, n: number): string {
  return toDay(new Date(parseDay(iso).getTime() + n * DAY_MS))
}

export function addWeeks(iso: string, n: number): string {
  return addDays(iso, n * 7)
}

/** Monday of the ISO week containing `iso` — matches date_trunc('week') in the views. */
export function mondayOf(iso: string): string {
  const d = parseDay(iso)
  const dow = d.getUTCDay() // 0 = Sunday
  const isoDow = dow === 0 ? 7 : dow // 1 = Monday … 7 = Sunday
  return addDays(iso, -(isoDow - 1))
}

/** Inclusive day count between two dates. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS) + 1
}

/* ─── Period selector ─── */

export const PERIOD_CHOICES = [4, 8, 13] as const
export type PeriodWeeks = (typeof PERIOD_CHOICES)[number]

export interface PeriodRange {
  weeks: PeriodWeeks
  /** First day of the period — always a Monday. */
  start: string
  /** Last day of the period — today in Bangkok. */
  end: string
  /** Equal-length window ending the day before `start`. */
  prevStart: string
  prevEnd: string
  /** Monday of the ISO week still in progress. */
  currentWeekStart: string
  /** Every ISO week start in the period, ascending (length === weeks). */
  weekStarts: string[]
}

/**
 * The last `weeks` ISO weeks, including the one in progress.
 *
 * The previous window is an equal number of DAYS immediately before `start`,
 * not N whole weeks — otherwise a part-week at the end would be compared
 * against a full one and every delta would read low.
 */
export function periodRange(weeks: PeriodWeeks, today: string = bangkokToday()): PeriodRange {
  const currentWeekStart = mondayOf(today)
  const start = addWeeks(currentWeekStart, -(weeks - 1))
  const end = today

  const span = daysInclusive(start, end)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(span - 1))

  const weekStarts: string[] = []
  for (let i = 0; i < weeks; i++) weekStarts.push(addWeeks(start, i))

  return { weeks, start, end, prevStart, prevEnd, currentWeekStart, weekStarts }
}

function inRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to
}

/* ─── Sales totals & KPI strip ─── */

export interface SalesTotals {
  receipts: number
  gross: number
  refunds: number
  net: number
  takeaway: number
  /** Days that actually carry a sale — not the calendar length of the window. */
  tradingDays: number
  /** Period average check = gross ÷ receipts, never the mean of daily averages. */
  avgCheck: number
}

export function sumSales(rows: SalesDailyRow[], from: string, to: string): SalesTotals {
  let receipts = 0
  let gross = 0
  let refunds = 0
  let net = 0
  let takeaway = 0
  let tradingDays = 0

  for (const r of rows) {
    if (!inRange(r.day, from, to)) continue
    receipts += r.receipts
    gross += r.gross_revenue
    refunds += r.refunds_thb
    net += r.net_revenue
    takeaway += r.takeaway_thb
    tradingDays += 1
  }

  return {
    receipts,
    gross,
    refunds,
    net,
    takeaway,
    tradingDays,
    avgCheck: receipts > 0 ? gross / receipts : 0,
  }
}

/** Percent change, or undefined when there is no baseline to divide by. */
export function pctDelta(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined
  return ((current - previous) / previous) * 100
}

export interface KpiSet {
  revenue7d: number
  revenue7dDelta: number | undefined
  revenue28d: number
  revenue28dDelta: number | undefined
  receipts: number
  receiptsDelta: number | undefined
  avgCheck: number
  avgCheckDelta: number | undefined
}

/**
 * Revenue 7d / 28d are fixed rolling windows (spec §5), each compared with the
 * window immediately before it. Receipts and avg check follow the selected
 * period and compare against `range.prevStart..prevEnd`.
 *
 * Revenue is GROSS throughout — the acceptance figure (Sept 2026 = THB 52,946)
 * is gross, and refunds are charted as their own series rather than netted
 * away silently.
 */
export function kpiStrip(rows: SalesDailyRow[], range: PeriodRange): KpiSet {
  const last7 = sumSales(rows, addDays(range.end, -6), range.end)
  const prev7 = sumSales(rows, addDays(range.end, -13), addDays(range.end, -7))
  const last28 = sumSales(rows, addDays(range.end, -27), range.end)
  const prev28 = sumSales(rows, addDays(range.end, -55), addDays(range.end, -28))

  const period = sumSales(rows, range.start, range.end)
  const prior = sumSales(rows, range.prevStart, range.prevEnd)

  return {
    revenue7d: last7.gross,
    revenue7dDelta: pctDelta(last7.gross, prev7.gross),
    revenue28d: last28.gross,
    revenue28dDelta: pctDelta(last28.gross, prev28.gross),
    receipts: period.receipts,
    receiptsDelta: pctDelta(period.receipts, prior.receipts),
    avgCheck: period.avgCheck,
    avgCheckDelta: pctDelta(period.avgCheck, prior.avgCheck),
  }
}

/* ─── Weekly revenue series ─── */

export interface WeekPoint {
  week: string
  /** Short axis label, e.g. "24 Aug". */
  label: string
  gross: number
  refunds: number
  /** Gross minus refunds — the bar's base segment, refunds stack on top. */
  netBar: number
  receipts: number
  takeaway: number
  /** Takeaway THB as a percentage of gross, 0 when the week has no sales. */
  takeawayShare: number
  /** True for the ISO week still in progress. */
  isPartial: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function weekLabel(iso: string): string {
  const d = parseDay(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/**
 * One point per ISO week in the period, including weeks with no sales at all —
 * a missing week must read as a gap, not be silently dropped off the axis.
 */
export function weeklySeries(rows: SalesDailyRow[], range: PeriodRange): WeekPoint[] {
  const byWeek = new Map<string, { gross: number; refunds: number; receipts: number; takeaway: number }>()
  for (const r of rows) {
    if (!inRange(r.day, range.start, range.end)) continue
    const entry = byWeek.get(r.week) ?? { gross: 0, refunds: 0, receipts: 0, takeaway: 0 }
    entry.gross += r.gross_revenue
    entry.refunds += r.refunds_thb
    entry.receipts += r.receipts
    entry.takeaway += r.takeaway_thb
    byWeek.set(r.week, entry)
  }

  return range.weekStarts.map((week) => {
    const e = byWeek.get(week) ?? { gross: 0, refunds: 0, receipts: 0, takeaway: 0 }
    return {
      week,
      label: weekLabel(week),
      gross: e.gross,
      refunds: e.refunds,
      netBar: Math.max(e.gross - e.refunds, 0),
      receipts: e.receipts,
      takeaway: e.takeaway,
      takeawayShare: e.gross > 0 ? (e.takeaway / e.gross) * 100 : 0,
      isPartial: week === range.currentWeekStart,
    }
  })
}

/* ─── Dishes & categories ─── */

export interface DishTotal {
  nomenclature_id: string
  product_code: string
  item_name: string
  category_name: string
  units: number
  revenue: number
}

/**
 * Aggregate sold items over the period.
 *
 * Modifier lines are dropped here, once, so no caller can forget: summing a
 * POS modifier next to a dish double-counts it as a menu item.
 */
export function aggregateDishes(rows: ItemSalesRow[], range: PeriodRange): DishTotal[] {
  const byItem = new Map<string, DishTotal>()

  for (const r of rows) {
    if (r.is_modifier) continue
    if (!inRange(r.day, range.start, range.end)) continue

    const existing = byItem.get(r.nomenclature_id)
    if (existing) {
      existing.units += r.units
      existing.revenue += r.revenue
      continue
    }
    byItem.set(r.nomenclature_id, {
      nomenclature_id: r.nomenclature_id,
      product_code: r.product_code,
      item_name: r.item_name,
      category_name: r.category_name ?? 'Uncategorised',
      units: r.units,
      revenue: r.revenue,
    })
  }

  return Array.from(byItem.values())
}

export type DishMetric = 'units' | 'revenue'

export function topDishes(dishes: DishTotal[], metric: DishMetric, limit = 10): DishTotal[] {
  return [...dishes]
    .sort((a, b) => b[metric] - a[metric] || b.revenue - a.revenue || a.item_name.localeCompare(b.item_name))
    .slice(0, limit)
}

export interface CategorySlice {
  name: string
  revenue: number
  units: number
  /** Share of the period's dish revenue, 0–100. */
  pct: number
}

export function categoryMix(dishes: DishTotal[]): CategorySlice[] {
  const byCategory = new Map<string, { revenue: number; units: number }>()
  for (const d of dishes) {
    const e = byCategory.get(d.category_name) ?? { revenue: 0, units: 0 }
    e.revenue += d.revenue
    e.units += d.units
    byCategory.set(d.category_name, e)
  }

  const total = dishes.reduce((s, d) => s + d.revenue, 0)
  return Array.from(byCategory.entries())
    .map(([name, e]) => ({
      name,
      revenue: e.revenue,
      units: e.units,
      pct: total > 0 ? (e.revenue / total) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

export const DONUT_MAX_SLICES = 8
export const OTHER_SLICE_NAME = 'Other sections'

/**
 * Slices for the donut itself: the biggest `max` sections, with everything
 * below them folded into one "Other sections" wedge.
 *
 * The menu carries ~18 selling sections and the smallest is well under 1 % of
 * revenue — under a degree of arc, which recharts will not draw at all. Left
 * ungrouped, the tail is not merely illegible, it silently disappears. The
 * legend still lists every section with its exact share, so grouping costs the
 * reader nothing.
 */
export function donutSlices(slices: CategorySlice[], max = DONUT_MAX_SLICES): CategorySlice[] {
  if (slices.length <= max) return slices

  const head = slices.slice(0, max)
  const tail = slices.slice(max)
  return [
    ...head,
    {
      name: OTHER_SLICE_NAME,
      revenue: tail.reduce((s, c) => s + c.revenue, 0),
      units: tail.reduce((s, c) => s + c.units, 0),
      pct: tail.reduce((s, c) => s + c.pct, 0),
    },
  ]
}

/* ─── Day × hour heatmap ─── */

export const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export interface HeatCell {
  iso_dow: number
  hour_local: number
  receipts: number
  /** 0–1, relative to the busiest cell in the period. */
  intensity: number
}

export interface HeatGrid {
  /** Hours that saw at least one receipt in the period, ascending. */
  hours: number[]
  /** Lookup key is `${iso_dow}-${hour_local}`. */
  cells: Map<string, HeatCell>
  busiestCell: number
  totalReceipts: number
  /** Cells with at least one receipt. */
  liveCells: number
  /** Receipts ÷ live cells — how much evidence is behind each square. */
  avgPerLiveCell: number
  /**
   * Below ~3 receipts per live cell the grid is mostly coin flips and must say
   * so rather than inviting the owner to read a staffing pattern out of noise
   * (spec §5: numbers never fake precision).
   */
  isSparse: boolean
}

export const HEAT_SPARSE_THRESHOLD = 3

/**
 * Receipts per day-of-week × hour for the selected period.
 *
 * Plots RECEIPTS, never revenue — at ~40 receipts a week revenue per cell is
 * dominated by whichever cell happened to sell a big order (spec §5).
 */
export function heatGrid(rows: HourlyHeatRow[], range: PeriodRange): HeatGrid {
  const cells = new Map<string, HeatCell>()
  const hourSet = new Set<number>()
  let totalReceipts = 0
  let busiestCell = 0

  for (const r of rows) {
    // `week` is a Monday, so the period's own Monday-aligned bounds apply directly.
    if (r.week < range.start || r.week > range.end) continue
    if (r.receipts <= 0) continue

    const key = `${r.iso_dow}-${r.hour_local}`
    const existing = cells.get(key)
    if (existing) {
      existing.receipts += r.receipts
    } else {
      cells.set(key, { iso_dow: r.iso_dow, hour_local: r.hour_local, receipts: r.receipts, intensity: 0 })
    }
    hourSet.add(r.hour_local)
    totalReceipts += r.receipts
  }

  for (const cell of cells.values()) {
    if (cell.receipts > busiestCell) busiestCell = cell.receipts
  }
  for (const cell of cells.values()) {
    cell.intensity = busiestCell > 0 ? cell.receipts / busiestCell : 0
  }

  const liveCells = cells.size
  const avgPerLiveCell = liveCells > 0 ? totalReceipts / liveCells : 0

  return {
    hours: Array.from(hourSet).sort((a, b) => a - b),
    cells,
    busiestCell,
    totalReceipts,
    liveCells,
    avgPerLiveCell,
    isSparse: liveCells > 0 && avgPerLiveCell < HEAT_SPARSE_THRESHOLD,
  }
}

/* ─── Chart palette ─── */

/**
 * Semantic tokens from `index.css` @theme, with a literal fallback so a bar is
 * never invisible if a token is renamed. Never hard-code a brand colour here —
 * see technical-rules.md § RULE-DESIGN-SYSTEM.
 */
export const CHART_COLORS = {
  revenue: 'var(--color-forest-soft, #5B7A3D)',
  refunds: 'var(--color-brick-bright, #E27A7F)',
  takeaway: 'var(--color-honey-300, #F0CE83)',
  grid: 'var(--line-strong, rgba(240,234,214,0.18))',
  axis: 'rgba(240,234,214,0.60)',
  heat: '204, 218, 174', // --color-mint-200 as an rgb triplet for alpha ramping
} as const

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--s-1, #10150D)',
  border: '1px solid var(--line-strong, rgba(240,234,214,0.18))',
  borderRadius: 8,
  fontSize: 11,
  color: 'var(--color-cream, #FBF8F0)',
} as const
