import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CATEGORY_COLORS, formatTHB, formatTHBFull } from '../finance/helpers'
import {
  CHART_COLORS,
  CHART_TOOLTIP_STYLE,
  weekSnapNote,
  type PeriodRange,
} from '../../lib/analytics'
import { OTHER_SUPPLIER_NAME, type WeeklySpend } from '../../lib/analyticsPurchases'

/* ═══════════════════════════════════════════════════════════════════
   WeeklySpendChart — purchase spend per ISO week, stacked by supplier,
   with the stub share hatched.

   Spec §5 Tab 2 asks to stack by purchase CATEGORY, which no allowed
   view exposes (the category lives in expense_ledger). The CEO chose
   supplier on 2026-10-17; the canonical-vs-stub distinction the spec
   really cares about survives as the hatch, so a glance still shows
   how much of a week's spend cannot be attributed to a real item.
   ═══════════════════════════════════════════════════════════════════ */

export interface WeeklySpendChartProps {
  spend: WeeklySpend
  range: PeriodRange
  isLoading: boolean
  error: string | null
}

function supplierColor(spend: WeeklySpend, supplier: string): string {
  if (supplier === OTHER_SUPPLIER_NAME) return 'var(--s-3, #1F2818)'
  const i = spend.suppliers.indexOf(supplier)
  return CATEGORY_COLORS[(i < 0 ? 0 : i) % CATEGORY_COLORS.length]
}

export function WeeklySpendChart({ spend, range, isLoading, error }: WeeklySpendChartProps) {
  const hasSpend = spend.grandTotal > 0
  const snapNote = weekSnapNote(range)

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Weekly spend</h2>
        <p className="text-xs text-cream/60">
          By supplier · hatched = auto-created stub lines, money we cannot attribute to a recipe
        </p>
        {snapNote && <p className="mt-1 text-[10px] leading-snug text-amber-watch">{snapNote}</p>}
      </div>

      <div className="flex-1 px-2 py-4">
        {error ? (
          <div className="flex h-64 items-center justify-center px-4 text-center text-xs text-brick-bright">
            {error}
          </div>
        ) : isLoading ? (
          <div className="flex h-64 items-end gap-3 px-4 pb-6">
            {[40, 70, 30, 85, 55, 75, 45, 60].map((h, i) => (
              <div
                key={i}
                className="flex-1 animate-pulse rounded-t bg-[var(--s-2)]"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        ) : !hasSpend ? (
          <div className="flex h-64 items-center justify-center text-xs text-cream/60">
            No purchases in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={spend.points} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <defs>
                {spend.suppliers.map((supplier) => {
                  const color = supplierColor(spend, supplier)
                  return (
                    <pattern
                      key={supplier}
                      id={`spend-hatch-${spend.suppliers.indexOf(supplier)}`}
                      patternUnits="userSpaceOnUse"
                      width={5}
                      height={5}
                      patternTransform="rotate(45)"
                    >
                      <rect width={5} height={5} fill={color} fillOpacity={0.26} />
                      <line x1={0} y1={0} x2={0} y2={5} stroke={color} strokeWidth={2} />
                    </pattern>
                  )
                })}
              </defs>

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
                tickFormatter={formatTHB}
                width={52}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                labelFormatter={(label) => `Week of ${label}`}
                formatter={(value, name) => {
                  const num = typeof value === 'number' ? value : Number(value)
                  const series = spend.series.find((s) => s.key === String(name))
                  const label = series
                    ? `${series.supplier}${series.kind === 'stub' ? ' · stub' : ''}`
                    : String(name)
                  return [`฿${formatTHBFull(num)}`, label] as [string, string]
                }}
              />
              {spend.series.map((s) => {
                const idx = spend.suppliers.indexOf(s.supplier)
                const color = supplierColor(spend, s.supplier)
                return (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    stackId="spend"
                    fill={s.kind === 'stub' ? `url(#spend-hatch-${idx})` : color}
                    stroke={s.kind === 'stub' ? color : undefined}
                    strokeWidth={s.kind === 'stub' ? 0.5 : 0}
                  />
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Hand-rolled legend: one entry per supplier, not one per series.
         *  recharts 3.8 no longer accepts a custom `payload` on <Legend>, and
         *  its default would list every canonical/stub pair separately. */}
        {!isLoading && !error && hasSpend && (
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-2">
            {spend.suppliers.map((supplier) => (
              <li key={supplier} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: supplierColor(spend, supplier) }}
                />
                <span className="max-w-[160px] truncate text-[10px] text-cream/60" title={supplier}>
                  {supplier}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
