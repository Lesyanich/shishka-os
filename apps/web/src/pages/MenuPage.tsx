import { Link } from 'react-router-dom'
import { Plus, ShoppingBag } from 'lucide-react'
import { usePublicMenu } from '../hooks/usePublicMenu.ts'
import { useCart } from '../state/cart.tsx'

const baht = (n: number | null) => (n == null ? '' : `฿${Number(n).toLocaleString()}`)

// Skeleton layout only — Shishka's designer replaces the card/visual styling.
export default function MenuPage() {
  const { categories, isLoading, error } = usePublicMenu()
  const cart = useCart()

  if (isLoading) return <p className="p-6 text-cream/60">Loading menu…</p>
  if (error) return <p className="p-6 text-royal-red">Could not load the menu: {error}</p>

  return (
    <div className="min-h-screen pb-24">
      <header className="px-5 py-6">
        <h1 className="font-display text-3xl text-cream">Shishka</h1>
        <p className="text-cream/50 text-sm">Healthy Kitchen</p>
      </header>

      {categories.map((cat) => (
        <section key={cat.code} className="px-5 mb-8">
          <h2 className="font-display text-xl text-cream/90 mb-3">{cat.name}</h2>
          <ul className="space-y-3">
            {cat.dishes.map((dish) => (
              <li
                key={dish.id}
                className="flex items-start gap-3 rounded-lg bg-surface-2 p-3"
              >
                <div className="flex-1">
                  <p className="text-cream">{dish.name}</p>
                  {dish.description && (
                    <p className="text-cream/50 text-sm line-clamp-2">{dish.description}</p>
                  )}
                  <p className="text-amber-watch mt-1 font-mono text-sm">{baht(dish.price)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => cart.add(dish)}
                  aria-label={`Add ${dish.name}`}
                  disabled={dish.price == null}
                  className="shrink-0 rounded-full bg-forest-soft p-2 text-surface-1 disabled:opacity-40"
                >
                  <Plus size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {cart.count > 0 && (
        <Link
          to="/checkout"
          className="fixed inset-x-4 bottom-4 flex items-center justify-between rounded-xl bg-royal-green px-5 py-4 text-cream shadow-lg"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag size={18} />
            {cart.count} {cart.count === 1 ? 'item' : 'items'}
          </span>
          <span className="font-mono">{baht(cart.total)} · Checkout</span>
        </Link>
      )}
    </div>
  )
}
