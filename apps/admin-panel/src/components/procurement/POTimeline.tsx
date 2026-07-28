import type { POStatus } from '../../types/procurement'

/**
 * Status path of an order: everything before the current status reads as done,
 * the current one is highlighted, the rest are pending.
 *
 * The DB keeps no per-transition history (no po_status_events table), so only
 * two timestamps are real: when the order was created and when it last moved.
 * We label exactly those two and leave the other steps bare rather than
 * inventing plausible-looking times.
 */
const STEPS: { key: POStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Sent' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'received', label: 'Received' },
  { key: 'reconciled', label: 'Done' },
]

/** partially_received sits on the "Received" step; cancelled has no path. */
function stepIndexOf(status: POStatus): number {
  if (status === 'partially_received') return STEPS.findIndex((s) => s.key === 'received')
  return STEPS.findIndex((s) => s.key === status)
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface Props {
  status: POStatus
  createdAt: string
  authorName: string | null
  updatedAt?: string | null
}

export function POTimeline({ status, createdAt, authorName, updatedAt }: Props) {
  if (status === 'cancelled') {
    return (
      <div className="rounded-xl border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-[11px] text-brick-bright">
        Cancelled{updatedAt ? ` · ${shortTime(updatedAt)}` : ''}
      </div>
    )
  }

  const current = stepIndexOf(status)

  return (
    <div className="flex items-start gap-0" role="list" aria-label="Order status">
      {STEPS.map((step, i) => {
        const isDone = i < current
        const isCurrent = i === current
        const caption =
          i === 0
            ? [authorName, shortTime(createdAt)].filter(Boolean).join(' · ')
            : isCurrent && updatedAt
              ? shortTime(updatedAt)
              : null

        return (
          <div
            key={step.key}
            role="listitem"
            aria-current={isCurrent ? 'step' : undefined}
            className="relative flex-1 text-center text-[9.5px] leading-tight text-cream/45"
          >
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute left-[-50%] top-[4.5px] h-[1.5px] w-full ${
                  isDone || isCurrent ? 'bg-mint-200/50' : 'bg-[var(--line-strong)]'
                }`}
              />
            )}
            <span
              aria-hidden
              className={`relative mx-auto mb-1 block h-2.5 w-2.5 rounded-full border-[1.5px] ${
                isDone
                  ? 'border-mint-200 bg-mint-200'
                  : isCurrent
                    ? 'border-honey-300 bg-honey-300'
                    : 'border-[var(--line-strong)] bg-[var(--s-3)]'
              }`}
            />
            <span className={isCurrent ? 'font-semibold text-cream' : undefined}>{step.label}</span>
            {caption && <span className="mt-0.5 block text-cream/35">{caption}</span>}
          </div>
        )
      })}
    </div>
  )
}
