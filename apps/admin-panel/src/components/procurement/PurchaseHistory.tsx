import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { NomenclatureLabel } from '../finance/NomenclatureLabel'

type PurchaseRow = {
  id: string
  quantity: number
  price_per_unit: number
  total_price: number
  invoice_date: string
  notes: string | null
  created_at: string
  // Joined
  item_code: string
  item_name: string
  supplier_name: string
}

export function PurchaseHistory({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<PurchaseRow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    setIsLoading(true)

    // Two-query pattern (Boris Rule): purchase_logs + nomenclature + suppliers
    const { data: logs, error: logsErr } = await supabase
      .from('purchase_logs')
      .select(
        'id, nomenclature_id, supplier_id, quantity, price_per_unit, total_price, invoice_date, notes, created_at',
      )
      .order('invoice_date', { ascending: false })
      .limit(50)

    if (logsErr) {
      console.error('[PurchaseHistory] logs error', logsErr)
      setIsLoading(false)
      return
    }

    if (!logs || logs.length === 0) {
      setRows([])
      setIsLoading(false)
      return
    }

    // Get unique nomenclature + supplier IDs
    const nomIds = [...new Set(logs.map((l) => l.nomenclature_id as string))]
    const suppIds = [...new Set(logs.map((l) => l.supplier_id as string))]

    const [nomRes, suppRes] = await Promise.all([
      supabase
        .from('nomenclature')
        .select('id, product_code, name')
        .in('id', nomIds),
      supabase.from('suppliers').select('id, name').in('id', suppIds),
    ])

    const nomMap: Record<string, { code: string; name: string }> = {}
    for (const n of nomRes.data ?? []) {
      nomMap[n.id as string] = {
        code: n.product_code as string,
        name: n.name as string,
      }
    }

    const suppMap: Record<string, string> = {}
    for (const s of suppRes.data ?? []) {
      suppMap[s.id as string] = s.name as string
    }

    const mapped: PurchaseRow[] = logs.map((l) => ({
      id: l.id as string,
      quantity: Number(l.quantity),
      price_per_unit: Number(l.price_per_unit),
      total_price: Number(l.total_price),
      invoice_date: l.invoice_date as string,
      notes: l.notes as string | null,
      created_at: l.created_at as string,
      item_code: nomMap[l.nomenclature_id as string]?.code ?? 'UNKNOWN',
      item_name: nomMap[l.nomenclature_id as string]?.name ?? 'Missing',
      supplier_name: suppMap[l.supplier_id as string] ?? 'Unknown',
    }))

    setRows(mapped)
    setIsLoading(false)
    // refreshKey is not read inside the callback, but it is intentionally
    // included so that bumping it from the parent changes the memoized
    // identity and triggers the useEffect below to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
      <header className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">
          Purchase History
        </h2>
        <p className="text-xs text-slate-500">Last 50 purchase entries</p>
      </header>

      <div className="overflow-x-auto px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading history...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No purchases logged yet. Use the form above to log your first
            purchase.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2">Supplier</th>
                <th className="py-2 pr-2 text-right">Qty</th>
                <th className="py-2 pr-2 text-right">Price/Unit</th>
                <th className="py-2 pr-2 text-right">Total</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-800/50 last:border-none"
                >
                  <td className="py-2 pr-2 text-slate-300">
                    {r.invoice_date}
                  </td>
                  <td className="py-2 pr-2">
                    <NomenclatureLabel
                      productCode={r.item_code}
                      name={r.item_name}
                      size="md"
                    />
                  </td>
                  <td className="py-2 pr-2 text-slate-300">
                    {r.supplier_name}
                  </td>
                  <td className="py-2 pr-2 text-right text-slate-100">
                    {r.quantity}
                  </td>
                  <td className="py-2 pr-2 text-right text-amber-300">
                    {r.price_per_unit.toFixed(2)}
                  </td>
                  <td className="py-2 pr-2 text-right font-medium text-slate-100">
                    {r.total_price.toFixed(2)}
                  </td>
                  <td className="max-w-[120px] truncate py-2 text-slate-500">
                    {r.notes || '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
