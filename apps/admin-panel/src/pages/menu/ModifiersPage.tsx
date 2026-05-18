import { useState } from 'react'
import { RefreshCw, AlertTriangle, Plus } from 'lucide-react'
import { useLoyverseModifierPull } from '../../hooks/useLoyverseModifierPull'
import { useModifierBindings } from '../../hooks/useModifierBindings'
import { PulledMirrorSection } from '../../components/menu/modifiers/PulledMirrorSection'
import { BindingsTable } from '../../components/menu/modifiers/BindingsTable'
import { AddBindingForm } from '../../components/menu/modifiers/AddBindingForm'

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

export function ModifiersPage() {
  const { lists, options, lastPulledAt, lastWarnings, isPulling, error: pullError, pull } = useLoyverseModifierPull()
  const { rows, error: bindingsError, create, remove } = useModifierBindings()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Modifiers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Last pull: {formatPulledAt(lastPulledAt)} · {lists.length} lists · {options.length} options · {rows.length} bindings
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

      {(pullError || bindingsError) && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-900/40 bg-rose-950/30 p-3 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{pullError ?? bindingsError}</span>
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

      <PulledMirrorSection lists={lists} options={options} />

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-200">Bindings</h2>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20"
          >
            <Plus className="h-3 w-3" />
            {addOpen ? 'Close' : 'Add binding'}
          </button>
        </header>
        {addOpen && (
          <div className="border-b border-slate-800 p-4">
            <AddBindingForm
              loyverseOptions={options}
              loyverseLists={lists}
              onSubmit={async (patch) => {
                const res = await create(patch)
                if (res.ok) setAddOpen(false)
                return res
              }}
              onCancel={() => setAddOpen(false)}
            />
          </div>
        )}
        <BindingsTable rows={rows} onDelete={(id) => remove(id)} />
      </section>
    </div>
  )
}
