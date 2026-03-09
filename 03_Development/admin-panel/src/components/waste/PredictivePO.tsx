import { useCallback, useEffect, useState } from 'react'
import { ShoppingCart, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { UsePredictivePOResult } from '../../hooks/usePredictivePO'

interface DailyPlan {
  id: string
  plan_date: string
  product_code: string
  target_quantity: number
  status: string
}

interface PredictivePOProps {
  po: UsePredictivePOResult
}

export function PredictivePO({ po }: PredictivePOProps) {
  const [plans, setPlans] = useState<DailyPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState('')
  const [plansLoading, setPlansLoading] = useState(true)

  // Fetch available daily plans
  useEffect(() => {
    async function fetchPlans() {
      const { data } = await supabase
        .from('daily_plan')
        .select('id, plan_date, product_code, target_quantity, status')
        .order('plan_date', { ascending: false })
        .limit(20)

      setPlans((data ?? []) as DailyPlan[])
      setPlansLoading(false)
    }
    fetchPlans()
  }, [])

  const handleGenerate = useCallback(() => {
    if (selectedPlan) {
      po.fetchPO(selectedPlan)
    }
  }, [selectedPlan, po])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <ShoppingCart className="h-4 w-4 text-sky-400" />
        <h3 className="text-sm font-semibold text-slate-100">Predictive Procurement</h3>
      </div>

      {/* Plan selector */}
      <div className="flex gap-2 border-b border-slate-800 px-4 py-3">
        <select
          value={selectedPlan}
          onChange={(e) => setSelectedPlan(e.target.value)}
          disabled={plansLoading}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500"
        >
          <option value="">
            {plansLoading ? 'Loading plans...' : 'Select production plan...'}
          </option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.plan_date} — {p.product_code} × {p.target_quantity} ({p.status})
            </option>
          ))}
        </select>
        <button
          onClick={handleGenerate}
          disabled={!selectedPlan || po.isLoading}
          className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          {po.isLoading ? 'Calculating...' : 'Generate PO'}
        </button>
      </div>

      {/* Error */}
      {po.error && (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-rose-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {po.error}
        </div>
      )}

      {/* Results */}
      {po.result && (
        <div>
          {/* Summary */}
          <div className="border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
            Plan: <span className="text-slate-200">{po.result.product_code}</span> × {po.result.target_quantity}
            {' · '}
            {po.result.items.filter((i) => i.shortage > 0).length} items need purchasing
          </div>

          {/* Table */}
          {po.result.items.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No RAW ingredients found in BOM tree
            </div>
          ) : (
            <div className="max-h-[350px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-slate-800 text-left text-slate-500">
                    <th className="px-4 py-2 font-medium">Ingredient</th>
                    <th className="px-4 py-2 text-right font-medium">Needed</th>
                    <th className="px-4 py-2 text-right font-medium">On Hand</th>
                    <th className="px-4 py-2 text-right font-medium">To Purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {po.result.items.map((item) => (
                    <tr
                      key={item.nomenclature_id}
                      className={[
                        'border-b border-slate-800/50',
                        item.shortage > 0 ? 'bg-rose-500/5' : '',
                      ].join(' ')}
                    >
                      <td className="px-4 py-2">
                        <p className="text-slate-200">{item.name}</p>
                        <p className="text-[10px] text-slate-500">{item.product_code}</p>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300">
                        {item.needed} {item.unit}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        {item.on_hand} {item.unit}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {item.shortage > 0 ? (
                          <span className="font-semibold text-rose-400">
                            {item.shortage} {item.unit}
                          </span>
                        ) : (
                          <span className="text-emerald-400">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!po.result && !po.error && !po.isLoading && (
        <div className="py-8 text-center text-xs text-slate-500">
          Select a production plan and click "Generate PO" to see procurement suggestions
        </div>
      )}
    </div>
  )
}
