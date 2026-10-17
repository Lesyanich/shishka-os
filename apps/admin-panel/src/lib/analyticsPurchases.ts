/* ═══════════════════════════════════════════════════════════════════
   Analytics — Purchases tab (spec §5 Tab 2, S3).

   Row types for the five purchase views plus the pure aggregations
   behind each widget. Pure on purpose: analyticsPurchases.test.ts and
   analyticsPurchases.prod-parity.test.ts exercise all of it without a
   database.

   Week math, formatting and chart tokens are shared with the Sales
   pulse tab via ./analytics — this module adds no second definition
   of "a week".
   ═══════════════════════════════════════════════════════════════════ */

import { addWeeks, weekLabel, type PeriodRange } from './analytics'

/* ─── Row shapes (mirror the S1 views, migration 463) ─── */

/** `v_analytics_purchases_weekly` — week × item × supplier. */
export interface PurchaseWeekRow {
  week: string
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string
  supplier_id: string | null
  supplier_name: string | null
  lines: number
  qty_base: number
  thb: number
  last_price_per_unit: number | null
  last_unit_price_base: number | null
  last_invoice_date: string | null
  /**
   * False means the pack size was never resolved, so `qty_base` is in
   * PURCHASE units, not base units — any unit price derived from it is not
   * comparable with another supplier's. True on only ~21 % of prod rows.
   */
  cf_known: boolean
  /** False for `RAW-AUTO-%` stubs and soft-deleted items. */
  is_canonical: boolean
}

/** `v_analytics_purchase_coverage_weekly` — one row per week. */
export interface CoverageWeekRow {
  week: string
  lines_total: number
  canonical_lines: number
  stub_lines: number
  thb_total: number
  thb_canonical: number
  canonical_pct: number
  canonical_lines_pct: number
  /** Lines first seen in THIS week that are still unmatched — not the whole queue. */
  unmatched_open: number
}

/** `v_analytics_price_watch` — one row per item, rolling 8 weeks. */
export interface PriceWatchRow {
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string
  supplier_id: string | null
  supplier_name: string | null
  last_unit_price: number | null
  median_unit_price_8w: number | null
  last_invoice_date: string | null
  /** With 1 week observed the "median" is just the single price — no signal. */
  weeks_observed: number
  cf_known: boolean
  count_class: string | null
  delta_pct: number | null
  is_spike: boolean
}

/** `v_analytics_abc_items` — one row per item, rolling 8 weeks. */
export interface AbcItemRow {
  nomenclature_id: string
  product_code: string
  name: string
  base_unit: string
  type: string | null
  is_canonical: boolean
  purchase_thb_8w: number
  lines_8w: number
  last_invoice_date: string | null
  cum_share: number | null
  count_class: string | null
  /**
   * Injected by the hook from `bom_structures.ingredient_id` — CEO-approved
   * sixth source (2026-10-17), used for nothing else. Undefined while the
   * BOM set is still loading.
   */
  has_bom?: boolean
}

/** `v_analytics_food_cost_weekly` — one row per week. */
export interface FoodCostWeekRow {
  week: string
  revenue: number
  receipts: number
  cogs_theoretical: number
  purchases_thb_canonical: number
  purchases_thb_all: number
  inventory_close_thb: number | null
  inventory_open_thb: number | null
  inventory_delta_thb: number | null
  cogs_actual: number | null
  /** `purchases_based` until a week is bracketed by two count days. */
  cogs_actual_basis: string | null
  fc_theoretical_pct: number | null
  /** CANONICAL purchases ÷ revenue — understated while coverage is low. */
  fc_actual_pct: number | null
  gap_thb: number | null
}

function inRange(week: string, range: PeriodRange): boolean {
  return week >= range.start && week <= range.end
}

/**
 * The comparison window for WEEK-grain rows: exactly `range.weeks` whole ISO
 * weeks immediately before the period.
 *
 * `PeriodRange.prevStart/prevEnd` is an equal number of DAYS, which is right
 * for the daily sales rows on the Sales pulse tab but wrong here. These rows
 * are bucketed by week, so a window starting mid-week (2026-07-01) excludes
 * that week's bucket (2026-06-29) in full: measured on prod, Makro's baseline
 * came out 4,475.94 instead of 9,808.19 — a 2.2x error in every delta. Whole
 * weeks in, whole weeks compared.
 */
export function previousWeekWindow(range: PeriodRange): { start: string; end: string } {
  const start = addWeeks(range.weekStarts[0], -range.weeks)
  const end = addWeeks(range.weekStarts[0], -1)
  return { start, end }
}

