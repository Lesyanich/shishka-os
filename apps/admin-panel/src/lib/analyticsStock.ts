/* ═══════════════════════════════════════════════════════════════════
   Analytics — Stock control tab (spec §5 Tab 3, S4).

   Row types for the stock views plus the pure aggregations behind each
   widget. Pure on purpose: analyticsStock.test.ts and
   analyticsStock.prod-parity.test.ts exercise all of it without a
   database.

   The variance table is written in full here even though prod cannot
   fill it yet — one count day exists and an interval needs two. The
   arithmetic is tested against a synthetic interval so that the first
   real interval is not also the first run of untested code.
   ═══════════════════════════════════════════════════════════════════ */

import type { PeriodRange } from './analytics'
import type { FoodCostWeekRow } from './analyticsPurchases'
import { varianceTone, VARIANCE_THRESHOLDS, type VarianceTone } from './analyticsThresholds'

/* ─── Row shapes (mirror the S1 views, migration 463) ─── */

/** `v_analytics_stock_variance` — one row per count interval × item. */
export interface StockVarianceRow {
  opening_day: string
  closing_day: string
  days_in_interval: number
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string
  count_class: string | null
  /** False when the item was not counted at every location it stocks. */
  is_complete: boolean
  opening_qty: number
  purchases_qty: number
  purchases_thb: number
  usage_qty: number
  waste_qty: number
  expected_closing_qty: number
  closing_qty: number
  /** Expected minus counted: positive means stock is missing. */
  variance_qty: number
  variance_thb: number
  variance_pct_of_usage: number | null
}

/** `v_analytics_count_days` — one row per count day × item. */
export interface CountDayRow {
  count_day: string
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string
  count_class: string | null
  counted_qty: number
  locations_counted: number
  locations_expected: number
  stations_counted: number
  is_complete: boolean
  counted_thb: number
}

/** `v_analytics_inventory_value` — one row per item × location. */
export interface InventoryValueRow {
  nomenclature_id: string
  product_code: string
  item_name: string
  base_unit: string
  location_id: string | null
  location_name: string | null
  counted_qty: number
  cost_per_unit: number | null
  value_thb: number
  counted_on: string | null
  days_since_count: number | null
  count_class: string | null
  is_canonical: boolean
}

/** `v_analytics_waste_weekly` — one row per week × reason. */
export interface WasteWeekRow {
  week: string
  reason: string
  entries: number
  items: number
  qty: number
  thb: number
  thb_liability_cafe: number
  thb_liability_employee: number
  thb_liability_supplier: number
}

/** `v_analytics_bom_coverage_weekly` — one row per week. */
export interface BomCoverageWeekRow {
  week: string
  deducted_units_pct: number | null
}

/** `v_station_replenishment`, trimmed to what this tab reads. */
export interface ReplenishmentRow {
  nomenclature_id: string
  product_code: string
  name: string
  base_unit: string
  location_name: string | null
  on_hand: number
  min_stock: number | null
  par_stock: number | null
  suggested_qty: number | null
  stock_status: string | null
  replenish_action: string | null
}

/** `v_stock_status`, trimmed to the expiry signal. */
export interface StockStatusRow {
  nomenclature_id: string
  product_code: string
  name: string
  storage_location: string | null
  next_expiry: string | null
  expiring_soon: number
  expired: number
}

/* ─── Inventory value ─── */

export interface LocationValue {
  location: string
  valueThb: number
  lines: number
  /** Lines holding stock whose cost is not on file — value understated. */
  linesWithoutCost: number
}

export interface InventoryValueSummary {
  totalThb: number
  lines: number
  byLocation: LocationValue[]
  countedOn: string | null
  daysSinceCount: number | null
  /**
   * Lines with stock on hand but no `cost_per_unit`, so their value counts as
   * zero and the total is a FLOOR rather than the holding. Measured on prod
   * 2026-10-17: 14 of 122 lines.
   */
  linesWithoutCost: number
  /**
   * Lines counted and found empty. Their zero is correct and must not be
   * confused with the above — 2 of 122 on prod.
   */
  linesCountedEmpty: number
  /** Lines sitting on RAW-AUTO stubs, and the THB on them. */
  stubLines: number
  stubThb: number
}

const NO_LOCATION = '(no location)'

/**
 * Inventory on hand at the last count, by location.
 *
 * Spec §5 Tab 3 asks for a tile by location with days since count. The two
 * honesty fields exist because a zero in this view has two quite different
 * causes and conflating them would misreport the holding.
 */
