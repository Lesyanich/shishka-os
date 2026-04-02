import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { OrderDetailsModal, type Order } from './OrderDetailsModal'

/* ─── Status column config ──────────────────────────────────── */

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: 'new', label: 'New', color: 'border-blue-500/40 bg-blue-500/5' },
  { key: 'preparing', label: 'Preparing', color: 'border-amber-500/40 bg-amber-500/5' },
  { key: 'ready', label: 'Ready', color: 'border-emerald-500/40 bg-emerald-500/5' },
]

const STATUS_DOT: Record<string, string> = {
  new: 'bg-blue-400',
  preparing: 'bg-amber-400',
  ready: 'bg-emerald-400',
}

/* ─── Nomenclature item for manual order form ──────────────── */

type NomOption = { id: string; product_code: string; name: string; price: number }

/* ─── Component ─────────────────────────────────────────────── */

export function LiveOrderBoard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  /* Manual order creation */
  const [showCreate, setShowCreate] = useState(false)
  const [nomOptions, setNomOptions] = useState<NomOption[]>([])
  const [cart, setCart] = useState<{ nom: NomOption; qty: number }[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  /* Track if component is mounted (for realtime cleanup) */
  const mountedRef = useRef(true)

  /* ─── Fetch orders ──────────────────────────────────────── */

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('id, source, status, customer_name, customer_phone, total_amount, notes, created_at')
      .in('status', ['new', 'preparing', 'ready'])
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[LiveOrderBoard] fetch error', error)
    } else if (mountedRef.current) {
      setOrders((data ?? []) as Order[])
    }
    if (mountedRef.current) setIsLoading(false)
  }, [])

  /* ─── Realtime subscription ─────────────────────────────── */

  useEffect(() => {
    mountedRef.current = true
    fetchOrders()

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          // Refetch on any change for simplicity
          if (mountedRef.current) fetchOrders()
        },
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [fetchOrders])

  /* ─── Load SALE items for manual order form ─────────────── */

  useEffect(() => {
    if (!showCreate) return

    const load = async () => {
      const { data } = await supabase
        .from('nomenclature')
        .select('id, product_code, name, sale_price')
        .ilike('product_code', 'SALE-%')
        .eq('is_deleted', false)
        .order('name')

      setNomOptions(
        (data ?? []).map((n) => ({
          id: n.id as string,
          product_code: n.product_code as string,
          name: n.name as string,
          price: Number(n.sale_price ?? 0),
        })),
      )
    }
    load()
  }, [showCreate])

  /* ─── Status change handler ─────────────────────────────── */

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    if (error) {
      console.error('[LiveOrderBoard] status update error', error)
      return
    }

    // If transitioning to 'preparing', trigger BOM explosion RPC
    if (newStatus === 'preparing') {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        'fn_process_new_order',
        { p_order_id: orderId },
      )

      if (rpcErr) {
        console.error('[LiveOrderBoard] RPC error (graceful)', rpcErr)
      } else {
        console.log('[LiveOrderBoard] RPC result', rpcResult)
      }
    }

    // Close detail modal if open
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(null)
    }

    // Realtime will refetch, but do it eagerly
    fetchOrders()
  }

  /* ─── Create manual order ───────────────────────────────── */

  const handleAddToCart = (nomId: string) => {
    const nom = nomOptions.find((n) => n.id === nomId)
    if (!nom) return

    setCart((prev) => {
      const existing = prev.find((c) => c.nom.id === nomId)
      if (existing) {
        return prev.map((c) =>
          c.nom.id === nomId ? { ...c, qty: c.qty + 1 } : c,
        )
      }
      return [...prev, { nom, qty: 1 }]
    })
  }

  const handleRemoveFromCart = (nomId: string) => {
    setCart((prev) => prev.filter((c) => c.nom.id !== nomId))
  }

  const handleQtyChange = (nomId: string, qty: number) => {
    if (qty <= 0) {
      handleRemoveFromCart(nomId)
      return
    }
    setCart((prev) =>
      prev.map((c) => (c.nom.id === nomId ? { ...c, qty } : c)),
    )
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.nom.price * c.qty, 0)

  const handleCreateOrder = async () => {
    if (cart.length === 0) return
    setIsCreating(true)

    try {
      // 1. Insert order
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          source: 'manual',
          status: 'new',
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          total_amount: cartTotal,
          notes: notes.trim() || null,
        })
        .select('id')
        .single()

      if (orderErr || !newOrder) throw orderErr ?? new Error('No order returned')

      // 2. Insert order_items
      const items = cart.map((c) => ({
        order_id: (newOrder as { id: string }).id,
        nomenclature_id: c.nom.id,
        quantity: c.qty,
        price_at_purchase: c.nom.price,
      }))

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(items)

      if (itemsErr) throw itemsErr

      // Reset form
      setShowCreate(false)
      setCart([])
      setCustomerName('')
      setCustomerPhone('')
      setNotes('')
      fetchOrders()
    } catch (err) {
      console.error('[LiveOrderBoard] create order error', err)
    } finally {
      setIsCreating(false)
    }
  }

  /* ─── Group orders by status ────────────────────────────── */

  const grouped: Record<string, Order[]> = { new: [], preparing: [], ready: [] }
  for (const o of orders) {
    if (grouped[o.status]) grouped[o.status].push(o)
  }

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Live Order Board
          </h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {orders.length} active
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchOrders}
            className="inline-flex h-7 items-center rounded-md border border-slate-700 px-2.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-7 items-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-2.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
          >
            <Plus className="mr-1 h-3 w-3" />
            New Order
          </button>
        </div>
      </div>

      {/* Kanban Columns */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-xs text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading orders...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className={`rounded-xl border ${col.color} p-3`}
            >
              {/* Column header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${STATUS_DOT[col.key]}`}
                  />
                  <span className="text-xs font-semibold text-slate-200">
                    {col.label}
                  </span>
                </div>
                <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-400">
                  {grouped[col.key].length}
                </span>
              </div>

              {/* Order cards */}
              <div className="space-y-2">
                {grouped[col.key].length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-slate-600">
                    No orders
                  </p>
                ) : (
                  grouped[col.key].map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/80 p-3 text-left transition hover:border-slate-600"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-slate-500">
                          {order.id.slice(0, 8)}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase text-slate-500">
                          {order.source}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-200">
                        {order.customer_name || 'Walk-in'}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-300">
                          {order.total_amount.toFixed(2)} THB
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(order.created_at).toLocaleString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {order.notes && (
                        <p className="mt-1 truncate text-[10px] italic text-slate-500">
                          {order.notes}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Create Order Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-100">
                Create Manual Order
              </h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              {/* Customer info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Walk-in"
                    className="h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+66..."
                    className="h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-[10px] text-slate-500">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special requests..."
                  className="h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
                />
              </div>

              {/* Add items */}
              <div>
                <label className="mb-1 block text-[10px] text-slate-500">
                  Add Menu Item
                </label>
                <select
                  value=""
                  onChange={(e) => handleAddToCart(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
                >
                  <option value="">Select a dish...</option>
                  {nomOptions.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.product_code} — {n.name} ({n.price.toFixed(0)} THB)
                    </option>
                  ))}
                </select>
              </div>

              {/* Cart */}
              {cart.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                    Order Items
                  </h4>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                        <th className="py-1 text-left">Item</th>
                        <th className="py-1 text-center">Qty</th>
                        <th className="py-1 text-right">Price</th>
                        <th className="py-1 text-right">Sub</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((c) => (
                        <tr
                          key={c.nom.id}
                          className="border-b border-slate-800/50"
                        >
                          <td className="py-1.5 text-slate-200">
                            {c.nom.name}
                          </td>
                          <td className="py-1.5 text-center">
                            <input
                              type="number"
                              min={1}
                              value={c.qty}
                              onChange={(e) =>
                                handleQtyChange(
                                  c.nom.id,
                                  parseInt(e.target.value, 10) || 0,
                                )
                              }
                              className="h-6 w-12 rounded border border-slate-700 bg-slate-800 text-center text-xs text-slate-100 outline-none"
                            />
                          </td>
                          <td className="py-1.5 text-right text-slate-300">
                            {c.nom.price.toFixed(0)}
                          </td>
                          <td className="py-1.5 text-right font-medium text-amber-300">
                            {(c.nom.price * c.qty).toFixed(0)}
                          </td>
                          <td className="py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(c.nom.id)}
                              className="text-slate-500 hover:text-red-300"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 text-right text-xs font-semibold text-emerald-300">
                    Total: {cartTotal.toFixed(2)} THB
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="h-8 rounded-md border border-slate-700 bg-slate-800 px-4 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={isCreating || cart.length === 0}
                className="inline-flex h-8 items-center rounded-md border border-emerald-500/60 bg-emerald-500/15 px-4 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {isCreating && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                Create Order
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