/* ─── Coverage strip ─── */

export interface CoverageTotals {
  thbTotal: number
  thbCanonical: number
  /** Share of THB landing on canonical items, 0–100. ~20 % on prod today. */
  canonicalPct: number
  linesTotal: number
  canonicalLines: number
  stubLines: number
  /**
   * Lines first seen inside the selected period that are still unmatched.
   * Deliberately NOT the size of the whole queue: `unmatched_open` is a
   * per-week figure, and summing every week (281) still undercounts the
   * real open queue (309) because some items sit outside these weeks.
   */
  unmatchedInPeriod: number
  weeksCovered: number
}

export function coverageTotals(rows: CoverageWeekRow[], range: PeriodRange): CoverageTotals {
  let thbTotal = 0
  let thbCanonical = 0
  let linesTotal = 0
  let canonicalLines = 0
  let stubLines = 0
  let unmatchedInPeriod = 0
  let weeksCovered = 0

  for (const r of rows) {
    if (!inRange(r.week, range)) continue
    thbTotal += r.thb_total
    thbCanonical += r.thb_canonical
    linesTotal += r.lines_total
    canonicalLines += r.canonical_lines
    stubLines += r.stub_lines
    unmatchedInPeriod += r.unmatched_open
    weeksCovered += 1
  }

  return {
    thbTotal,
    thbCanonical,
    canonicalPct: thbTotal > 0 ? (thbCanonical / thbTotal) * 100 : 0,
    linesTotal,
    canonicalLines,
    stubLines,
    unmatchedInPeriod,
    weeksCovered,
  }
}

/** Below this, spend-composition widgets say so instead of implying completeness. */
export const CANONICAL_PCT_TRUSTWORTHY = 90

/* ─── Supplier table ─── */

export interface SupplierTotal {
  supplier: string
  thb: number
  lines: number
  /** Share of the period's purchase THB, 0–100. */
  sharePct: number
  lastInvoice: string | null
  /** THB change vs the equal-length window before the period, or undefined. */
  deltaPct: number | undefined
  prevThb: number
}

const NO_SUPPLIER = '(no supplier)'

function sumBySupplier(rows: PurchaseWeekRow[], from: string, to: string) {
  const map = new Map<string, { thb: number; lines: number; lastInvoice: string | null }>()
  for (const r of rows) {
    if (r.week < from || r.week > to) continue
    const key = r.supplier_name ?? NO_SUPPLIER
    const e = map.get(key) ?? { thb: 0, lines: 0, lastInvoice: null }
    e.thb += r.thb
    e.lines += r.lines
    if (r.last_invoice_date && (!e.lastInvoice || r.last_invoice_date > e.lastInvoice)) {
      e.lastInvoice = r.last_invoice_date
    }
    map.set(key, e)
  }
  return map
}

/**
 * Suppliers for the period, biggest spend first, each with its change against
 * the equal-length window before the period.
 *
 * Note for the reader of the table, not a defect here: prod splits some
 * suppliers across several names ("Tops Daily" / "Tops RAWAYANA" /
 * "Tops (Rawaiyana)", two Supercheap rows). This groups by the name the view
 * gives; de-duplicating suppliers is a procurement data job, not a UI one.
 */
export function supplierTable(rows: PurchaseWeekRow[], range: PeriodRange): SupplierTotal[] {
  const prev = previousWeekWindow(range)
  const current = sumBySupplier(rows, range.start, range.end)
  const previous = sumBySupplier(rows, prev.start, prev.end)
  const total = Array.from(current.values()).reduce((s, e) => s + e.thb, 0)

  return Array.from(current.entries())
    .map(([supplier, e]) => {
      const prevThb = previous.get(supplier)?.thb ?? 0
      return {
        supplier,
        thb: e.thb,
        lines: e.lines,
        sharePct: total > 0 ? (e.thb / total) * 100 : 0,
        lastInvoice: e.lastInvoice,
        deltaPct: prevThb > 0 ? ((e.thb - prevThb) / prevThb) * 100 : undefined,
        prevThb,
      }
    })
    .sort((a, b) => b.thb - a.thb || a.supplier.localeCompare(b.supplier))
}

/* ─── Weekly spend, stacked by supplier with the stub share hatched ─── */

export const SPEND_MAX_SUPPLIERS = 6
export const OTHER_SUPPLIER_NAME = 'Other suppliers'

/**
 * recharts reads a dataKey containing "." as a nested path, and prod supplier
 * names carry dots and commas ("Supercheap Co., Ltd."). Keys must therefore be
 * slugs, never the raw name.
 */