export function inventoryValueSummary(rows: InventoryValueRow[]): InventoryValueSummary {
  const byLocation = new Map<string, LocationValue>()
  let totalThb = 0
  let linesWithoutCost = 0
  let linesCountedEmpty = 0
  let stubLines = 0
  let stubThb = 0
  let countedOn: string | null = null
  let daysSinceCount: number | null = null

  for (const r of rows) {
    const key = r.location_name ?? NO_LOCATION
    const entry = byLocation.get(key) ?? {
      location: key,
      valueThb: 0,
      lines: 0,
      linesWithoutCost: 0,
    }
    entry.valueThb += r.value_thb
    entry.lines += 1

    const noCost = r.counted_qty > 0 && !r.cost_per_unit
    if (noCost) {
      entry.linesWithoutCost += 1
      linesWithoutCost += 1
    }
    if (r.counted_qty === 0) linesCountedEmpty += 1

    byLocation.set(key, entry)

    totalThb += r.value_thb
    if (!r.is_canonical) {
      stubLines += 1
      stubThb += r.value_thb
    }

    // Every row shares the one count day today; take the most recent if not.
    if (r.counted_on && (!countedOn || r.counted_on > countedOn)) {
      countedOn = r.counted_on
      daysSinceCount = r.days_since_count ?? null
    }
  }

  return {
    totalThb,
    lines: rows.length,
    byLocation: Array.from(byLocation.values()).sort(
      (a, b) => b.valueThb - a.valueThb || a.location.localeCompare(b.location),
    ),
    countedOn,
    daysSinceCount,
    linesWithoutCost,
    linesCountedEmpty,
    stubLines,
    stubThb,
  }
}

/** Beyond this, a count is too old to describe today's shelves. */
export const COUNT_STALE_DAYS = 14

/* ─── Count coverage ─── */

export interface CountCoverage {
  /** The most recent count day, or null when none exists. */
  latestCountDay: string | null
  /** How many distinct count days exist at all. */
  countDays: number
  itemsCounted: number
  aClassCounted: number
  /** Items not counted at every location they stock — excluded from variance. */
  incompleteItems: number
  /**
   * A variance interval needs two count days. With fewer, the hero table is
   * empty for a floor-process reason, not a code reason.
   */
  hasInterval: boolean
}

export function countCoverage(rows: CountDayRow[]): CountCoverage {
  const days = Array.from(new Set(rows.map((r) => r.count_day))).sort()
  const latest = days.length > 0 ? days[days.length - 1] : null
  const latestRows = latest ? rows.filter((r) => r.count_day === latest) : []

  return {
    latestCountDay: latest,
    countDays: days.length,
    itemsCounted: latestRows.length,
    aClassCounted: latestRows.filter((r) => r.count_class === 'A').length,
    incompleteItems: latestRows.filter((r) => !r.is_complete).length,
    hasInterval: days.length >= 2,
  }
}

/* ─── Variance table ─── */

export interface VarianceRowView extends StockVarianceRow {
  tone: VarianceTone
  /** |THB| this item accumulated over the last few intervals, incl. this one. */
  cumulativeAbsThb: number
}

/**
 * Variance rows for the latest interval, loudest first.
 *
 * Incomplete rows are dropped rather than shown: an item counted at the
 * Fridge but not the Bar produces a phantom shortage (spec §8). The count of
 * what was dropped is returned so the UI can say so instead of silently
 * showing less.
 */
export function varianceView(
  rows: StockVarianceRow[],
  intervals = VARIANCE_THRESHOLDS.cumulativeIntervals,
): { rows: VarianceRowView[]; droppedIncomplete: number; interval: { from: string; to: string } | null } {
  if (rows.length === 0) return { rows: [], droppedIncomplete: 0, interval: null }

  const closingDays = Array.from(new Set(rows.map((r) => r.closing_day))).sort()
  const latestClosing = closingDays[closingDays.length - 1]
  const recentClosings = new Set(closingDays.slice(-intervals))

  // Cumulative |THB| per item across the trailing intervals.
  const cumulative = new Map<string, number>()
  for (const r of rows) {
    if (!recentClosings.has(r.closing_day)) continue
    cumulative.set(
      r.nomenclature_id,
      (cumulative.get(r.nomenclature_id) ?? 0) + Math.abs(r.variance_thb),
    )
  }

  const latest = rows.filter((r) => r.closing_day === latestClosing)
  const complete = latest.filter((r) => r.is_complete)

  const view = complete
    .map((r) => {
      const cumulativeAbsThb = cumulative.get(r.nomenclature_id) ?? Math.abs(r.variance_thb)
      return {
        ...r,
        cumulativeAbsThb,
        tone: varianceTone({
          variancePctOfUsage: r.variance_pct_of_usage,
          varianceThb: r.variance_thb,
          daysInInterval: r.days_in_interval,
          cumulativeAbsThb,
        }),
      }
    })
    .sort(
      (a, b) =>
        Math.abs(b.variance_thb) - Math.abs(a.variance_thb) ||
        a.product_code.localeCompare(b.product_code),
    )

  return {
    rows: view,
    droppedIncomplete: latest.length - complete.length,
    interval: { from: latest[0].opening_day, to: latestClosing },
  }
}

