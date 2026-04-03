import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CapExCategorySummary } from '../../hooks/useCapEx'

interface CapExMiniChartProps {
  byCategory: CapExCategorySummary[]
  isLoading: boolean
  error: string | null
}

function Skeleton() {
  return (
    <div className="flex h-48 animate-pulse flex-col justify-end gap-2 px-2">
      {[60, 90, 40, 75, 55].map((h, i) => (
        <div
          key={i}
          className="w-full rounded bg-slate-800"
          style={{ height: `${h * 0.5}%` }}
        />
      ))}
    </div>
  )
}

// Truncate long category names for X axis
function shortLabel(name: string) {
  return name.length > 12 ? name.slice(0, 11) + '…' : name
}

function formatTHB(value: number) {
  if (value >= 1_000_000) return `฿${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `฿${(value / 1_000).toFixed(0)}K`
  return `฿${value}`
}

export function CapExMiniChart({ byCategory, isLoading, error }: CapExMiniChartProps) {
  // Top 8 categories for readability
  const chartData = byCategory.slice(0, 8).map((c) => ({
    name: shortLabel(c.category_name),
    fullName: c.category_name,
    total: c.total,
    count: c.count,
  }))

  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/30">
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">CapEx by Category</h2>
        <p className="text-xs text-slate-500">All-time spend from capex_transactions</p>
      </div>

      <div className="flex-1 px-2 py-4">
        {error ? (
          <div className="flex h-48 items-center justify-center text-xs text-rose-400">
            {error}
          </div>
        ) : isLoading ? (
          <Skeleton />
        ) : chartData.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs text-slate-500">
            <span className="text-2xl">📊</span>
            No transactions yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatTHB}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName ?? ''
                }
                formatter={(value, _, entry) => {
                  const num = typeof value === 'number' ? value : Number(value)
                  const count = (entry.payload as { count: number }).count
                  return [`${formatTHB(num)} (${count} tx)`, 'Total'] as [string, string]
                }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="total" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
