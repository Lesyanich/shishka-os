import { useEffect, useRef } from 'react'
import { X, Clock, ShoppingBag } from 'lucide-react'
import type { MenuDish } from '../hooks/usePublicMenu.ts'

const baht = (n: number | null) => (n == null ? '' : `฿${Number(n).toLocaleString()}`)

interface Props {
  dish: MenuDish | null
  onClose: () => void
  onAddToCart: (dish: MenuDish) => void
}

export function ProductSheet({ dish, onClose, onAddToCart }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!dish) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dish, onClose])

  if (!dish) return null

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dish.name}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-surface-1 shadow-2xl"
      >
        {/* Drag handle + close row */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between rounded-t-2xl bg-surface-1 px-4 py-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-surface-3 absolute left-1/2 top-3 -translate-x-1/2" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-cream/50 pt-2">
            {dish.category_name ?? 'Menu'}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-cream/70 transition hover:bg-surface-3 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-soft"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Photo */}
          {dish.image_url ? (
            <img
              src={dish.image_url}
              alt={dish.name}
              className="w-full aspect-[4/3] object-cover"
            />
          ) : (
            <div className="w-full aspect-[4/3] bg-surface-2 flex items-center justify-center">
              <span className="text-5xl opacity-30">🍽</span>
            </div>
          )}

          <div className="px-5 py-5 space-y-4">
            {/* Name + price */}
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl text-cream leading-tight">{dish.name}</h2>
              <span className="shrink-0 font-mono text-xl text-amber-watch">
                {baht(dish.price)}
              </span>
            </div>

            {/* Weight */}
            {dish.portion_size != null && (
              <p className="flex items-center gap-1.5 text-sm text-cream/50">
                <Clock size={14} className="shrink-0" />
                {dish.portion_size}
                {dish.portion_unit ?? 'g'}
              </p>
            )}

            {/* Description */}
            {dish.description && (
              <p className="text-cream/80 leading-relaxed text-sm">{dish.description}</p>
            )}

            {/* Nutrition row */}
            {(dish.calories != null || dish.protein != null || dish.carbs != null || dish.fat != null) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {dish.calories != null && (
                  <span className="rounded-full bg-amber-900/40 px-3 py-1 text-xs text-amber-300">
                    {dish.calories} kcal
                  </span>
                )}
                {dish.protein != null && (
                  <span className="rounded-full bg-sky-900/40 px-3 py-1 text-xs text-sky-300">
                    P {dish.protein}g
                  </span>
                )}
                {dish.carbs != null && (
                  <span className="rounded-full bg-violet-900/40 px-3 py-1 text-xs text-violet-300">
                    C {dish.carbs}g
                  </span>
                )}
                {dish.fat != null && (
                  <span className="rounded-full bg-rose-900/40 px-3 py-1 text-xs text-rose-300">
                    F {dish.fat}g
                  </span>
                )}
              </div>
            )}

            {/* Allergens */}
            {dish.allergens.length > 0 && (
              <p className="text-xs text-cream/40">
                Contains: {dish.allergens.join(', ')}
              </p>
            )}

            {/* Tags */}
            {dish.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dish.tags.map((tag) => (
                  <span
                    key={tag.slug}
                    className="rounded-full bg-surface-2 px-3 py-1 text-xs text-cream/60"
                    style={tag.color ? { backgroundColor: `${tag.color}33`, color: tag.color } : undefined}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add to cart footer */}
        <div className="shrink-0 border-t border-surface-2 bg-surface-1 px-5 py-4">
          <button
            type="button"
            disabled={dish.price == null}
            onClick={() => {
              onAddToCart(dish)
              onClose()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-soft py-4 font-medium text-surface-1 transition active:scale-95 disabled:opacity-40"
          >
            <ShoppingBag size={18} />
            Add to cart · {baht(dish.price)}
          </button>
        </div>
      </div>
    </>
  )
}
