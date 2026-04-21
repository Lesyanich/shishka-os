import { useMemo, useState } from 'react'
import { Plus, X, Search } from 'lucide-react'
import type { DishTag } from '../../../hooks/useDishTags'

interface DrawerTagEditorProps {
  tags: DishTag[]
  available: DishTag[]
  isLoading: boolean
  error: string | null
  onAdd: (tagId: string) => Promise<{ ok: boolean; error?: string }>
  onRemove: (tagId: string) => Promise<{ ok: boolean; error?: string }>
}

function tagChipStyle(tag: DishTag): React.CSSProperties | undefined {
  if (!tag.color) return undefined
  return { backgroundColor: `${tag.color}22`, color: tag.color }
}

export function DrawerTagEditor({
  tags,
  available,
  isLoading,
  error,
  onAdd,
  onRemove,
}: DrawerTagEditorProps) {
  const [picker, setPicker] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.tagGroup.toLowerCase().includes(q),
    )
  }, [available, query])

  const groupedFiltered = useMemo(() => {
    const byGroup = new Map<string, DishTag[]>()
    for (const t of filtered) {
      const arr = byGroup.get(t.tagGroup) ?? []
      arr.push(t)
      byGroup.set(t.tagGroup, arr)
    }
    return Array.from(byGroup.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <section aria-labelledby="drawer-tags-title" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3
          id="drawer-tags-title"
          className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-cream)]/60"
          style={{ fontFamily: 'var(--font-display-sc)' }}
        >
          CBS tags
        </h3>
        <button
          type="button"
          onClick={() => setPicker((p) => !p)}
          className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--color-cream)]/70 transition hover:border-slate-500 hover:text-[color:var(--color-cream)]"
        >
          <Plus className="h-3 w-3" />
          {picker ? 'Done' : 'Add'}
        </button>
      </div>

      {isLoading && <div className="text-xs text-slate-500">Loading tags…</div>}
      {error && <div className="text-xs text-rose-400">{error}</div>}

      {/* Applied */}
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-300"
              style={tagChipStyle(t)}
            >
              <span className="opacity-60 font-mono text-[9px]">{t.tagGroup}:</span>
              {t.name}
              <button
                type="button"
                onClick={() => void onRemove(t.id)}
                aria-label={`Remove ${t.name}`}
                className="ml-0.5 rounded-full p-0.5 opacity-60 transition hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        !isLoading && (
          <div className="text-xs text-[color:var(--color-cream)]/40">
            No tags yet. Use + Add to classify CBS / taste / texture / science.
          </div>
        )
      )}

      {/* Picker */}
      {picker && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-[var(--color-surface-2)] p-2">
          <div className="mb-2 flex items-center gap-1.5 rounded border border-slate-700 bg-[var(--color-surface-1)] px-2">
            <Search className="h-3 w-3 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tags…"
              className="flex-1 bg-transparent py-1 text-xs text-[color:var(--color-cream)] placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {groupedFiltered.length === 0 && (
              <div className="text-xs text-slate-500">No matches.</div>
            )}
            {groupedFiltered.map(([group, items]) => (
              <div key={group}>
                <div
                  className="mb-1 text-[9px] uppercase tracking-wider text-[color:var(--color-cream)]/40"
                  style={{ fontFamily: 'var(--font-display-sc)' }}
                >
                  {group}
                </div>
                <div className="flex flex-wrap gap-1">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void onAdd(t.id)}
                      className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-300 transition hover:bg-slate-600"
                      style={tagChipStyle(t)}
                    >
                      + {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
