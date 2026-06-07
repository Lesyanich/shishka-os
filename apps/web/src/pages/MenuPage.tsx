import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, Star, X } from 'lucide-react'
import { usePublicMenu, type MenuDish } from '../hooks/usePublicMenu.ts'

const baht = (n: number | null) => (n == null ? '' : `฿${Number(n).toLocaleString()}`)

const portionLabel = (d: MenuDish) =>
  d.portion_size != null ? `${d.portion_size}${d.portion_unit ? ` ${d.portion_unit}` : ''}` : null

const allergenLabel = (slug: string) => slug.replace(/^allergen-/, '').replace(/-/g, ' ')

/** Macro kcal split → conic-gradient stops for the КБЖУ donut.
 *  Colors are design tokens (index.css → Figma: Color/Nutrition). */
const MACRO = {
  protein: { kcalPerG: 4, ring: 'var(--color-nutri-pro)' },
  carbs: { kcalPerG: 4, ring: 'var(--color-nutri-car)' },
  fat: { kcalPerG: 9, ring: 'var(--color-nutri-fat)' },
} as const

/** Calories-in-center donut showing the protein/carb/fat balance. */
function MacroDonut({ dish, size = 'sm' }: { dish: MenuDish; size?: 'sm' | 'lg' }) {
  const p = (dish.protein ?? 0) * MACRO.protein.kcalPerG
  const c = (dish.carbs ?? 0) * MACRO.carbs.kcalPerG
  const f = (dish.fat ?? 0) * MACRO.fat.kcalPerG
  const total = p + c + f
  if (total <= 0) return null

  const pPct = (p / total) * 100
  const cPct = (c / total) * 100
  const ring = `conic-gradient(${MACRO.protein.ring} 0 ${pPct}%, ${MACRO.carbs.ring} ${pPct}% ${
    pPct + cPct
  }%, ${MACRO.fat.ring} ${pPct + cPct}% 100%)`

  const outer = size === 'lg' ? 'h-20 w-20' : 'h-14 w-14'
  const inner = size === 'lg' ? 'h-14 w-14' : 'h-10 w-10'
  const kcal = size === 'lg' ? 'text-sm' : 'text-[11px]'

  return (
    <div
      className={`relative grid ${outer} shrink-0 place-items-center rounded-full`}
      style={{ background: ring }}
      aria-hidden
    >
      <div
        className={`grid ${inner} place-items-center rounded-full bg-surface-2 text-center leading-none`}
      >
        <span className={`font-mono ${kcal} font-semibold text-cream`}>{dish.calories ?? '—'}</span>
        <span className="text-[7px] uppercase tracking-wide text-cream/40">kcal</span>
      </div>
    </div>
  )
}

const macroBadge = 'rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums'

function NutritionBadges({ dish }: { dish: MenuDish }) {
  const items = [
    dish.protein != null && ['P', dish.protein, 'bg-sky-900/40 text-sky-300'],
    dish.carbs != null && ['C', dish.carbs, 'bg-violet-900/40 text-violet-300'],
    dish.fat != null && ['F', dish.fat, 'bg-rose-900/40 text-rose-300'],
  ].filter(Boolean) as [string, number, string][]
  if (!items.length) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.map(([label, val, cls]) => (
        <span key={label} className={`${macroBadge} ${cls}`}>
          {label} {val}g
        </span>
      ))}
    </div>
  )
}

/** Branded placeholder when a dish has no photo yet: the dish's initial set in
 *  Alegreya italic over a per-dish gradient, so a grid of them reads as design
 *  rather than broken images. Photos appear automatically once image_url fills. */
function Placeholder({ name, id }: { name: string; id: string }) {
  const angle = (id.charCodeAt(0) * 37 + id.length * 13) % 360
  const initial = name.trim().charAt(0).toUpperCase() || '·'
  return (
    <div
      className="relative grid h-full w-full place-items-center"
      style={{
        background: `linear-gradient(${angle}deg, var(--color-surface-3), var(--color-royal-green))`,
      }}
    >
      <span className="font-display text-5xl italic text-cream/30 select-none">{initial}</span>
      <span className="absolute bottom-1.5 right-2 font-mono text-[8px] uppercase tracking-wide text-cream/25">
        No photo
      </span>
    </div>
  )
}

