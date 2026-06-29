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
  pending:   { bg: 'bg-amber-watch/15',  text: 'text-amber-watch',  label: 'Pending' },
  partial:   { bg: 'bg-honey-300/15',    text: 'text-honey-300',    label: 'Partial' },
  paid:      { bg: 'bg-forest-soft/20',  text: 'text-mint-200',     label: 'Paid' },
  overdue:   { bg: 'bg-brick-soft/15',   text: 'text-brick-bright', label: 'Overdue' },
  on_hold:   { bg: 'bg-cream/10',        text: 'text-cream/60',     label: 'On Hold' },
  cancelled: { bg: 'bg-cream/10',        text: 'text-cream/40',     label: 'Cancelled' },
}

const PRIORITY_DOT: Record<Obligation['priority'], string> = {
  critical: 'bg-brick-bright',
  high:     'bg-amber-watch',
  medium:   'bg-honey-300',
  low:      'bg-cream/40',
}

export function ObligationsTable({ obligations, totalOutstanding, isLoading }: ObligationsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="shk-panel p-4">
        <div className="h-48 animate-pulse rounded-lg bg-[var(--s-2)]" />
      </div>
    )
  }

  const active = obligations.filter(o => o.status !== 'paid')
  const paid = obligations.filter(o => o.status === 'paid')

  return (
    <div className="shk-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-cream/60">
          Obligations
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="text-xs text-cream/45">Outstanding:</span>
          <span className="font-mono text-sm font-bold tabular-nums text-brick-bright">
            ฿{formatTHBFull(totalOutstanding)}
          </span>
        </div>
      </div>

      {/* Active obligations */}
      {active.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-cream/45">No active obligations</p>
      ) : (
        <div className="divide-y divide-[var(--line)]">
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
        <div className="border-t border-[var(--line)]">
          <button
            onClick={() => setExpandedId(expandedId === '__paid__' ? null : '__paid__')}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-[10px] text-cream/45 hover:bg-[var(--s-2)]"
          >
            {expandedId === '__paid__' ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {paid.length} paid obligation{paid.length > 1 ? 's' : ''}
          </button>
          {expandedId === '__paid__' && (
            <div className="divide-y divide-[var(--line)]">
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
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--s-2)]"
      >
        {/* Priority dot */}
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[obl.priority]}`} />

        {/* Creditor + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-cream">
              {obl.creditor}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
              {style.label}
            </span>
          </div>
          {obl.description && (
            <p className="mt-0.5 truncate text-[10px] text-cream/45">{obl.description}</p>
          )}
        </div>

        {/* Amount */}
        <div className="shrink-0 text-right">
          <span className={`font-mono text-sm font-semibold tabular-nums ${obl.status === 'paid' ? 'text-cream/40 line-through' : 'text-cream'}`}>
            ฿{formatTHBFull(obl.amount_thb)}
          </span>
          {obl.paid_thb > 0 && obl.status !== 'paid' && (
            <p className="text-[10px] text-mint-200">
              ฿{formatTHBFull(obl.paid_thb)} paid
            </p>
          )}
        </div>

        {/* Due date */}
        <div className="w-16 shrink-0 text-right">
          {obl.due_date ? (
            <span className={`text-[10px] ${isOverdue ? 'font-semibold text-brick-bright' : 'text-cream/45'}`}>
              {new Date(obl.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          ) : (
            <span className="text-[10px] text-cream/30">—</span>
          )}
        </div>

        {/* Expand chevron */}
        {obl.status !== 'paid' && (
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-cream/30 transition ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-[var(--line)] bg-[var(--s-1)] px-4 py-3 space-y-2">
          {/* Progress bar for partial payments */}
          {obl.paid_thb > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-cream/45">
                <span>Paid: ฿{formatTHBFull(obl.paid_thb)}</span>
                <span>Remaining: ฿{formatTHBFull(remaining)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--s-2)]">
                <div
                  className="h-full rounded-full bg-forest-soft transition-all"
                  style={{ width: `${paidPct}%` }}
                />
              </div>
            </div>
          )}

          {obl.notes && (
            <p className="text-[10px] leading-relaxed text-cream/45">{obl.notes}</p>
          )}

          <div className="flex gap-4 text-[10px] text-cream/40">
            <span>Priority: {obl.priority}</span>
            {obl.source && <span>Source: {obl.source}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
