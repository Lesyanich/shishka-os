import { useEffect } from 'react'
import { X, Clock, ShoppingBag } from 'lucide-react'
import type { MenuDish } from '../hooks/usePublicMenu.ts'

const baht = (n: number | null) => (n == null ? '' : `฿${Number(n).toLocaleString()}`)

interface Props {
  dish: MenuDish | null
  onClose: () => void
  onAddToCart: (dish: MenuDish) => void
}

export function ProductSheet({ dish, onClose, onAddToCart }: Props) {
  useEffect(() => {
    if (!dish) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [dish, onClose])

  if (!dish) return null

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dish.name}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[95dvh] flex-col overflow-hidden rounded-t-3xl shadow-2xl"
        style={{ background: '#FAF7F0' }}
      >
        {/* Photo area — close button floats here, always visible */}
        <div className="relative shrink-0">
          {/* X button — fixed to top-right of photo, never scrolls */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition active:scale-90"
            style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', color: '#2D3F1C' }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>

          {/* Drag pill */}
          <div
            className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full"
            style={{ background: 'rgba(45,63,28,0.15)' }}
          />

          {dish.image_url ? (
            <img
              src={dish.image_url}
              alt={dish.name}
              className="w-full"
              style={{
                aspectRatio: '1 / 1',
                objectFit: 'contain',
                background: '#FAF7F0',
                display: 'block',
              }}
            />
          ) : (
            <div
              className="flex w-full items-center justify-center"
              style={{ aspectRatio: '1 / 1', background: '#F0EAD6' }}
            >
              <span style={{ fontSize: 64, opacity: 0.18 }}>🍽</span>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ color: '#2D3F1C' }}>
          <div className="px-5 pt-5 pb-4 space-y-3">
            {/* Name + price */}
            <div className="flex items-start justify-between gap-3">
              <h2
                className="leading-tight"
                style={{
                  fontFamily: 'Alegreya, Georgia, serif',
                  fontSize: '1.9rem',
                  fontWeight: 700,
                  color: '#2D3F1C',
                  lineHeight: 1.1,
                }}
              >
                {dish.name}
              </h2>
              <span
                style={{
                  fontFamily: 'Alegreya, Georgia, serif',
                  fontSize: '1.6rem',
                  fontWeight: 700,
                  color: '#2D3F1C',
                  whiteSpace: 'nowrap',
                  paddingTop: 4,
                }}
              >
                {baht(dish.price)}
              </span>
            </div>

            {/* Weight */}
            {dish.portion_size != null && (
              <p className="flex items-center gap-1.5 text-sm" style={{ color: 'rgba(45,63,28,0.55)' }}>
                <Clock size={14} className="shrink-0" />
                {dish.portion_size}{dish.portion_unit ?? 'g'}
              </p>
            )}

            {/* Description */}
            {dish.description && (
              <p className="leading-relaxed text-[0.95rem]" style={{ color: 'rgba(45,63,28,0.8)' }}>
                {dish.description}
              </p>
            )}

            {/* Nutrition */}
            {(dish.calories != null || dish.protein != null || dish.carbs != null || dish.fat != null) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {dish.calories != null && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>
                    {dish.calories} kcal
                  </span>
                )}
                {dish.protein != null && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: '#E0F2FE', color: '#0C4A6E' }}>
                    P {dish.protein}g
                  </span>
                )}
                {dish.carbs != null && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: '#EDE9FE', color: '#4C1D95' }}>
                    C {dish.carbs}g
                  </span>
                )}
                {dish.fat != null && (
                  <span className="rounded-full px-3 py-1 text-xs" style={{ background: '#FFE4E6', color: '#9F1239' }}>
                    F {dish.fat}g
                  </span>
                )}
              </div>
            )}

            {/* Allergens */}
            {dish.allergens.length > 0 && (
              <p className="text-xs" style={{ color: 'rgba(45,63,28,0.38)' }}>
                Contains: {dish.allergens.join(', ')}
              </p>
            )}

            {/* Tags */}
            {dish.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dish.tags.map((tag) => (
                  <span
                    key={tag.slug}
                    className="rounded-full px-3 py-1 text-xs"
                    style={
                      tag.color
                        ? { background: `${tag.color}22`, color: tag.color }
                        : { border: '1px solid rgba(45,63,28,0.18)', color: 'rgba(45,63,28,0.6)' }
                    }
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add to cart footer */}
        <div className="shrink-0 px-5 pb-8 pt-3" style={{ background: '#FAF7F0' }}>
          <button
            type="button"
            disabled={dish.price == null}
            onClick={() => { onAddToCart(dish); onClose() }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: '#2D3F1C', color: '#F0EAD6', letterSpacing: '0.01em' }}
          >
            <ShoppingBag size={18} />
            Add to cart · {baht(dish.price)}
          </button>
        </div>
      </div>
    </>
  )
}
