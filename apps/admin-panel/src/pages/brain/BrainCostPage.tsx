import { useEffect, useState } from 'react'
import { AlertTriangle, DollarSign, Hash, Zap, Loader2 } from 'lucide-react'
import { CostChart } from './components/CostChart'
import {
  fetchDailyCosts,
  fetchAgentBreakdown,
  fetchTotalSpend30d,
  fetchRecentQueries,
  type DailyCost,
  type AgentCost,
  type BrainQueryRow,
} from '../../api/brainCost'

const ALERT_THRESHOLD_USD = 5

export function BrainCostPage() {
  const [dailyCosts, setDailyCosts] = useState<DailyCost[]>([])
  const [agents, setAgents] = useState<AgentCost[]>([])
  const [total30d, setTotal30d] = useState(0)
  const [recentQueries, setRecentQueries] = useState<BrainQueryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [d, a, t, q] = await Promise.all([
          fetchDailyCosts(30),
          fetchAgentBreakdown(),
          fetchTotalSpend30d(),
          fetchRecentQueries(20),
        ])
        setDailyCosts(d)
        setAgents(a)
        setTotal30d(t)
        setRecentQueries(q)
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
        Loading brain cost data...
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

  const totalQueries = agents.reduce((s, a) => s + a.queries, 0)

  return (
    <div className="space-y-6">
      {/* Alert banner */}
      {total30d > ALERT_THRESHOLD_USD && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm text-amber-300">
            30-day brain spend is ${total30d.toFixed(2)} — exceeds ${ALERT_THRESHOLD_USD}/mo threshold
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={DollarSign}
          label="30-day spend"
          value={`$${total30d.toFixed(4)}`}
          accent={total30d > ALERT_THRESHOLD_USD ? 'amber' : 'emerald'}
        />
        <SummaryCard icon={Hash} label="Total queries" value={String(totalQueries)} accent="sky" />
        <SummaryCard
          icon={Zap}
          label="Avg cost/query"
          value={totalQueries > 0 ? `$${(total30d / totalQueries).toFixed(6)}` : '$0'}
          accent="violet"
        />
      </div>

      {/* Cost chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Daily cost (last 30 days)</h3>
        <CostChart data={dailyCosts} />
      </div>

      {/* Agent breakdown */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Cost by agent</h3>
        {agents.length === 0 ? (
          <p className="text-sm text-slate-500">No queries logged yet</p>
        ) : (
          <div className="space-y-2">
            {agents.map((a) => (
              <div key={a.agent_id} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2">
                <span className="text-sm text-slate-200">{a.agent_id}</span>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>{a.queries} queries</span>
                  <span className="text-emerald-400">${a.cost_usd.toFixed(6)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent queries table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Recent queries</h3>
        {recentQueries.length === 0 ? (
          <p className="text-sm text-slate-500">No queries logged yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="pb-2 pr-3">Time</th>
                  <th className="pb-2 pr-3">Agent</th>
                  <th className="pb-2 pr-3">Mode</th>
                  <th className="pb-2 pr-3">Preview</th>
                  <th className="pb-2 pr-3 text-right">Latency</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {recentQueries.map((q) => (
                  <tr key={q.id} className="border-b border-slate-800/50">
                    <td className="py-1.5 pr-3 text-slate-400">
                      {new Date(q.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-1.5 pr-3 text-slate-300">{q.agent_id ?? '—'}</td>
                    <td className="py-1.5 pr-3">
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {q.query_mode}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate py-1.5 pr-3 text-slate-400">
                      {q.query_preview ?? '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-slate-400">
                      {q.latency_ms != null ? `${q.latency_ms}ms` : '—'}
                    </td>
                    <td className="py-1.5 text-right text-emerald-400">
                      ${Number(q.cost_usd).toFixed(6)}
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
  icon: typeof DollarSign
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
