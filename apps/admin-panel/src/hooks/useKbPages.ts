import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAppRole, type AppRole } from '../contexts/AppRoleContext'
import { ROLE_RANK } from '../lib/roles'
import { assignedStaffIds, type KbLang, type KbPage, type KbTreeNode } from '../types/knowledgeBase'

const PAGE_SELECT =
  'id, parent_id, slug, icon, sort_order, min_role, is_published, redirect_to_page_id, cover_image_url, created_by, updated_by, created_at, updated_at, translations:kb_page_translations(id, page_id, lang, title, body_md, updated_at), assignments:kb_page_assignments(staff_id)'

export interface KbPageInput {
  slug: string
  parent_id: string | null
  icon: string | null
  min_role: AppRole
  sort_order: number
  is_published: boolean
  redirect_to_page_id?: string | null
  cover_image_url?: string | null
}

export interface MutationResult {
  ok: boolean
  id?: string
  error?: string
}

/** Build a nested tree from the flat page list, ordered by sort_order. */
function buildTree(pages: KbPage[]): KbTreeNode[] {
  const byId = new Map<string, KbTreeNode>()
  for (const p of pages) byId.set(p.id, { ...p, children: [], depth: 0 })
  const roots: KbTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (nodes: KbTreeNode[], depth: number) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    for (const n of nodes) {
      n.depth = depth
      sortRec(n.children, depth + 1)
    }
  }
  sortRec(roots, 0)
  return roots
}

export interface UseKbPagesResult {
  pages: KbPage[]
  visiblePages: KbPage[]
  tree: KbTreeNode[]
  bySlug: Map<string, KbPage>
  allSlugs: string[]
  /** Page ids personally assigned to the current staff member. */
  assignedToMe: Set<string>
  isLoading: boolean
  error: string | null
  isOwner: boolean
  refetch: () => Promise<void>
  createPage: (input: KbPageInput) => Promise<MutationResult>
  updatePage: (id: string, patch: Partial<KbPageInput>) => Promise<MutationResult>
  deletePage: (id: string) => Promise<MutationResult>
  upsertTranslation: (
    pageId: string,
    lang: KbLang,
    content: { title: string; body_md: string },
  ) => Promise<MutationResult>
  /** Replace the set of staff a page is personally assigned to (owner only). */
  setPageAssignments: (pageId: string, staffIds: string[]) => Promise<MutationResult>
}

/**
 * Loads the whole knowledge base (pages + all translations in one PostgREST
 * query), builds the tree, and filters by the caller's role: owners see
 * everything (incl. drafts); everyone else sees only published pages within
 * their role rank. min_role is a UI-visibility gate only (see mig 345 — reads
 * are open to any authenticated staff at the DB level, so store nothing
 * sensitive here). Mutations are owner-only; RLS rejects non-owner writes.
 */
