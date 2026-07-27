import { FileText, ChevronRight, Send, ClipboardCheck } from 'lucide-react'
import { isNewForMe, stageOf } from '../../hooks/usePurchaseOrders'
import type { PurchaseOrder, POStatus, POStage } from '../../types/procurement'

const STATUS_COLORS: Record<POStatus, string> = {
  draft: 'bg-[var(--s-3)] text-cream/80',
  submitted: 'bg-honey-300/15 text-honey-300',
  confirmed: 'bg-honey-600/30 text-honey-300',
  shipped: 'bg-nutri-car/25 text-cream/90',
  partially_received: 'bg-amber-watch/20 text-amber-watch',
  received: 'bg-forest-soft/20 text-mint-200',
  reconciled: 'bg-forest-soft/20 text-mint-200',
  cancelled: 'bg-brick-soft/20 text-brick-bright',
}

const STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  partially_received: 'Partial',
  received: 'Received',
  reconciled: 'Reconciled',
  cancelled: 'Cancelled',
}

/** Workflow stages, in the order the desk shows them. */
const STAGES: { key: POStage; label: string; hint: string }[] = [
  { key: 'draft', label: 'Draft', hint: 'yours only — not sent yet' },
  { key: 'waiting', label: 'Waiting', hint: 'sent, awaiting confirmation' },
  { key: 'delivery', label: 'In delivery', hint: 'confirmed or on the way' },
  { key: 'receive', label: 'To receive', hint: 'arrived — check against the order' },
  { key: 'done', label: 'Done', hint: 'reconciled or cancelled' },
]

function formatWhen(order: PurchaseOrder): string | null {
  if (!order.expected_date) return null
  const date = new Date(order.expected_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
  return order.delivery_window ? `${date} · ${order.delivery_window}` : date
}

interface Props {
  orders: PurchaseOrder[]
  isLoading: boolean
  onSelect: (order: PurchaseOrder) => void
  /** Identity behind the author chip and the NEW badge. */
  myUserId: string | null
  seenIds: Set<string>
  onSubmitDraft: (order: PurchaseOrder) => void
  onReceive: (order: PurchaseOrder) => void
  busyId?: string | null
}

/**
 * Order Desk — the orders grouped by workflow stage rather than raw status,
 * so both sides see at a glance what is theirs to act on. An order handed to
 * you and not yet opened carries a NEW badge (spec §4.1).
 */
export function POHistory({
  orders,
  isLoading,
  onSelect,
  myUserId,
  seenIds,
  onSubmitDraft,
  onReceive,
  busyId,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-4">
        <h3 className="text-sm font-bold text-cream">Order Desk</h3>
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--s-3)]" />
          ))}
        </div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-4">
        <h3 className="text-sm font-bold text-cream">Order Desk</h3>
        <div className="py-6 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-cream/30" />
          <p className="text-xs text-cream/45">No purchase orders yet</p>
          <p className="mt-1 text-[11px] text-cream/35">
            Build one from the catalog, or create it by hand below.
          </p>
        </div>
      </div>
    )
  }

  const byStage = new Map<POStage, PurchaseOrder[]>()
  for (const order of orders) {
    const stage = stageOf(order.status)
    const bucket = byStage.get(stage)
    if (bucket) bucket.push(order)
    else byStage.set(stage, [order])
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-4">
      <h3 className="text-sm font-bold text-cream">Order Desk</h3>

      {STAGES.map(({ key, label, hint }) => {
        const group = byStage.get(key)
        if (!group || group.length === 0) return null

        return (
          <section key={key} className="space-y-1.5">
            <p className="pt-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-cream/40">
              {label} <span className="normal-case tracking-normal text-cream/30">· {hint}</span>
            </p>

            {group.map((po) => {
              const isNew = isNewForMe(po, myUserId, seenIds)
              const when = formatWhen(po)
              const isMine = po.created_by != null && po.created_by === myUserId
              const isBusy = busyId === po.id

              return (
                <div
                  key={po.id}
                  className={`flex items-center gap-2.5 rounded-lg border bg-[var(--s-2)] p-3 transition ${
                    isNew
                      ? 'border-brick-bright/50'
                      : key === 'done'
                        ? 'border-[var(--line-strong)] opacity-60'
                        : 'border-[var(--line-strong)]'
                  }`}
                >
                  <button
                    onClick={() => onSelect(po)}
                    className="group min-w-0 flex-1 text-left"
                    aria-label={`Open ${po.po_number}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-cream">{po.po_number}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[po.status]}`}
                      >
                        {STATUS_LABELS[po.status]}
                      </span>
                      {isNew && (
                        <span className="rounded-full bg-brick-bright px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
                          NEW
                        </span>
                      )}
                      {po.author_name && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isMine
                              ? 'bg-honey-300/15 text-honey-300'
                              : 'bg-forest-soft/20 text-mint-200'
                          }`}
                        >
                          {isMine ? 'by you' : `by ${po.author_name}`}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-cream/60">{po.supplier_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[10px] text-cream/45">
                      <span>{po.line_count} items</span>
                      {when && <span>{when}</span>}
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    {po.grand_total != null && po.grand_total > 0 && (
                      <span className="whitespace-nowrap text-[13px] font-bold text-honey-300">
                        ฿{po.grand_total.toLocaleString()}
                      </span>
                    )}

                    {key === 'draft' && (
                      <button
                        onClick={() => onSubmitDraft(po)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 rounded-lg bg-[var(--color-royal-green)] px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-[var(--color-royal-soft)] active:scale-95 disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" />
                        {isBusy ? '…' : 'Submit'}
                      </button>
                    )}

                    {key === 'receive' && po.status !== 'received' && (
                      <button
                        onClick={() => onReceive(po)}
                        className="flex items-center gap-1.5 rounded-lg bg-brick-bright px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110 active:scale-95"
                      >
                        <ClipboardCheck className="h-3 w-3" />
                        Receive
                      </button>
                    )}

                    <ChevronRight className="h-4 w-4 text-cream/30" aria-hidden />
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
