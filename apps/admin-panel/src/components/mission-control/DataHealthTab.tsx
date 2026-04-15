import { useCallback, useMemo, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Wrench,
} from 'lucide-react'
import {
  useDataHealth,
  type HealthItem,
  type HealthMetric,
  type HealthMetricKey,
  type HealthSeverity,
} from '../../hooks/useDataHealth'
import type { NewBusinessTask } from '../../hooks/useBusinessTasks'

// ── Metric presentation metadata ──

interface MetricMeta {
  label: string
  description: string
  entityScope: string
}

const METRIC_META: Record<HealthMetricKey, MetricMeta> = {
  type_mismatch: {
    label: 'Type mismatch',
    description: 'RAW-coded rows with non-raw type',
    entityScope: 'nomenclature',
  },
  duplicate_names: {
    label: 'Duplicate names',
    description: 'Active rows sharing the same display name',
    entityScope: 'nomenclature',
  },
  no_category: {
    label: 'No category',
    description: 'Active RAW items without L3 category assigned',
    entityScope: 'nomenclature (RAW)',
  },
  zero_cost_with_purchases: {
    label: 'Zero cost + purchases',
    description: 'Has purchase history but cost_per_unit is 0',
    entityScope: 'nomenclature',
  },
  misclassified_cogs: {
    label: 'Misclassified COGS',
    description: 'Expense flagged COGS but supplier is non-food',
    entityScope: 'expense_ledger',
  },
  unmatched_queue: {
    label: 'Unmatched queue',
    description: 'OCR line items awaiting manual review',
    entityScope: 'unmatched_items',
  },
  orphan_items: {
    label: 'Orphan items',
    description: 'Active RAW items never purchased',
    entityScope: 'nomenclature (RAW)',
  },
  stale_prices: {
    label: 'Stale prices',
    description: 'Last purchase > 30 days ago',
    entityScope: 'nomenclature (RAW)',
  },
}

const SEVERITY_ORDER: HealthSeverity[] = ['error', 'warning', 'action', 'info']

// ── Severity presentation ──

function severityChip(severity: HealthSeverity, count: number): string {
  if (count === 0) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
  switch (severity) {
    case 'error':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/25'
    case 'warning':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/25'
    case 'action':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/25'
    case 'info':
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/25'
  }
}

function severityIcon(severity: HealthSeverity, count: number) {
  if (count === 0) return <CheckCircle2 size={14} className="text-emerald-400" />
  switch (severity) {
    case 'error':
      return <AlertOctagon size={14} className="text-rose-400" />
    case 'warning':
      return <AlertTriangle size={14} className="text-amber-400" />
    case 'action':
      return <Wrench size={14} className="text-sky-400" />
    case 'info':
    default:
      return <Info size={14} className="text-slate-400" />
  }
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-400'
  if (score >= 70) return 'text-amber-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-rose-400'
}

function scoreStroke(score: number): string {
  if (score >= 90) return 'stroke-emerald-400'
  if (score >= 70) return 'stroke-amber-400'
  if (score >= 40) return 'stroke-orange-400'
  return 'stroke-rose-400'
}

// ── Score ring (SVG) ──

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="relative inline-flex h-28 w-28 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="fill-none stroke-slate-800"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={`fill-none ${scoreStroke(clamped)} transition-all duration-700`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold tabular-nums ${scoreColor(clamped)}`}>{clamped}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          of 100
        </span>
      </div>
    </div>
  )
}

// ── Item row with "Create Task" ──

interface ItemRowProps {
  item: HealthItem
  metric: HealthMetric
  onCreateTask: (item: HealthItem, metric: HealthMetric) => Promise<void>
}