export function useKbPages(): UseKbPagesResult {
  const { role, staffName, staffId } = useAppRole()
  const [pages, setPages] = useState<KbPage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('kb_pages')
      .select(PAGE_SELECT)
      .order('sort_order')
    if (err) {
      setError(err.message)
      setPages([])
    } else {
      setPages((data ?? []) as unknown as KbPage[])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const isOwner = role === 'owner'
  const isManager = role === 'task_manager' || isOwner

  // Pages personally assigned to the current staff member.
  const assignedToMe = useMemo(() => {
    const s = new Set<string>()
    if (!staffId) return s
    for (const p of pages) {
      if (assignedStaffIds(p).includes(staffId)) s.add(p.id)
    }
    return s
  }, [pages, staffId])

  const visiblePages = useMemo(() => {
    // Owner sees everything (incl. drafts).
    if (isOwner) return pages

    const byId = new Map(pages.map((p) => [p.id, p]))

    // Directly-visible pages: published, and either shared (role-gated) or
    // personally assigned to me. Managers see all published pages.
    const directlyVisible = pages.filter((p) => {
      if (!p.is_published) return false
      if (isManager) return true
      const assignees = assignedStaffIds(p)
      if (assignees.length === 0) return ROLE_RANK[role] >= ROLE_RANK[p.min_role]
      return staffId != null && assignees.includes(staffId)
    })

    // Keep the tree path intact: pull in each visible page's (published) ancestors.
    const visibleIds = new Set(directlyVisible.map((p) => p.id))
    for (const p of directlyVisible) {
      let cur = p.parent_id ? byId.get(p.parent_id) : undefined
      while (cur && !visibleIds.has(cur.id)) {
        if (cur.is_published) visibleIds.add(cur.id)
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
      }
    }
    return pages.filter((p) => visibleIds.has(p.id))
  }, [pages, role, isOwner, isManager, staffId])

  const tree = useMemo(() => buildTree(visiblePages), [visiblePages])
  const bySlug = useMemo(() => {
    const m = new Map<string, KbPage>()
    for (const p of visiblePages) m.set(p.slug, p)
    return m
  }, [visiblePages])
  const allSlugs = useMemo(() => visiblePages.map((p) => p.slug), [visiblePages])

  const createPage = useCallback(
    async (input: KbPageInput): Promise<MutationResult> => {
      const { data, error: err } = await supabase
        .from('kb_pages')
        .insert({ ...input, created_by: staffName, updated_by: staffName })
        .select('id')
        .single()
      if (err) return { ok: false, error: err.message }
      await refetch()
      return { ok: true, id: data.id as string }
    },
    [refetch, staffName],
  )

  const updatePage = useCallback(
    async (id: string, patch: Partial<KbPageInput>): Promise<MutationResult> => {
      const { error: err } = await supabase
        .from('kb_pages')
        .update({ ...patch, updated_by: staffName })
        .eq('id', id)
      if (err) return { ok: false, error: err.message }
      await refetch()
      return { ok: true, id }
    },
    [refetch, staffName],
  )

  const deletePage = useCallback(
    async (id: string): Promise<MutationResult> => {
      // ON DELETE CASCADE removes translations and any child pages.
      const { error: err } = await supabase.from('kb_pages').delete().eq('id', id)
      if (err) return { ok: false, error: err.message }
      await refetch()
      return { ok: true, id }
    },
    [refetch],
  )

  const upsertTranslation = useCallback(
    async (
      pageId: string,
      lang: KbLang,
      content: { title: string; body_md: string },
    ): Promise<MutationResult> => {
      const { error: err } = await supabase
        .from('kb_page_translations')
        .upsert(
          { page_id: pageId, lang, title: content.title, body_md: content.body_md },
          { onConflict: 'page_id,lang' },
        )
      if (err) return { ok: false, error: err.message }
      await refetch()
      return { ok: true, id: pageId }
    },
    [refetch],
  )

  const setPageAssignments = useCallback(
    async (pageId: string, staffIds: string[]): Promise<MutationResult> => {
      // Replace the page's assignment set: clear, then insert the chosen staff.
      const { error: delErr } = await supabase
        .from('kb_page_assignments')
        .delete()
        .eq('page_id', pageId)
      if (delErr) return { ok: false, error: delErr.message }
      if (staffIds.length > 0) {
        const { error: insErr } = await supabase.from('kb_page_assignments').insert(
          staffIds.map((sid) => ({ page_id: pageId, staff_id: sid, assigned_by: staffName })),
        )
        if (insErr) return { ok: false, error: insErr.message }
      }
      await refetch()
      return { ok: true, id: pageId }
    },
    [refetch, staffName],
  )

  return {
    pages,
    visiblePages,
    tree,
    bySlug,
    allSlugs,
    assignedToMe,
    isLoading,
    error,
    isOwner,
    refetch,
    createPage,
    updatePage,
    deletePage,
    upsertTranslation,
    setPageAssignments,
  }
}
