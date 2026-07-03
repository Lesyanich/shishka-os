import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { AlertCircle, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { slugifyHeading } from '../../lib/vault'
import { useKbImageUpload } from '../../hooks/useKbImageUpload'
import type { AppRole } from '../../contexts/AppRoleContext'
import type { KbOutletContext } from './HandbookLayout'
import { KbMarkdown } from './KbMarkdown'
import {
  KB_LANGS,
  KB_LANG_LABEL,
  type KbLang,
  type KbPage,
} from '../../types/knowledgeBase'

type LangContent = Record<KbLang, { title: string; body_md: string }>

const EMPTY_CONTENT: LangContent = {
  en: { title: '', body_md: '' },
  th: { title: '', body_md: '' },
  my: { title: '', body_md: '' },
}

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'cook', label: 'Everyone (cook+)' },
  { value: 'task_manager', label: 'Managers + owner' },
  { value: 'owner', label: 'Owner only' },
]

/** Collect a page and all its descendants (to exclude them as parent options). */
function descendantIds(rootId: string, pages: KbPage[]): Set<string> {
  const out = new Set<string>([rootId])
  let added = true
  while (added) {
    added = false
    for (const p of pages) {
      if (p.parent_id && out.has(p.parent_id) && !out.has(p.id)) {
        out.add(p.id)
        added = true
      }
    }
  }
  return out
}

