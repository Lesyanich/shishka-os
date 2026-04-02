import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from 'recharts'
import type { ExpenseRow } from '../../hooks/useExpenseLedger'
import { CATEGORY_COLORS } from './helpers'

/* ═══════════════════════════════════════════════════════
   CategoryBreakdown — interactive donut chart
   Groups expenses by category (or flow_type) for the
   selected period. Active sector on hover shows details.
   ═══════════════════════════════════════════════════════ */

export interface CategoryBreakdownProps {
  rows: ExpenseRow[]
  isLoading: boolean
}

type GroupBy = 'category' | 'flow_type'

interface Slice {
  name: string
  value: number
  pct: number
  count: number
}

export function CategoryBreakdown({ rows, isLoading }: CategoryBreakdownProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('category')
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)

  const slices: Slice[] = useMemo(() => {
    const map = new Map<string, { value: number; count: number }>()
    for (const r of rows) {
      const key = groupBy === 'category' ? (r.category_name ?? 'Uncategorized') : r.flow_type
      const entry = map.get(key) ?? { value: 0, count: 0 }
      entry.value += r.amount_thb
      entry.count += 1
      map.set(key, entry)
    }
    const total = rows.reduce((s, r) => s + r.amount_thb, 0) || 1
    return Array.from(map.entries())
      .map(([name, { value, count }]) => ({
        name,
        value,
        pct: (value / total) * 100,
        count,
      }))
      .sort((a, b) => b.value - a.value)
  }, [rows, groupBy])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-40 w-40 animate-pulse rounded-full bg-slate-800/50" />
      </div>
    )
  }

  if (slices.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        No data
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with toggle */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h3 className="text-sm font-semibold text-slate-300">Category Breakdown</h3>
        <div className="flex rounded-md border border-slate-700 bg-slate-800/50">
          {(['category', 'flow_type'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={`px-2 py-0.5 text-[10px] font-medium transition ${
                groupBy === g
                  ? 'bg-slate-700 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {g === 'category' ? 'Category' : 'Type'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart + legend */}
      <div className="flex flex-1 items-center gap-2 px-2">
        {/* Donut */}
        <div className="flex-shrink-0" style={{ width: 180, height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
                activeShape={activeIndex != null ? renderActiveShape : undefined}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
              >
                {slices.map((_, i) => (
                  <Cell
                    key={i}
                    fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                    stroke="transparent"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-1 overflow-y-auto" style={{ maxHeight: 170 }}>
          {slices.map((s, i) => (
            <div
              key={s.name}
              className="flex items-center gap-2 rounded px-1.5 py-0.5 transition hover:bg-slate-800/50"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(undefined)}
            >
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
              />
              <span className="flex-1 truncate text-[10px] text-slate-400">{s.name}</span>
              <span className="text-[10px] font-medium text-slate-300">
                {s.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Active shape renderer for hover effect ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderActiveShape(props: any) {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
  } = props

  return (
    <g>
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontWeight={600}>
        {payload.name.length > 12 ? payload.name.slice(0, 12) + '…' : payload.name}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#94a3b8" fontSize={10}>
        {(percent * 100).toFixed(1)}%
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 3}
        outerRadius={innerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.3}
      />
    </g>
  )
}
