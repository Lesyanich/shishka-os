import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { CategoryFilter } from './CategoryFilter'
import type { ProductCategory } from '../../hooks/useProductCategories'

const cat = (id: string, name: string, level: number, parent_id: string | null = null): ProductCategory => ({
  id,
  code: id.toUpperCase(),
  name,
  parent_id,
  level,
  sort_order: 0,
})

const mainCategories = [cat('produce', 'Produce', 2), cat('proteins', 'Proteins', 2)]
const subs: Record<string, ProductCategory[]> = {
  produce: [cat('veg', 'Vegetables', 3, 'produce'), cat('herbs', 'Fresh Herbs', 3, 'produce')],
  proteins: [cat('sea', 'Seafood', 3, 'proteins')],
}
const subCategoriesOf = (parentId: string | null) => (parentId ? (subs[parentId] ?? []) : [])

function setup(categoryId: string | null = null, subCategoryId: string | null = null) {
  const onChange = vi.fn()
  render(
    <CategoryFilter
      categoryId={categoryId}
      subCategoryId={subCategoryId}
      onChange={onChange}
      mainCategories={mainCategories}
      subCategoriesOf={subCategoriesOf}
    />,
  )
  return { onChange }
}

const openCategory = () => fireEvent.click(screen.getByRole('button', { name: 'Category' }))
const openSub = () => fireEvent.click(screen.getByRole('button', { name: 'Subcategory' }))

afterEach(cleanup)

describe('CategoryFilter', () => {
  it('offers an explicit "all" entry so the filter can be cleared', () => {
    setup()
    openCategory()
    expect(within(screen.getByRole('listbox')).getByText('All categories')).toBeTruthy()
  })

  it('reports a chosen category as null when "all" is picked', () => {
    const { onChange } = setup('produce')
    openCategory()
    fireEvent.click(screen.getByText('All categories'))
    expect(onChange).toHaveBeenCalledWith({ categoryId: null, subCategoryId: null })
  })

  it('clears the subcategory when the category changes', () => {
    // A stale pair (Produce → Seafood) matches nothing, and the list would look
    // empty with no visible reason why.
    const { onChange } = setup('produce', 'veg')
    openCategory()
    fireEvent.click(screen.getByText('Proteins'))
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'proteins', subCategoryId: null })
  })

  it('disables the subcategory picker until a category is chosen', () => {
    setup()
    const sub = screen.getByRole('button', { name: 'Subcategory' })
    expect((sub as HTMLButtonElement).disabled).toBe(true)
    expect(sub.textContent).toContain('Pick a category first')
  })

  it('offers only the subcategories of the chosen category', () => {
    setup('produce')
    openSub()
    const shown = within(screen.getByRole('listbox')).getAllByRole('option')
    const labels = shown.map((o) => o.textContent)
    expect(labels).toContain('Vegetables')
    expect(labels).toContain('Fresh Herbs')
    expect(labels.join()).not.toContain('Seafood')
  })

  it('keeps the category when only the subcategory changes', () => {
    const { onChange } = setup('produce')
    openSub()
    fireEvent.click(screen.getByText('Vegetables'))
    expect(onChange).toHaveBeenCalledWith({ categoryId: 'produce', subCategoryId: 'veg' })
  })

  it('shows how much of the list the filter is hiding', () => {
    render(
      <CategoryFilter
        categoryId="produce"
        subCategoryId={null}
        onChange={vi.fn()}
        mainCategories={mainCategories}
        subCategoriesOf={subCategoriesOf}
        countLabel="48 of 702"
      />,
    )
    expect(screen.getByText('48 of 702')).toBeTruthy()
  })
})
