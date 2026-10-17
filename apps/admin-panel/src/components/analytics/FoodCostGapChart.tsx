import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Info } from 'lucide-react'
import { CHART_COLORS, CHART_TOOLTIP_STYLE, weekSnapNote, type PeriodRange } from '../../lib/analytics'
import type { FoodCostGapPoint } from '../../lib/analyticsStock'

/* ═══════════════════════════════════════════════════════════════════
   FoodCostGapChart — theoretical food cost against actual, with the
   gap shaded (spec §5 Tab 3).

   "Actual" is ALL purchases ÷ revenue (CEO decision 2026-10-17). The
   view's own `fc_actual_pct` counts canonical purchases only, so at
   ~21 % attribution it reads 0–14 % against a 19–25 % theoretical;
   shading THAT as an unexplained gap would report the kitchen bleeding
   food cost when the real story is unlinked spend. It is still drawn,
   faint, so the difference is visible rather than hidden.
   ═══════════════════════════════════════════════════════════════════ */

export interface FoodCostGapChartProps {
  data: FoodCostGapPoint[]
  range: PeriodRange
  isLoading: boolean
  error: string | null
}

const SERIES_LABEL: Record<string, string> = {
  theoreticalPct: 'Theoretical (recipes)',
  actualPct: 'Actual (all purchases)',
  canonicalOnlyPct: 'Actual, attributed only',
  gapBand: 'Gap',
}

export function FoodCostGapChart({ data, range, isLoading, error }: FoodCostGapChartProps) {
  const hasData = data.some((p) => p.actualPct !== null || p.theoreticalPct !== null)
  const snapNote = weekSnapNote(range)
  const purchasesBased = data.some((p) => p.purchasesBased)

  // The shaded band runs between the two lines, so it is drawn as an area
  // anchored on the theoretical line with the gap stacked on top of it.
  const shaped = data.map((p) => ({
    ...p,
    gapBase: p.theoreticalPct ?? null,
    gapBand:
      p.theoreticalPct !== null && p.actualPct !== null ? p.actualPct - p.theoreticalPct : null,
  }))

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Food cost: theoretical vs actual</h2>
        <p className="text-xs text-cream/60">
          What the recipes say the food cost, against what was actually bought
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
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={shaped} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
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
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
                  labelFormatter={(label) => `Week of ${label}`}
                  formatter={(value, name) => {
                    const key = String(name)
                    if (key === 'gapBase') return [] as unknown as [string, string]
                    const num = typeof value === 'number' ? value : Number(value)
                    return [`${num.toFixed(1)}%`, SERIES_LABEL[key] ?? key] as [string, string]
                  }}
                />

                {/* Invisible base + visible gap = a band between the two lines. */}
                <Area
                  dataKey="gapBase"
                  stackId="gap"
                  stroke="none"
                  fill="transparent"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="gapBand"
                  stackId="gap"
                  stroke="none"
                  fill={CHART_COLORS.refunds}
                  fillOpacity={0.16}
                  isAnimationActive={false}
                />

                <Line
                  type="monotone"
                  dataKey="theoreticalPct"
                  stroke={CHART_COLORS.revenue}
                  strokeWidth={2}
                  dot={{ r: 2, fill: CHART_COLORS.revenue, strokeWidth: 0 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="actualPct"
                  stroke={CHART_COLORS.takeaway}
                  strokeWidth={2}
                  dot={{ r: 2, fill: CHART_COLORS.takeaway, strokeWidth: 0 }}
                  connectNulls
                />
                {/* The view's own canonical-only figure, kept visible but faint. */}
                <Line
                  type="monotone"
                  dataKey="canonicalOnlyPct"
                  stroke={CHART_COLORS.axis}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>

            <p className="mt-2 flex items-start gap-1.5 px-2 text-[10px] leading-snug text-cream/60">
              <Info className="mt-px h-3 w-3 flex-shrink-0" />
              <span>
                The shaded gap is all purchases minus what the recipes account for. It is{' '}
                <strong className="text-cream/80">not</strong> shrinkage yet: most of it is spend
                not yet linked to an item, which is why the dashed line — the attributed-only
                figure the view computes — sits so much lower.
                {purchasesBased && (
                  <>
                    {' '}
                    Actual is purchases-based throughout: no week here is bracketed by two stock
                    counts, so nothing is adjusted for what sat on the shelves.
                  </>
                )}
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
