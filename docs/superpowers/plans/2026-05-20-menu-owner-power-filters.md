# Owner Power Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-category strip in /menu Owner view with a multi-chip filter bar (Categories multi-select, Available tri-state, Loyverse sync tri-state, Flags multi-select), and fix header stats to reflect the active filter.

**Architecture:** All filter state lives in URL params. A new `useMenuFilters` hook is the single read/write point. `MenuPage` pre-filters items once, passes filtered set + stats down to view components. L1/L2/Customer views keep their single-category strip behavior (out of scope for v1). No DB changes — `loyverse_id` is already on `nomenclature`, just needs to be exposed in the data hook.

**Tech Stack:** Vite + React 19 + React Router 7 + Tailwind v4 + Supabase JS + TypeScript strict + Vitest. No new deps.

**Spec:** [docs/superpowers/specs/2026-05-20-menu-owner-power-filters-design.md](../specs/2026-05-20-menu-owner-power-filters-design.md)

---

## File Map

**Create:**
- `apps/admin-panel/src/pages/menu/hooks/useMenuFilters.ts` — URL ↔ MenuFilters state + `applyFilters` pure helper
- `apps/admin-panel/src/pages/menu/hooks/useMenuFilters.test.ts` — unit tests
- `apps/admin-panel/src/components/menu/owner/FilterChip.tsx` — single popover chip primitive
- `apps/admin-panel/src/components/menu/owner/FilterChip.test.ts` — smoke
- `apps/admin-panel/src/components/menu/owner/FilterBar.tsx` — assembles 4 chips
- `apps/admin-panel/src/components/menu/owner/FilterBar.test.ts` — integration

**Modify:**
- `apps/admin-panel/src/hooks/useMenuData.ts` — surface `loyverse_id` field on items
- `apps/admin-panel/src/pages/menu/MenuPage.tsx` — use `useMenuFilters`; replace cat strip in Owner view with `FilterBar`; pre-filter items; recompute header stats from filtered set; keep L1/L2/Customer single-select strip as today

---

## Task 1: Add `loyverse_id` to the menu data hook

**Files:**
- Modify: `apps/admin-panel/src/hooks/useMenuData.ts:80-220`

- [ ] **Step 1: Add type field**

Edit the item type around line 82 — add `loyverse_id` after `is_available`:

```ts
  is_available: boolean
  is_featured: boolean
  image_url: string | null
  loyverse_id: string | null   // NEW
  calories: number | string | null
```

- [ ] **Step 2: Add to Supabase SELECT**

Around line 138 — add `loyverse_id` to the select column list:

```ts
          is_available, is_featured, image_url, loyverse_id,
          calories, protein, carbs, fat,
```

- [ ] **Step 3: Add to row mapper**

Around line 215 — set the new field:

```ts
        image_url: raw.image_url,
        loyverse_id: raw.loyverse_id ?? null,
        calories: raw.calories != null ? Number(raw.calories) : null,
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/admin-panel && pnpm tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel/src/hooks/useMenuData.ts
git commit -m "feat(menu): expose nomenclature.loyverse_id in menu data hook"
```

---

## Task 2: Create `useMenuFilters` hook (URL ↔ state + apply)

**Files:**
- Create: `apps/admin-panel/src/pages/menu/hooks/useMenuFilters.ts`
- Test: `apps/admin-panel/src/pages/menu/hooks/useMenuFilters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `useMenuFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseFiltersFromParams, serializeFilters, applyFilters, type MenuFilters, type FilteredItem } from './useMenuFilters'

const item = (over: Partial<FilteredItem> = {}): FilteredItem => ({
  id: 'i1',
  category_id: 'c1',
  is_available: true,
  loyverse_id: 'lv-1',
  image_url: 'http://x/y.jpg',
  calories: 100,
  price: 89,
  hasBom: true,
  ...over,
})

