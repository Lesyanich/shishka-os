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
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--s-1)] shadow-xl">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-mint-200" />
            <h3 className="text-sm font-semibold text-cream">
              Create {poCount} draft {poCount === 1 ? 'PO' : 'POs'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-cream/45 transition hover:bg-[var(--s-2)] hover:text-cream/80"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 py-3">
          {poCount === 0 && (
            <p className="rounded-lg border border-[var(--line)] bg-[var(--s-2)] px-3 py-6 text-center text-sm text-cream/60">
              No lines can be grouped into a PO yet. Assign a supplier (set a default supplier on
              the ingredient or record a price) and try again.
            </p>
          )}

          {groups.map((g) => (
            <div
              key={g.supplier_id}
              className="rounded-lg border border-[var(--line)] bg-[var(--s-2)] px-3 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-cream">
                  <PackageCheck className="h-3.5 w-3.5 text-mint-200" />
                  {g.supplier_name}
                </span>
                <span className="text-[11px] text-cream/45">{g.lines.length} lines</span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {g.lines.map((l) => (
                  <li
                    key={l.nomenclature_id}
                    className="flex justify-between text-[11px] text-cream/60"
                  >
                    <span className="truncate">{l.name}</span>
                    <span className="shrink-0 tabular-nums text-cream/80">
                      {l.qty}
                      {l.unit ? ` ${l.unit}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {unassigned.length > 0 && (
            <div className="rounded-lg border border-amber-watch/30 bg-amber-watch/5 px-3 py-2 text-[11px] text-amber-watch">
              {unassigned.length} item{unassigned.length === 1 ? '' : 's'} have no supplier — assign
              one to include them.
            </div>
          )}
          {skippedNoProduct > 0 && (
            <p className="text-[11px] text-cream/45">
              {skippedNoProduct} manual item{skippedNoProduct === 1 ? '' : 's'} (no linked product)
              can’t be ordered automatically.
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-xs text-cream/80 transition hover:bg-[var(--s-2)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy || poCount === 0}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-royal-green)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-royal-soft)] disabled:opacity-40"
          >
            {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create {poCount} {poCount === 1 ? 'PO' : 'POs'}
          </button>
        </footer>
      </div>
    </div>
  )
}
