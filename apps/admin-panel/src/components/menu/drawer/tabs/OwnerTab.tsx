import { useState } from 'react'
import { Shield, ExternalLink, Hash, Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishScorecard } from '../../../../hooks/useDishScorecard'
import { DrawerScorecard } from '../../owner/DrawerScorecard'
import { useLoyversePushDish } from '../../../../hooks/useLoyversePushDish'

interface OwnerTabProps {
  item: MenuItem
  scorecard: DishScorecard | null
  scorecardLoading: boolean
  scorecardError: string | null
  /** Notify parent after a successful push so it can refetch. */
  onSynced?: () => void
}

function posStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
    case 'synced':
      return 'bg-sky-900/40 text-sky-300'
    default:
      return 'bg-surface-3 text-cream/60'
  }
}

export function OwnerTab({
  item,
  scorecard,
  scorecardLoading,
  scorecardError,
  onSynced,
}: OwnerTabProps) {
  const { pushDish, isPushing, lastResult } = useLoyversePushDish()
  const [pushToast, setPushToast] = useState<{
    type: 'ok' | 'error'
    text: string
  } | null>(null)

  const isSale = item.kind === 'SALE'

  const handlePush = async () => {
    setPushToast(null)
    const result = await pushDish(item.id)
    if (result.ok) {
      setPushToast({
        type: 'ok',
        text: `Pushed to Loyverse${result.loyverse_item_id ? ` (id ${result.loyverse_item_id.slice(0, 8)})` : ''}`,
      })
      onSynced?.()
    } else if (result.reason) {
      setPushToast({ type: 'error', text: `Blocked: ${result.reason}` })
    } else {
      setPushToast({ type: 'error', text: result.error ?? 'Push failed' })
    }
    setTimeout(() => setPushToast(null), 5000)
  }

  return (
    <div className="space-y-6">
      {/* Version + Verified */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <Shield className="mr-1 inline h-3 w-3" />
          Card Version
        </h4>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-cream/70">
            <Hash className="h-2.5 w-2.5" />
            v{item.card_version}
          </span>
          {item.last_verified_at && (
            <span className="text-[10px] text-cream/40">
              verified{' '}
              {new Date(item.last_verified_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </section>

      {/* POS Status */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          POS Status
        </h4>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${posStatusBadge(item.pos_status)}`}
        >
          {item.pos_status}
        </span>
      </section>

      {/* Cost rollup */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Cost Rollup
        </h4>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.cost_per_unit != null
                ? `\u0E3F${item.cost_per_unit.toFixed(0)}`
                : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Cost</div>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.price != null ? `\u0E3F${item.price.toFixed(0)}` : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Price</div>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.cost_per_unit != null &&
              item.price != null &&
              item.price > 0
                ? `${((item.cost_per_unit / item.price) * 100).toFixed(1)}%`
                : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Food Cost</div>
          </div>
        </div>
      </section>

      {/* Scorecard */}
      <DrawerScorecard
        scorecard={scorecard}
        isLoading={scorecardLoading}
        error={scorecardError}
      />

      {/* TTC Source URL */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          TTC Source
        </h4>
        {item.ttc_source_url ? (
          <a
            href={item.ttc_source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-forest-soft hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Source link
          </a>
        ) : (
          <span className="text-xs text-cream/40">Not set</span>
        )}
      </section>

      {/* Loyverse push — SALE-only */}
      {isSale && (
        <section className="space-y-2 border-t border-surface-3 pt-4">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
            <Upload className="mr-1 inline h-3 w-3" />
            Loyverse Sync
          </h4>
          <p className="text-[10px] text-cream/45">
            Gated by POS status = approved AND is_available = true. Pushes
            customer-facing name, description (with allergen suffix), photo,
            and price.
          </p>
          <button
            type="button"
            onClick={handlePush}
            disabled={isPushing || item.pos_status === 'draft' || !item.is_available}
            className="inline-flex items-center gap-1.5 rounded-lg border border-forest-soft/40 bg-[var(--color-royal-green)]/20 px-3 py-1.5 text-xs font-medium text-[color:var(--color-forest-soft)] transition hover:bg-[var(--color-royal-green)]/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPushing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Push to Loyverse
          </button>
          {pushToast && (
            <div
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] ${
                pushToast.type === 'ok'
                  ? 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
                  : 'bg-[var(--color-royal-red)]/20 text-[color:var(--color-brick-soft)]'
              }`}
            >
              {pushToast.type === 'ok' ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {pushToast.text}
            </div>
          )}
          {lastResult?.ok && lastResult.payload && (
            <details className="rounded border border-surface-3 bg-surface-2/40 p-2 text-[10px]">
              <summary className="cursor-pointer text-cream/55">
                Last pushed payload
              </summary>
              <pre className="mt-1 overflow-auto text-[10px] text-cream/65">
                {JSON.stringify(lastResult.payload, null, 2)}
              </pre>
            </details>
          )}
        </section>
      )}
    </div>
  )
}
