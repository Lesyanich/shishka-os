import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DishSummary, MenuCategorySummary } from '../shared/types'
import { DishGrid } from './DishGrid'

interface CategorySectionProps {
  categories: MenuCategorySummary[]
  dishes: DishSummary[]
  /** Map dish → category id. When undefined, all dishes render in a single
   * unnamed section. */
  categoryOf?: (dishId: string) => string | null | undefined
  onSelect?: (id: string) => void
  qualityScoreFor?: (dishId: string) => number | null | undefined
  descriptionFor?: (dishId: string) => string | null | undefined
  /** Sticky top offset in pixels (for fixed app chrome). Default 0. */
  stickyTopPx?: number
}

/** Long-scroll customer menu: sticky category nav in Alegreya SC, each
 * category renders as its own <section> with a DishGrid. Active tab
 * syncs via IntersectionObserver as the user scrolls. Click a tab to
 * smooth-scroll to that section. */
export function CategorySection({
  categories,
  dishes,
  categoryOf,
  onSelect,
  qualityScoreFor,
  descriptionFor,
  stickyTopPx = 0,
}: CategorySectionProps) {
  const byCategory = useMemo(() => {
    const map = new Map<string, DishSummary[]>()
    const uncategorized: DishSummary[] = []
    for (const dish of dishes) {
      const catId = categoryOf?.(dish.id) ?? null
      if (!catId) {
        uncategorized.push(dish)
        continue
      }
      const arr = map.get(catId) ?? []
      arr.push(dish)
      map.set(catId, arr)
    }
    return { map, uncategorized }
  }, [dishes, categoryOf])

  const visibleCategories = useMemo(
    () => categories.filter((c) => (byCategory.map.get(c.id)?.length ?? 0) > 0),
    [categories, byCategory],
  )

  const [activeId, setActiveId] = useState<string | null>(
    visibleCategories[0]?.id ?? null,
  )

  const sectionRefs = useRef(new Map<string, HTMLElement>())
  const setSectionRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) sectionRefs.current.set(id, el)
      else sectionRefs.current.delete(id)
    },
    [],
  )

  // Sync active tab with the section currently closest to the top of view.
  useEffect(() => {
    if (visibleCategories.length === 0) return
    const handler = (entries: IntersectionObserverEntry[]) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => (a.intersectionRect.top ?? 0) - (b.intersectionRect.top ?? 0))
      if (visible.length > 0) {
        const id = visible[0].target.getAttribute('data-cat-id')
        if (id) setActiveId(id)
      }
    }
    const observer = new IntersectionObserver(handler, {
      rootMargin: `-${stickyTopPx + 120}px 0px -60% 0px`,
      threshold: [0, 0.1, 0.5],
    })
    for (const el of sectionRefs.current.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [visibleCategories, stickyTopPx])

  const scrollTo = useCallback(
    (id: string) => {
      const el = sectionRefs.current.get(id)
      if (!el) return
      const y = el.getBoundingClientRect().top + window.scrollY - stickyTopPx - 8
      window.scrollTo({ top: y, behavior: 'smooth' })
      setActiveId(id)
    },
    [stickyTopPx],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Sticky tab strip */}
      <nav
        aria-label="Menu categories"
        className="sticky z-10 -mx-2 flex gap-1 overflow-x-auto border-b border-slate-800/70 bg-[var(--color-surface-1)]/90 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface-1)]/70"
        style={{ top: stickyTopPx }}
      >
        {visibleCategories.map((cat) => {
          const isActive = activeId === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollTo(cat.id)}
              aria-current={isActive ? 'true' : undefined}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] transition ${
                isActive
                  ? 'bg-[var(--color-royal-green)]/25 text-[color:var(--color-forest-soft)] ring-1 ring-inset ring-[var(--color-forest-soft)]/40'
                  : 'text-[color:var(--color-cream)]/60 hover:bg-[var(--color-surface-3)] hover:text-[color:var(--color-cream)]/85'
              }`}
              style={{ fontFamily: 'var(--font-display-sc)' }}
            >
              {cat.name}
              <span className="ml-2 font-mono text-[10px] tabular-nums opacity-60">
                {byCategory.map.get(cat.id)?.length ?? 0}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Sections */}
      <div className="flex flex-col gap-12">
        {visibleCategories.map((cat) => {
          const items = byCategory.map.get(cat.id) ?? []
          return (
            <section
              key={cat.id}
              ref={setSectionRef(cat.id)}
              data-cat-id={cat.id}
              aria-labelledby={`cat-heading-${cat.id}`}
              className="scroll-mt-24"
            >
              <h2
                id={`cat-heading-${cat.id}`}
                className="mb-4 italic text-[color:var(--color-cream)]"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.35rem, 3vw, 1.75rem)',
                  fontWeight: 500,
                }}
              >
                {cat.name}
              </h2>
              <DishGrid
                dishes={items}
                onSelect={onSelect}
                qualityScoreFor={qualityScoreFor}
                descriptionFor={descriptionFor}
                density="relaxed"
              />
            </section>
          )
        })}

        {byCategory.uncategorized.length > 0 && (
          <section
            data-cat-id="__uncategorized"
            aria-label="Other dishes"
            className="scroll-mt-24"
          >
            <h2
              className="mb-4 italic text-[color:var(--color-cream)]/80"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.35rem, 3vw, 1.75rem)',
                fontWeight: 500,
              }}
            >
              More
            </h2>
            <DishGrid
              dishes={byCategory.uncategorized}
              onSelect={onSelect}
              qualityScoreFor={qualityScoreFor}
              descriptionFor={descriptionFor}
            />
          </section>
        )}
      </div>
    </div>
  )
}
