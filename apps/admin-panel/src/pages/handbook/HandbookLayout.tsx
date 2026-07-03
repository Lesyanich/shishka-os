import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, List, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAppRole } from '../../contexts/AppRoleContext'
import { useKbPages, type UseKbPagesResult } from '../../hooks/useKbPages'
import { KbTree } from './KbTree'
import {
  KB_LANGS,
  KB_LANG_LABEL,
  pickTranslation,
  type KbLang,
} from '../../types/knowledgeBase'

export interface KbOutletContext extends UseKbPagesResult {
  lang: KbLang
  setLang: (lang: KbLang) => void
}

const LANG_STORAGE_KEY = 'kb_lang'

function isKbLang(v: unknown): v is KbLang {
  return typeof v === 'string' && (KB_LANGS as readonly string[]).includes(v)
}

/** Derive the active page slug from the URL (/handbook/<slug>[/edit]). */
function activeSlugFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean) // ['handbook', slug, ...]
  if (parts.length < 2 || parts[0] !== 'handbook') return null
  if (parts[1] === 'new') return null
  return decodeURIComponent(parts[1])
}

export function HandbookLayout() {
  const kb = useKbPages()
  const { staffId } = useAppRole()
  const navigate = useNavigate()
  const location = useLocation()
  const activeSlug = activeSlugFromPath(location.pathname)

  const [lang, setLangState] = useState<KbLang>(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY)
    return isKbLang(saved) ? saved : 'en'
  })
  const [query, setQuery] = useState('')

  // Default the language from the staff member's preferred_language, but only
  // when they haven't explicitly chosen one (no saved override yet).
  useEffect(() => {
    if (localStorage.getItem(LANG_STORAGE_KEY)) return
    if (!staffId) return
    let cancelled = false
    supabase
      .from('staff')
      .select('preferred_language')
      .eq('id', staffId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const pl = data?.preferred_language
        if (isKbLang(pl)) setLangState(pl)
      })
    return () => {
      cancelled = true
    }
  }, [staffId])

  const setLang = (l: KbLang) => {
    setLangState(l)
    localStorage.setItem(LANG_STORAGE_KEY, l)
  }

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return kb.visiblePages
      .filter((p) => {
        const { title } = pickTranslation(p, lang)
        return title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
      })
      .slice(0, 30)
  }, [query, kb.visiblePages, lang])

  const ctx: KbOutletContext = { ...kb, lang, setLang }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4 lg:h-[calc(100vh-9rem)] lg:flex-row">
      {/* ── Left rail: search + tree ── */}
      <aside className="shk-panel flex w-full shrink-0 flex-col p-3 lg:w-72">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-honey-300" />
          <span className="shk-eyebrow text-honey-300">Handbook</span>
          {kb.isOwner && (
            <button
              type="button"
              onClick={() => navigate('/handbook/registry')}
              title="Registry — manage pages & access"
              className="ml-auto flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-cream/70 transition hover:border-[var(--color-forest-soft)]/40 hover:text-cream"
            >
              <List className="h-3.5 w-3.5" />
              Registry
            </button>
          )}
        </div>

        {/* Language switcher */}
        <div className="shk-seg mb-3 w-full">
          {KB_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className="shk-seg-btn flex-1 justify-center"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
            >
              {KB_LANG_LABEL[l]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cream/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages…"
            className="w-full rounded-md border border-[var(--line)] bg-[var(--s-2)] py-1.5 pl-8 pr-2 text-xs text-cream placeholder:text-cream/35 focus:border-[var(--color-forest-soft)]/50 focus:outline-none"
          />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto pr-1">
          {kb.isLoading ? (
            <p className="px-2 py-3 text-xs text-cream/40">Loading…</p>
          ) : kb.error ? (
            <p className="px-2 py-3 text-xs text-rose-300">{kb.error}</p>
          ) : query.trim() ? (
            searchResults.length === 0 ? (
              <p className="px-2 py-3 text-xs text-cream/40">No matches.</p>
            ) : (
              <div className="space-y-0.5">
                {searchResults.map((p) => {
                  const { title } = pickTranslation(p, lang)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setQuery('')
                        navigate(`/handbook/${p.slug}`)
                      }}
                      className="block w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-cream/70 transition hover:bg-surface-3 hover:text-cream"
                    >
                      {title}
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <KbTree
              nodes={kb.tree}
              lang={lang}
              activeSlug={activeSlug}
              onSelect={(slug) => navigate(`/handbook/${slug}`)}
            />
          )}
        </nav>
      </aside>

      {/* ── Right: page content ── */}
      <section className="min-w-0 flex-1 overflow-y-auto">
        <Outlet context={ctx} />
      </section>
    </div>
  )
}
