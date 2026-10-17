import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FilterBar } from './FilterBar'
import { defaultFilters, type MenuFilters } from '../../../pages/menu/hooks/useMenuFilters'

const categories = [
  { id: 'c1', name: 'Manaish', code: 'MAN' },
  { id: 'c2', name: 'Salads', code: 'SAL' },
]
const counts = new Map<string | null, number>([[null, 10], ['c1', 6], ['c2', 4]])
// What a bare /menu renders: available-only, nothing else narrowed.
const empty: MenuFilters = defaultFilters()

describe('FilterBar', () => {
  it('renders 4 chips and a clear button only when active', () => {
    const { rerender } = render(
      <FilterBar filters={empty} categories={categories} categoryCounts={counts} onChange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Categories/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Available/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Loyverse/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Flags/ })).toBeInTheDocument()
    expect(screen.queryByText(/Clear all/)).toBeNull()

    rerender(
      <FilterBar
        filters={{ ...empty, categoryIds: ['c1'] }}
        categories={categories}
        categoryCounts={counts}
        onChange={() => {}}
      />,
    )
    expect(screen.getByText(/Clear all/)).toBeInTheDocument()
  })

  it('changing a chip emits new MenuFilters', () => {
    let observed: MenuFilters | null = null
    render(
      <FilterBar
        filters={empty}
        categories={categories}
        categoryCounts={counts}
        onChange={(f) => { observed = f }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Available/ }))
    fireEvent.click(screen.getByLabelText(/All \(incl. retired\)/))
    expect(observed).toEqual({ ...empty, available: 'all' })
  })

  it('Categories chip emits categoryIds change', () => {
    let observed: MenuFilters | null = null
    render(
      <FilterBar
        filters={empty}
        categories={categories}
        categoryCounts={counts}
        onChange={(f) => { observed = f }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Categories/ }))
    fireEvent.click(screen.getByLabelText(/Manaish/))
    expect(observed).toEqual({ ...empty, categoryIds: ['c1'] })
  })

  it('Loyverse chip emits loyverse change', () => {
    let observed: MenuFilters | null = null
    render(
      <FilterBar
        filters={empty}
        categories={categories}
        categoryCounts={counts}
        onChange={(f) => { observed = f }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Loyverse/ }))
    fireEvent.click(screen.getByLabelText(/Synced/))
    expect(observed).toEqual({ ...empty, loyverse: 'synced' })
  })

  it('Flags chip emits flags change', () => {
    let observed: MenuFilters | null = null
    render(
      <FilterBar
        filters={empty}
        categories={categories}
        categoryCounts={counts}
        onChange={(f) => { observed = f }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Flags/ }))
    fireEvent.click(screen.getByLabelText(/No photo/))
    expect(observed).toEqual({ ...empty, flags: ['no-photo'] })
  })

  it('Clear all resets every dimension back to the defaults', () => {
    let observed: MenuFilters | null = null
    render(
      <FilterBar
        filters={{ categoryIds: ['c1'], available: 'all', loyverse: 'synced', flags: ['no-photo'] }}
        categories={categories}
        categoryCounts={counts}
        onChange={(f) => { observed = f }}
      />,
    )
    fireEvent.click(screen.getByText(/Clear all/))
    expect(observed).toEqual({ categoryIds: [], available: 'yes', loyverse: null, flags: [] })
  })
})
