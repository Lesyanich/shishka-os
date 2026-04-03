import { useState } from 'react'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Link2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface MatchedItem {
  shishka: { id: string; name: string; code: string }
  syrve: { id: string; name: string; code: string | null; unit: string }
  confidence: number
  already_mapped: boolean
}

interface UnmatchedItem {
  id: string
  name: string
  code: string
}

interface PocReport {
  ok: boolean
  error?: string
  syrve?: {
    organization_id: string
    organization_name: string
    products_count: number
    groups_count: number
    revision: number
  }
  shishka?: { items_count: number }
  matching?: {
    matched_count: number
    already_mapped: number
    fuzzy_matched: number
    unmatched_shishka: number
    unmatched_syrve: number
    match_rate_percent: number
  }
  matched?: MatchedItem[]
  unmatched_shishka?: UnmatchedItem[]
  unmatched_syrve?: Array<{ id: string; name: string; code: string | null; type: string }>
}

interface Props {
  report: PocReport | null
  isLoading: boolean
  onApplyMapping: (nomenclatureId: string, syrveUuid: string) => Promise<boolean>
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    value >= 0.9
      ? 'bg-emerald-500/20 text-emerald-300'
      : value >= 0.7
        ? 'bg-sky-500/20 text-sky-300'
        : 'bg-amber-500/20 text-amber-300'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {pct}%
    </span>
  )
}

export function SyrvePocReport({ report, isLoading, onApplyMapping }: Props) {
  const [showMatched, setShowMatched] = useState(true)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/30 p-12">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-sky-400" />
          <p className="text-xs text-slate-400">Connecting to Syrve API...</p>
          <p className="mt-1 text-[10px] text-slate-600">
            Fetching nomenclature & matching products
          </p>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/30 p-12">
        <div className="text-center">
          <Link2 className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-xs text-slate-500">
            Configure your Syrve API credentials, then click "Run PoC" to test the connection.
          </p>
        </div>
      </div>
    )
  }

  if (!report.ok) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <XCircle className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-bold text-red-300">Connection Failed</h3>
        </div>
        <p className="text-xs text-red-300/80">{report.error}</p>
      </div>
    )
  }

  const { syrve, shishka, matching, matched = [], unmatched_shishka = [], unmatched_syrve = [] } = report

  const handleApply = async (shishkaId: string, syrveId: string) => {
    setApplyingId(shishkaId)
    await onApplyMapping(shishkaId, syrveId)
    setApplyingId(null)
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-bold text-slate-100">Syrve PoC Report</h3>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBox label="Syrve Products" value={syrve?.products_count ?? 0} />
        <StatBox label="Shishka Items" value={shishka?.items_count ?? 0} />
        <StatBox
          label="Matched"
          value={matching?.matched_count ?? 0}
          accent="emerald"
        />
        <StatBox
          label="Match Rate"
          value={`${matching?.match_rate_percent ?? 0}%`}
          accent={
            (matching?.match_rate_percent ?? 0) >= 70
              ? 'emerald'
              : (matching?.match_rate_percent ?? 0) >= 40
                ? 'sky'
                : 'amber'
          }
        />
      </div>

      {/* Sub-stats */}
      <div className="flex gap-3 text-[10px] text-slate-500">
        <span>Syrve Org: {syrve?.organization_name}</span>
        <span>·</span>
        <span>{syrve?.groups_count} groups</span>
        <span>·</span>
        <span>Rev {syrve?.revision}</span>
      </div>

      {/* Matched items */}
      {matched.length > 0 && (
        <Section
          title={`Matched Items (${matched.length})`}
          subtitle={`${matching?.already_mapped ?? 0} already mapped, ${matching?.fuzzy_matched ?? 0} fuzzy`}
          isOpen={showMatched}
          onToggle={() => setShowMatched(!showMatched)}
        >
          <div className="space-y-1">
            {matched.map((m) => (
              <div
                key={m.shishka.id}
                className="flex items-center gap-2 rounded-lg border border-slate-700/30 bg-slate-800/20 p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">{m.shishka.code}</span>
                    <span className="truncate text-xs text-slate-200">{m.shishka.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-sky-500">→ {m.syrve.name}</span>
                    <span className="text-[10px] text-slate-600">({m.syrve.unit})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ConfidenceBadge value={m.confidence} />
                  {m.already_mapped ? (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      Linked
                    </span>
                  ) : (
                    <button
                      onClick={() => handleApply(m.shishka.id, m.syrve.id)}
                      disabled={applyingId === m.shishka.id}
                      className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-medium text-sky-300 transition hover:bg-sky-500/30 disabled:opacity-50"
                    >
                      {applyingId === m.shishka.id ? '...' : 'Apply'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Unmatched Shishka */}
      {unmatched_shishka.length > 0 && (
        <Section
          title={`Unmatched Shishka (${unmatched_shishka.length})`}
          subtitle="No Syrve match found"
          isOpen={showUnmatched}
          onToggle={() => setShowUnmatched(!showUnmatched)}
          warn
        >
          <div className="space-y-0.5">
            {unmatched_shishka.map((i) => (
              <div key={i.id} className="flex items-center gap-2 px-2 py-1">
                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500/50" />
                <span className="text-[10px] text-slate-500">{i.code}</span>
                <span className="truncate text-xs text-slate-400">{i.name}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Unmatched Syrve */}
      {unmatched_syrve.length > 0 && (
        <Section
          title={`Unmatched Syrve (${unmatched_syrve.length})`}
          subtitle="Products only in Syrve"
          isOpen={false}
          onToggle={() => {}}
        >
          <div className="space-y-0.5">
            {unmatched_syrve.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2 py-1">
                <span className="truncate text-xs text-slate-400">{p.name}</span>
                <span className="text-[10px] text-slate-600">{p.type}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'emerald' | 'sky' | 'amber'
}) {
  const textColor = accent
    ? accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'sky'
        ? 'text-sky-300'
        : 'text-amber-300'
    : 'text-slate-100'

  return (
    <div className="rounded-lg border border-slate-700/30 bg-slate-800/20 p-2 text-center">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${textColor}`}>{value}</p>
    </div>
  )
}

function Section({
  title,
  subtitle,
  isOpen,
  onToggle,
  warn,
  children,
}: {
  title: string
  subtitle?: string
  isOpen: boolean
  onToggle: () => void
  warn?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border ${warn ? 'border-amber-500/20' : 'border-slate-700/30'} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div>
          <span className={`text-xs font-medium ${warn ? 'text-amber-300' : 'text-slate-200'}`}>
            {title}
          </span>
          {subtitle && (
            <span className="ml-2 text-[10px] text-slate-500">{subtitle}</span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        )}
      </button>
      {isOpen && <div className="border-t border-slate-700/20 p-2">{children}</div>}
    </div>
  )
}
