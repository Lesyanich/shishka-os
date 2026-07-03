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

const PAGES = [
  {
    id: '1', parent_id: null, slug: 'company', icon: null, sort_order: 10,
    min_role: 'cook', is_published: true, redirect_to_page_id: null, cover_image_url: null,
    created_by: null, updated_by: null, created_at: '', updated_at: '', translations: [tr('1', 'Company')],
  },
  {
    id: '2', parent_id: '1', slug: 'about', icon: null, sort_order: 10,
    min_role: 'cook', is_published: true, redirect_to_page_id: null, cover_image_url: null,
    created_by: null, updated_by: null, created_at: '', updated_at: '', translations: [tr('2', 'About')],
  },
]

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: PAGES, error: null }) }),
    }),
  },
}))

import { useKbPages } from './useKbPages'

describe('useKbPages', () => {
  it('loads pages and nests them into a tree', async () => {
    const { result } = renderHook(() => useKbPages())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.tree).toHaveLength(1)
    expect(result.current.tree[0].slug).toBe('company')
    expect(result.current.tree[0].children).toHaveLength(1)
    expect(result.current.tree[0].children[0].slug).toBe('about')
    expect(result.current.bySlug.get('about')?.parent_id).toBe('1')
    expect(result.current.allSlugs).toContain('company')
  })
})
