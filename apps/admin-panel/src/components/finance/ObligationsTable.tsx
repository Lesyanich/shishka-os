import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { Obligation } from '../../hooks/useFinanceDashboard'
import { formatTHBFull } from './helpers'

interface ObligationsTableProps {
  obligations: Obligation[]
  totalOutstanding: number
  isLoading: boolean
}

const STATUS_STYLE: Record<Obligation['status'], { bg: string; text: string; label: string }> = {
  pending:   { bg: 'bg-amber-500/15',   text: 'text-amber-300',   label: 'Pending' },
  partial:   { bg: 'bg-sky-500/15',     text: 'text-sky-300',     label: 'Partial' },
  paid:      { bg: 'bg-emerald-500/15', text: 'text-emerald-300', label: 'Paid' },
  overdue:   { bg: 'bg-rose-500/15',    text: 'text-rose-300',    label: 'Overdue' },
  on_hold:   { bg: 'bg-slate-500/15',   text: 'text-slate-400',   label: 'On Hold' },
  cancelled: { bg: 'bg-slate-500/15',   text: 'text-slate-500',   label: 'Cancelled' },
}

const PRIORITY_DOT: Record<Obligation['priority'], string> = {
  critical: 'bg-rose-400',
  high:     'bg-amber-400',
  medium:   'bg-sky-400',
  low:      'bg-slate-500',
}

export function ObligationsTable({ obligations, totalOutstanding, isLoading }: ObligationsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="h-48 animate-pulse rounded-lg bg-slate-800/50" />
      </div>
    )
  }

  const active = obligations.filter(o => o.status !== 'paid')
  const paid = obligations.filter(o => o.status === 'paid')

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Obligations
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-slate-500">Outstanding:</span>
          <span className="text-sm font-bold tabular-nums text-rose-400">
            ฿{formatTHBFull(totalOutstanding)}
          </span>
        </div>
      </div>

      {/* Active obligations */}
      {active.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-500">No active obligations</p>
      ) : (
        <div className="divide-y divide-slate-800/50">
          {active.map(obl => (
            <ObligationRow
              key={obl.id}
              obligation={obl}
              isExpanded={expandedId === obl.id}
              onToggle={() => setExpandedId(expandedId === obl.id ? null : obl.id)}
            />
          ))}
        </div>
      )}

      {/* Paid section (collapsed) */}
      {paid.length > 0 && (
        <div className="border-t border-slate-800">
          <button
            onClick={() => setExpandedId(expandedId === '__paid__' ? null : '__paid__')}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-[10px] text-slate-500 hover:bg-slate-800/30"
          >
            {expandedId === '__paid__' ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {paid.length} paid obligation{paid.length > 1 ? 's' : ''}
          </button>
          {expandedId === '__paid__' && (
            <div className="divide-y divide-slate-800/30">
              {paid.map(obl => (
                <ObligationRow
                  key={obl.id}
                  obligation={obl}
                  isExpanded={false}
                  onToggle={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Single obligation row ─── */

function ObligationRow({
  obligation: obl,
  isExpanded,
  onToggle,
}: {
  obligation: Obligation
  isExpanded: boolean
  onToggle: () => void
}) {
  const style = STATUS_STYLE[obl.status]
  const remaining = obl.amount_thb - obl.paid_thb
  const paidPct = obl.amount_thb > 0 ? (obl.paid_thb / obl.amount_thb) * 100 : 0
  const isOverdue = obl.due_date && new Date(obl.due_date) < new Date() && obl.status !== 'paid'

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-800/30"
      >
        {/* Priority dot */}
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[obl.priority]}`} />

        {/* Creditor + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-slate-200">
              {obl.creditor}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
              {style.label}
            </span>
          </div>
          {obl.description && (
            <p className="mt-0.5 truncate text-[10px] text-slate-500">{obl.description}</p>
          )}
        </div>

        {/* Amount */}
        <div className="shrink-0 text-right">
          <span className={`text-sm font-semibold tabular-nums ${obl.status === 'paid' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
            ฿{formatTHBFull(obl.amount_thb)}
          </span>
          {obl.paid_thb > 0 && obl.status !== 'paid' && (
            <p className="text-[10px] text-emerald-500">
              ฿{formatTHBFull(obl.paid_thb)} paid
            </p>
          )}
        </div>

        {/* Due date */}
        <div className="w-16 shrink-0 text-right">
          {obl.due_date ? (
            <span className={`text-[10px] ${isOverdue ? 'font-semibold text-rose-400' : 'text-slate-500'}`}>
              {new Date(obl.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          ) : (
            <span className="text-[10px] text-slate-600">—</span>
          )}
        </div>

        {/* Expand chevron */}
        {obl.status !== 'paid' && (
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-600 transition ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-slate-800/50 bg-slate-900/30 px-4 py-3 space-y-2">
          {/* Progress bar for partial payments */}
          {obl.paid_thb > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                <span>Paid: ฿{formatTHBFull(obl.paid_thb)}</span>
                <span>Remaining: ฿{formatTHBFull(remaining)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${paidPct}%` }}
                />
              </div>
            </div>
          )}

          {obl.notes && (
            <p className="text-[10px] leading-relaxed text-slate-500">{obl.notes}</p>
          )}

          <div className="flex gap-4 text-[10px] text-slate-600">
            <span>Priority: {obl.priority}</span>
            {obl.source && <span>Source: {obl.source}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
