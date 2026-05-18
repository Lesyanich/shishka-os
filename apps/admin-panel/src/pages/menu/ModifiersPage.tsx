import { RefreshCw } from 'lucide-react'

export function ModifiersPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Modifiers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pull modifier_lists from Loyverse Dashboard, bind each option to a
            dish + slot + MOD nomenclature for BOM deduction.
          </p>
        </div>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Pull now
        </button>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Pulled lists will appear here. (Task 6 wires the pull hook.)
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
        Bindings table will appear here. (Tasks 8–9 wire CRUD.)
      </section>
    </div>
  )
}
