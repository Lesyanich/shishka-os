import { useMemo } from 'react'
import { SearchableSelect, type SearchableOption } from './SearchableSelect'
import type { ProductCategory } from '../../hooks/useProductCategories'

interface Props {
  categoryId: string | null
  subCategoryId: string | null
  onChange: (next: { categoryId: string | null; subCategoryId: string | null }) => void
  mainCategories: ProductCategory[]
  subCategoriesOf: (parentId: string | null) => ProductCategory[]
  /** Rendered next to the selects, e.g. "48 of 702". */
  countLabel?: string
  disabled?: boolean
}

const ALL = ''

/**
 * Category → subcategory filter pair.
 *
 * Subcategory options follow the chosen category, and picking a different
 * category clears the subcategory — otherwise a stale pair silently filters
 * everything out and the list looks empty for no visible reason.
 */
export function CategoryFilter({
  categoryId,
  subCategoryId,
  onChange,
  mainCategories,
  subCategoriesOf,
  countLabel,
  disabled = false,
}: Props) {
  const categoryOptions: SearchableOption[] = useMemo(
    () => [
      { value: ALL, label: 'All categories' },
      ...mainCategories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [mainCategories],
  )

  const subOptions: SearchableOption[] = useMemo(() => {
    const subs = subCategoriesOf(categoryId)
    // No options at all when there is no category yet, so the control shows its
    // placeholder ("Pick a category first") rather than a misleading
    // "All subcategories" for a list that does not exist.
    if (subs.length === 0) return []
    return [
      { value: ALL, label: 'All subcategories' },
      ...subs.map((c) => ({ value: c.id, label: c.name })),
    ]
  }, [subCategoriesOf, categoryId])

  const hasSubs = subOptions.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <SearchableSelect
          label="Category"
          value={categoryId ?? ALL}
          onChange={(v) =>
            onChange({ categoryId: v || null, subCategoryId: null })
          }
          options={categoryOptions}
          placeholder="All categories"
          disabled={disabled}
          emptyText="No category matches"
        />
      </div>
      <div className="min-w-0 flex-1">
        <SearchableSelect
          label="Subcategory"
          value={subCategoryId ?? ALL}
          onChange={(v) => onChange({ categoryId, subCategoryId: v || null })}
          options={subOptions}
          placeholder={hasSubs ? 'All subcategories' : 'Pick a category first'}
          disabled={disabled || !hasSubs}
          emptyText="No subcategory matches"
        />
      </div>
      {countLabel && (
        <span className="shrink-0 text-[10px] text-cream/45">{countLabel}</span>
      )}
    </div>
  )
}
