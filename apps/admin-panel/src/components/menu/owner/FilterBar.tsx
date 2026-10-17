import { FilterChip, type FilterChipOption } from './FilterChip'
import {
  DEFAULT_AVAILABLE,
  defaultFilters,
  isNonDefault,
  type MenuFilters,
  type AvailableFilter,
  type LoyverseFilter,
  type FlagKey,
} from '../../../pages/menu/hooks/useMenuFilters'
import type { MenuCategorySummary } from '../shared/types'

interface FilterBarProps {
  filters: MenuFilters
  categories: MenuCategorySummary[]
  categoryCounts: Map<string | null, number>
  onChange: (next: MenuFilters) => void
}

// 'all' is the only way back to retired/archived dishes, since 'yes' is the
// default the page opens with — it must stay visible in the dropdown.
const AVAILABLE_OPTS: FilterChipOption<AvailableFilter>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'all', label: 'All (incl. retired)' },
]

const LOYVERSE_OPTS: FilterChipOption<'synced' | 'unsynced'>[] = [
  { value: 'synced', label: 'Synced (pushed)' },
  { value: 'unsynced', label: 'Not synced' },
]

const FLAG_OPTS: FilterChipOption<FlagKey>[] = [
  { value: 'no-photo', label: 'No photo' },
  { value: 'no-kbju', label: 'No macros' },
  { value: 'no-bom', label: 'No BOM' },
  { value: 'draft', label: 'Draft (no price)' },
]

export function FilterBar({ filters, categories, categoryCounts, onChange }: FilterBarProps) {
  const catOpts: FilterChipOption<string>[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    count: categoryCounts.get(c.id),
  }))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        label="Categories"
        options={catOpts}
        selectedValues={filters.categoryIds}
        onChange={(v) => onChange({ ...filters, categoryIds: v })}
      />
      <FilterChip<AvailableFilter>
        label="Available"
        mode="single"
        options={AVAILABLE_OPTS}
        selectedValues={[filters.available]}
        onChange={(v) => onChange({ ...filters, available: v[0] ?? DEFAULT_AVAILABLE })}
      />
      <FilterChip<'synced' | 'unsynced'>
        label="Loyverse"
        mode="single"
        options={LOYVERSE_OPTS}
        selectedValues={filters.loyverse ? [filters.loyverse] : []}
        onChange={(v) => onChange({ ...filters, loyverse: (v[0] ?? null) as LoyverseFilter })}
      />
      <FilterChip<FlagKey>
        label="Flags"
        options={FLAG_OPTS}
        selectedValues={filters.flags}
        onChange={(v) => onChange({ ...filters, flags: v })}
      />
      {isNonDefault(filters) && (
        <button
          type="button"
          onClick={() => onChange(defaultFilters())}
          className="text-xs text-cream/50 underline-offset-2 hover:text-cream hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
