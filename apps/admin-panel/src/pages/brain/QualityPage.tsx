import { useEffect, useState } from 'react'
import { AlertTriangle, Activity, Hash, TrendingDown, Loader2 } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  fetchScoreDistribution,
  fetchGaps,
  fetchLowScoreQueries,
  fetchQualitySummary,
  type ScoreBucket,
  type GapRow,
  type LowScoreQuery,
} from '../../api/brainQuality'

const SCORE_COLORS: Record<number, string> = {
  1: '#ef4444', // red
  2: '#f97316', // orange
  3: '#eab308', // yellow
  4: '#22c55e', // green
  5: '#10b981', // emerald
}

export function QualityPage() {
  const [distribution, setDistribution] = useState<ScoreBucket[]>([])
  const [gaps, setGaps] = useState<GapRow[]>([])
  const [lowQueries, setLowQueries] = useState<LowScoreQuery[]>([])
  const [summary, setSummary] = useState({ totalScored: 0, avgScore: 0, gapCount: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [dist, g, lq, s] = await Promise.all([
          fetchScoreDistribution(30),
          fetchGaps(50),
          fetchLowScoreQueries(30),
          fetchQualitySummary(30),
        ])
        setDistribution(dist)
        setGaps(g)
        setLowQueries(lq)
        setSummary(s)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading quality data...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm text-rose-300">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={Activity}
          label="Scored queries (30d)"
          value={String(summary.totalScored)}
          accent="sky"
        />
        <SummaryCard
          icon={Hash}
          label="Avg quality score"
          value={summary.avgScore > 0 ? summary.avgScore.toFixed(1) : '—'}
          accent={summary.avgScore >= 3.5 ? 'emerald' : 'amber'}
        />
        <SummaryCard
          icon={TrendingDown}
          label="Knowledge gaps"
          value={String(summary.gapCount)}
          accent={summary.gapCount > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Score distribution chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Score distribution (last 30 days)</h3>
        {summary.totalScored === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No scored queries yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={distribution} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="score"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(v: number) => `${v}/5`}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v) => `Score: ${v}/5`}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {distribution.map((entry) => (
                  <Cell key={entry.score} fill={SCORE_COLORS[entry.score] ?? '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Active gaps */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Active knowledge gaps</h3>
        {gaps.length === 0 ? (
          <p className="text-sm text-slate-500">No gaps detected</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="pb-2 pr-3">Query pattern</th>
                  <th className="pb-2 pr-3">Layer</th>
                  <th className="pb-2 pr-3 text-right">Hits</th>
                  <th className="pb-2 pr-3 text-right">Avg score</th>
                  <th className="pb-2 pr-3">First seen</th>
                  <th className="pb-2">Agents</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    <td className="max-w-[250px] truncate py-1.5 pr-3 text-slate-300">
                      {g.query_pattern}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {g.layer}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right text-amber-400">{g.hit_count}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-400">
                      {g.avg_score != null ? g.avg_score : '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-500">
                      {new Date(g.first_seen).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-1.5 text-slate-500">
                      {g.agents?.join(', ') ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent low-score queries */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          Recent low-score queries
        </h3>
        {lowQueries.length === 0 ? (
          <p className="text-sm text-slate-500">No low-score queries</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="pb-2 pr-3">Time</th>
                  <th className="pb-2 pr-3">Layer</th>
                  <th className="pb-2 pr-3">Agent</th>
                  <th className="pb-2 pr-3">Score</th>
                  <th className="pb-2 pr-3">Query</th>
                  <th className="pb-2">Response</th>
                </tr>
              </thead>
              <tbody>
                {lowQueries.map((q) => (
                  <tr key={q.id} className="border-b border-slate-800/50">
                    <td className="py-1.5 pr-3 text-slate-400">
                      {new Date(q.ts).toLocaleString('en-GB', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {q.layer ?? 'L2'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-slate-300">{q.agent_id ?? '—'}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: `${SCORE_COLORS[q.quality_score ?? 1]}20`, color: SCORE_COLORS[q.quality_score ?? 1] }}
                      >
                        {q.quality_score}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate py-1.5 pr-3 text-slate-400">
                      {q.query_preview ?? '—'}
                    </td>
                    <td className="max-w-[200px] truncate py-1.5 text-slate-500">
                      {q.response_preview ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Activity
  label: string
  value: string
  accent: 'emerald' | 'sky' | 'violet' | 'amber'
}) {
  const colors = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    sky: 'bg-sky-500/10 text-sky-400',
    violet: 'bg-violet-500/10 text-violet-400',
    amber: 'bg-amber-500/10 text-amber-400',
  }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] text-slate-500">{label}</p>
          <p className="text-lg font-semibold text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  )
}
