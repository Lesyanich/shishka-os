import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus, ArrowLeft } from 'lucide-react'
import { useCart } from '../state/cart.tsx'
import { createOrder } from '../lib/api.ts'
import type { FulfillmentType } from '@shishka/contracts'

const baht = (n: number) => `฿${n.toLocaleString()}`

export default function CheckoutPage() {
  const cart = useCart()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [fulfillment, setFulfillment] = useState<FulfillmentType>('pickup')
  const [tableNumber, setTableNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (cart.lines.length === 0) {
    return (
      <div className="min-h-screen p-6 text-cream/70">
        <p>Your cart is empty.</p>
        <Link to="/" className="text-forest-soft underline">
          Back to menu
        </Link>
      </div>
    )
  }

  async function placeOrder() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await createOrder({
        channel: 'own_web',
        items: cart.lines.map((l) => ({
          nomenclatureId: l.dish.id,
          quantity: l.quantity,
          modifierSlugs: [],
        })),
        checkout: {
          customerName: name || null,
          customerPhone: phone || null,
          fulfillmentType: fulfillment,
          tableNumber: fulfillment === 'dine_in' ? tableNumber : null,
          notes: notes || null,
        },
      })
      cart.clear()
      navigate(`/order/${res.orderCode}`, { state: { total: res.totalAmount } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the order')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen p-5 pb-28">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-cream/60 text-sm">
        <ArrowLeft size={16} /> Menu
      </Link>
      <h1 className="font-display text-2xl text-cream mb-4">Your order</h1>

      <ul className="space-y-2 mb-6">
        {cart.lines.map((l) => (
          <li key={l.dish.id} className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
            <div className="flex-1">
              <p className="text-cream">{l.dish.name}</p>
              <p className="text-amber-watch font-mono text-sm">{baht(l.dish.price ?? 0)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="decrease"
                onClick={() => cart.setQuantity(l.dish.id, l.quantity - 1)}
                className="rounded-full bg-surface-3 p-1.5 text-cream"
              >
                <Minus size={14} />
              </button>
              <span className="w-5 text-center font-mono text-cream">{l.quantity}</span>
              <button
                type="button"
                aria-label="increase"
                onClick={() => cart.setQuantity(l.dish.id, l.quantity + 1)}
                className="rounded-full bg-surface-3 p-1.5 text-cream"
              >
                <Plus size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 mb-6">
        <div className="flex gap-2">
          {(['pickup', 'dine_in'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFulfillment(f)}
              className={`flex-1 rounded-lg py-2 text-sm ${
                fulfillment === f ? 'bg-royal-green text-cream' : 'bg-surface-2 text-cream/60'
              }`}
            >
              {f === 'pickup' ? 'Pickup' : 'Dine-in'}
            </button>
          ))}
        </div>
        {fulfillment === 'dine_in' && (
          <input
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="Table number"
            className="w-full rounded-lg bg-surface-2 px-3 py-2 text-cream placeholder:text-cream/40"
          />
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-full rounded-lg bg-surface-2 px-3 py-2 text-cream placeholder:text-cream/40"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          inputMode="tel"
          className="w-full rounded-lg bg-surface-2 px-3 py-2 text-cream placeholder:text-cream/40"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for the kitchen (optional)"
          rows={2}
          className="w-full rounded-lg bg-surface-2 px-3 py-2 text-cream placeholder:text-cream/40"
        />
      </div>

      {error && <p className="mb-3 text-royal-red text-sm">{error}</p>}

      <button
        type="button"
        onClick={placeOrder}
        disabled={submitting || (fulfillment === 'dine_in' && !tableNumber)}
        className="fixed inset-x-4 bottom-4 rounded-xl bg-forest-soft py-4 text-center font-medium text-surface-1 disabled:opacity-50"
      >
        {submitting ? 'Placing order…' : `Place order · ${baht(cart.total)}`}
      </button>
    </div>
  )
}
