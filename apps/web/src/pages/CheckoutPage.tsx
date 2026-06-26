import { Link } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, ShoppingBag } from 'lucide-react'
import { useCart } from '../state/cart.tsx'

const baht = (n: number) => `฿${n.toLocaleString()}`

// STUB: online ordering is not yet live.
// Cashier does not receive web orders — show selection to staff instead.
// Remove this file and restore CheckoutPage.v2.tsx when ordering is tested.
export default function CheckoutPage() {
  const cart = useCart()

  return (
    <div className="min-h-screen pb-10" style={{ background: '#FAF7F0', color: '#2D3F1C' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <Link
          to="/"
          aria-label="Back to menu"
          className="flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90"
          style={{ background: 'rgba(45,63,28,0.08)' }}
        >
          <ArrowLeft size={18} style={{ color: '#2D3F1C' }} />
        </Link>
        <h1
          style={{ fontFamily: 'Alegreya, Georgia, serif', fontSize: '1.4rem', fontWeight: 700 }}
        >
          Your selection
        </h1>
      </div>

      {/* Coming-soon banner */}
      <div className="mx-5 mb-5 rounded-2xl px-5 py-4" style={{ background: '#FEF3C7' }}>
        <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
          Online ordering — coming soon
        </p>
        <p className="mt-1 text-sm" style={{ color: '#78350F' }}>
          Show your selection to the cashier and they'll take care of you.
        </p>
      </div>

      {cart.lines.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <ShoppingBag size={40} style={{ color: 'rgba(45,63,28,0.2)', margin: '0 auto 12px' }} />
          <p style={{ color: 'rgba(45,63,28,0.5)' }}>Your cart is empty</p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm underline"
            style={{ color: '#5B7A3D' }}
          >
            Browse menu
          </Link>
        </div>
      ) : (
        <>
          {/* Cart lines */}
          <ul className="space-y-2 px-5">
            {cart.lines.map((l) => (
              <li
                key={l.dish.id}
                className="flex items-center gap-3 rounded-xl p-3"
                style={{ background: 'rgba(45,63,28,0.06)' }}
              >
                {l.dish.image_url && (
                  <img
                    src={l.dish.image_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{l.dish.name}</p>
                  <p className="text-sm" style={{ color: '#B88830', fontFamily: 'monospace' }}>
                    {baht(l.dish.price ?? 0)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label="decrease"
                    onClick={() => cart.setQuantity(l.dish.id, l.quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition active:scale-90"
                    style={{ background: 'rgba(45,63,28,0.1)' }}
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-5 text-center font-mono font-semibold">{l.quantity}</span>
                  <button
                    type="button"
                    aria-label="increase"
                    onClick={() => cart.setQuantity(l.dish.id, l.quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition active:scale-90"
                    style={{ background: 'rgba(45,63,28,0.1)' }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Total */}
          <div className="mx-5 mt-4 flex items-baseline justify-between border-t pt-4"
            style={{ borderColor: 'rgba(45,63,28,0.12)' }}>
            <span style={{ color: 'rgba(45,63,28,0.55)' }}>Total</span>
            <span style={{ fontFamily: 'Alegreya, Georgia, serif', fontSize: '1.5rem', fontWeight: 700 }}>
              {baht(cart.total)}
            </span>
          </div>

          {/* CTA — show to cashier */}
          <div className="mx-5 mt-6 rounded-2xl p-5 text-center"
            style={{ background: '#2D3F1C', color: '#F0EAD6' }}>
            <p className="text-sm" style={{ opacity: 0.7 }}>Show this screen to the cashier</p>
            <p
              className="mt-1"
              style={{ fontFamily: 'Alegreya, Georgia, serif', fontSize: '1.25rem', fontWeight: 700 }}
            >
              {cart.count} {cart.count === 1 ? 'item' : 'items'} · {baht(cart.total)}
            </p>
          </div>

          <div className="px-5 mt-4 text-center">
            <button
              type="button"
              onClick={() => cart.clear()}
              className="text-sm underline"
              style={{ color: 'rgba(45,63,28,0.4)' }}
            >
              Clear cart
            </button>
          </div>
        </>
      )}
    </div>
  )
}
