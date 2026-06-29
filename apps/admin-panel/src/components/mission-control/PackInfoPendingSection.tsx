import { useCallback, useMemo, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useAppRole } from '../../contexts/AppRoleContext'
import {
  usePackInfoPending,
  type PendingCard,
  type PendingDecision,
} from '../../hooks/usePackInfoPending'

// ── Source labels (resolver Source enum) ──

const SOURCE_LABEL: Record<string, string> = {
  supplier_catalog_exact: 'supplier_catalog (exact)',
  supplier_catalog_fuzzy: 'supplier_catalog (fuzzy)',
  makro_barcode: 'makro.pro (barcode)',
  makro_fuzzy: 'makro.pro (fuzzy)',
}

// ── Confidence presentation ──

function confidenceTone(conf: number | null): string {
  if (conf == null) return 'bg-[var(--s-3)] text-cream/80 border-[var(--line-strong)]'
  if (conf >= 0.9) return 'bg-forest-soft/15 text-mint-200 border-forest-soft/25'
  if (conf >= 0.5) return 'bg-amber-watch/15 text-amber-watch border-amber-watch/25'
  return 'bg-brick-soft/15 text-brick-bright border-brick-soft/25'
}

function formatConfidence(conf: number | null): string {
  if (conf == null) return '—'
  return `${Math.round(conf * 100)}%`
}

// ── Conflict payload type (matches resolver Conflict shape) ──

interface ConflictEntry {
  source?: string
  pack_info?: { package_weight?: string; package_qty?: number; package_unit?: string }
  evidence?: Record<string, unknown>
}

function extractConflicts(decision: PendingDecision): ConflictEntry[] {
  const payload = decision.source_payload
  if (!payload || typeof payload !== 'object') return []
  const raw = (payload as { conflicts?: unknown }).conflicts
  if (!Array.isArray(raw)) return []
  return raw as ConflictEntry[]
}

// ── Single decision row inside a card (one per field change) ──

interface DecisionRowProps {
  decision: PendingDecision
}

function DecisionRow({ decision }: DecisionRowProps) {
  const label =
    decision.field === 'base_unit'
      ? 'Base unit'
      : decision.field === 'cost_per_unit'
        ? 'Cost per unit'
        : decision.field

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded bg-[var(--s-2)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-cream/60">
        {label}
      </span>
      <span className="font-mono text-cream/60">{decision.old_value || '∅'}</span>
      <span className="text-cream/30">→</span>
      <span className="font-mono text-cream">{decision.new_value || '∅'}</span>
      {decision.decision_source === 'rule_auto_conflict' && (
        <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-watch/15 px-1.5 py-0.5 text-[10px] text-amber-watch">
          <AlertTriangle size={10} />
          conflict
        </span>
      )}
      {decision.decision_source === 'rule_auto_cost_pending' && (
        <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-honey-300/15 px-1.5 py-0.5 text-[10px] text-honey-300">
          <ShieldAlert size={10} />
          BOM-impact
        </span>
      )}
    </div>
  )
}

// ── Card per nomenclature row ──

interface CardActionState {
  status: 'idle' | 'working' | 'error'
  message?: string
}

interface PendingCardViewProps {
  card: PendingCard
  approve: (decisionId: string) => Promise<{ ok: boolean; error?: string }>
  reject: (decisionId: string) => Promise<{ ok: boolean; error?: string }>
}

