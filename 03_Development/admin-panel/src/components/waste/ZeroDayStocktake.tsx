import { useCallback, useState } from 'react'
import { Save, PackageCheck } from 'lucide-react'
import type { InventoryItem } from '../../hooks/useInventory'

interface ZeroDayStocktakeProps {
  items: InventoryItem[]
  isLoading: boolean
  error: string | null
  onSave: (nomenclatureId: string, quantity: number) => Promise<{ ok: boolean; error?: string }>
  onRefetch: () => void
}

export function ZeroDayStocktake({
  items,
  isLoading,
  error,
  onSave,
  onRefetch,
}: ZeroDayStocktakeProps) {
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState('')

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(filter.toLowerCase()) ||
      item.product_code.toLowerCase().includes(filter.toLowerCase()),
  )

  const handleSave = useCallback(
    async (item: InventoryItem) => {
      const rawValue = editValues[item.nomenclature_id]
      const qty = rawValue !== undefined ? parseFloat(rawValue) : item.quantity
      if (isNaN(qty) || qty < 0) {
        setSaveErrors((prev) => ({ ...prev, [item.nomenclature_id]: 'Invalid quantity' }))
        return
      }

      setSaving((prev) => ({ ...prev, [item.nomenclature_id]: true }))
      setSaveErrors((prev) => {
        const next = { ...prev }
        delete next[item.nomenclature_id]
        return next
      })

      const result = await onSave(item.nomenclature_id, qty)

      if (!result.ok) {
        setSaveErrors((prev) => ({ ...prev, [item.nomenclature_id]: result.error ?? 'Failed' }))
      } else {
        setEditValues((prev) => {
          const next = { ...prev }
          delete next[item.nomenclature_id]
          return next
        })
        onRefetch()
      }

      setSaving((prev) => ({ ...prev, [item.nomenclature_id]: false }))
    },
    [editValues, onSave, onRefetch],
  )

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-300">
        Failed to load inventory: {error}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-800/50" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-100">Stocktake</h3>
          <span className="text-xs text-slate-500">{items.length} items</span>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search..."
          className="w-40 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500"
        />
      </div>

      {/* Table */}
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900">
            <tr className="border-b border-slate-800 text-left text-slate-500">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="w-28 px-4 py-2 font-medium">Qty</th>
              <th className="w-20 px-4 py-2 font-medium">Last Count</th>
              <th className="w-12 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const editVal = editValues[item.nomenclature_id]
              const isEdited = editVal !== undefined
              const isSaving = saving[item.nomenclature_id]
              const err = saveErrors[item.nomenclature_id]

              return (
                <tr
                  key={item.nomenclature_id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30"
                >
                  <td className="px-4 py-2 text-slate-200">{item.name}</td>
                  <td className="px-4 py-2 text-slate-500">{item.product_code}</td>
                  <td className="px-4 py-2 text-slate-400">{item.base_unit ?? 'kg'}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editVal ?? item.quantity}
                      onChange={(e) =>
                        setEditValues((prev) => ({
                          ...prev,
                          [item.nomenclature_id]: e.target.value,
                        }))
                      }
                      className={[
                        'w-full rounded border bg-slate-800 px-2 py-1 text-right text-slate-100 outline-none',
                        isEdited ? 'border-emerald-500/50' : 'border-slate-700',
                        err ? 'border-rose-500/50' : '',
                      ].join(' ')}
                    />
                    {err && <p className="mt-0.5 text-[10px] text-rose-400">{err}</p>}
                  </td>
                  <td className="px-4 py-2 text-[10px] text-slate-600">
                    {item.last_counted_at
                      ? new Date(item.last_counted_at).toLocaleDateString('en-GB')
                      : 'Never'}
                  </td>
                  <td className="px-4 py-2">
                    {isEdited && (
                      <button
                        onClick={() => handleSave(item)}
                        disabled={isSaving}
                        className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredItems.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-500">
            {filter ? 'No items match your search' : 'No inventory items found'}
          </div>
        )}
      </div>
    </div>
  )
}