/* ─── Waste ─── */

export interface WasteReasonTotal {
  reason: string
  thb: number
  qty: number
  entries: number
}

export interface WasteSummary {
  totalThb: number
  entries: number
  byReason: WasteReasonTotal[]
  liability: { cafe: number; employee: number; supplier: number }
  weeks: number
}

export function wasteSummary(rows: WasteWeekRow[], range: PeriodRange): WasteSummary {
  const inPeriod = rows.filter((r) => r.week >= range.weekStart && r.week <= range.weekEnd)
  const byReason = new Map<string, WasteReasonTotal>()
  const liability = { cafe: 0, employee: 0, supplier: 0 }
  let totalThb = 0
  let entries = 0

  for (const r of inPeriod) {
    const e = byReason.get(r.reason) ?? { reason: r.reason, thb: 0, qty: 0, entries: 0 }
    e.thb += r.thb
    e.qty += r.qty
    e.entries += r.entries
    byReason.set(r.reason, e)

    liability.cafe += r.thb_liability_cafe
    liability.employee += r.thb_liability_employee
    liability.supplier += r.thb_liability_supplier
    totalThb += r.thb
    entries += r.entries
  }

  return {
    totalThb,
    entries,
    byReason: Array.from(byReason.values()).sort((a, b) => b.thb - a.thb),
    liability,
    weeks: new Set(inPeriod.map((r) => r.week)).size,
  }
}

/* ─── Food cost: theoretical vs actual ─── */

export interface FoodCostGapPoint {
  week: string
  label: string
  revenue: number
  /** Σ units × dish food cost, ÷ revenue. */
  theoreticalPct: number | null
  /**
   * ALL purchases ÷ revenue (CEO decision 2026-10-17). The view's own
   * `fc_actual_pct` counts canonical purchases only, which at ~21 % coverage
   * reads 0–14 % against a 19–25 % theoretical — a gap that is missing
   * attribution, not shrinkage, and would read as the kitchen bleeding money.
   */
  actualPct: number | null
  /** The view's canonical-only figure, drawn faint for transparency. */
  canonicalOnlyPct: number | null
  /** actual − theoretical, in percentage points. */
  gapPp: number | null
  /** Purchases minus theoretical COGS, in THB. */
  gapThb: number | null
  /** True while no week in the period is bracketed by two counts. */
  purchasesBased: boolean
}

export function foodCostGapSeries(rows: FoodCostWeekRow[], range: PeriodRange): FoodCostGapPoint[] {
  const byWeek = new Map(rows.map((r) => [r.week, r]))

  return range.weekStarts.map((week) => {
    const r = byWeek.get(week)
    const revenue = r?.revenue ?? 0
    const purchases = r?.purchases_thb_all ?? 0
    const theoretical = r?.cogs_theoretical ?? 0

    const actualPct = revenue > 0 ? (purchases / revenue) * 100 : null
    const theoreticalPct = revenue > 0 ? (theoretical / revenue) * 100 : null

    return {
      week,
      label: weekShortLabel(week),
      revenue,
      theoreticalPct,
      actualPct,
      canonicalOnlyPct: r?.fc_actual_pct ?? null,
      gapPp: actualPct !== null && theoreticalPct !== null ? actualPct - theoreticalPct : null,
      gapThb: r ? purchases - theoretical : null,
      purchasesBased: (r?.cogs_actual_basis ?? 'purchases_based') === 'purchases_based',
    }
  })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function weekShortLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/* ─── Reorder & expiring (compact reuse of existing views) ─── */

export function reorderRows(rows: ReplenishmentRow[], limit = 12): ReplenishmentRow[] {
  return rows
    .filter((r) => (r.suggested_qty ?? 0) > 0)
    .sort((a, b) => (b.suggested_qty ?? 0) - (a.suggested_qty ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export function expiringRows(rows: StockStatusRow[], limit = 12): StockStatusRow[] {
  return rows
    .filter((r) => r.expiring_soon > 0 || r.expired > 0)
    .sort(
      (a, b) =>
        b.expired - a.expired ||
        b.expiring_soon - a.expiring_soon ||
        (a.next_expiry ?? '').localeCompare(b.next_expiry ?? ''),
    )
    .slice(0, limit)
}