export function supplierSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'supplier'
}

export interface SpendSeries {
  /** dataKey on the chart rows. */
  key: string
  supplier: string
  kind: 'canonical' | 'stub'
}

export interface SpendWeekPoint {
  week: string
  label: string
  total: number
  /** slug key → THB. Missing keys mean zero for that week. */
  [key: string]: string | number
}

export interface WeeklySpend {
  points: SpendWeekPoint[]
  /** Two entries per supplier (canonical then stub), biggest supplier first. */
  series: SpendSeries[]
  suppliers: string[]
  grandTotal: number
}

/**
 * Spend per ISO week, split by supplier and then by canonical vs stub.
 *
 * Spec §5 asks for the stack by purchase *category*, which no allowed view
 * exposes — the CEO chose supplier on 2026-10-17, keeping the canonical/stub
 * distinction as the hatch. Suppliers past the cap collapse into one wedge so
 * a 14-supplier week stays readable.
 */
export function weeklySpend(
  rows: PurchaseWeekRow[],
  range: PeriodRange,
  maxSuppliers = SPEND_MAX_SUPPLIERS,
): WeeklySpend {
  const inPeriod = rows.filter((r) => inRange(r.week, range))

  const bySupplier = new Map<string, number>()
  for (const r of inPeriod) {
    const key = r.supplier_name ?? NO_SUPPLIER
    bySupplier.set(key, (bySupplier.get(key) ?? 0) + r.thb)
  }

  const ranked = Array.from(bySupplier.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)

  const kept = ranked.slice(0, maxSuppliers)
  const keptSet = new Set(kept)
  const hasOther = ranked.length > kept.length
  const suppliers = hasOther ? [...kept, OTHER_SUPPLIER_NAME] : kept

  const series: SpendSeries[] = suppliers.flatMap((supplier) => [
    { key: `${supplierSlug(supplier)}__canonical`, supplier, kind: 'canonical' as const },
    { key: `${supplierSlug(supplier)}__stub`, supplier, kind: 'stub' as const },
  ])

  const points: SpendWeekPoint[] = range.weekStarts.map((week) => {
    const point: SpendWeekPoint = { week, label: weekLabel(week), total: 0 }
    for (const s of series) point[s.key] = 0
    return point
  })
  const byWeek = new Map(points.map((p) => [p.week, p]))

  let grandTotal = 0
  for (const r of inPeriod) {
    const point = byWeek.get(r.week)
    if (!point) continue // a week outside the selector's buckets
    const rawName = r.supplier_name ?? NO_SUPPLIER
    const supplier = keptSet.has(rawName) ? rawName : OTHER_SUPPLIER_NAME
    const key = `${supplierSlug(supplier)}__${r.is_canonical ? 'canonical' : 'stub'}`
    point[key] = (point[key] as number) + r.thb
    point.total = (point.total as number) + r.thb
    grandTotal += r.thb
  }

  return { points, series, suppliers, grandTotal }
}

/* ─── Purchases ÷ revenue, against the target band ─── */

export const FOOD_COST_BAND = { low: 28, high: 35 } as const
export const RATIO_ROLLING_WEEKS = 4

export interface RatioWeekPoint {
  week: string
  label: string
  revenue: number
  purchasesAll: number
  purchasesCanonical: number
  /** ALL purchases ÷ revenue — the complete money, lumpy week to week. */
  pctAll: number | null
  /**
   * The view's own `fc_actual_pct`, which divides CANONICAL purchases by
   * revenue. Reported for transparency and never drawn against the band:
   * with ~20 % canonical coverage it reads ~3–14 % and would suggest a
   * wonderfully low food cost when four fifths of the spend is simply
   * invisible to it.
   */
  pctCanonicalOnly: number | null
  /** Rolling mean of pctAll over the trailing `RATIO_ROLLING_WEEKS`. */
  rollingPct: number | null
}

/**
 * Weekly purchases ÷ revenue plus its rolling mean.
 *
 * Raw weekly values on prod run 0.4 % → 77.4 %: one Makro run lands in a
 * single week while revenue is smooth, so the weekly line cannot be compared
 * with the 28–35 % band at all. The rolling mean is what the band is for
 * (CEO decision, 2026-10-17).
 */
