import { useState } from 'react'
import { Shield, ExternalLink, Hash, Upload, Loader2, CheckCircle2, AlertCircle, Globe, EyeOff } from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishScorecard } from '../../../../hooks/useDishScorecard'
import type { ModifierOption } from '../../../../hooks/useModifierOptions'
import { DrawerScorecard } from '../../owner/DrawerScorecard'
import { useLoyversePushDish } from '../../../../hooks/useLoyversePushDish'

interface OwnerTabProps {
  item: MenuItem
  scorecard: DishScorecard | null
  scorecardLoading: boolean
  scorecardError: string | null
  /** Dish's modifier options (2-level model) for the cost/margin breakdown. */
  modifiers?: ModifierOption[]
  /** Notify parent after a successful push so it can refetch. */
  onSynced?: () => void
  /** Toggle website visibility (is_web_visible, mig 263). Undefined disables
   * the control. The parent's update refetches, so `item` reflects the result. */
  onToggleWeb?: (id: string, next: boolean) => void | Promise<void>
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
  modifiers = [],
  onSynced,
  onToggleWeb,
}: OwnerTabProps) {
  const { pushDish, isPushing, lastResult } = useLoyversePushDish()
  const [pushToast, setPushToast] = useState<{
    type: 'ok' | 'error'
    text: string
  } | null>(null)
  const [webPending, setWebPending] = useState(false)

  const isSale = item.kind === 'SALE'
  // Drift: DB row edited after the last Loyverse push → POS price is stale.
  // The site always shows DB price, so "stale" only flags a Loyverse mismatch.
  const webStale =
    isSale &&
    !!item.loyverse_synced_at &&
    !!item.updated_at &&
    new Date(item.updated_at).getTime() > new Date(item.loyverse_synced_at).getTime()

  // POS price drift: Loyverse holds a different price than our DB (exact, from
  // the stored loyverse_price). The site always shows DB price, so this is the
  // only place a real money mismatch can hide.
  const posPriceDrift =
    isSale && item.loyverse_price != null && item.price != null &&
    Number(item.loyverse_price) !== Number(item.price)

  const handleToggleWeb = async () => {
    if (!onToggleWeb) return
    setWebPending(true)
    await onToggleWeb(item.id, !item.is_web_visible)
    setWebPending(false)
  }

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

      {/* Modifier options cost/margin (Phase 6) — owner view of per-option economics */}
      {modifiers.length > 0 && (
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
            Modifier Options — cost &amp; margin
          </h4>
          <div className="overflow-hidden rounded-lg border border-surface-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-2/40 text-[10px] uppercase tracking-wide text-cream/40">
                  <th className="px-2 py-1 text-left font-medium">Option</th>
                  <th className="px-2 py-1 text-right font-medium">Price</th>
                  <th className="px-2 py-1 text-right font-medium">Cost</th>
                  <th className="px-2 py-1 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {modifiers.map((m) => (
                  <tr key={m.id} className="border-t border-surface-3/60">
                    <td className="px-2 py-1 text-cream/80">
                      {m.modifier_name}
                      {m.group_name && <span className="text-cream/30"> · {m.group_name}</span>}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-cream/80">{`฿${m.price_delta.toFixed(0)}`}</td>
                    <td className="px-2 py-1 text-right font-mono text-cream/60">
                      {m.cost != null ? `฿${m.cost.toFixed(0)}` : '—'}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-mono ${
                        m.margin != null && m.margin < 0 ? 'text-[color:var(--color-brick-soft)]' : 'text-[color:var(--color-forest-soft)]'
                      }`}
                    >
                      {m.margin != null ? `฿${m.margin.toFixed(0)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-cream/30">
            Cost = linked ingredient × portion. Link ingredients on /menu/modifiers to fill the blanks.
          </p>
        </section>
      )}

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

      {/* Website visibility — SALE-only. Independent of Loyverse (mig 263):
          shows/hides the dish on shishka.health by flipping is_web_visible. */}
      {isSale && (
        <section className="space-y-2 border-t border-surface-3 pt-4">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
            <Globe className="mr-1 inline h-3 w-3" />
            Website (shishka.health)
          </h4>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                item.is_web_visible
                  ? 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
                  : 'bg-surface-3 text-cream/60'
              }`}
            >
              {item.is_web_visible ? (
                <Globe className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
              {item.is_web_visible ? 'Live' : 'Hidden'}
            </span>
            {item.is_web_visible && item.web_published_at && (
              <span className="text-[10px] text-cream/45">
                on site since{' '}
                {new Date(item.web_published_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-[10px] text-cream/45">
            Site price always equals DB price (
            {item.price != null ? `฿${item.price.toLocaleString()}` : '—'}).{' '}
            {posPriceDrift ? (
              <span className="font-semibold text-brick-soft">
                ⚠ Loyverse has ฿{Number(item.loyverse_price).toLocaleString()} — push to sync the POS.
              </span>
            ) : webStale ? (
              '⚠ Edited after last Loyverse sync — re-push to be safe.'
            ) : (
              'Loyverse: in sync.'
            )}
          </p>
          <button
            type="button"
            onClick={handleToggleWeb}
            disabled={webPending || !onToggleWeb}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              item.is_web_visible
                ? 'border border-slate-700 bg-[var(--color-surface-1)] text-[color:var(--color-cream)]/75 hover:border-[var(--color-brick-soft)]/50 hover:text-[color:var(--color-brick-soft)]'
                : 'border border-forest-soft/40 bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)] hover:bg-[var(--color-royal-green)]/30'
            }`}
          >
            {webPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : item.is_web_visible ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            {item.is_web_visible ? 'Hide from site' : 'Show on site'}
          </button>
        </section>
      )}
    </div>
  )
}
