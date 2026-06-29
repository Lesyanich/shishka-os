import { useCallback, useEffect, useState } from 'react'
import { Archive, ChevronDown, ChevronRight, Loader2, ShoppingCart } from 'lucide-react'
import {
  useStockRequests,
  type StockRequestLine,
  type StockRequestSummary,
} from '../../hooks/useStockRequests'
import type { StockStatus } from '../../types/stockSheet'

const STATUS_CHIP: Record<StockStatus, { label: string; cls: string }> = {
  out: { label: 'Out', cls: 'bg-brick-soft/15 text-brick-bright' },
  low: { label: 'Low', cls: 'bg-amber-watch/15 text-amber-watch' },
  in: { label: 'In', cls: 'bg-forest-soft/15 text-mint-200' },
}

export interface PrefillLine {
  nomenclature_id: string
  qty_ordered: number
}

interface Props {
  /** Hand the marked items to the PO form (parent switches to the Orders tab). */
  onAddToPO: (lines: PrefillLine[], notes: string) => void
}

function statusBadge(status: StockRequestSummary['status']) {
  const map: Record<string, string> = {
    open: 'bg-honey-300/15 text-honey-300',
    converted: 'bg-forest-soft/15 text-mint-200',
    archived: 'bg-[var(--s-3)] text-cream/60',
  }
  return map[status] ?? 'bg-[var(--s-3)] text-cream/60'
}

export function StockRequestsPanel({ onAddToPO }: Props) {
  const { requests, isLoading, error, fetchLines, updateStatus } = useStockRequests()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [lines, setLines] = useState<Record<string, StockRequestLine[]>>({})
  const [loadingLines, setLoadingLines] = useState(false)

  const toggle = useCallback(
    async (id: string) => {
      if (expanded === id) {
        setExpanded(null)
        return
      }
      setExpanded(id)
      if (!lines[id]) {
        setLoadingLines(true)
        const fetched = await fetchLines(id)
        setLines((prev) => ({ ...prev, [id]: fetched }))
        setLoadingLines(false)
      }
    },
    [expanded, lines, fetchLines],
  )

  // Preload lines for the first request so the panel is immediately useful.
  useEffect(() => {
    if (requests.length > 0 && expanded === null) {
      toggle(requests[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests.length])

  const handleAddToPO = useCallback(
    (req: StockRequestSummary) => {
      const reqLines = lines[req.id] ?? []
      const prefill: PrefillLine[] = reqLines
        .filter((l) => l.status !== 'in' || (l.order_qty ?? 0) > 0)
        .map((l) => ({
          nomenclature_id: l.nomenclature_id,
          qty_ordered: l.order_qty && l.order_qty > 0 ? l.order_qty : 1,
        }))
      if (prefill.length === 0) return
      const date = new Date(req.submitted_at).toLocaleDateString()
      onAddToPO(prefill, `From stock sheet ${date}`)
      updateStatus(req.id, 'converted')
    },
    [lines, onAddToPO, updateStatus],
  )

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-cream">Stock Requests</h3>
        <p className="text-xs text-cream/45">What staff reported via the stock sheet (/stock).</p>
      </div>

      {error && (
        <div className="rounded-lg border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12 text-cream/45">
          <Loader2 className="h-5 w-5 animate-spin text-mint-200" />
        </div>
      )}

      {!isLoading && requests.length === 0 && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] px-3 py-8 text-center text-sm text-cream/45">
          No submissions yet.
        </p>
      )}

      {requests.map((req) => {
        const isOpen = expanded === req.id
        const reqLines = lines[req.id] ?? []
        return (
          <div
            key={req.id}
            className="overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)]"
          >
            <button
              onClick={() => toggle(req.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-[var(--s-2)]"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-cream/45" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-cream/45" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-cream">
                  {new Date(req.submitted_at).toLocaleString()}
                </p>
                {req.note && <p className="truncate text-[11px] text-cream/45">{req.note}</p>}
              </div>
              <span className="text-[11px] text-cream/45">{req.line_count} items</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(req.status)}`}
              >
                {req.status}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-[var(--line-strong)] px-3 py-3">
                {loadingLines && !lines[req.id] ? (
                  <div className="flex justify-center py-4 text-cream/45">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {reqLines.map((l) => (
                        <div key={l.id} className="flex items-center gap-2 text-xs text-cream/80">
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CHIP[l.status].cls}`}
                          >
                            {STATUS_CHIP[l.status].label}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{l.product_name}</span>
                          {l.order_qty != null && l.order_qty > 0 && (
                            <span className="shrink-0 font-semibold text-honey-300">
                              {l.order_qty} {l.base_unit ?? ''}
                            </span>
                          )}
                          {l.note && (
                            <span className="shrink-0 text-[10px] text-cream/45">“{l.note}”</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleAddToPO(req)}
                        disabled={req.status === 'converted'}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-royal-green)] py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-royal-soft)] active:scale-[0.99] disabled:opacity-40"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Add to Purchase Order
                      </button>
                      <button
                        onClick={() => updateStatus(req.id, 'archived')}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-xs text-cream/60 transition hover:bg-[var(--s-2)]"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