export function ratioSeries(
  rows: FoodCostWeekRow[],
  range: PeriodRange,
  rollingWeeks = RATIO_ROLLING_WEEKS,
): RatioWeekPoint[] {
  const byWeek = new Map(rows.map((r) => [r.week, r]))

  const base = range.weekStarts.map((week) => {
    const r = byWeek.get(week)
    const revenue = r?.revenue ?? 0
    const purchasesAll = r?.purchases_thb_all ?? 0
    return {
      week,
      label: weekLabel(week),
      revenue,
      purchasesAll,
      purchasesCanonical: r?.purchases_thb_canonical ?? 0,
      pctAll: revenue > 0 ? (purchasesAll / revenue) * 100 : null,
      pctCanonicalOnly: r?.fc_actual_pct ?? null,
    }
  })

  return base.map((point, i) => {
    // Mean over the trailing window, skipping weeks with no revenue rather
    // than counting them as 0 % and dragging the mean down.
    const window = base.slice(Math.max(0, i - rollingWeeks + 1), i + 1)
    const usable = window.filter((w) => w.revenue > 0)
    const revenue = usable.reduce((s, w) => s + w.revenue, 0)
    const purchases = usable.reduce((s, w) => s + w.purchasesAll, 0)
    return {
      ...point,
      rollingPct: revenue > 0 ? (purchases / revenue) * 100 : null,
    }
  })
}

/* ─── Price watch ─── */

export interface PriceWatchView {
  /** Spikes with a comparable unit price — the actionable rows. */
  comparableSpikes: PriceWatchRow[]
  /** Spikes whose pack size is unknown, so the price is not comparable. */
  unknownPackSpikes: PriceWatchRow[]
  /** Rows with only one week observed: the "median" is that single price. */
  noMedianYet: number
  comparableRows: number
  totalRows: number
}

/**
 * Split price watch into what can honestly be acted on and what cannot.
 *
 * On prod 18 of 25 rows have `cf_known = false`, so their unit price is in
 * purchase units and comparing it across suppliers is meaningless; and 20 of
 * 25 have a single observed week, where median == last price by construction.
 */
export function priceWatchView(rows: PriceWatchRow[]): PriceWatchView {
  const byDelta = (a: PriceWatchRow, b: PriceWatchRow) =>
    (b.delta_pct ?? 0) - (a.delta_pct ?? 0) || a.item_name.localeCompare(b.item_name)

  const spikes = rows.filter((r) => r.is_spike)

  return {
    comparableSpikes: spikes.filter((r) => r.cf_known).sort(byDelta),
    unknownPackSpikes: spikes.filter((r) => !r.cf_known).sort(byDelta),
    noMedianYet: rows.filter((r) => r.weeks_observed < 2).length,
    comparableRows: rows.filter((r) => r.cf_known).length,
    totalRows: rows.length,
  }
}

/* ─── Top items by spend ─── */

export const TOP_SPEND_LIMIT = 20

export interface TopSpendItem {
  nomenclature_id: string
  product_code: string
  name: string
  thb: number
  lines: number
  countClass: string | null
  isCanonical: boolean
  /** Undefined while the BOM set is loading; false means nothing consumes it. */
  hasBom: boolean | undefined
}

export interface TopSpendView {
  items: TopSpendItem[]
  /** How many of the listed rows are RAW-AUTO stubs — 18 of 20 on prod today. */
  stubCount: number
  /** How many carry an ABC class at all — 2 of 20 on prod today. */
  classedCount: number
  noBomCount: number
}

/**
 * The biggest purchase lines of the rolling 8-week window.
 *
 * This widget is at its least flattering right now and that is the point:
 * most of the spend sits on `RAW-AUTO` stubs that reach no BOM, so the list
 * reads as "we cannot tell you what this money bought". It is the same
 * pressure the coverage strip applies (spec §7, S3 ships regardless).
 */
export function topSpendItems(rows: AbcItemRow[], limit = TOP_SPEND_LIMIT): TopSpendView {
  const items = [...rows]
    .sort(
      (a, b) =>
        b.purchase_thb_8w - a.purchase_thb_8w || a.product_code.localeCompare(b.product_code),
    )
    .slice(0, limit)
    .map((r) => ({
      nomenclature_id: r.nomenclature_id,
      product_code: r.product_code,
      name: r.name,
      thb: r.purchase_thb_8w,
      lines: r.lines_8w,
      countClass: r.count_class,
      isCanonical: r.is_canonical,
      hasBom: r.has_bom,
    }))

  return {
    items,
    stubCount: items.filter((i) => !i.isCanonical).length,
    classedCount: items.filter((i) => i.countClass !== null).length,
    noBomCount: items.filter((i) => i.hasBom === false).length,
  }
}
