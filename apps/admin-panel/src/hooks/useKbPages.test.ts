import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const tr = (id: string, title: string) => ({
  id: `${id}-en`,
  page_id: id,
  lang: 'en',
  title,
  body_md: '',
  updated_at: '',
})

const base = {
  icon: null, is_published: true, redirect_to_page_id: null, cover_image_url: null,
  created_by: null, updated_by: null, created_at: '', updated_at: '', min_role: 'cook',
}

const PAGES = [
  { ...base, id: '1', parent_id: null, slug: 'company', sort_order: 10, translations: [tr('1', 'Company')], assignments: [] },
  { ...base, id: '2', parent_id: '1', slug: 'about', sort_order: 10, translations: [tr('2', 'About')], assignments: [] },
  { ...base, id: '3', parent_id: null, slug: 'mine', sort_order: 20, translations: [tr('3', 'Mine')], assignments: [{ staff_id: 'me' }] },
  { ...base, id: '4', parent_id: null, slug: 'theirs', sort_order: 30, translations: [tr('4', 'Theirs')], assignments: [{ staff_id: 'other' }] },
  // Children with NO own assignment — access cascades from the assigned section.
  { ...base, id: '5', parent_id: '3', slug: 'mine-child', sort_order: 10, translations: [tr('5', 'Mine child')], assignments: [] },
  { ...base, id: '6', parent_id: '4', slug: 'theirs-child', sort_order: 10, translations: [tr('6', 'Theirs child')], assignments: [] },
]

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: PAGES, error: null }) }),
    }),
  },
}))

// Current viewer is a cook whose staff id is "me".
vi.mock('../contexts/AppRoleContext', () => ({
  useAppRole: () => ({ role: 'cook', staffId: 'me', staffName: 'Me', isLoading: false }),
}))

import { useKbPages } from './useKbPages'

describe('useKbPages', () => {
  it('loads pages and nests them into a tree', async () => {
    const { result } = renderHook(() => useKbPages())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const company = result.current.tree.find((n) => n.slug === 'company')
    expect(company).toBeDefined()
    expect(company!.children).toHaveLength(1)
    expect(company!.children[0].slug).toBe('about')
  })

  it('shows unassigned + own pages to a cook, hides pages assigned to others', async () => {
    const { result } = renderHook(() => useKbPages())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const slugs = result.current.visiblePages.map((p) => p.slug)
    expect(slugs).toContain('company') // shared (no assignment)
    expect(slugs).toContain('about') // shared child
    expect(slugs).toContain('mine') // assigned to me
    expect(slugs).not.toContain('theirs') // assigned to someone else
    expect(slugs).toContain('mine-child') // cascades: section assigned to me
    expect(slugs).not.toContain('theirs-child') // cascades: section assigned to other

    expect(result.current.assignedToMe.has('3')).toBe(true)
    expect(result.current.assignedToMe.has('4')).toBe(false)
  })
})
