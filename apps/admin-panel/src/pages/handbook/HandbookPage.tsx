import { useEffect, useMemo } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ChevronRight, Info, Pencil } from 'lucide-react'
import type { KbOutletContext } from './HandbookLayout'
import { KbMarkdown } from './KbMarkdown'
import { pickTranslation, type KbPage } from '../../types/knowledgeBase'

/** Walk the parent chain to build breadcrumbs (root → … → current). */
function breadcrumbTrail(page: KbPage, byId: Map<string, KbPage>): KbPage[] {
  const trail: KbPage[] = []
  let cur: KbPage | undefined = page
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    trail.unshift(cur)
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
  }
  return trail
}

export function HandbookPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { visiblePages, bySlug, allSlugs, lang, isLoading, error, isOwner } =
    useOutletContext<KbOutletContext>()

  const page = slug ? bySlug.get(slug) ?? null : null

  const byId = useMemo(() => {
    const m = new Map<string, KbPage>()
    for (const p of visiblePages) m.set(p.id, p)
    return m
  }, [visiblePages])

  // Redirect pages: hop to the target and replace history.
  useEffect(() => {
    if (page?.redirect_to_page_id) {
      const target = byId.get(page.redirect_to_page_id)
      if (target) navigate(`/handbook/${target.slug}`, { replace: true })
    }
  }, [page, byId, navigate])

  if (isLoading) return <p className="p-6 text-sm text-cream/50">Loading…</p>
  if (error) return <p className="p-6 text-sm text-rose-300">{error}</p>
  if (!page) {
    return (
      <div className="shk-panel p-6">
        <h1 className="text-lg font-semibold text-cream">Page not found</h1>
        <p className="mt-1 text-sm text-cream/50">
          This handbook page doesn’t exist or isn’t available to you.
        </p>
        <button
          type="button"
          onClick={() => navigate('/handbook')}
          className="mt-3 text-sm text-honey-300 hover:underline"
        >
          ← Back to Handbook
        </button>
      </div>
    )
  }

  const { title, body_md, isFallback } = pickTranslation(page, lang)
  const trail = breadcrumbTrail(page, byId)
  const children = visiblePages
    .filter((p) => p.parent_id === page.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))

  return (
    <article className="shk-panel p-5 lg:p-6">
      {/* Breadcrumbs */}
      <nav className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-cream/40">
        <button type="button" onClick={() => navigate('/handbook')} className="hover:text-cream/70">
          Handbook
        </button>
        {trail.map((p) => {
          const isLast = p.id === page.id
          return (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-cream/25" />
              {isLast ? (
                <span className="text-cream/70">{pickTranslation(p, lang).title}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/handbook/${p.slug}`)}
                  className="hover:text-cream/70"
                >
                  {pickTranslation(p, lang).title}
                </button>
              )}
            </span>
          )
        })}
      </nav>

      <header className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-cream">{title}</h1>
          {!page.is_published && (
            <span className="mt-1 inline-block rounded bg-honey-300/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-honey-300">
              draft — not visible to staff
            </span>
          )}
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => navigate(`/handbook/${page.slug}/edit`)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-cream/70 transition hover:border-[var(--color-forest-soft)]/40 hover:text-cream"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </header>

      {isFallback && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--s-2)] px-3 py-2 text-[11px] text-cream/55">
          <Info className="h-3.5 w-3.5 shrink-0 text-honey-300" />
          Not translated yet — showing English.
        </div>
      )}

      {body_md.trim() ? (
        <KbMarkdown
          body={body_md}
          knownSlugs={allSlugs}
          onNavigate={(s) => navigate(`/handbook/${s}`)}
        />
      ) : (
        <p className="text-sm text-cream/40">This page has no content yet.</p>
      )}

      {children.length > 0 && (
        <footer className="mt-6 border-t border-[var(--line)] pt-4">
          <p className="shk-eyebrow mb-2 text-cream/40">In this section</p>
          <div className="flex flex-col gap-0.5">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/handbook/${c.slug}`)}
                className="group flex items-center gap-1.5 rounded px-1 py-1 text-left text-sm text-cream/60 transition hover:text-cream"
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cream/30 group-hover:text-honey-300" />
                <span className="truncate">{pickTranslation(c, lang).title}</span>
              </button>
            ))}
          </div>
        </footer>
      )}
    </article>
  )
}