describe('parseFiltersFromParams', () => {
  it('returns empty defaults when no params', () => {
    const f = parseFiltersFromParams(new URLSearchParams(''))
    expect(f).toEqual({ categoryIds: [], available: null, loyverse: null, flags: [] })
  })

  it('parses single cat (back-compat)', () => {
    const f = parseFiltersFromParams(new URLSearchParams('cat=c1'))
    expect(f.categoryIds).toEqual(['c1'])
  })

  it('parses comma-separated cats', () => {
    const f = parseFiltersFromParams(new URLSearchParams('cat=c1,c2,c3'))
    expect(f.categoryIds).toEqual(['c1', 'c2', 'c3'])
  })

  it('parses available + loyverse + flags', () => {
    const f = parseFiltersFromParams(new URLSearchParams('available=yes&loyverse=unsynced&flags=no-photo,draft'))
    expect(f.available).toBe('yes')
    expect(f.loyverse).toBe('unsynced')
    expect(f.flags).toEqual(['no-photo', 'draft'])
  })

  it('ignores unknown values', () => {
    const f = parseFiltersFromParams(new URLSearchParams('available=maybe&flags=junk'))
    expect(f.available).toBeNull()
    expect(f.flags).toEqual([])
  })
})

describe('serializeFilters', () => {
  it('omits empty values for clean URLs', () => {
    const out = serializeFilters({ categoryIds: [], available: null, loyverse: null, flags: [] })
    expect(out).toEqual({ cat: null, available: null, loyverse: null, flags: null })
  })

  it('joins multi values with comma', () => {
    const out = serializeFilters({ categoryIds: ['c1', 'c2'], available: 'yes', loyverse: 'synced', flags: ['no-photo'] })
    expect(out.cat).toBe('c1,c2')
    expect(out.flags).toBe('no-photo')
  })
})

