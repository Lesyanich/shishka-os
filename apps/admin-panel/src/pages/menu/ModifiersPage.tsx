import { useState } from 'react'
import { RefreshCw, AlertTriangle, Layers, UtensilsCrossed, UploadCloud, CheckCircle2, CircleAlert } from 'lucide-react'
import { useLoyverseModifierPull } from '../../hooks/useLoyverseModifierPull'
import { useDishModifierGroups } from '../../hooks/useDishModifierGroups'
import { useModifierSync } from '../../hooks/useModifierSync'
import { ModifierGroupsTab } from '../../components/menu/modifiers/ModifierGroupsTab'
import { ModifierDishesTab } from '../../components/menu/modifiers/ModifierDishesTab'

function formatPulledAt(iso: string | null): string {
  if (!iso) return 'never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return new Date(iso).toLocaleDateString()
}

type TabKey = 'groups' | 'dishes'

export function ModifiersPage() {
  const { lists, options, lastPulledAt, lastWarnings, isPulling, error: pullError, pull, reload: reloadPull } =
    useLoyverseModifierPull()
  const { dishes, attachmentsByDish, error: dmgError, attach, detach, reload: reloadDmg } = useDishModifierGroups()
  const { lastPushedAt, pending, priceDraftCount, attachmentsDirty, isPushing, error: syncError, push } =
    useModifierSync()
  const [tab, setTab] = useState<TabKey>('groups')

  const error = pullError ?? dmgError ?? syncError

  const onPush = async () => {
    const bits: string[] = []
    if (priceDraftCount > 0) bits.push(`${priceDraftCount} price change(s)`)
    if (attachmentsDirty) bits.push('dish attachment changes')
    const summary = bits.length ? bits.join(' + ') : 'a re-sync of dish attachments'
    if (!window.confirm(`Push ${summary} to the LIVE Loyverse POS now?`)) return
    const res = await push(false)
    if (res.ok) {
      await Promise.all([reloadPull(), reloadDmg()])
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Modifiers</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            {/* Sync status */}
            {pending ? (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
                <CircleAlert className="h-3 w-3" />
                {[
                  priceDraftCount > 0 ? `${priceDraftCount} price draft${priceDraftCount > 1 ? 's' : ''}` : null,
                  attachmentsDirty ? 'attachment changes' : null,
                ].filter(Boolean).join(' + ')} — needs push
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> in sync
              </span>
            )}
            <span>· pulled {formatPulledAt(lastPulledAt)} · pushed {formatPulledAt(lastPushedAt)}</span>
            <span>· {lists.length} groups · {options.length} options · {dishes.length} dishes</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => pull()}
            disabled={isPulling}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-700/40 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/70 disabled:opacity-50"
          >
            <RefreshCw className={isPulling ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            {isPulling ? 'Pulling…' : 'Pull'}
          </button>
          <button
            type="button"
            onClick={onPush}
            disabled={isPushing}
            className={[
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50',
              pending
                ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
            ].join(' ')}
            title="Apply staged prices + re-attach dish groups to the live Loyverse POS"
          >
            <UploadCloud className={isPushing ? 'h-3.5 w-3.5 animate-pulse' : 'h-3.5 w-3.5'} />
            {isPushing ? 'Pushing…' : 'Push to Loyverse'}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-900/40 bg-rose-950/30 p-3 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {lastWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 p-3 text-xs text-amber-300">
          <strong className="block pb-1">Pull warnings:</strong>
          <ul className="list-disc pl-4">
            {lastWarnings.map((w, i) => (<li key={i}>{w}</li>))}
          </ul>
        </div>
      )}

      {/* Two lenses on the same data: by group, or by dish. */}
      <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/40 p-1 text-xs">
        <button
          type="button"
          onClick={() => setTab('groups')}
          className={[
            'inline-flex items-center gap-1.5 rounded px-3 py-1.5',
            tab === 'groups' ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-400 hover:text-slate-200',
          ].join(' ')}
        >
          <Layers className="h-3.5 w-3.5" /> By group
        </button>
        <button
          type="button"
          onClick={() => setTab('dishes')}
          className={[
            'inline-flex items-center gap-1.5 rounded px-3 py-1.5',
            tab === 'dishes' ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-400 hover:text-slate-200',
          ].join(' ')}
        >
          <UtensilsCrossed className="h-3.5 w-3.5" /> By dish
        </button>
      </div>

      {tab === 'groups' ? (
        <ModifierGroupsTab
          lists={lists}
          options={options}
          dishes={dishes}
          attachmentsByDish={attachmentsByDish}
          attach={attach}
          detach={detach}
        />
      ) : (
        <ModifierDishesTab
          lists={lists}
          dishes={dishes}
          attachmentsByDish={attachmentsByDish}
          attach={attach}
          detach={detach}
        />
      )}
    </div>
  )
}
