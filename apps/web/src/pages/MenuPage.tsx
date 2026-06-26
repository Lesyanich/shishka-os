import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ShoppingBag } from 'lucide-react'
import { usePublicMenu, type MenuDish } from '../hooks/usePublicMenu.ts'
import { useCart } from '../state/cart.tsx'
import { ProductSheet } from '../components/ProductSheet.tsx'

const baht = (n: number | null) => (n == null ? '' : `฿${Number(n).toLocaleString()}`)

function MenuSkeleton() {
  return (
    <div className="animate-pulse px-5">
      {/* Category tab skeletons */}
      <div className="flex gap-2 mb-6 overflow-hidden">
        {[72, 56, 88, 64].map((w, i) => (
          <div key={i} className="h-8 shrink-0 rounded-full bg-surface-2" style={{ width: w }} />
        ))}
      </div>
      {/* Two category groups */}
      {[3, 4].map((count, gi) => (
        <div key={gi} className="mb-8">
          <div className="mb-3 h-5 w-20 rounded bg-surface-2" />
          <ul className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
                <div className="h-16 w-16 shrink-0 rounded-lg bg-surface-3" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-surface-3" />
                  <div className="h-3 w-full rounded bg-surface-3" />
                  <div className="h-3 w-1/4 rounded bg-surface-3" />
                </div>
                <div className="h-9 w-9 shrink-0 rounded-full bg-surface-3" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function MenuPage() {
  const { categories, isLoading, error } = usePublicMenu()
  const cart = useCart()
  const [selectedDish, setSelectedDish] = useState<MenuDish | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())

  function scrollToCategory(code: string) {
    setActiveTab(code)
    sectionRefs.current.get(code)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="px-5 py-6">
        <h1 className="font-display text-3xl text-cream">Shishka</h1>
        <p className="text-cream/50 text-sm">Healthy Kitchen</p>
      </header>

      {isLoading && <MenuSkeleton />}

      {error && (
        <div className="px-5 py-4">
          <p className="text-royal-red text-sm">Could not load the menu.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 text-forest-soft underline text-sm"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* Sticky category tabs */}
          {categories.length > 1 && (
            <nav className="scrollbar-none sticky top-0 z-30 flex gap-2 overflow-x-auto border-b border-surface-2 bg-surface-1 px-5 py-2">
              {categories.map((cat) => (
                <button
                  key={cat.code}
                  type="button"
                  onClick={() => scrollToCategory(cat.code)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${
                    (activeTab ?? categories[0]?.code) === cat.code
                      ? 'bg-forest-soft font-medium text-surface-1'
                      : 'text-cream/60 hover:text-cream'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </nav>
          )}

          {/* Dish sections */}
          {categories.map((cat) => (
            <section
              key={cat.code}
              ref={(el) => { if (el) sectionRefs.current.set(cat.code, el) }}
              className="scroll-mt-14 px-5 pt-4 mb-8"
            >
              <h2 className="font-display text-xl text-cream/90 mb-3">{cat.name}</h2>
              <ul className="space-y-3">
                {cat.dishes.map((dish) => (
                  <li key={dish.id} className="flex items-start gap-3 rounded-lg bg-surface-2 p-3">
                    {/* Tap card body → open detail sheet */}
                    <button
                      type="button"
                      onClick={() => setSelectedDish(dish)}
                      className="flex flex-1 items-start gap-3 text-left"
                    >
                      {dish.image_url ? (
                        <img
                          src={dish.image_url}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-3">
                          <span className="text-xl opacity-25">🍽</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-cream">{dish.name}</p>
                        {dish.description && (
                          <p className="mt-0.5 text-cream/50 text-sm line-clamp-2">
                            {dish.description}
                          </p>
                        )}
                        <p className="mt-1 font-mono text-sm text-amber-watch">
                          {baht(dish.price)}
                        </p>
                      </div>
                    </button>

                    {/* Quick-add */}
                    <button
                      type="button"
                      onClick={() => cart.add(dish)}
                      aria-label={`Add ${dish.name}`}
                      disabled={dish.price == null}
                      className="self-center shrink-0 rounded-full bg-forest-soft p-2 text-surface-1 transition active:scale-90 disabled:opacity-40"
                    >
                      <Plus size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {/* Cart bar */}
      {cart.count > 0 && (
        <Link
          to="/checkout"
          className="fixed inset-x-4 bottom-4 flex items-center justify-between rounded-xl bg-royal-green px-5 py-4 text-cream shadow-xl"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag size={18} />
            {cart.count} {cart.count === 1 ? 'item' : 'items'}
          </span>
          <span className="font-mono">{baht(cart.total)} · View order</span>
        </Link>
      )}

      <ProductSheet
        dish={selectedDish}
        onClose={() => setSelectedDish(null)}
        onAddToCart={(dish) => cart.add(dish)}
      />
    </div>
  )
}
