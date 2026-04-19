import { useEffect, useState } from 'react'
import { Brain, ChefHat, DollarSign, Hash, Loader2, Receipt, Sparkles } from 'lucide-react'
import {
  fetchDailyCosts,
  fetchModelBreakdown,
  fetchRecentApiCosts,
  fetchTotalSpend30d,
  type ApiCostRow,
  type DailyCost,
  type ModelBreakdown,
} from '../api/apiCost'

/* ────────────────────────── Summary Card ────────────────────────── */

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>}
    </div>
  )
}

/* ────────────────────────── Feature registry ────────────────────────── */

interface FeatureMeta {
  label: string
  color: string         // Tailwind bg class for bars/dots
  icon: React.ReactNode
}

const FEATURE_REGISTRY: Record<string, FeatureMeta> = {
  'chef-chat':    { label: 'Chef AI',      color: 'bg-orange-500',  icon: <ChefHat className="h-3 w-3" /> },
  'receipt-ocr':  { label: 'Receipt OCR',  color: 'bg-emerald-500', icon: <Receipt className="h-3 w-3" /> },
  'brain-query':  { label: 'Brain Query',  color: 'bg-purple-500',  icon: <Brain className="h-3 w-3" /> },
}

const DEFAULT_META: FeatureMeta = { label: 'Other', color: 'bg-slate-500', icon: <Sparkles className="h-3 w-3" /> }

function featureMeta(f: string): FeatureMeta {
  return FEATURE_REGISTRY[f] ?? { ...DEFAULT_META, label: f }
}

function featureLabel(f: string) {
  return featureMeta(f).label
}

function featureColor(f: string) {
  return featureMeta(f).color
}

/* ────────────────────────── Page ────────────────────────── */

export function ApiCostPage() {
  const [totals, setTotals] = useState<{ total: number; byFeature: Record<string, number> }>({ total: 0, byFeature: {} })
  const [dailyCosts, setDailyCosts] = useState<DailyCost[]>([])
  const [models, setModels] = useState<ModelBreakdown[]>([])
  const [recent, setRecent] = useState<ApiCostRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [t, d, m, r] = await Promise.all([
          fetchTotalSpend30d(),
          fetchDailyCosts(30),
          fetchModelBreakdown(),
          fetchRecentApiCosts(30),
        ])
        setTotals(t)
        setDailyCosts(d)
        setModels(m)
        setRecent(r)
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
        Loading API cost data...
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

  // Aggregate daily costs for simple bar chart
  const dailyTotals: Record<string, Record<string, number>> = {}
  for (const d of dailyCosts) {
    if (!dailyTotals[d.date]) dailyTotals[d.date] = {}
    dailyTotals[d.date][d.feature] = (dailyTotals[d.date][d.feature] || 0) + d.cost_usd
  }
  const maxDailyCost = Math.max(
    ...Object.values(dailyTotals).map((feats) => Object.values(feats).reduce((a, b) => a + b, 0)),
    0.01,
  )

  // Collect all unique features across daily data + totals for legend/cards
  const allFeatures = Array.from(new Set([
    ...Object.keys(totals.byFeature),
    ...Object.values(dailyTotals).flatMap((feats) => Object.keys(feats)),
  ]))

  const totalCount = recent.length + models.reduce((s, m) => s + m.count, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-100">API Costs</h1>
        <p className="mt-1 text-xs text-slate-500">Расходы на все API: ��аспознавание чеков, Brain, и другие</p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          icon={<DollarSign className="h-3 w-3" />}
          label="30 дней"
          value={`$${totals.total.toFixed(2)}`}
        />
        {Object.entries(totals.byFeature)
          .sort(([, a], [, b]) => b - a)
          .map(([feature, cost]) => {
            const meta = featureMeta(feature)
            return (
              <Card
                key={feature}
                icon={meta.icon}
                label={meta.label}
                value={`$${cost.toFixed(2)}`}
              />
            )
          })}
        <Card
          icon={<Hash className="h-3 w-3" />}
          label="Вызовов"
          value={String(totalCount)}
        />
      </div>

      {/* ── Daily cost bars ── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 text-xs font-semibold text-slate-300">Расходы по дням (30 дней)</h2>
        {Object.keys(dailyTotals).length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">Нет данных за этот период</p>
        ) : (
          <div className="flex items-end gap-px" style={{ height: 120 }}>
            {Object.entries(dailyTotals)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, feats]) => {
                const total = Object.values(feats).reduce((a, b) => a + b, 0)
                return (
                  <div
                    key={date}
                    className="group relative flex flex-1 flex-col items-stretch justify-end"
                    style={{ height: '100%' }}
                  >
                    {Object.entries(feats).map(([feature, cost]) => {
                      const segPct = (cost / maxDailyCost) * 100
                      return (
                        <div
                          key={feature}
                          className={`${featureColor(feature)} rounded-t opacity-80`}
                          style={{ height: `${segPct}%`, minHeight: cost > 0 ? 2 : 0 }}
                        />
                      )
                    })}
                    <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-slate-800 px-1.5 py-0.5 text-[8px] text-slate-300 opacity-0 shadow transition group-hover:opacity-100">
                      {date.slice(5)}: ${total.toFixed(4)}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[9px] text-slate-500">
          {allFeatures.map((f) => {
            const meta = featureMeta(f)
            return (
              <span key={f} className="flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded ${meta.color}`} />
                {meta.label}
              </span>
            )
          })}
        </div>
      </section>

      {/* ── Model breakdown ── */}
      {models.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-xs font-semibold text-slate-300">По моделям</h2>
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-left">Модель</th>
                <th className="px-2 py-1.5 text-left">Задача</th>
                <th className="px-2 py-1.5 text-right">Вызовов</th>
                <th className="px-2 py-1.5 text-right">Всего</th>
                <th className="px-2 py-1.5 text-right">Среднее</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {models.map((m) => (
                <tr key={`${m.model}-${m.feature}`}>
                  <td className="px-2 py-2 text-slate-200">{m.model}</td>
                  <td className="px-2 py-2 text-slate-400">{featureLabel(m.feature)}</td>
                  <td className="px-2 py-2 text-right text-slate-400">{m.count}</td>
                  <td className="px-2 py-2 text-right text-slate-200">${m.cost_usd.toFixed(4)}</td>
                  <td className="px-2 py-2 text-right text-slate-500">${m.avg_cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Recent calls ── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 text-xs font-semibold text-slate-300">Последние вызовы</h2>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-600">Нет записей</p>
        ) : (
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">Время</th>
                  <th className="px-2 py-1.5 text-left">Модель</th>
                  <th className="px-2 py-1.5 text-left">Задача</th>
                  <th className="px-2 py-1.5 text-right">In</th>
                  <th className="px-2 py-1.5 text-right">Out</th>
                  <th className="px-2 py-1.5 text-right">Стоимость</th>
                  <th className="px-2 py-1.5 text-center">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2 text-slate-400">
                      {new Date(r.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-2 py-2 text-slate-200">{r.model}</td>
                    <td className="px-2 py-2 text-slate-400">{featureLabel(r.feature)}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{r.tokens_in.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{r.tokens_out.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-slate-200">${Number(r.cost_usd).toFixed(4)}</td>
                    <td className="px-2 py-2 text-center">
                      {r.error ? (
                        <span className="text-[9px] text-rose-400" title={r.error}>err</span>
                      ) : (
                        <span className="text-[9px] text-emerald-400">ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
