import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Info } from 'lucide-react'
import {
  CHART_COLORS,
  CHART_TOOLTIP_STYLE,
  weekSnapNote,
  type PeriodRange,
} from '../../lib/analytics'
import {
  FOOD_COST_BAND,
  RATIO_ROLLING_WEEKS,
  type RatioWeekPoint,
} from '../../lib/analyticsPurchases'

/* ═══════════════════════════════════════════════════════════════════
   PurchaseRatioChart — purchases ÷ revenue per week against the
   28–35 % target band (spec §5 Tab 2): the crude actual food cost,
   available long before any stock count exists.

   The raw weekly line swings 0.4 % → 77.4 % on prod, because one
   Makro run lands in a single week while revenue is smooth. So the
   weekly line is drawn faint and the 4-week rolling mean carries the
   comparison with the band (CEO decision, 2026-10-17).
   ═══════════════════════════════════════════════════════════════════ */

export interface PurchaseRatioChartProps {
  data: RatioWeekPoint[]
  range: PeriodRange
  isLoading: boolean
  error: string | null
}

const SERIES_LABEL: Record<string, string> = {
  pctAll: 'Weekly (all purchases)',
  rollingPct: `${RATIO_ROLLING_WEEKS}-week mean`,
}

export function PurchaseRatioChart({ data, range, isLoading, error }: PurchaseRatioChartProps) {
  const hasData = data.some((p) => p.pctAll !== null)
  const snapNote = weekSnapNote(range)
  const latestMean = [...data].reverse().find((p) => p.rollingPct !== null)?.rollingPct ?? null
  const inBand =
    latestMean !== null && latestMean >= FOOD_COST_BAND.low && latestMean <= FOOD_COST_BAND.high

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Purchases ÷ revenue</h2>
        <p className="text-xs text-cream/60">
          {isLoading || latestMean === null
            ? `Crude actual food cost · target band ${FOOD_COST_BAND.low}–${FOOD_COST_BAND.high}%`
            : `${RATIO_ROLLING_WEEKS}-week mean ${latestMean.toFixed(1)}% · target band ${FOOD_COST_BAND.low}–${FOOD_COST_BAND.high}% · ${inBand ? 'inside the band' : 'outside the band'}`}
        </p>
        {snapNote && <p className="mt-1 text-[10px] leading-snug text-amber-watch">{snapNote}</p>}
      </div>

      <div className="flex-1 px-2 py-4">
        {error ? (
          <div className="flex h-56 items-center justify-center px-4 text-center text-xs text-brick-bright">
            {error}
          </div>
        ) : isLoading ? (
          <div className="h-56 animate-pulse rounded bg-[var(--s-2)]" />
        ) : !hasData ? (
          <div className="flex h-56 items-center justify-center text-xs text-cream/60">
            No revenue in this period
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: CHART_COLORS.axis }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: CHART_COLORS.axis }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={40}
                />

                {/* The target band itself — what the rolling mean is read against. */}
                <ReferenceArea
                  y1={FOOD_COST_BAND.low}
                  y2={FOOD_COST_BAND.high}
                  fill={CHART_COLORS.revenue}
                  fillOpacity={0.14}
                  stroke={CHART_COLORS.revenue}
                  strokeOpacity={0.3}
                  strokeDasharray="3 3"
                />

                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
                  labelFormatter={(label) => `Week of ${label}`}
                  formatter={(value, name) => {
                    const num = typeof value === 'number' ? value : Number(value)
                    return [`${num.toFixed(1)}%`, SERIES_LABEL[String(name)] ?? String(name)] as [
                      string,
                      string,
                    ]
                  }}
                />

                {/* Faint: real but too lumpy to compare with the band. */}
                <Line
                  type="monotone"
                  dataKey="pctAll"
                  stroke={CHART_COLORS.axis}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  dot={{ r: 1.5, fill: CHART_COLORS.axis, strokeWidth: 0 }}
                  connectNulls
                />
                {/* Solid: the series the band is for. */}
                <Line
                  type="monotone"
                  dataKey="rollingPct"
                  stroke={CHART_COLORS.takeaway}
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: CHART_COLORS.takeaway, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>

            <p className="mt-2 flex items-start gap-1.5 px-2 text-[10px] leading-snug text-cream/60">
              <Info className="mt-px h-3 w-3 flex-shrink-0" />
              <span>
                Purchasing is lumpy — a single wholesale run lands in one week while revenue is
                smooth — so the dashed weekly line swings far outside the band and means little on
                its own. The solid {RATIO_ROLLING_WEEKS}-week mean is the number to read against
                the band. Both use <strong className="text-cream/80">all</strong> purchases; the
                view&apos;s own food-cost figure counts only canonical items and so reads far too
                low while stub coverage is this high.
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
