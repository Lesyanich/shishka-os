import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatTHB, CATEGORY_COLORS } from './helpers'

export interface MonthlyChartProps {
  summaries: { month: string; total_thb: number; by_category: Record<string, number> }[]
  isLoading: boolean
  error: string | null
}

export function MonthlyChart({ summaries, isLoading, error }: MonthlyChartProps) {
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const s of summaries) {
      for (const cat of Object.keys(s.by_category)) set.add(cat)
    }
    return Array.from(set).sort()
  }, [summaries])

  const chartData = useMemo(
    () =>
      summaries.map((s) => ({
        month: s.month,
        ...s.by_category,
      })),
    [summaries],
  )

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/30">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Monthly Expenses</h2>
        <p className="text-xs text-slate-500">amount_thb by category</p>
      </div>
      <div className="flex-1 px-2 py-4">
        {error ? (
          <div className="flex h-52 items-center justify-center text-xs text-rose-400">{error}</div>
        ) : isLoading ? (
          <div className="flex h-52 animate-pulse flex-col justify-end gap-2 px-2">
            {[60, 90, 40, 75, 55].map((h, i) => (
              <div key={i} className="w-full rounded bg-slate-800" style={{ height: `${h * 0.5}%` }} />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-52 flex-col items-center justify-center gap-2 text-xs text-slate-500">
            <span className="text-2xl">No expense data yet</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatTHB}
                width={52}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value) => {
                  const num = typeof value === 'number' ? value : Number(value)
                  return [formatTHB(num)] as [string]
                }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Legend
                wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
                iconSize={8}
              />
              {allCategories.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  stackId="a"
                  fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                  radius={i === allCategories.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