export function KbEditor() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const {
    visiblePages,
    bySlug,
    allSlugs,
    createPage,
    updatePage,
    deletePage,
    upsertTranslation,
  } = useOutletContext<KbOutletContext>()
  const { upload, isUploading } = useKbImageUpload()

  const existing = slug ? bySlug.get(slug) ?? null : null
  const isEdit = !!existing

  // ── Form state ──
  const [slugVal, setSlugVal] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [parentId, setParentId] = useState<string | null>(null)
  const [minRole, setMinRole] = useState<AppRole>('cook')
  const [icon, setIcon] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [isPublished, setIsPublished] = useState(true)
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  const [content, setContent] = useState<LangContent>(EMPTY_CONTENT)
  const [activeTab, setActiveTab] = useState<KbLang>('en')

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Populate from the existing page when editing.
  useEffect(() => {
    if (!existing) {
      setContent(EMPTY_CONTENT)
      return
    }
    setSlugVal(existing.slug)
    setSlugTouched(true)
    setParentId(existing.parent_id)
    setMinRole(existing.min_role)
    setIcon(existing.icon ?? '')
    setSortOrder(existing.sort_order)
    setIsPublished(existing.is_published)
    setRedirectTo(existing.redirect_to_page_id)
    const next: LangContent = {
      en: { title: '', body_md: '' },
      th: { title: '', body_md: '' },
      my: { title: '', body_md: '' },
    }
    for (const t of existing.translations) {
      next[t.lang] = { title: t.title, body_md: t.body_md }
    }
    setContent(next)
  }, [existing])

  // Auto-derive slug from the English title until the owner edits it manually.
  useEffect(() => {
    if (isEdit || slugTouched) return
    setSlugVal(slugifyHeading(content.en.title))
  }, [content.en.title, isEdit, slugTouched])

  const parentOptions = useMemo(() => {
    const excluded = existing ? descendantIds(existing.id, visiblePages) : new Set<string>()
    return visiblePages
      .filter((p) => !excluded.has(p.id))
      .map((p) => ({
        id: p.id,
        label: (p.translations.find((t) => t.lang === 'en')?.title || p.slug),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [visiblePages, existing])

  const setLangField = (lang: KbLang, field: 'title' | 'body_md', value: string) => {
    setContent((c) => ({ ...c, [lang]: { ...c[lang], [field]: value } }))
  }

  const insertAtCursor = (text: string) => {
    const el = bodyRef.current
    const cur = content[activeTab].body_md
    if (!el) {
      setLangField(activeTab, 'body_md', `${cur}\n${text}\n`)
      return
    }
    const start = el.selectionStart ?? cur.length
    const end = el.selectionEnd ?? cur.length
    const next = cur.slice(0, start) + text + cur.slice(end)
    setLangField(activeTab, 'body_md', next)
  }

  const handleImage = async (file: File | undefined) => {
    if (!file) return
    setErr(null)
    const res = await upload(file, existing?.id ?? null)
    if (!res.ok || !res.url) {
      setErr(res.error ?? 'Image upload failed')
      return
    }
    insertAtCursor(`\n![image](${res.url})\n`)
  }


  const handleSave = async () => {
    setErr(null)
    const finalSlug = (slugVal || slugifyHeading(content.en.title)).trim()
    if (!finalSlug) return setErr('Slug is required.')
    if (!content.en.title.trim()) return setErr('English title is required.')

    setSaving(true)
    const pageInput = {
      slug: finalSlug,
      parent_id: parentId,
      icon: icon.trim() || null,
      min_role: minRole,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      is_published: isPublished,
      redirect_to_page_id: redirectTo,
    }

    let pageId = existing?.id ?? null
    if (isEdit && existing) {
      const res = await updatePage(existing.id, pageInput)
      if (!res.ok) {
        setSaving(false)
        return setErr(res.error ?? 'Save failed')
      }
    } else {
      const res = await createPage(pageInput)
      if (!res.ok || !res.id) {
        setSaving(false)
        return setErr(res.error ?? 'Create failed')
      }
      pageId = res.id
    }

    // Upsert each language that has any content.
    for (const lang of KB_LANGS) {
      const { title, body_md } = content[lang]
      if (lang !== 'en' && !title.trim() && !body_md.trim()) continue
      if (pageId) await upsertTranslation(pageId, lang, { title, body_md })
    }

    setSaving(false)
    navigate(`/handbook/${finalSlug}`)
  }

  const handleDelete = async () => {
    if (!existing) return
    const ok = window.confirm(
      'Delete this page? Its translations and any child pages will also be deleted.',
    )
    if (!ok) return
    setSaving(true)
    const res = await deletePage(existing.id)
    setSaving(false)
    if (!res.ok) return setErr(res.error ?? 'Delete failed')
    navigate('/handbook')
  }

  return (
    <div className="shk-panel p-5 lg:p-6">
      <header className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <h1 className="font-display text-xl font-bold text-cream">
          {isEdit ? 'Edit page' : 'New page'}
        </h1>
        <div className="flex items-center gap-2">
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md border border-rose-700/40 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-900/20 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/handbook/${existing!.slug}` : '/handbook')}
            disabled={saving}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-cream/70 transition hover:text-cream disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-[var(--color-forest-soft)] px-3 py-1.5 text-xs font-medium text-cream transition hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* ── Page settings ── */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-cream/60">
          Slug
          <input
            value={slugVal}
            onChange={(e) => {
              setSlugTouched(true)
              setSlugVal(e.target.value)
            }}
            placeholder="page-slug"
            className="rounded-md border border-[var(--line)] bg-[var(--s-2)] px-2 py-1.5 font-mono text-xs text-cream focus:border-[var(--color-forest-soft)]/50 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-cream/60">
          Parent
          <select
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value || null)}
            className="rounded-md border border-[var(--line)] bg-[var(--s-2)] px-2 py-1.5 text-xs text-cream focus:border-[var(--color-forest-soft)]/50 focus:outline-none"
          >
            <option value="">— Top level (space) —</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-cream/60">
          Who can read
          <select
            value={minRole}
            onChange={(e) => setMinRole(e.target.value as AppRole)}
            className="rounded-md border border-[var(--line)] bg-[var(--s-2)] px-2 py-1.5 text-xs text-cream focus:border-[var(--color-forest-soft)]/50 focus:outline-none"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-cream/60">
          Icon (lucide name, optional)
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="BookOpen"
            className="rounded-md border border-[var(--line)] bg-[var(--s-2)] px-2 py-1.5 text-xs text-cream focus:border-[var(--color-forest-soft)]/50 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-cream/60">
          Sort order
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            className="rounded-md border border-[var(--line)] bg-[var(--s-2)] px-2 py-1.5 text-xs text-cream focus:border-[var(--color-forest-soft)]/50 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-xs text-cream/70">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-forest-soft)]"
          />
          Published (visible to staff)
        </label>
      </div>

      {/* Access (who sees this page/section) is managed centrally in the Registry. */}

      {/* ── Language tabs ── */}
      <div className="shk-seg mb-3">
        {KB_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            className="shk-seg-btn"
            aria-pressed={activeTab === l}
            onClick={() => setActiveTab(l)}
          >
            {KB_LANG_LABEL[l]}
            {l !== 'en' && content[l].body_md.trim() && (
              <span className="ml-1 text-[9px] text-honey-300">●</span>
            )}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {activeTab !== 'en' && (
          <span className="text-[11px] text-cream/40">
            Translated offline and stored — edit here if needed.
          </span>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] text-cream/70 transition hover:text-cream">
          {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          Insert image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImage(e.target.files?.[0])}
          />
        </label>
      </div>

      <label className="mb-1 block text-xs text-cream/60">Title ({KB_LANG_LABEL[activeTab]})</label>
      <input
        value={content[activeTab].title}
        onChange={(e) => setLangField(activeTab, 'title', e.target.value)}
        placeholder={activeTab === 'en' ? 'Page title (required)' : 'Title in this language'}
        className="mb-3 w-full rounded-md border border-[var(--line)] bg-[var(--s-2)] px-3 py-2 text-sm text-cream focus:border-[var(--color-forest-soft)]/50 focus:outline-none"
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-cream/60">Markdown</label>
          <textarea
            ref={bodyRef}
            value={content[activeTab].body_md}
            onChange={(e) => setLangField(activeTab, 'body_md', e.target.value)}
            spellCheck={false}
            placeholder="Write with Markdown. Link other pages with [[page-slug]] or /handbook/page-slug."
            className="min-h-[55vh] w-full resize-y rounded-md border border-[var(--line)] bg-[var(--s-2)] p-3 font-mono text-xs text-cream focus:border-[var(--color-forest-soft)]/50 focus:outline-none"
          />
        </div>
        <div className="hidden xl:block">
          <label className="mb-1 block text-xs text-cream/60">Preview</label>
          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--s-1)] p-3">
            {content[activeTab].body_md.trim() ? (
              <KbMarkdown body={content[activeTab].body_md} knownSlugs={allSlugs} />
            ) : (
              <p className="text-xs text-cream/35">Nothing to preview yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
