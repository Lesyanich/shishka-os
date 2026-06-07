import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ShoppingBag, Sparkles } from 'lucide-react'
import {
  BUNDLE_CATEGORY,
  MANAKISH_CATEGORY,
  SAUCE_CATEGORY,
  SAUCE_MAX_PRICE,
  findBundle,
  tierPrice,
} from '@shishka/contracts'
import { usePublicMenu, type MenuDish } from '../hooks/usePublicMenu.ts'
import { usePriceTiers } from '../hooks/usePriceTiers.ts'
import { useCart } from '../state/cart.tsx'
import BundleBuilder from '../components/BundleBuilder.tsx'

const baht = (n: number | null) => (n == null ? '' : `฿${Number(n).toLocaleString()}`)

/** Price tag for a menu card: "From ฿X" for build-your-own dishes, else the price. */
const priceTag = (dish: MenuDish): string =>
  dish.from_price != null ? `From ${baht(dish.from_price)}` : baht(dish.price)

// Skeleton layout only — Shishka's designer replaces the card/visual styling.
export default function MenuPage() {
  const { categories, isLoading, error } = usePublicMenu()
  const { discounts } = usePriceTiers()
  const cart = useCart()
  const [activeBundle, setActiveBundle] = useState<MenuDish | null>(null)

  const dishesIn = (code: string): MenuDish[] =>
    categories.find((c) => c.code === code)?.dishes ?? []

  const manakishPool = useMemo(
    () => dishesIn(MANAKISH_CATEGORY).filter((d) => d.price != null),
    [categories],
  )
  const saucePool = useMemo(
    () => dishesIn(SAUCE_CATEGORY).filter((d) => d.price != null && d.price <= SAUCE_MAX_PRICE),
    [categories],
  )
  const bundleDishes = useMemo(() => dishesIn(BUNDLE_CATEGORY), [categories])
  // Bundles render in their own section; hide the raw bundle category below.
  const normalCategories = categories.filter((c) => c.code !== BUNDLE_CATEGORY)

  if (isLoading) return <p className="p-6 text-cream/60">Loading menu…</p>
  if (error) return <p className="p-6 text-royal-red">Could not load the menu: {error}</p>

  /** This bundle's size discount (e.g. 10), or null until tiers load. */
  const discountFor = (dish: MenuDish): number | null => {
    const def = findBundle(dish.product_code)
    const pct = def ? discounts[def.tierCode] : undefined
    return pct ?? null
  }

  /** "from ฿X" = cheapest possible fill at this bundle's tier discount. */
  const fromPrice = (dish: MenuDish): number | null => {
    const def = findBundle(dish.product_code)
    const disc = discountFor(dish)
    if (!def || disc == null || manakishPool.length === 0) return null
    const cheapest = Math.min(...manakishPool.map((d) => d.price ?? Infinity))
    return def.manakishCount * tierPrice(cheapest, disc)
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="px-5 py-6">
        <h1 className="font-display text-3xl text-cream">Shishka</h1>
        <p className="text-cream/50 text-sm">Healthy Kitchen</p>
      </header>

      {/* Bundles — build-your-own sets */}
      {bundleDishes.length > 0 && manakishPool.length > 0 && (
        <section className="px-5 mb-8">
          <h2 className="font-display text-xl text-cream/90 mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-amber-watch" /> Bundles
          </h2>
          <ul className="space-y-3">
            {bundleDishes.map((dish) => {
              const from = fromPrice(dish)
              const disc = discountFor(dish)
              return (
                <li key={dish.id} className="flex items-start gap-3 rounded-lg bg-surface-2 p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-cream">{dish.name}</p>
                      {disc != null && (
                        <span className="rounded-full bg-royal-green/80 px-1.5 py-0.5 text-[10px] font-semibold text-cream">
                          −{disc}%
                        </span>
                      )}
                    </div>
                    {dish.description && (
                      <p className="text-cream/50 text-sm line-clamp-2">{dish.description}</p>
                    )}
                    {from != null && (
                      <p className="text-amber-watch mt-1 font-mono text-sm">From {baht(from)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveBundle(dish)}
                    className="shrink-0 rounded-full bg-forest-soft px-3 py-2 text-xs font-medium text-surface-1"
                  >
                    Build
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {normalCategories.map((cat) => (
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
                  <p className="text-amber-watch mt-1 font-mono text-sm">{priceTag(dish)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => cart.add(dish)}
                  aria-label={`Add ${dish.name}`}
                  // Build-your-own dishes (from_price set) can't be ordered at the
                  // base price — they need their own builder, so don't allow a
                  // plain add (which would undercharge).
                  disabled={dish.price == null || dish.from_price != null}
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

      {activeBundle &&
        (() => {
          const def = findBundle(activeBundle.product_code)
          const disc = discountFor(activeBundle)
          if (!def || disc == null) return null
          return (
            <BundleBuilder
              bundleDish={activeBundle}
              manakishCount={def.manakishCount}
              sauceCount={def.sauceCount}
              discountPct={disc}
              manakishPool={manakishPool}
              saucePool={saucePool}
              onClose={() => setActiveBundle(null)}
              onConfirm={(childLines, price) => cart.addBundle(activeBundle, childLines, price)}
            />
          )
        })()}
    </div>
  )
}
