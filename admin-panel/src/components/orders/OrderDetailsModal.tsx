import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type OrderItem = {
  id: string
  nomenclature_id: string
  quantity: number
  price_at_purchase: number
  product_code: string
  item_name: string
}

export type Order = {
  id: string
  source: string
  status: string
  customer_name: string | null
  customer_phone: string | null
  total_amount: number
  notes: string | null
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  preparing: { label: 'Preparing', color: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  ready: { label: 'Ready', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  delivered: { label: 'Delivered', color: 'bg-slate-500/15 text-slate-300 border-slate-500/40' },
  cancelled: { label: 'Cancelled', color: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
}

export function OrderDetailsModal({
  order,
  onClose,
  onStatusChange,
}: {
  order: Order
  onClose: () => void
  onStatusChange: (orderId: string, newStatus: string) => void
}) {
  const [items, setItems] = useState<OrderItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true)

      const { data: rawItems, error: itemsErr } = await supabase
        .from('order_items')
        .select('id, nomenclature_id, quantity, price_at_purchase')
        .eq('order_id', order.id)

      if (itemsErr) {
        console.error('[OrderDetails] items error', itemsErr)
        setIsLoading(false)
        return
      }

      if (!rawItems || rawItems.length === 0) {
        setItems([])
        setIsLoading(false)
        return
      }

      const nomIds = [...new Set(rawItems.map((i) => i.nomenclature_id as string))]
      const { data: nomData } = await supabase
        .from('nomenclature')
        .select('id, product_code, name')
        .in('id', nomIds)

      const nomMap: Record<string, { code: string; name: string }> = {}
      for (const n of nomData ?? []) {
        nomMap[n.id as string] = { code: n.product_code as string, name: n.name as string }
      }

      setItems(
        rawItems.map((i) => ({
          id: i.id as string,
          nomenclature_id: i.nomenclature_id as string,
          quantity: Number(i.quantity),
          price_at_purchase: Number(i.price_at_purchase),
          product_code: nomMap[i.nomenclature_id as string]?.code ?? 'UNKNOWN',
          item_name: nomMap[i.nomenclature_id as string]?.name ?? 'Missing',
        })),
      )
      setIsLoading(false)
    }

    loadItems()
  }, [order.id])

  const statusInfo = STATUS_LABELS[order.status] ?? STATUS_LABELS.new

  const nextStatuses: Record<string, string[]> = {
    new: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['delivered'],
  }

  const availableTransitions = nextStatuses[order.status] ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Order Details
            </h3>
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
              {order.id.slice(0, 8)}...
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Customer Info + Status */}
        <div className="space-y-3 border-b border-slate-800 px-5 py-4">
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
            <span className="text-[10px] uppercase text-slate-500">
              {order.source}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-500">Customer</span>
              <p className="text-slate-200">
                {order.customer_name || 'Walk-in'}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500">Phone</span>
              <p className="text-slate-200">{order.customer_phone || '--'}</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500">Total</span>
              <p className="font-semibold text-emerald-300">
                {order.total_amount.toFixed(2)} THB
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500">Created</span>
              <p className="text-slate-200">
                {new Date(order.created_at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {order.notes && (
            <p className="text-xs italic text-slate-400">{order.notes}</p>
          )}
        </div>

        {/* Items */}
        <div className="px-5 py-4">
          <h4 className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
            Order Items
          </h4>
          {isLoading ? (
            <div className="flex items-center py-4 text-xs text-slate-500">
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Loading items...
            </div>
          ) : items.length === 0 ? (
            <p className="py-2 text-xs text-slate-500">No items</p>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <th className="py-1.5 text-left">Item</th>
                  <th className="py-1.5 text-right">Qty</th>
                  <th className="py-1.5 text-right">Price</th>
                  <th className="py-1.5 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-800/50 last:border-none"
                  >
                    <td className="py-1.5">
                      <div className="font-mono text-slate-100">
                        {item.product_code}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {item.item_name}
                      </div>
                    </td>
                    <td className="py-1.5 text-right text-slate-200">
                      {item.quantity}
                    </td>
                    <td className="py-1.5 text-right text-slate-300">
                      {item.price_at_purchase.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right font-medium text-amber-300">
                      {(item.quantity * item.price_at_purchase).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Status transition buttons */}
        {availableTransitions.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
            {availableTransitions.map((s) => {
              const info = STATUS_LABELS[s] ?? STATUS_LABELS.new
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatusChange(order.id, s)}
                  className={`inline-flex h-8 items-center rounded-md border px-4 text-xs font-medium ${info.color} hover:opacity-80`}
                >
                  Move to {info.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
