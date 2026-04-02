import { useCallback, useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type NomItem = { id: string; product_code: string; name: string; type: 'SALE' | 'PF' }

export interface SelectedDish {
  id: string
  product_code: string
  name: string
  qty: number
}

interface DishSelectorProps {
  dishes: SelectedDish[]
  onChange: (dishes: SelectedDish[]) => void
}

export function DishSelector({ dishes, onChange }: DishSelectorProps) {
  const [items, setItems] = useState<NomItem[]>([])

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('nomenclature')
      .select('id, product_code, name')
      .or('product_code.ilike.SALE-%,product_code.ilike.PF-%')
      .eq('is_deleted', false)
      .order('product_code')

    setItems(
      (data ?? []).map((n) => ({
        id: n.id as string,
        product_code: n.product_code as string,
        name: n.name as string,
        type: (n.product_code as string).startsWith('SALE-') ? 'SALE' as const : 'PF' as const,
      })),
    )
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  function addDish(id: string) {
    const item = items.find((s) => s.id === id)
    if (!item || dishes.some((d) => d.id === id)) return
    onChange([...dishes, { id: item.id, product_code: item.product_code, name: item.name, qty: 1 }])
  }

  function removeDish(id: string) {
    onChange(dishes.filter((d) => d.id !== id))
  }

  function updateQty(id: string, qty: number) {
    if (qty < 1) return
    onChange(dishes.map((d) => (d.id === id ? { ...d, qty } : d)))
  }

  const available = items.filter((s) => !dishes.some((d) => d.id === s.id))

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <select
          value=""
          onChange={(e) => addDish(e.target.value)}
          className="h-8 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
        >
          <option value="">Add dish (SALE / PF)...</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.product_code} — {s.name}
            </option>
          ))}
        </select>
      </div>

      {dishes.length > 0 && (
        <div className="space-y-1">
          {dishes.map((d) => {
            const isSale = d.product_code.startsWith('SALE-')
            return (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-1.5"
              >
                {/* Type indicator dot */}
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    isSale ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                  title={isSale ? 'SALE' : 'PF'}
                />
                <span className="flex-1 truncate text-xs text-slate-200">
                  <span className="font-mono text-[10px] text-slate-500 mr-1">
                    {d.product_code}
                  </span>
                  {d.name}
                </span>
                <input
                  type="number"
                  min={1}
                  value={d.qty}
                  onChange={(e) => updateQty(d.id, parseInt(e.target.value, 10) || 1)}
                  className="h-6 w-14 rounded border border-slate-700 bg-slate-800 text-center text-xs text-slate-100 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeDish(d.id)}
                  className="text-slate-500 hover:text-rose-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {dishes.length === 0 && (
        <p className="text-xs text-slate-600 flex items-center gap-1">
          <Plus className="h-3 w-3" /> Select dishes for scheduling
        </p>
      )}
    </div>
  )
}
