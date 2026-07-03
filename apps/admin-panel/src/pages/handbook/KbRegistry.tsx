import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ChevronRight, Lock, Pencil, Plus, Users } from 'lucide-react'
import { useStaff } from '../../hooks/useStaff'
import type { KbOutletContext } from './HandbookLayout'
import { assignedStaffIds, pickTranslation, type KbPage, type KbTreeNode } from '../../types/knowledgeBase'

interface FlatRow {
  page: KbPage
  depth: number
}

/** Depth-first flatten of the page tree for an ordered outline. */
function flatten(nodes: KbTreeNode[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const n of nodes) {
    out.push({ page: n, depth })
    flatten(n.children, depth + 1, out)
  }
  return out
}

/**
 * Handbook Registry — the owner's single table of contents. Manage the whole
 * handbook here: see every section/page, who can access it, and jump to edit.
 * Access is per section/page and cascades down: assigning a top-level section
 * to staff grants them its whole subtree; leave a page open = everyone (by role).
 */
export function KbRegistry() {
  const { tree, setPageAssignments, isLoading, error } = useOutletContext<KbOutletContext>()
  const { staff } = useStaff()
  const navigate = useNavigate()
  const [openAccess, setOpenAccess] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const rows = useMemo(() => flatten(tree), [tree])
  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff])
  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of staff) m.set(s.id, s.name)
    return m
  }, [staff])

  const toggleAssignee = async (page: KbPage, staffId: string) => {
    const current = assignedStaffIds(page)
    const next = current.includes(staffId)
      ? current.filter((x) => x !== staffId)
      : [...current, staffId]
    setBusy(page.id)
    await setPageAssignments(page.id, next)
    setBusy(null)
  }

  if (isLoading) return <p className="p-6 text-sm text-cream/50">Loading…</p>
  if (error) return <p className="p-6 text-sm text-rose-300">{error}</p>

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-cream">Handbook Registry</h1>
          <p className="mt-1 max-w-2xl text-sm text-cream/55">
            The whole table of contents in one place. Set who can access each section — access
            cascades to everything inside it. Leave a section open and everyone (by role) can read it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/handbook/new')}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-cream/70 transition hover:border-[var(--color-forest-soft)]/40 hover:text-cream"
        >
          <Plus className="h-3.5 w-3.5" />
          New page
        </button>
      </header>

      <div className="shk-panel overflow-hidden p-0">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-[var(--line)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-cream/40">
          <span>Section / Page</span>
          <span>Access</span>
        </div>

        {rows.map(({ page, depth }) => {
          const title = pickTranslation(page, 'en').title
          const assignees = assignedStaffIds(page)
          const isOpen = openAccess === page.id
          const isSection = depth === 0
          return (
            <div key={page.id} className="border-b border-[var(--line)] last:border-b-0">
              <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5">
                {/* Title */}
                <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/handbook/${page.slug}`)}
                    className={[
                      'truncate text-left transition hover:text-honey-300',
                      isSection ? 'text-sm font-semibold text-cream' : 'text-sm text-cream/75',
                    ].join(' ')}
                  >
                    {title}
                  </button>
                  {!page.is_published && (
                    <span className="shrink-0 rounded bg-honey-300/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-honey-300">
                      draft
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/handbook/${page.slug}/edit`)}
                    title="Edit content"
                    className="shrink-0 rounded p-1 text-cream/35 transition hover:text-cream"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Access summary + toggle */}
                <button
                  type="button"
                  onClick={() => setOpenAccess(isOpen ? null : page.id)}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] text-cream/70 transition hover:text-cream"
                >
                  {assignees.length === 0 ? (
                    <>
                      <Users className="h-3.5 w-3.5 text-cream/40" />
                      Everyone
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5 text-honey-300" />
                      {assignees.length === 1
                        ? nameById.get(assignees[0]) ?? '1 person'
                        : `${assignees.length} people`}
                    </>
                  )}
                  <ChevronRight className={['h-3.5 w-3.5 transition-transform', isOpen ? 'rotate-90' : ''].join(' ')} />
                </button>
              </div>

              {/* Inline access editor */}
              {isOpen && (
                <div className="border-t border-[var(--line)] bg-[var(--s-1)] px-4 py-3" style={{ paddingLeft: `${depth * 16 + 16}px` }}>
                  <p className="mb-2 text-[11px] text-cream/45">
                    Assign this {isSection ? 'section' : 'page'} to specific people, or leave empty for everyone.
                    {isSection && ' Applies to every page inside it.'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeStaff.length === 0 ? (
                      <span className="text-xs text-cream/35">No staff.</span>
                    ) : (
                      activeStaff.map((s) => {
                        const on = assignees.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            type="button"
                            disabled={busy === page.id}
                            onClick={() => toggleAssignee(page, s.id)}
                            className={[
                              'rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-40',
                              on
                                ? 'bg-[var(--color-forest-soft)]/25 text-cream ring-1 ring-inset ring-[var(--color-forest-soft)]/40'
                                : 'bg-[var(--s-2)] text-cream/55 hover:text-cream',
                            ].join(' ')}
                          >
                            {s.name}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {rows.length === 0 && <p className="px-4 py-6 text-sm text-cream/40">No pages yet.</p>}
      </div>
    </div>
  )
}