function PendingCardView({ card, approve, reject }: PendingCardViewProps) {
  const [showConflicts, setShowConflicts] = useState(false)
  const [actions, setActions] = useState<Record<string, CardActionState>>({})

  const setActionState = (id: string, state: CardActionState) =>
    setActions((prev) => ({ ...prev, [id]: state }))

  const handle = useCallback(
    async (decisionId: string, kind: 'approve' | 'reject') => {
      setActionState(decisionId, { status: 'working' })
      const fn = kind === 'approve' ? approve : reject
      const result = await fn(decisionId)
      if (!result.ok) {
        setActionState(decisionId, { status: 'error', message: result.error })
      }
      // On success refetch removes the row; no need to clear state.
    },
    [approve, reject],
  )

  // Aggregate conflicts across all decisions in the card.
  const conflicts = useMemo(
    () => card.decisions.flatMap((d) => extractConflicts(d)),
    [card.decisions],
  )

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] p-3">
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Package size={14} className="text-cream/45" />
            {card.product_code && (
              <span className="rounded bg-[var(--s-2)] px-1.5 py-0.5 font-mono text-[10px] text-cream/80">
                {card.product_code}
              </span>
            )}
            <span className="truncate text-sm font-medium text-cream">{card.product_name}</span>
            {card.current_base_unit && (
              <span className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[10px] text-cream/60">
                now: {card.current_base_unit}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-cream/45">
            <span
              className={[
                'rounded border px-1.5 py-0.5 font-mono tabular-nums',
                confidenceTone(card.max_confidence),
              ].join(' ')}
            >
              conf {formatConfidence(card.max_confidence)}
            </span>
            {card.source && (
              <span className="rounded bg-[var(--s-2)] px-1.5 py-0.5 text-[10px] text-cream/60">
                {SOURCE_LABEL[card.source] ?? card.source}
              </span>
            )}
            <span className="text-cream/30">
              {new Date(card.latest_decided_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Decision rows */}
      <div className="mt-3 flex flex-col gap-1.5">
        {card.decisions.map((d) => {
          const action = actions[d.id] ?? { status: 'idle' as const }
          return (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-black/70 px-2 py-1.5"
            >
              <DecisionRow decision={d} />
              <div className="flex shrink-0 items-center gap-1">
                {action.status === 'error' && action.message && (
                  <span
                    className="max-w-[200px] truncate text-[10px] text-brick-bright"
                    title={action.message}
                  >
                    {action.message}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handle(d.id, 'approve')}
                  disabled={action.status === 'working'}
                  className={[
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                    action.status === 'working'
                      ? 'bg-[var(--s-3)] text-cream/60'
                      : 'bg-forest-soft/15 text-mint-200 hover:bg-forest-soft/25',
                  ].join(' ')}
                >
                  {action.status === 'working' ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Check size={11} />
                  )}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handle(d.id, 'reject')}
                  disabled={action.status === 'working'}
                  className={[
                    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                    action.status === 'working'
                      ? 'bg-[var(--s-3)] text-cream/60'
                      : 'bg-brick-soft/15 text-brick-bright hover:bg-brick-soft/25',
                  ].join(' ')}
                >
                  <X size={11} />
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Conflicts collapsible */}
      {conflicts.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowConflicts((prev) => !prev)}
            className="inline-flex items-center gap-1 text-[11px] text-amber-watch/85 hover:text-amber-watch"
          >
            {showConflicts ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {conflicts.length} conflicting candidate{conflicts.length === 1 ? '' : 's'}
          </button>
          {showConflicts && (
            <div className="mt-2 flex flex-col gap-1 rounded-lg border border-amber-watch/20 bg-amber-watch/5 p-2">
              {conflicts.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[11px]">
                  <span className="rounded bg-[var(--s-2)] px-1.5 py-0.5 font-mono text-[10px] text-cream/60">
                    {c.source ?? 'unknown'}
                  </span>
                  <span className="font-mono text-cream">{c.pack_info?.package_weight ?? '—'}</span>
                  <span className="text-cream/45">
                    qty {c.pack_info?.package_qty ?? '?'} {c.pack_info?.package_unit ?? ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main section ──

export function PackInfoPendingSection() {
  const { role, isLoading: roleLoading } = useAppRole()
  const { cards, isLoading, error, refetch, approve, reject } = usePackInfoPending()

  // Hide entirely from non-owners. RLS-defended at DB layer (mig 172 RPC owner check),
  // this is a UX guard so cooks don't see an unusable section.
  if (roleLoading) return null
  if (role !== 'owner') return null

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-cream/45">
          Pending review · Pack-Info
        </h3>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--s-1)] px-2 py-1 text-[10px] text-cream/60 hover:bg-[var(--s-2)]"
        >
          <RefreshCw size={10} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-4 py-3 text-[11px] text-cream/45">
          <Loader2 size={12} className="animate-spin" />
          Loading pending decisions…
        </div>
      )}

      {error && !isLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-brick-soft/30 bg-brick-soft/5 px-4 py-3 text-[11px] text-brick-bright">
          <AlertOctagon size={12} />
          {error}
        </div>
      )}

      {!isLoading && !error && cards.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-4 py-3 text-[11px] text-cream/45">
          <CheckCircle2 size={12} className="text-mint-200" />
          No pending pack-info decisions.
        </div>
      )}

      {!isLoading && !error && cards.length > 0 && (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <PendingCardView key={card.entity_id} card={card} approve={approve} reject={reject} />
          ))}
        </div>
      )}
    </section>
  )
}