describe('applyFilters', () => {
  it('returns all when no filter active', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    expect(applyFilters(items, { categoryIds: [], available: null, loyverse: null, flags: [] })).toHaveLength(2)
  })

  it('cat = OR within group', () => {
    const items = [item({ id: 'a', category_id: 'c1' }), item({ id: 'b', category_id: 'c2' }), item({ id: 'c', category_id: 'c3' })]
    const out = applyFilters(items, { categoryIds: ['c1', 'c2'], available: null, loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('available=yes filters out unavailable', () => {
    const items = [item({ id: 'a', is_available: true }), item({ id: 'b', is_available: false })]
    const out = applyFilters(items, { categoryIds: [], available: 'yes', loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('loyverse=unsynced filters to null loyverse_id', () => {
    const items = [item({ id: 'a', loyverse_id: 'lv-1' }), item({ id: 'b', loyverse_id: null })]
    const out = applyFilters(items, { categoryIds: [], available: null, loyverse: 'unsynced', flags: [] })
    expect(out.map((i) => i.id)).toEqual(['b'])
  })

  it('flags OR within group', () => {
    const items = [
      item({ id: 'a', image_url: null }),            // no-photo
      item({ id: 'b', calories: null }),             // no-kbju
      item({ id: 'c' }),                              // matches neither
    ]
    const out = applyFilters(items, { categoryIds: [], available: null, loyverse: null, flags: ['no-photo', 'no-kbju'] })
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('AND across groups', () => {
    const items = [
      item({ id: 'a', category_id: 'c1', is_available: true }),
      item({ id: 'b', category_id: 'c1', is_available: false }),
      item({ id: 'c', category_id: 'c2', is_available: true }),
    ]
    const out = applyFilters(items, { categoryIds: ['c1'], available: 'yes', loyverse: null, flags: [] })
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('draft flag matches null/zero price', () => {
    const items = [item({ id: 'a', price: 89 }), item({ id: 'b', price: null }), item({ id: 'c', price: 0 })]
    const out = applyFilters(items, { categoryIds: [], available: null, loyverse: null, flags: ['draft'] })
    expect(out.map((i) => i.id)).toEqual(['b', 'c'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/admin-panel && pnpm vitest run src/pages/menu/hooks/useMenuFilters.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the hook**

Create `useMenuFilters.ts`:

```ts
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export type AvailableFilter = 'yes' | 'no' | null
export type LoyverseFilter = 'synced' | 'unsynced' | null
export type FlagKey = 'no-photo' | 'no-kbju' | 'no-bom' | 'draft'

export interface MenuFilters {
  categoryIds: string[]
  available: AvailableFilter
  loyverse: LoyverseFilter
  flags: FlagKey[]
}

export interface FilteredItem {
  id: string
  category_id: string | null
  is_available: boolean
  loyverse_id: string | null
  image_url: string | null
  calories: number | null
  price: number | null
  hasBom: boolean
}

const KNOWN_FLAGS: readonly FlagKey[] = ['no-photo', 'no-kbju', 'no-bom', 'draft']

export function parseFiltersFromParams(params: URLSearchParams): MenuFilters {
  const catRaw = params.get('cat')
  const categoryIds = catRaw ? catRaw.split(',').filter(Boolean) : []

  const availableRaw = params.get('available')
  const available: AvailableFilter =
    availableRaw === 'yes' || availableRaw === 'no' ? availableRaw : null

  const loyverseRaw = params.get('loyverse')
  const loyverse: LoyverseFilter =
    loyverseRaw === 'synced' || loyverseRaw === 'unsynced' ? loyverseRaw : null

  const flagsRaw = params.get('flags')
  const flags: FlagKey[] = flagsRaw
    ? (flagsRaw.split(',').filter((f) => (KNOWN_FLAGS as readonly string[]).includes(f)) as FlagKey[])
    : []

  return { categoryIds, available, loyverse, flags }
}

export function serializeFilters(f: MenuFilters): Record<string, string | null> {
  return {
    cat: f.categoryIds.length ? f.categoryIds.join(',') : null,
    available: f.available,
    loyverse: f.loyverse,
    flags: f.flags.length ? f.flags.join(',') : null,
  }
}

export function applyFilters<T extends FilteredItem>(items: T[], f: MenuFilters): T[] {
  return items.filter((item) => {
    if (f.categoryIds.length > 0) {
      if (!item.category_id || !f.categoryIds.includes(item.category_id)) return false
    }
    if (f.available === 'yes' && !item.is_available) return false
    if (f.available === 'no' && item.is_available) return false
    if (f.loyverse === 'synced' && !item.loyverse_id) return false
    if (f.loyverse === 'unsynced' && item.loyverse_id) return false
    if (f.flags.length > 0) {
      const matches = f.flags.some((flag) => {
        if (flag === 'no-photo') return !item.image_url
        if (flag === 'no-kbju') return item.calories == null
        if (flag === 'no-bom') return !item.hasBom
        if (flag === 'draft') return !item.price
        return false
      })
      if (!matches) return false
    }
    return true
  })
}

export function useMenuFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams])

  const setFilters = useCallback(
    (next: MenuFilters) => {
      const patch = serializeFilters(next)
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') out.delete(k)
            else out.set(k, v)
          }
          return out
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const activeCount = useMemo(
    () =>
      filters.categoryIds.length +
      (filters.available ? 1 : 0) +
      (filters.loyverse ? 1 : 0) +
      filters.flags.length,
    [filters],
  )

  const clearAll = useCallback(() => {
    setFilters({ categoryIds: [], available: null, loyverse: null, flags: [] })
  }, [setFilters])

  return { filters, setFilters, activeCount, clearAll }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd apps/admin-panel && pnpm vitest run src/pages/menu/hooks/useMenuFilters.test.ts`
Expected: PASS, all assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel/src/pages/menu/hooks/useMenuFilters.ts apps/admin-panel/src/pages/menu/hooks/useMenuFilters.test.ts
git commit -m "feat(menu): add useMenuFilters hook with URL state + applyFilters helper"
```

---

## Task 3: Create `FilterChip` primitive

**Files:**
- Create: `apps/admin-panel/src/components/menu/owner/FilterChip.tsx`
- Test: `apps/admin-panel/src/components/menu/owner/FilterChip.test.ts`

- [ ] **Step 1: Write smoke test**

Create `FilterChip.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterChip, type FilterChipOption } from './FilterChip'

const opts: FilterChipOption<string>[] = [
  { value: 'a', label: 'Alpha', count: 3 },
  { value: 'b', label: 'Beta', count: 1 },
]

describe('FilterChip', () => {
  it('renders label and active count badge', () => {
    render(<FilterChip label="Cats" options={opts} selectedValues={['a']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Cats/ })).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument() // active count badge
  })

  it('toggles option on click in multi mode', () => {
    let selected: string[] = []
    const handler = (v: string[]) => { selected = v }
    render(<FilterChip label="Cats" options={opts} selectedValues={[]} onChange={handler} />)
    fireEvent.click(screen.getByRole('button', { name: /Cats/ }))
    fireEvent.click(screen.getByLabelText('Alpha'))
    expect(selected).toEqual(['a'])
  })

  it('single mode replaces value', () => {
    let selected: string[] = ['a']
    const handler = (v: string[]) => { selected = v }
    render(<FilterChip label="Avail" mode="single" options={opts} selectedValues={['a']} onChange={handler} />)
    fireEvent.click(screen.getByRole('button', { name: /Avail/ }))
    fireEvent.click(screen.getByLabelText('Beta'))
    expect(selected).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `cd apps/admin-panel && pnpm vitest run src/components/menu/owner/FilterChip.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement FilterChip**

Create `FilterChip.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

export interface FilterChipOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface FilterChipProps<T extends string> {
  label: string
  options: FilterChipOption<T>[]
  selectedValues: T[]
  onChange: (next: T[]) => void
  /** 'multi' (default) checkboxes; 'single' radio behavior */
  mode?: 'multi' | 'single'
}

export function FilterChip<T extends string>({
  label,
  options,
  selectedValues,
  onChange,
  mode = 'multi',
}: FilterChipProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeCount = selectedValues.length

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (v: T) => {
    if (mode === 'single') {
      onChange(selectedValues.includes(v) ? [] : [v])
    } else {
      onChange(
        selectedValues.includes(v)
          ? selectedValues.filter((s) => s !== v)
          : [...selectedValues, v],
      )
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          activeCount > 0
            ? 'border-forest-soft/40 bg-royal-green/25 text-forest-soft'
            : 'border-surface-3 bg-surface-1 text-cream/70 hover:text-cream'
        }`}
      >
        {label}
        {activeCount > 0 && (
          <span className="rounded-full bg-forest-soft/30 px-1.5 py-0.5 text-[10px] font-mono tabular-nums">
            {activeCount}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[200px] rounded-lg border border-surface-3 bg-surface-2 p-2 shadow-lg">
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {options.map((opt) => {
              const checked = selectedValues.includes(opt.value)
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-xs text-cream/80 hover:bg-surface-3"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type={mode === 'single' ? 'radio' : 'checkbox'}
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                      className="h-3.5 w-3.5 accent-forest-soft"
                    />
                    {opt.label}
                  </span>
                  {opt.count != null && (
                    <span className="font-mono text-[10px] tabular-nums opacity-50">
                      {opt.count}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-[11px] text-cream/50 hover:bg-surface-3 hover:text-cream"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/admin-panel && pnpm vitest run src/components/menu/owner/FilterChip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel/src/components/menu/owner/FilterChip.tsx apps/admin-panel/src/components/menu/owner/FilterChip.test.ts
git commit -m "feat(menu): add FilterChip primitive (popover multi/single select)"
```

---

## Task 4: Create `FilterBar` composing 4 chips

**Files:**
- Create: `apps/admin-panel/src/components/menu/owner/FilterBar.tsx`
- Test: `apps/admin-panel/src/components/menu/owner/FilterBar.test.ts`

- [ ] **Step 1: Write integration test**

Create `FilterBar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from './FilterBar'
import type { MenuFilters } from '../../../pages/menu/hooks/useMenuFilters'

const categories = [
  { id: 'c1', name: 'Manaish' },
  { id: 'c2', name: 'Salads' },
]
const counts = new Map<string | null, number>([[null, 10], ['c1', 6], ['c2', 4]])
const empty: MenuFilters = { categoryIds: [], available: null, loyverse: null, flags: [] }

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
    fireEvent.click(screen.getByLabelText('Yes'))
    expect(observed).toEqual({ ...empty, available: 'yes' })
  })
})
```

- [ ] **Step 2: Run to fail**

Run: `cd apps/admin-panel && pnpm vitest run src/components/menu/owner/FilterBar.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement FilterBar**

Create `FilterBar.tsx`:

```tsx
import { FilterChip, type FilterChipOption } from './FilterChip'
import type { MenuFilters, AvailableFilter, LoyverseFilter, FlagKey } from '../../../pages/menu/hooks/useMenuFilters'
import type { MenuCategorySummary } from '../../menu/shared/types'

interface FilterBarProps {
  filters: MenuFilters
  categories: MenuCategorySummary[]
  categoryCounts: Map<string | null, number>
  onChange: (next: MenuFilters) => void
}

const AVAILABLE_OPTS: FilterChipOption<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
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

const hasAny = (f: MenuFilters) =>
  f.categoryIds.length > 0 || f.available !== null || f.loyverse !== null || f.flags.length > 0

export function FilterBar({ filters, categories, categoryCounts, onChange }: FilterBarProps) {
  const catOpts: FilterChipOption<string>[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    count: categoryCounts.get(c.id) ?? undefined,
  }))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        label="Categories"
        options={catOpts}
        selectedValues={filters.categoryIds}
        onChange={(v) => onChange({ ...filters, categoryIds: v })}
      />
      <FilterChip<'yes' | 'no'>
        label="Available"
        mode="single"
        options={AVAILABLE_OPTS}
        selectedValues={filters.available ? [filters.available] : []}
        onChange={(v) => onChange({ ...filters, available: (v[0] ?? null) as AvailableFilter })}
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
      {hasAny(filters) && (
        <button
          type="button"
          onClick={() =>
            onChange({ categoryIds: [], available: null, loyverse: null, flags: [] })
          }
          className="text-xs text-cream/50 underline-offset-2 hover:text-cream hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/admin-panel && pnpm vitest run src/components/menu/owner/FilterBar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel/src/components/menu/owner/FilterBar.tsx apps/admin-panel/src/components/menu/owner/FilterBar.test.ts
git commit -m "feat(menu): add FilterBar composing Categories/Available/Loyverse/Flags chips"
```

---

## Task 5: Wire FilterBar into MenuPage (replace cat strip in Owner view + fix stats)

**Files:**
- Modify: `apps/admin-panel/src/pages/menu/MenuPage.tsx`

- [ ] **Step 1: Replace single-cat URL read with hook**

In `MenuPage.tsx`, around line 77 — replace:

```ts
  const selectedCategory = searchParams.get('cat')
```

with imports + hook usage:

```ts
import { useMenuFilters, applyFilters } from './hooks/useMenuFilters'
import { FilterBar } from '../../components/menu/owner/FilterBar'
// ...inside MenuPage:
  const { filters, setFilters } = useMenuFilters()
  // Back-compat for L1/L2/Customer single-cat strip — derive single string|null
  const selectedCategory = filters.categoryIds[0] ?? null
  const setSelectedCategory = useCallback(
    (id: string | null) => setFilters({ ...filters, categoryIds: id ? [id] : [] }),
    [filters, setFilters],
  )
```

Delete the now-redundant `setSelectedCategory` defined earlier (around line 119-122).

- [ ] **Step 2: Augment item shape with hasBom for flag filter**

Around line 144, add a `hasBom` lookup using the existing `childrenByParent`:

```ts
  // Pre-compute hasBom per item id (for `no-bom` flag filter)
  const hasBomById = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const item of items) {
      m.set(item.id, (childrenByParent.get(item.id)?.length ?? 0) > 0)
    }
    return m
  }, [items, childrenByParent])
```

- [ ] **Step 3: Apply filters once at the page level**

Replace `typeFilteredItems` memo (around line 146-149) with a two-step compose:

```ts
  const typeFilteredItems = useMemo(() => {
    if (typeFilter === 'all') return items
    return items.filter((i) => i.kind === typeFilter || (i.isDualType && typeFilter === 'PF'))
  }, [items, typeFilter])

  // Apply user filters ONLY in Owner view; L1/L2/Customer keep their cat-strip
  const ownerFilteredItems = useMemo(() => {
    if (view !== 'owner') return typeFilteredItems
    return applyFilters(
      typeFilteredItems.map((i) => ({ ...i, hasBom: hasBomById.get(i.id) ?? false })),
      filters,
    )
  }, [typeFilteredItems, filters, view, hasBomById])

  // Filtered dishes (SALE only) for OwnerGallery
  const ownerFilteredDishes = useMemo(
    () => ownerFilteredItems.filter((i) => i.kind === 'SALE'),
    [ownerFilteredItems],
  )
```

- [ ] **Step 4: Recompute header stats from filtered set (fixes B2)**

Replace stats computation (lines 187-194):

```ts
  // Stats — for Owner view use filtered set; for others use full dishes (current behavior)
  const statsSource = view === 'owner' ? ownerFilteredItems : dishes
  const totalDishes = statsSource.length
  const availableCount = statsSource.filter((d) => d.is_available).length
  const featuredCount = statsSource.filter((d) => d.is_featured).length
  const fcDenom = statsSource.filter((d) => d.price && d.cost_per_unit).length || 1
  const avgFoodCost =
    statsSource.reduce((sum, d) => {
      if (!d.price || !d.cost_per_unit) return sum
      return sum + (d.cost_per_unit / d.price) * 100
    }, 0) / fcDenom
```

- [ ] **Step 5: Replace cat strip in Owner view block with FilterBar**

Find the block (lines 282-297):

```tsx
      {view === 'owner' && (
        <div className="flex flex-wrap items-center gap-3">
          <TypeFilter value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
          {categories.length > 0 && (
            <div className="flex-1 min-w-0">
              <CategoryTabs
                categories={categories}
                selectedId={selectedCategory}
                onSelect={setSelectedCategory}
                counts={categoryCounts}
              />
            </div>
          )}
        </div>
      )}
```

Replace with:

```tsx
      {view === 'owner' && (
        <div className="space-y-2">
          <TypeFilter value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
          <FilterBar
            filters={filters}
            categories={categories}
            categoryCounts={categoryCounts}
            onChange={setFilters}
          />
        </div>
      )}
```

Leave the L1/L2/Customer CategoryTabs block (lines 298-305) unchanged — single-select strip there is fine for v1.

- [ ] **Step 6: Pass filtered items to OwnerTable + OwnerGallery**

Find the OwnerTable render (lines 325-339), change `items={typeFilteredItems}` → `items={ownerFilteredItems}`. Same for `selectedCategory` — pass `null` so OwnerTable doesn't re-filter (already filtered by FilterBar):

```tsx
        <OwnerTable
          items={ownerFilteredItems}
          typeFilter={typeFilter}
          selectedCategory={null}
          subcategories={subcategories}
          childrenByParent={childrenByParent}
          dualTypeIds={dualTypeIds}
          onUpdate={inlineUpdate.commit}
          isFailed={inlineUpdate.isFailed}
          errorFor={inlineUpdate.errorFor}
          onOpenDrawer={openDrawer}
          autoExpandId={justCreatedId}
          grabMargins={grabMargins}
        />
```

Find OwnerGallery render (lines 340-346):

```tsx
        <OwnerGallery
          dishes={ownerFilteredDishes}
          selectedCategory={null}
          onUpdate={updateItem}
          onOpenDrawer={openDrawer}
        />
```

Leave L1CookView, L2AssemblerView, CustomerPreview renders untouched — they still take `selectedCategory` (string|null) which we derived above for back-compat.

- [ ] **Step 7: Typecheck + run all affected tests**

Run:
```bash
cd apps/admin-panel
pnpm tsc --noEmit
pnpm vitest run src/pages/menu/ src/components/menu/
```
Expected: 0 type errors, all tests pass.

- [ ] **Step 8: Smoke-test the page**

Start dev server (or visit prod):
```bash
cd apps/admin-panel && pnpm dev
```
Manual checklist (browse to /menu):
- Default load: no filter params → all items show (Owner/Sale).
- Click "Categories" chip → popover opens with all categories + counts.
- Tick Manaish + Salads → URL becomes `?cat=<id1>,<id2>`; both categories visible.
- Click "Available" → choose "Yes" → only `is_available=true` shows.
- Click "Loyverse" → choose "Not synced" → only items where `loyverse_id IS NULL` show.
- Header stats line updates to match filtered count.
- "Clear all" button appears when any active; resets URL params.
- Switch to L1 Cook view: FilterBar disappears; old cat strip still present (back-compat).
- Switch to PF tab — Owner stats line updates (B2 fixed).

- [ ] **Step 9: Commit**

```bash
git add apps/admin-panel/src/pages/menu/MenuPage.tsx
git commit -m "feat(menu): wire FilterBar into Owner view, fix header stats per filter"
```

---

## Task 6: Update MC tasks + push PR

**Files:**
- N/A (MC operations + git push)

- [ ] **Step 1: Push branch + create PR**

```bash
git push -u origin claude/strange-benz-271708
gh pr create --base main --title "feat(menu): owner power filters (multi-cat + available + loyverse + flags)" --body "$(cat <<'EOF'
## Summary
- Replace single-category strip in /menu Owner view with multi-chip FilterBar
- 4 new filters: Categories (multi), Available (tri-state), Loyverse sync (tri-state), Flags (no-photo/no-kbju/no-bom/draft)
- Fix header stats line (was always Sale totals) — now reflects active filter set in Owner view
- Expose `loyverse_id` in useMenuData hook

## Spec / plan
- docs/superpowers/specs/2026-05-20-menu-owner-power-filters-design.md
- docs/superpowers/plans/2026-05-20-menu-owner-power-filters.md

## MC tasks closed
- B2 header stats (18ab7fe9) — folded into this PR
- /menu UI audit parent (5a308946) — additional item delivered

## Test plan
- [x] Vitest passes for useMenuFilters + FilterChip + FilterBar
- [x] Manual smoke: open /menu, tick Categories=Manaish+Salads + Available=Yes, verify URL + visible set
- [ ] L1/L2/Customer views still navigate via single-cat strip (no regression)
- [ ] Reload preserves filter from URL
EOF
)"
```

- [ ] **Step 2: Close MC subsumed task**

After PR is merged, in a follow-up step (not part of this plan if not yet merged), update MC task `18ab7fe9` to `done` with PR number — and append a comment to parent task `5a308946` linking the PR.

```bash
# After merge:
gh pr view --json mergedAt,number   # confirm merged
# Then via MC MCP from next session:
# update_task(task_id="18ab7fe9...", status="done", notes="Subsumed by PR #N")
# add_comment(task_id="5a308946...", body="Power Filters epic delivered in PR #N")
```

---

## Self-Review Notes

- **Spec coverage:** All filter dimensions (cat multi, available, loyverse, flags) covered in Task 2 hook tests + Task 4 integration. Header stats fix in Task 5 Step 4. URL backward-compat for single `?cat=uuid` covered in Task 2 Step 1 test. Customer view filter-bar hidden — enforced by `view === 'owner'` guard in Task 5 Step 3. Out-of-scope items (bulk-edit, sort, presets) not mentioned — correct.
- **Placeholder scan:** None. All code blocks complete.
- **Type consistency:** `MenuFilters` interface stays the same across Tasks 2-5. `FilteredItem` only used inside `applyFilters`; MenuPage casts items to it at call site.
- **No new deps:** All Tailwind classes + lucide-react icons already in stack. Confirmed in CLAUDE.md.
