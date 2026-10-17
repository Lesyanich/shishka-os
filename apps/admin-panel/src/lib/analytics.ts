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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const PERIOD_CHOICES = [4, 8, 13] as const
export type PeriodWeeks = (typeof PERIOD_CHOICES)[number]

/** The first day Loyverse sales exist — a range before this can only be empty. */
export const SALES_WINDOW_START = '2026-05-18'

export type PeriodMode = 'preset' | 'custom'

export interface PeriodRange {
  mode: PeriodMode
  /** null for a custom range. */
  weeks: PeriodWeeks | null
  /** Short human label: "8w", or "1 – 15 Oct". */
  label: string

  /* ── The DAY window the owner actually chose ── */
  /** First day of the period. A Monday for presets, arbitrary when custom. */
  start: string
  /** Last day of the period. Today in Bangkok for presets. */
  end: string
  /** Equal-length day window ending the day before `start`. */
  prevStart: string
  prevEnd: string

  /* ── The WEEK window, for sources bucketed by ISO week ── */
  /** Monday of the ISO week still in progress. */
  currentWeekStart: string
  /** Every ISO week the day window touches, ascending. */
  weekStarts: string[]
  /** First Monday covered — i.e. `weekStarts[0]`. */
  weekStart: string
  /** Last Monday covered — i.e. `weekStarts.at(-1)`. */
  weekEnd: string
  /**
   * True when the week window reaches beyond the chosen days, so a week-grain
   * widget is showing more than was asked for and must say so.
   *
   * Always false for presets: those start on a Monday and run to today, which
   * is what their own bars already mean.
   */
  snappedToWeeks: boolean
}

/** "1 – 15 Oct", or "28 Sep – 15 Oct" when the months differ. */
export function rangeLabel(from: string, to: string): string {
  const a = parseDay(from)
  const b = parseDay(to)
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
  return sameMonth
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
}

/** Every ISO week start the day window `from`..`to` touches, ascending. */
export function coveringWeekStarts(from: string, to: string): string[] {
  const first = mondayOf(from)
  const last = mondayOf(to)
  const out: string[] = []
  for (let w = first; w <= last; w = addWeeks(w, 1)) out.push(w)
  return out
}

function buildRange(args: {
  mode: PeriodMode
  weeks: PeriodWeeks | null
  label: string
  start: string
  end: string
  today: string
  /** Presets own their part-week by definition, so they never read as snapped. */
  forceUnsnapped?: boolean
}): PeriodRange {
  const { mode, weeks, label, start, end, today, forceUnsnapped } = args

  const span = daysInclusive(start, end)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(span - 1))

  const weekStarts = coveringWeekStarts(start, end)
  const weekStart = weekStarts[0]
  const weekEnd = weekStarts[weekStarts.length - 1]

  // The week window runs Monday..Sunday; it exceeds the day window whenever the
  // chosen start is not a Monday or the chosen end is not that week's Sunday.
  const snappedToWeeks = forceUnsnapped
    ? false
    : start !== weekStart || end !== addDays(weekEnd, 6)

  return {
    mode,
    weeks,
    label,
    start,
    end,
    prevStart,
    prevEnd,
    currentWeekStart: mondayOf(today),
    weekStarts,
    weekStart,
    weekEnd,
    snappedToWeeks,
  }
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
  return buildRange({
    mode: 'preset',
    weeks,
    label: `${weeks}w`,
    start: addWeeks(currentWeekStart, -(weeks - 1)),
    end: today,
    today,
    forceUnsnapped: true,
  })
}

/**
 * An arbitrary from–to day range (CEO request 2026-10-17: «выбор диапазона с по»).
 *
 * Day-grain surfaces honour these dates exactly. Week-grain surfaces must read
 * `weekStart`..`weekEnd` instead and, when `snappedToWeeks`, say that they are
 * showing the covering whole weeks — drawing a partial week as a whole one is
 * the single way this feature could start lying.
 */
export function customRange(from: string, to: string, today: string = bangkokToday()): PeriodRange {
  const start = from <= to ? from : to
  const end = from <= to ? to : from
  return buildRange({
    mode: 'custom',
    weeks: null,
    label: rangeLabel(start, end),
    start,
    end,
    today,
  })
}

export interface RangeProblem {
  field: 'from' | 'to'
  message: string
}

/**
 * Why a picked range cannot be used, or null when it is fine.
 *
 * A range wholly before the first day of sales is rejected rather than drawn
 * as an empty tab, so the picker explains the emptiness instead of the charts
 * implying a collapse in trade.
 */
export function validateRange(
  from: string,
  to: string,
  today: string = bangkokToday(),
): RangeProblem | null {
  if (!from) return { field: 'from', message: 'Pick a start date' }
  if (!to) return { field: 'to', message: 'Pick an end date' }
  if (from > to) return { field: 'from', message: 'Start date is after the end date' }
  if (to > today) return { field: 'to', message: 'That is in the future' }
  if (to < SALES_WINDOW_START) {
    return { field: 'to', message: `Sales start on ${SALES_WINDOW_START} — nothing exists before that` }
  }
  return null
}

function inRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to
}

/**
 * What a week-grain panel must say when the chosen day range does not line up
 * with whole ISO weeks. Returning null means there is nothing to disclose.
 *
 * Drawing a part-week bar as though it were a whole one is the single way the
 * custom date range could start lying, so every week-grain panel carries this.
 */
export function weekSnapNote(range: PeriodRange): string | null {
  if (!range.snappedToWeeks) return null
  return `Week-grain source: showing whole ISO weeks ${weekLabel(range.weekStart)} – ${weekLabel(
    addDays(range.weekEnd, 6),
  )}, which is wider than the ${range.label} you picked.`
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
  // Bucketed by week, so the bars cover whole weeks: filtering on the chosen
  // DAYS would silently draw a part-week bar at each end of a custom range.
  const from = range.weekStart
  const to = addDays(range.weekEnd, 6)
  for (const r of rows) {
    if (!inRange(r.day, from, to)) continue
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
    // `week` is a Monday, so it must be compared with the WEEK window. Against
    // the day window a custom range starting mid-week would drop its own
    // covering week (measured on prod: 81 receipts where the day range holds
    // 75 and the covering weeks hold 108 — neither answer).
    if (r.week < range.weekStart || r.week > range.weekEnd) continue
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