function DishCard({ dish, onOpen }: { dish: MenuDish; onOpen: () => void }) {
  const portion = portionLabel(dish)
  // Coming soon / out of stock: shown on the menu but not orderable — greyed,
  // badged, and non-interactive so the customer knows it's upcoming.
  const unavailable = dish.stock_state !== 'in_stock'
  const stockLabel = dish.stock_state === 'out_of_stock' ? 'Out of stock' : 'Coming soon'
  return (
    <article
      onClick={unavailable ? undefined : onOpen}
      aria-disabled={unavailable || undefined}
      className={`flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface-2 shadow-[var(--shadow-card)] ring-1 ring-white/5 transition ${
        unavailable ? 'cursor-default opacity-60 saturate-50' : 'cursor-pointer hover:ring-white/15'
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-3">
        {dish.image_url ? (
          <img
            src={dish.image_url}
            alt={dish.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <Placeholder name={dish.name} id={dish.id} />
        )}
        {dish.is_featured && !unavailable && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-watch/90 px-2 py-0.5 text-[10px] font-semibold text-surface-1">
            <Star size={10} className="fill-current" /> Featured
          </span>
        )}
        {unavailable && (
          <span className="absolute left-2 top-2 rounded-full bg-surface-1/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream ring-1 ring-white/15 backdrop-blur">
            {stockLabel}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 font-display text-base leading-tight text-cream">
              {dish.name}
            </h3>
            {dish.description && (
              <p className="mt-0.5 line-clamp-2 text-xs text-cream/50">{dish.description}</p>
            )}
          </div>
          <MacroDonut dish={dish} />
        </div>

        <NutritionBadges dish={dish} />

        {dish.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {dish.tags.slice(0, 3).map((t) => (
              <span
                key={t.slug}
                className="rounded-full px-2 py-0.5 text-[10px] text-cream/80"
                style={{ background: t.color ?? 'var(--color-surface-3)' }}
              >
                {t.name}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between pt-1">
          <span className="font-mono text-sm text-amber-watch">{baht(dish.price)}</span>
          {portion && <span className="text-[11px] text-cream/40">{portion}</span>}
        </div>
      </div>
    </article>
  )
}

/** Full-screen dish detail, deep-linked via ?product=<id> (shareable + back-button). */
function DishModal({ dish, onClose }: { dish: MenuDish; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const portion = portionLabel(dish)
  return (
    <div
      className="fixed inset-0 z-30 grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface-2 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-3">
          {dish.image_url ? (
            <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
          ) : (
            <Placeholder name={dish.name} id={dish.id} />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-surface-1/80 text-cream backdrop-blur"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl text-cream">{dish.name}</h2>
              <div className="mt-1 flex items-center gap-2 font-mono text-amber-watch">
                {baht(dish.price)}
                {portion && <span className="text-cream/40">· {portion}</span>}
              </div>
            </div>
            <MacroDonut dish={dish} size="lg" />
          </div>

          {dish.description && (
            <p className="mt-3 text-sm leading-relaxed text-cream/70">{dish.description}</p>
          )}

          <NutritionBadges dish={dish} />

          {dish.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dish.tags.map((t) => (
                <span
                  key={t.slug}
                  className="rounded-full px-2.5 py-1 text-[11px] text-cream/80"
                  style={{ background: t.color ?? 'var(--color-surface-3)' }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}

          {dish.allergens.length > 0 && (
            <p className="mt-4 text-xs text-cream/40">
              Contains: {dish.allergens.map(allergenLabel).join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MenuPage() {
  const { categories, isLoading, error } = usePublicMenu()
  const [active, setActive] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [diets, setDiets] = useState<Set<string>>(new Set())
  const [allergens, setAllergens] = useState<Set<string>>(new Set())

  // Filter options derived from loaded data — no extra DB calls.
  const { dietOptions, allergenOptions } = useMemo(() => {
    const dietMap = new Map<string, string>() // slug → name
    const allergenSet = new Set<string>()
    for (const cat of categories) {
      for (const d of cat.dishes) {
        if (d.price == null) continue
        for (const t of d.tags) if (t.group === 'dietary') dietMap.set(t.slug, t.name)
        for (const a of d.allergens) allergenSet.add(a)
      }
    }
    return {
      dietOptions: [...dietMap.entries()].map(([slug, name]) => ({ slug, name })),
      allergenOptions: [...allergenSet].sort(),
    }
  }, [categories])

  // Priced dishes, then diet (must-have) + allergen (exclude) filters applied.
  const shown = useMemo(() => {
    const dietList = [...diets]
    return categories
      .map((cat) => ({
        ...cat,
        dishes: cat.dishes.filter((d) => {
          if (d.price == null) return false
          const slugs = new Set(d.tags.map((t) => t.slug))
          if (dietList.some((s) => !slugs.has(s))) return false
          if (d.allergens.some((a) => allergens.has(a))) return false
          return true
        }),
      }))
      .filter((cat) => cat.dishes.length > 0)
  }, [categories, diets, allergens])

  const openDish = useMemo(() => {
    const id = params.get('product')
    if (!id) return null
    for (const cat of categories) {
      const d = cat.dishes.find((x) => x.id === id)
      if (d) return d
    }
    return null
  }, [params, categories])

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    apply(next)
  }
  const activeFilters = diets.size + allergens.size

  if (isLoading)
    return <div className="grid min-h-screen place-items-center text-cream/60">Loading menu…</div>
  if (error)
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center text-royal-red">
        Could not load the menu: {error}
      </div>
    )

  const scrollTo = (code: string) => {
    setActive(code)
    document.getElementById(`cat-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const openProduct = (id: string) => setParams({ product: id }, { replace: false })
  const closeProduct = () => {
    const next = new URLSearchParams(params)
    next.delete('product')
    setParams(next, { replace: false })
  }
  const hasFilters = dietOptions.length > 0 || allergenOptions.length > 0

  return (
    <div className="min-h-screen pb-16">
      <header className="flex items-end justify-between px-5 pb-3 pt-6">
        <div>
          <h1 className="font-display text-3xl text-cream">Shishka</h1>
          <p className="text-sm text-cream/50">Healthy Kitchen</p>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs text-cream/80 ring-1 ring-white/5"
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilters > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-forest-soft px-1 text-[10px] font-semibold text-surface-1">
                {activeFilters}
              </span>
            )}
          </button>
        )}
      </header>

      {/* Sticky category tabs */}
      <nav className="sticky top-0 z-10 border-b border-white/5 bg-surface-1/90 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shown.map((cat) => (
            <button
              key={cat.code}
              type="button"
              onClick={() => scrollTo(cat.code)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm transition ${
                active === cat.code ? 'bg-forest-soft text-surface-1' : 'bg-surface-2 text-cream/70'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </nav>

      {/* Filter panel */}
      {filtersOpen && hasFilters && (
        <div className="border-b border-white/5 bg-surface-1 px-5 py-4">
          {dietOptions.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-cream/40">Diets</p>
              <div className="flex flex-wrap gap-1.5">
                {dietOptions.map((d) => (
                  <button
                    key={d.slug}
                    type="button"
                    onClick={() => toggle(diets, d.slug, setDiets)}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      diets.has(d.slug)
                        ? 'bg-forest-soft text-surface-1'
                        : 'bg-surface-2 text-cream/70'
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {allergenOptions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-cream/40">
                Exclude allergens
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allergenOptions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggle(allergens, a, setAllergens)}
                    className={`rounded-full px-3 py-1 text-xs capitalize transition ${
                      allergens.has(a)
                        ? 'bg-royal-red text-cream'
                        : 'bg-surface-2 text-cream/70'
                    }`}
                  >
                    {allergenLabel(a)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setDiets(new Set())
                setAllergens(new Set())
              }}
              className="mt-3 text-xs text-cream/50 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <main className="px-4 pt-5">
        {shown.map((cat) => (
          <section key={cat.code} id={`cat-${cat.code}`} className="mb-9 scroll-mt-16">
            <h2 className="mb-3 px-1 font-display text-xl text-cream/90">{cat.name}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cat.dishes.map((dish) => (
                <DishCard key={dish.id} dish={dish} onOpen={() => openProduct(dish.id)} />
              ))}
            </div>
          </section>
        ))}
        {shown.length === 0 && (
          <p className="px-2 py-10 text-center text-cream/50">
            {activeFilters > 0 ? 'No dishes match these filters.' : 'Menu coming soon.'}
          </p>
        )}
      </main>

      {openDish && <DishModal dish={openDish} onClose={closeProduct} />}
    </div>
  )
}
