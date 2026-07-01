import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, PackageCheck } from 'lucide-react'
import type { InventoryItem } from '../../hooks/useInventory'
import type { Location } from '../../hooks/useLocations'

interface ZeroDayStocktakeProps {
  items: InventoryItem[]
  isLoading: boolean
  error: string | null
  onSave: (
    nomenclatureId: string,
    quantity: number,
    opts: { locationId?: string; unit?: string | null },
  ) => Promise<{ ok: boolean; error?: string }>
  onRefetch: () => void
  /** Warehouses the count can be recorded against (W2: count → fn_apply_stocktake). */
  locations: Location[]
}

export function ZeroDayStocktake({
  items,
  isLoading,
  error,
  onSave,
  onRefetch,
  locations,
}: ZeroDayStocktakeProps) {
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState('')
  // Which warehouse the counts apply to. Default to Storage (raw store), where most
  // tracked SKUs live; the counter switches to Kitchen/Assembly when standing there.
  const [stationId, setStationId] = useState('')
  const stations = locations.filter((l) => l.type !== 'delivery')
  useEffect(() => {
    if (stationId) return
    const avail = locations.filter((l) => l.type !== 'delivery')
    if (avail.length === 0) return
    const def = avail.find((l) => l.type === 'storage') ?? avail[0]
    setStationId(def.id)
  }, [locations, stationId])
  // Synchronous re-entrancy guard (React `saving` state lags a render) and a
  // flag to skip the save that Escape's blur would otherwise trigger.
  const savingRef = useRef<Set<string>>(new Set())
  const skipBlurRef = useRef(false)

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(filter.toLowerCase()) ||
      item.product_code.toLowerCase().includes(filter.toLowerCase()),
  )

  const handleSave = useCallback(
    async (item: InventoryItem) => {
      const id = item.nomenclature_id
      const rawValue = editValues[id]
      // Nothing typed in this row → blurring a merely-focused field must not
      // record a phantom count.
      if (rawValue === undefined) return
      if (savingRef.current.has(id)) return

      const qty = parseFloat(rawValue)
      if (isNaN(qty) || qty < 0) {
        setSaveErrors((prev) => ({ ...prev, [id]: 'Invalid quantity' }))
        return
      }

      savingRef.current.add(id)
      setSaving((prev) => ({ ...prev, [id]: true }))
      setSaveErrors((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })

      const result = await onSave(id, qty, {
        locationId: stationId || undefined,
        unit: item.base_unit,
      })
      savingRef.current.delete(id)

      if (!result.ok) {
        setSaveErrors((prev) => ({ ...prev, [id]: result.error ?? 'Failed' }))
      } else {
        setEditValues((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        onRefetch()
      }

      setSaving((prev) => ({ ...prev, [id]: false }))
    },
    [editValues, onSave, onRefetch, stationId],
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

      {/* Station selector — the count is recorded against this warehouse (W2) */}
      {stations.length > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Station</span>
          <div className="flex gap-1">
            {stations.map((loc) => {
              const active = loc.id === stationId
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setStationId(loc.id)}
                  className={[
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                      : 'text-slate-400 hover:bg-slate-800',
                  ].join(' ')}
                >
                  {loc.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                      onBlur={() => {
                        if (skipBlurRef.current) {
                          skipBlurRef.current = false
                          return
                        }
                        void handleSave(item)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          e.currentTarget.blur() // → onBlur commits the count
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          skipBlurRef.current = true
                          setEditValues((prev) => {
                            const next = { ...prev }
                            delete next[item.nomenclature_id]
                            return next
                          })
                          e.currentTarget.blur()
                        }
                      }}
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
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    ) : isEdited ? (
                      <span
                        title="Unsaved — press Enter or click away to save"
                        className="text-[11px] leading-none text-emerald-400/80"
                      >
                        ●
                      </span>
                    ) : null}
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
