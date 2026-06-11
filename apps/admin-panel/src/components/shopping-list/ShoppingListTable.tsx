import { CheckSquare, Square, ExternalLink, Trash2 } from 'lucide-react'
import {
  SHOPPING_STORES,
  STORE_LABELS,
  type ShoppingItem,
  type ShoppingPatch,
  type ShoppingStore,
} from '../../types/shopping'

const STORE_BADGE: Record<ShoppingStore, string> = {
  makro: 'bg-emerald-500/15 text-emerald-300',
  homepro: 'bg-orange-500/15 text-orange-300',
  sangdamrong: 'bg-sky-500/15 text-sky-300',
  lazada: 'bg-violet-500/15 text-violet-300',
  tops: 'bg-rose-500/15 text-rose-300',
  other: 'bg-slate-500/20 text-slate-300',
}

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : `฿${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

interface ShoppingListTableProps {
  items: ShoppingItem[]
  onUpdate: (id: string, patch: ShoppingPatch) => Promise<{ ok: boolean; error?: string }>
  onRemove: (id: string) => Promise<{ ok: boolean; error?: string }>
}

const editableInput =
  'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-slate-100 hover:border-slate-700 focus:border-emerald-500 focus:bg-slate-950 focus:outline-none'

export function ShoppingListTable({ items, onUpdate, onRemove }: ShoppingListTableProps) {
  // Group by store, preserving the SHOPPING_STORES order
  const groups = SHOPPING_STORES.map((store) => ({
    store,
    rows: items.filter((it) => it.store === store),
  })).filter((g) => g.rows.length > 0)

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 px-4 py-10 text-center text-sm text-slate-500">
        Список пуст. Добавь товар вручную или нажми «Seed from menu».
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map(({ store, rows }) => {
        const subtotal = rows
          .filter((r) => r.status !== 'cancelled')
          .reduce((sum, r) => sum + (r.est_price ?? 0), 0)

        return (
          <div key={store} className="overflow-hidden rounded-lg border border-slate-800">
            <div className="flex items-center justify-between bg-slate-900/70 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STORE_BADGE[store]}`}>
                  {STORE_LABELS[store]}
                </span>
                <span className="text-[11px] text-slate-500">{rows.length} items</span>
              </div>
              <span className="text-xs font-semibold tabular-nums text-slate-300">{fmt(subtotal)}</span>
            </div>

            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="w-8 px-2 py-1.5" />
                  <th className="px-2 py-1.5">Item</th>
                  <th className="w-28 px-2 py-1.5">Store</th>
                  <th className="w-20 px-2 py-1.5">Qty</th>
                  <th className="w-24 px-2 py-1.5 text-right">฿ Price</th>
                  <th className="w-10 px-2 py-1.5 text-center">Link</th>
                  <th className="px-2 py-1.5">Notes</th>
                  <th className="w-10 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => {
                  const bought = it.status === 'bought'
                  return (
                    <tr
                      key={it.id}
                      className={`border-b border-slate-800/60 last:border-0 ${bought ? 'opacity-50' : ''}`}
                    >
                      <td className="px-2 py-1 align-middle">
                        <button
                          onClick={() => onUpdate(it.id, { status: bought ? 'needed' : 'bought' })}
                          title={bought ? 'Mark as needed' : 'Mark as bought'}
                          className="text-slate-400 transition hover:text-emerald-400"
                        >
                          {bought ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>

                      <td className="px-1 py-1">
                        <input
                          defaultValue={it.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            if (v && v !== it.name) onUpdate(it.id, { name: v })
                          }}
                          className={`${editableInput} ${bought ? 'line-through' : ''}`}
                        />
                      </td>

                      <td className="px-1 py-1">
                        <select
                          value={it.store}
                          onChange={(e) => onUpdate(it.id, { store: e.target.value as ShoppingStore })}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs text-slate-300 hover:border-slate-700 focus:border-emerald-500 focus:bg-slate-950 focus:outline-none"
                        >
                          {SHOPPING_STORES.map((s) => (
                            <option key={s} value={s}>
                              {STORE_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            defaultValue={it.qty ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value === '' ? null : Number(e.target.value)
                              if (v !== it.qty) onUpdate(it.id, { qty: v })
                            }}
                            className={`${editableInput} w-12 tabular-nums`}
                          />
                          <input
                            defaultValue={it.unit ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || null
                              if (v !== it.unit) onUpdate(it.id, { unit: v })
                            }}
                            placeholder="unit"
                            className={`${editableInput} w-12 text-slate-400 placeholder:text-slate-600`}
                          />
                        </div>
                      </td>

                      <td className="px-1 py-1 text-right">
                        <input
                          type="number"
                          defaultValue={it.est_price ?? ''}
                          onBlur={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            if (v !== it.est_price) onUpdate(it.id, { est_price: v })
                          }}
                          className={`${editableInput} text-right tabular-nums`}
                        />
                      </td>

                      <td className="px-2 py-1 text-center">
                        {it.product_url ? (
                          <a
                            href={it.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={it.product_url}
                            className="inline-flex text-sky-400 transition hover:text-sky-300"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>

                      <td className="px-1 py-1">
                        <input
                          defaultValue={it.notes ?? ''}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null
                            if (v !== it.notes) onUpdate(it.id, { notes: v })
                          }}
                          placeholder="—"
                          className={`${editableInput} text-slate-400 placeholder:text-slate-600`}
                        />
                      </td>

                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove "${it.name}" from the list?`)) onRemove(it.id)
                          }}
                          title="Remove"
                          className="text-slate-500 transition hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
