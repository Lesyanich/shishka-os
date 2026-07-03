import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { KbTree } from './KbTree'
import type { KbTreeNode } from '../../types/knowledgeBase'

function node(
  id: string,
  slug: string,
  title: string,
  depth: number,
  opts: { published?: boolean; children?: KbTreeNode[] } = {},
): KbTreeNode {
  return {
    id,
    parent_id: null,
    slug,
    icon: null,
    sort_order: 0,
    min_role: 'cook',
    is_published: opts.published ?? true,
    redirect_to_page_id: null,
    cover_image_url: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
    translations: [{ id: `${id}-en`, page_id: id, lang: 'en', title, body_md: '', updated_at: '' }],
    depth,
    children: opts.children ?? [],
  }
}

describe('KbTree', () => {
  it('renders an empty state with no nodes', () => {
    render(<KbTree nodes={[]} lang="en" activeSlug={null} onSelect={() => {}} />)
    expect(screen.getByText(/No pages yet/)).toBeInTheDocument()
  })

  it('renders nested titles and a draft badge for unpublished pages', () => {
    const tree = [
      node('1', 'company', 'Company', 0, {
        children: [node('2', 'about', 'About', 1, { published: false })],
      }),
    ]
    render(<KbTree nodes={tree} lang="en" activeSlug={null} onSelect={() => {}} />)
    expect(screen.getByText('Company')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
  })

  it('calls onSelect with the slug when a node is clicked', () => {
    const onSelect = vi.fn()
    render(
      <KbTree
        nodes={[node('1', 'company', 'Company', 0)]}
        lang="en"
        activeSlug={null}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByText('Company'))
    expect(onSelect).toHaveBeenCalledWith('company')
  })
})
