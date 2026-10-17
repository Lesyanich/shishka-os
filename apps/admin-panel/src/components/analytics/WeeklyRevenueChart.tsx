import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatTHB, formatTHBFull } from '../finance/helpers'
import { CHART_COLORS, CHART_TOOLTIP_STYLE, type WeekPoint } from '../../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   WeeklyRevenueChart — gross revenue per ISO week with refunds
   stacked on top and takeaway share as a thin line (spec §5).

   The stack is net + refunds, so each bar's full height is
   gross and the red cap is the money that went back out.
   ═══════════════════════════════════════════════════════════ */

export interface WeeklyRevenueChartProps {
  data: WeekPoint[]
  isLoading: boolean
  error: string | null
}

const SERIES_LABEL: Record<string, string> = {
  netBar: 'Revenue (net)',
  refunds: 'Refunds',
  takeawayShare: 'Takeaway share',
}

export function WeeklyRevenueChart({ data, isLoading, error }: WeeklyRevenueChartProps) {
  const hasSales = data.some((p) => p.gross > 0)

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Weekly revenue</h2>
        <p className="text-xs text-cream/60">
          Gross per ISO week · refunds stacked on top · takeaway share as a line
        </p>
      </div>

      <div className="flex-1 px-2 py-4">
        {error ? (
          <div className="flex h-64 items-center justify-center px-4 text-center text-xs text-brick-bright">
            {error}
          </div>
        ) : isLoading ? (
          <div className="flex h-64 items-end gap-3 px-4 pb-6">
            {[55, 80, 45, 70, 60, 85, 50, 65].map((h, i) => (
              <div
                key={i}
                className="flex-1 animate-pulse rounded-t bg-[var(--s-2)]"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        ) : !hasSales ? (
          <div className="flex h-64 items-center justify-center text-xs text-cream/60">
            No sales in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: CHART_COLORS.axis }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="thb"
                tick={{ fontSize: 9, fill: CHART_COLORS.axis }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatTHB}
                width={52}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: CHART_COLORS.axis }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                width={34}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                labelFormatter={(label) => {
                  const point = data.find((p) => p.label === label)
                  const week = `Week of ${label}`
                  return point?.isPartial ? `${week} · partial — still in progress` : week
                }}
                formatter={(value, name) => {
                  const num = typeof value === 'number' ? value : Number(value)
                  const label = SERIES_LABEL[String(name)] ?? String(name)
                  const shown =
                    String(name) === 'takeawayShare'
                      ? `${num.toFixed(0)}%`
                      : `฿${formatTHBFull(num)}`
                  return [shown, label] as [string, string]
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
                iconSize={8}
                formatter={(name) => SERIES_LABEL[String(name)] ?? String(name)}
              />

              <Bar yAxisId="thb" dataKey="netBar" stackId="revenue" fill={CHART_COLORS.revenue}>
                {/* The week in progress is dimmed so a part-week does not read as a slump. */}
                {data.map((p) => (
                  <Cell key={p.week} fillOpacity={p.isPartial ? 0.42 : 1} />
                ))}
              </Bar>
              <Bar
                yAxisId="thb"
                dataKey="refunds"
                stackId="revenue"
                fill={CHART_COLORS.refunds}
                radius={[3, 3, 0, 0]}
              >
                {data.map((p) => (
                  <Cell key={p.week} fillOpacity={p.isPartial ? 0.42 : 1} />
                ))}
              </Bar>
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="takeawayShare"
                stroke={CHART_COLORS.takeaway}
                strokeWidth={1.5}
                dot={{ r: 2, fill: CHART_COLORS.takeaway, strokeWidth: 0 }}
                activeDot={{ r: 3.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
