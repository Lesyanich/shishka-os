import { LiveOrderBoard } from '../components/orders/LiveOrderBoard'

export function OrderManager() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Orders</h1>
        <p className="text-xs text-slate-500">
          Live order pipeline — manual, website & POS orders flow through here
        </p>
      </div>

      {/* Live Kanban Board */}
      <LiveOrderBoard />
    </div>
  )
}
