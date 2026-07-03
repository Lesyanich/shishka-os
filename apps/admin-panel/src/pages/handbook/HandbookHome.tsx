import { useOutletContext, useNavigate } from 'react-router-dom'
import { ChevronRight, Star } from 'lucide-react'
import type { KbOutletContext } from './HandbookLayout'
import { pickTranslation } from '../../types/knowledgeBase'

/** Handbook landing: a personal "assigned to you" strip, then a card per space. */
export function HandbookHome() {
  const { tree, visiblePages, assignedToMe, lang, isLoading, error } =
    useOutletContext<KbOutletContext>()
  const navigate = useNavigate()

  if (isLoading) return <p className="p-6 text-sm text-cream/50">Loading…</p>
  if (error) return <p className="p-6 text-sm text-rose-300">{error}</p>

  const myPages = visiblePages.filter((p) => assignedToMe.has(p.id))

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-cream">Team Handbook</h1>
        <p className="mt-1 text-sm text-cream/55">
          Everything about our company, our processes, and how we work. Pick a topic to start reading.
        </p>
      </header>

      {myPages.length > 0 && (
        <section className="shk-panel p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Star className="h-4 w-4 text-honey-300" />
            <span className="shk-eyebrow text-honey-300">Assigned to you</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {myPages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/handbook/${p.slug}`)}
                className="rounded-lg bg-[var(--color-royal-green)]/25 px-3 py-1.5 text-sm text-cream ring-1 ring-inset ring-[var(--color-forest-soft)]/30 transition hover:bg-[var(--color-royal-green)]/40"
              >
                {pickTranslation(p, lang).title}
              </button>
            ))}
          </div>
        </section>
      )}

      {tree.length === 0 ? (
        <div className="shk-panel p-6 text-sm text-cream/50">No pages yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tree.map((space) => {
            const { title } = pickTranslation(space, lang)
            return (
              <div key={space.id} className="shk-panel flex flex-col p-4">
                <button
                  type="button"
                  onClick={() => navigate(`/handbook/${space.slug}`)}
                  className="mb-2 text-left font-display text-base font-semibold text-cream hover:text-honey-300"
                >
                  {title}
                </button>
                <div className="flex flex-col">
                  {space.children.map((child) => {
                    const c = pickTranslation(child, lang)
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => navigate(`/handbook/${child.slug}`)}
                        className="group flex items-center gap-1.5 rounded px-1 py-1 text-left text-sm text-cream/60 transition hover:text-cream"
                      >
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cream/30 group-hover:text-honey-300" />
                        <span className="truncate">{c.title}</span>
                      </button>
                    )
                  })}
                  {space.children.length === 0 && (
                    <p className="px-1 py-1 text-xs text-cream/35">No pages inside yet.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
