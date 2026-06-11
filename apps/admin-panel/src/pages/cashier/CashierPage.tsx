import { useState, type FormEvent } from 'react'
import { Search, Printer, Check, X, Loader2, Utensils, ShoppingBag } from 'lucide-react'
import { useCashier, type PaymentMethod } from '../../hooks/useCashier'

const baht = (n: number) => `฿${n.toLocaleString()}`

const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'promptpay', label: 'PromptPay' },
  { id: 'card', label: 'Card' },
]

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-amber-500/15 text-amber-300',
  preparing: 'bg-sky-500/15 text-sky-300',
  ready: 'bg-emerald-500/15 text-emerald-300',
  delivered: 'bg-zinc-500/15 text-zinc-300',
}

export function CashierPage() {
  const { order, isLoading, isBusy, error, lookup, acceptPayment, markDelivered, reset } = useCashier()
  const [code, setCode] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    void lookup(code)
  }

  const isPaid = order?.paymentStatus === 'paid'

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-100">Cashier</h1>
      <p className="mb-5 text-sm text-zinc-400">
        Enter the customer&apos;s order code to take payment and send it to the kitchen.
      </p>

      <form onSubmit={onSearch} className="mb-5 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Order code (e.g. 042)"
          autoFocus
          inputMode="numeric"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-lg tracking-wide text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isLoading || !code.trim()}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
          Find
        </button>
      </form>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-500/10 px-4 py-3 text-rose-300">
          <X size={16} /> {error}
        </div>
      )}

      {order && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="text-4xl font-bold tracking-wider text-zinc-100">{order.orderCode}</div>
              <div className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
                {order.fulfillmentType === 'dine_in' ? (
                  <>
                    <Utensils size={14} /> Dine-in{order.tableNumber ? ` · table ${order.tableNumber}` : ''}
                  </>
                ) : (
                  <>
                    <ShoppingBag size={14} /> Pickup
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[order.status] ?? 'bg-zinc-700 text-zinc-200'}`}>
                {order.status}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${isPaid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                {isPaid ? `paid · ${order.paymentMethod ?? ''}` : 'unpaid'}
              </span>
            </div>
          </div>

          {(order.customerName || order.customerPhone) && (
            <div className="mb-3 text-sm text-zinc-400">
              {order.customerName} {order.customerPhone ? `· ${order.customerPhone}` : ''}
            </div>
          )}

          <ul className="mb-3 divide-y divide-zinc-800 border-y border-zinc-800">
            {order.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between py-2 text-zinc-200">
                <span>
                  <span className="font-mono text-zinc-400">{it.quantity}×</span> {it.name}
                </span>
                <span className="font-mono">{baht(it.price * it.quantity)}</span>
              </li>
            ))}
          </ul>

          <div className="mb-4 flex items-center justify-between text-lg font-semibold text-zinc-100">
            <span>Total</span>
            <span className="font-mono">{baht(order.total)}</span>
          </div>

          {order.notes && (
            <div className="mb-4 rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-300">
              Note: {order.notes}
            </div>
          )}

          {/* Actions */}
          {!isPaid ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                      method === m.id ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void acceptPayment(method)}
                disabled={isBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 font-semibold text-white disabled:opacity-50"
              >
                {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
                Take payment & print to kitchen
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 py-2 text-sm text-emerald-300">
                <Check size={16} /> Paid · sent to kitchen
              </div>
              {order.status !== 'delivered' && (
                <button
                  type="button"
                  onClick={() => void markDelivered()}
                  disabled={isBusy}
                  className="w-full rounded-lg bg-zinc-700 py-3 font-medium text-zinc-100 disabled:opacity-50"
                >
                  {isBusy ? 'Saving…' : 'Mark delivered'}
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              reset()
              setCode('')
            }}
            className="mt-4 w-full text-sm text-zinc-500 hover:text-zinc-300"
          >
            New search
          </button>
        </div>
      )}
    </div>
  )
}
