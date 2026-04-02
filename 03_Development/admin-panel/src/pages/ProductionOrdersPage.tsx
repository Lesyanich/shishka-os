import { useMemo, useState } from 'react'
import { Factory, Plus } from 'lucide-react'
import { useProductionOrders, type ProductionOrderStatus } from '../hooks/useProductionOrders'
import { useStaff } from '../hooks/useStaff'
import { ProductionOrderCard } from '../components/production/ProductionOrderCard'
import { CreateOrderModal } from '../components/production/CreateOrderModal'

// ─── Status tabs ─────────────────────────────────────────────────

type TabKey = 'all' | ProductionOrderStatus

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'planned', label: 'Planned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
]

// ─── Page ────────────────────────────────────────────────────────

export function ProductionOrdersPage() {
  const [tab, setTab] = useState<TabKey>('all')
  const [dateFilter, setDateFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const statusFilter = tab === 'all' ? undefined : tab
  const { orders, isLoading, error, createOrder, startOrder, cancelOrder, completeOrder, updateOrder } =
    useProductionOrders({ status: statusFilter, date: dateFilter || undefined })
  const { staff } = useStaff()

  // Count per tab for badges
  const allOrders = useProductionOrders()
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: allOrders.orders.length }
    for (const o of allOrders.orders) {
      map[o.status] = (map[o.status] ?? 0) + 1
    }
    return map
  }, [allOrders.orders])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Factory className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Production Orders</h1>
            <p className="text-xs text-slate-500">{orders.length} orders</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New Order
        </button>
      </div>

      {/* Filters row: tabs + date */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-slate-800/50 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
              {counts[t.key] != null && (
                <span className="ml-1.5 text-[10px] text-slate-500">{counts[t.key]}</span>
              )}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="h-8 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-800/50" />
          ))}
        </div>
      )}

      {/* Order cards */}
      {!isLoading && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => (
            <ProductionOrderCard
              key={order.id}
              order={order}
              staff={staff}
              onStart={startOrder}
              onCancel={cancelOrder}
              onComplete={completeOrder}
              onAssign={(id, staffId) =>
                updateOrder(id, { assigned_to: staffId })
              }
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && orders.length === 0 && !error && (
        <div className="py-16 text-center">
          <Factory className="mx-auto mb-3 h-10 w-10 text-slate-700" />
          <p className="text-sm text-slate-500">No production orders</p>
          <p className="text-xs text-slate-600">
            {tab !== 'all'
              ? `No ${tab.replace('_', ' ')} orders${dateFilter ? ' on this date' : ''}`
              : 'Click "+ New Order" to create one'}
          </p>
        </div>
      )}

      {/* Create modal */}
      <CreateOrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={createOrder}
      />
    </div>
  )
}
