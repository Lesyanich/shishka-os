import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CATEGORY_COLORS, formatTHB, formatTHBFull } from '../finance/helpers'
import {
  CHART_COLORS,
  CHART_TOOLTIP_STYLE,
  topDishes,
  type DishMetric,
  type DishTotal,
} from '../../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   TopDishesChart — top 10 sold items by units or revenue,
   coloured by menu category (spec §5).

   Modifier lines are already gone: aggregateDishes() drops
   them before anything reaches this component.
   ═══════════════════════════════════════════════════════════ */

export interface TopDishesChartProps {
  dishes: DishTotal[]
  /** Stable category → colour map, shared with the category mix donut. */
  categoryColor: (name: string) => string
  isLoading: boolean
}

export function TopDishesChart({ dishes, categoryColor, isLoading }: TopDishesChartProps) {
  const [metric, setMetric] = useState<DishMetric>('units')

  const rows = useMemo(() => topDishes(dishes, metric, 10), [dishes, metric])

  return (
    <div className="flex flex-col shk-panel">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-cream">Top 10 dishes</h2>
          <p className="text-xs text-cream/60">Coloured by menu section · period-scoped</p>
        </div>
        <div className="flex flex-shrink-0 rounded-md border border-[var(--line)] bg-[var(--s-2)]">
          {(['units', 'revenue'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className={`px-2 py-0.5 text-[10px] font-medium transition ${
                metric === m ? 'bg-[var(--s-3)] text-cream' : 'text-cream/60 hover:text-cream'
              }`}
              style={{ transitionTimingFunction: 'var(--e-out)' }}
            >
              {m === 'units' ? 'Units' : 'Revenue'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-2 py-4">
        {isLoading ? (
          <div className="space-y-2 px-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-[var(--s-2)]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-xs text-cream/60">
            No dishes sold in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(rows.length * 28, 120)}>
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 9, fill: CHART_COLORS.axis }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (metric === 'revenue' ? formatTHB(Number(v)) : String(v))}
              />
              <YAxis
                type="category"
                dataKey="item_name"
                tick={{ fontSize: 9, fill: CHART_COLORS.axis }}
                axisLine={false}
                tickLine={false}
                width={132}
                interval={0}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                formatter={(value, _name, entry) => {
                  const num = typeof value === 'number' ? value : Number(value)
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const row = (entry as any)?.payload as DishTotal | undefined
                  const shown = metric === 'revenue' ? `฿${formatTHBFull(num)}` : `${num} units`
                  return [shown, row?.category_name ?? 'Dish'] as [string, string]
                }}
              />
              <Bar dataKey={metric} radius={[0, 3, 3, 0]} barSize={14}>
                {rows.map((r) => (
                  <Cell key={r.nomenclature_id} fill={categoryColor(r.category_name)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

/**
 * Build a category → colour lookup that is stable across both widgets, so a
 * section is the same colour in the top-10 as in the donut.
 */
export function makeCategoryColor(names: string[]): (name: string) => string {
  const index = new Map<string, number>()
  names.forEach((n, i) => index.set(n, i))
  return (name: string) => CATEGORY_COLORS[(index.get(name) ?? 0) % CATEGORY_COLORS.length]
}
