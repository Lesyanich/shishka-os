import { useState } from 'react'
import { RefreshCw, AlertTriangle, Layers, UtensilsCrossed } from 'lucide-react'
import { useLoyverseModifierPull } from '../../hooks/useLoyverseModifierPull'
import { useDishModifierGroups } from '../../hooks/useDishModifierGroups'
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
  const { lists, options, lastPulledAt, lastWarnings, isPulling, error: pullError, pull } =
    useLoyverseModifierPull()
  const { dishes, attachmentsByDish, error: dmgError, attach, detach } = useDishModifierGroups()
  const [tab, setTab] = useState<TabKey>('groups')

  const error = pullError ?? dmgError

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Modifiers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Last pull: {formatPulledAt(lastPulledAt)} · {lists.length} groups · {options.length} options · {dishes.length} dishes
          </p>
        </div>
        <button
          type="button"
          onClick={() => pull()}
          disabled={isPulling}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <RefreshCw className={isPulling ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          {isPulling ? 'Pulling…' : 'Pull now'}
        </button>
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
