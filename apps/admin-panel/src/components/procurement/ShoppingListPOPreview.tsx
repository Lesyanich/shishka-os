import { Loader2, PackageCheck, Truck, X } from 'lucide-react'
import type { GroupedReorder } from '../../lib/reorderGrouping'

interface Props {
  result: GroupedReorder & { skippedNoProduct: number }
  isBusy: boolean
  onConfirm: () => void
  onClose: () => void
}

/** Confirmation modal shown before creating draft POs from the buy-list:
 * previews how many POs (one per supplier), what's unassigned, what's skipped. */
export function ShoppingListPOPreview({ result, isBusy, onConfirm, onClose }: Props) {
  const { groups, unassigned, skippedNoProduct } = result
  const poCount = groups.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Create {poCount} draft {poCount === 1 ? 'PO' : 'POs'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 py-3">
          {poCount === 0 && (
            <p className="rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-6 text-center text-sm text-slate-400">
              No lines can be grouped into a PO yet. Assign a supplier (set a default supplier on the
              ingredient or record a price) and try again.
            </p>
          )}

          {groups.map((g) => (
            <div key={g.supplier_id} className="rounded-lg border border-slate-800 bg-slate-800/30 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <PackageCheck className="h-3.5 w-3.5 text-emerald-400" />
                  {g.supplier_name}
                </span>
                <span className="text-[11px] text-slate-500">{g.lines.length} lines</span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {g.lines.map((l) => (
                  <li key={l.nomenclature_id} className="flex justify-between text-[11px] text-slate-400">
                    <span className="truncate">{l.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-300">
                      {l.qty}
                      {l.unit ? ` ${l.unit}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {unassigned.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
              {unassigned.length} item{unassigned.length === 1 ? '' : 's'} have no supplier — assign one
              to include them.
            </div>
          )}
          {skippedNoProduct > 0 && (
            <p className="text-[11px] text-slate-500">
              {skippedNoProduct} manual item{skippedNoProduct === 1 ? '' : 's'} (no linked product) can’t
              be ordered automatically.
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy || poCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create {poCount} {poCount === 1 ? 'PO' : 'POs'}
          </button>
        </footer>
      </div>
    </div>
  )
}
