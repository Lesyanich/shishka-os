import { useCallback, useEffect, useState } from 'react'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShoppingCart,
} from 'lucide-react'
import {
  useStockRequests,
  type StockRequestLine,
  type StockRequestSummary,
} from '../../hooks/useStockRequests'
import type { StockStatus } from '../../types/stockSheet'

const STATUS_CHIP: Record<StockStatus, { label: string; cls: string }> = {
  out: { label: 'Out', cls: 'bg-rose-500/15 text-rose-300' },
  low: { label: 'Low', cls: 'bg-amber-500/15 text-amber-300' },
  in: { label: 'In', cls: 'bg-emerald-500/15 text-emerald-300' },
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
    open: 'bg-sky-500/15 text-sky-300',
    converted: 'bg-emerald-500/15 text-emerald-300',
    archived: 'bg-slate-700 text-slate-400',
  }
  return map[status] ?? 'bg-slate-700 text-slate-400'
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
        <h3 className="text-sm font-bold text-slate-100">Stock Requests</h3>
        <p className="text-xs text-slate-500">
          What staff reported via the stock sheet (/stock).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
        </div>
      )}

      {!isLoading && requests.length === 0 && (
        <p className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-8 text-center text-sm text-slate-500">
          No submissions yet.
        </p>
      )}

      {requests.map((req) => {
        const isOpen = expanded === req.id
        const reqLines = lines[req.id] ?? []
        return (
          <div
            key={req.id}
            className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/30"
          >
            <button
              onClick={() => toggle(req.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-slate-800/50"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200">
                  {new Date(req.submitted_at).toLocaleString()}
                </p>
                {req.note && <p className="truncate text-[11px] text-slate-500">{req.note}</p>}
              </div>
              <span className="text-[11px] text-slate-500">{req.line_count} items</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(req.status)}`}
              >
                {req.status}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-slate-700/50 px-3 py-3">
                {loadingLines && !lines[req.id] ? (
                  <div className="flex justify-center py-4 text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {reqLines.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center gap-2 text-xs text-slate-300"
                        >
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CHIP[l.status].cls}`}
                          >
                            {STATUS_CHIP[l.status].label}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{l.product_name}</span>
                          {l.order_qty != null && l.order_qty > 0 && (
                            <span className="shrink-0 font-semibold text-sky-300">
                              {l.order_qty} {l.base_unit ?? ''}
                            </span>
                          )}
                          {l.note && (
                            <span className="shrink-0 text-[10px] text-slate-500">“{l.note}”</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleAddToPO(req)}
                        disabled={req.status === 'converted'}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-40"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Add to Purchase Order
                      </button>
                      <button
                        onClick={() => updateStatus(req.id, 'archived')}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:bg-slate-800"
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