function ItemRow({ item, metric, onCreateTask }: ItemRowProps) {
  const [state, setState] = useState<'idle' | 'creating' | 'done'>('idle')

  const click = async () => {
    if (state !== 'idle') return
    setState('creating')
    try {
      await onCreateTask(item, metric)
      setState('done')
    } catch {
      setState('idle')
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/60 bg-slate-900/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.product_code && (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
              {item.product_code}
            </span>
          )}
          <span className="truncate text-sm text-slate-200">{item.name}</span>
        </div>
        {item.extra_json && Object.keys(item.extra_json).length > 0 && (
          <div className="mt-0.5 truncate text-[11px] text-slate-500">
            {Object.entries(item.extra_json)
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(' · ')}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={click}
        disabled={state !== 'idle'}
        className={[
          'shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
          state === 'done'
            ? 'bg-emerald-500/15 text-emerald-300'
            : state === 'creating'
              ? 'bg-slate-700 text-slate-400'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100',
        ].join(' ')}
      >
        {state === 'creating' ? (
          <>
            <Loader2 size={11} className="animate-spin" />
            Creating…
          </>
        ) : state === 'done' ? (
          <>
            <Check size={11} />
            Created
          </>
        ) : (
          <>
            <Plus size={11} />
            Create Task
          </>
        )}
      </button>
    </div>
  )
}

// ── Collapsible metric card ──

interface MetricCardProps {
  metric: HealthMetric
  fetchItems: (metric: HealthMetricKey) => Promise<HealthItem[]>
  onCreateTask: (item: HealthItem, metric: HealthMetric) => Promise<void>
}

function MetricCard({ metric, fetchItems, onCreateTask }: MetricCardProps) {
  const meta = METRIC_META[metric.metric]
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<HealthItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    if (metric.val === 0) return
    const next = !expanded
    setExpanded(next)
    if (next && items === null) {
      setLoading(true)
      const rows = await fetchItems(metric.metric)
      setItems(rows)
      setLoading(false)
    }
  }, [expanded, items, fetchItems, metric.metric, metric.val])

  const clickable = metric.val > 0

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/30">
      <button
        type="button"
        onClick={toggle}
        disabled={!clickable}
        className={[
          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
          clickable ? 'hover:bg-slate-900/60' : 'cursor-default',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {severityIcon(metric.severity, metric.val)}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-100">{meta.label}</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                {meta.entityScope}
              </span>
            </div>
            <p className="truncate text-[11px] text-slate-500">{meta.description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={[
              'rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums',
              severityChip(metric.severity, metric.val),
            ].join(' ')}
          >
            {metric.val}
          </span>
          {clickable &&
            (expanded ? (
              <ChevronDown size={14} className="text-slate-500" />
            ) : (
              <ChevronRight size={14} className="text-slate-500" />
            ))}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-800/60 px-3 py-2">
          {loading && (
            <div className="flex items-center gap-2 py-3 text-[11px] text-slate-500">
              <Loader2 size={12} className="animate-spin" />
              Loading items…
            </div>
          )}
          {!loading && items && items.length === 0 && (
            <div className="py-3 text-[11px] text-slate-500">No items to show.</div>
          )}
          {!loading && items && items.length > 0 && (
            <div className="flex flex-col gap-1.5 py-1">
              {items.map(item => (
                <ItemRow
                  key={`${item.metric}-${item.entity_id}`}
                  item={item}
                  metric={metric}
                  onCreateTask={onCreateTask}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main tab ──

interface DataHealthTabProps {
  /** Creates a new business task; returns true on success. */
  addTask: (task: NewBusinessTask) => Promise<boolean>
}

export function DataHealthTab({ addTask }: DataHealthTabProps) {
  const { metrics, healthScore, isLoading, error, refetch, fetchItems } = useDataHealth()

  const byGroup = useMemo(() => {
    const map = new Map<HealthSeverity, HealthMetric[]>()
    for (const sev of SEVERITY_ORDER) map.set(sev, [])
    for (const m of metrics) {
      const bucket = map.get(m.severity)
      if (bucket) bucket.push(m)
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => b.val - a.val)
    }
    return map
  }, [metrics])

  const stats = useMemo(() => {
    const critical = metrics
      .filter(m => m.severity === 'error')
      .reduce((s, m) => s + m.val, 0)
    const warnings = metrics
      .filter(m => m.severity === 'warning' || m.severity === 'action')
      .reduce((s, m) => s + m.val, 0)
    const allClear = metrics.filter(m => m.val === 0).length
    return { critical, warnings, allClear }
  }, [metrics])

  const handleCreateTask = useCallback(
    async (item: HealthItem, metric: HealthMetric) => {
      const meta = METRIC_META[metric.metric]
      const prefix = item.product_code ?? item.entity_kind
      const title = `Data Health (${meta.label}): ${prefix} — ${item.name}`.slice(0, 200)
      const description = [
        `Auto-created from Data Health tab.`,
        ``,
        `Metric: ${metric.metric} (${metric.severity})`,
        `Entity: ${item.entity_kind} / ${item.entity_id}`,
        item.product_code ? `Code: ${item.product_code}` : null,
        `Name: ${item.name}`,
        item.extra_json && Object.keys(item.extra_json).length > 0
          ? `Context: ${JSON.stringify(item.extra_json)}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')

      const domain =
        metric.metric === 'misclassified_cogs'
          ? 'finance'
          : metric.metric === 'unmatched_queue'
            ? 'finance'
            : 'tech'
      const priority =
        metric.severity === 'error'
          ? 'high'
          : metric.severity === 'warning' || metric.severity === 'action'
            ? 'medium'
            : 'low'

      await addTask({
        title,
        domain,
        priority,
        description,
        source: 'agent_discovery',
        created_by: 'data-health-tab',
      })
    },
    [addTask],
  )

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-20 text-slate-500">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Loading data health metrics…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-rose-400">
        <AlertOctagon size={22} />
        <p className="text-sm">Failed to load: {error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header: score ring + stats */}
      <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
        <ScoreRing score={healthScore} />
        <div className="flex flex-1 flex-wrap gap-4">
          <StatBlock label="Critical" value={stats.critical} tone="error" />
          <StatBlock label="Warnings" value={stats.warnings} tone="warning" />
          <StatBlock label="All clear" value={stats.allClear} tone="ok" />
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Sections by severity */}
      {SEVERITY_ORDER.map(sev => {
        const bucket = byGroup.get(sev) ?? []
        if (bucket.length === 0) return null
        return (
          <section key={sev} className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {sev === 'error'
                ? 'Errors'
                : sev === 'warning'
                  ? 'Warnings'
                  : sev === 'action'
                    ? 'Action required'
                    : 'Info'}
            </h3>
            <div className="flex flex-col gap-2">
              {bucket.map(m => (
                <MetricCard
                  key={m.metric}
                  metric={m}
                  fetchItems={fetchItems}
                  onCreateTask={handleCreateTask}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ── Stat tile ──

function StatBlock({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'error' | 'warning' | 'ok'
}) {
  const toneCls =
    tone === 'error'
      ? 'text-rose-300'
      : tone === 'warning'
        ? 'text-amber-300'
        : 'text-emerald-300'
  return (
    <div className="min-w-[96px] rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}
