# Menu Card Phase 2 — Drawer UI + Owner View Extension

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tabbed DishDrawer (4 role tabs + Save & Verify) and extend the Owner table with version/verified/completeness indicators, consuming the Phase 1 data layer (migrations 179-190, 4 RPCs, 1 view).

**Architecture:** The drawer replaces the existing `DetailDrawer` (400px slide-in) with a wider (640px) tabbed panel. Each tab renders role-specific fields using dedicated data hooks that call Phase 1 RPCs. The Owner table gets 3 new columns showing card_version, last_verified, and a 4-dot completeness indicator. All edits go through `fn_dish_card_save` / `fn_pf_pack_card_save` RPCs with optimistic locking.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS v4, Supabase JS, lucide-react icons. No new dependencies.

**Branch:** `feature/admin/menu-card-phase2-drawer` (from `main`)

**NOT in scope (Phase 3):** L1 Cook list view, L2 Assembler list view, Customer view extension, photo upload (Storage bucket), Loyverse push button, per-role RLS.

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `src/hooks/useDishCard.ts` | Fetch `dish_card` row + `v_dish_assembly_components` for a SALE item |
| `src/hooks/useDishCard.test.ts` | Smoke test |
| `src/hooks/usePfPackCard.ts` | Fetch `pf_pack_card` row for a PF item |
| `src/hooks/usePfPackCard.test.ts` | Smoke test |
| `src/hooks/useAllergens.ts` | Call `fn_dish_allergens` RPC |
| `src/hooks/useAllergens.test.ts` | Smoke test |
| `src/hooks/useModifierOptions.ts` | Fetch `nomenclature_modifier_options` for a SALE item |
| `src/hooks/useModifierOptions.test.ts` | Smoke test |
| `src/hooks/useDishCardSave.ts` | Call `fn_dish_card_save` / `fn_pf_pack_card_save` RPCs with optimistic lock |
| `src/hooks/useDishCardSave.test.ts` | Smoke test |
| `src/components/menu/drawer/DishDrawer.tsx` | Tabbed drawer shell (640px) + Save & Verify button |
| `src/components/menu/drawer/DishDrawer.test.ts` | Smoke test |
| `src/components/menu/drawer/tabs/CustomerTab.tsx` | Customer-facing fields: descriptions, allergens, modifiers, ETA |
| `src/components/menu/drawer/tabs/CustomerTab.test.ts` | Smoke test |
| `src/components/menu/drawer/tabs/L1CookTab.tsx` | PF links + recipes_flow steps with CCP badges |
| `src/components/menu/drawer/tabs/L1CookTab.test.ts` | Smoke test |
| `src/components/menu/drawer/tabs/L2AssemblerTab.tsx` | dish_card fields: container, assembly order, merrychef, checks |
| `src/components/menu/drawer/tabs/L2AssemblerTab.test.ts` | Smoke test |
| `src/components/menu/drawer/tabs/OwnerTab.tsx` | Cost rollup + scorecard + version + TTC source |
| `src/components/menu/drawer/tabs/OwnerTab.test.ts` | Smoke test |
| `src/components/menu/drawer/sections/AssemblyOrderEditor.tsx` | JSONB array editor for `assembly_order` |
| `src/components/menu/drawer/sections/AssemblyOrderEditor.test.ts` | Smoke test |
| `src/components/menu/drawer/sections/MerrychefProgramForm.tsx` | `merrychef_program` JSONB form (temp_c + time_sec) |
| `src/components/menu/drawer/sections/MerrychefProgramForm.test.ts` | Smoke test |
| `src/components/menu/drawer/sections/AllergenBadges.tsx` | Read-only allergen badge row with origin labels |
| `src/components/menu/drawer/sections/AllergenBadges.test.ts` | Smoke test |
| `src/components/menu/drawer/sections/ModifierChips.tsx` | Read-only modifier chips with price delta |
| `src/components/menu/drawer/sections/ModifierChips.test.ts` | Smoke test |

### Modified files

| File | Changes |
|------|---------|
| `src/hooks/useMenuData.ts` | Add `card_version`, `last_verified_at`, `last_verified_by`, `pos_status`, `customer_description`, `customer_short_name`, `assembler_note`, `kitchen_note` to SELECT + `MenuItem` type |
| `src/pages/menu/MenuPage.tsx` | Replace `DetailDrawer` import with `DishDrawer`; pass save handler |
| `src/pages/menu/components/OwnerTable.tsx` | Add 3 columns: Version, Verified, Completeness |

---

## Task 1: Data hooks — useDishCard, usePfPackCard, useAllergens, useModifierOptions, useDishCardSave

**Files:**
- Create: `src/hooks/useDishCard.ts`
- Create: `src/hooks/useDishCard.test.ts`
- Create: `src/hooks/usePfPackCard.ts`
- Create: `src/hooks/usePfPackCard.test.ts`
- Create: `src/hooks/useAllergens.ts`
- Create: `src/hooks/useAllergens.test.ts`
- Create: `src/hooks/useModifierOptions.ts`
- Create: `src/hooks/useModifierOptions.test.ts`
- Create: `src/hooks/useDishCardSave.ts`
- Create: `src/hooks/useDishCardSave.test.ts`

All paths relative to `apps/admin-panel/`.

- [ ] **Step 1: Create `useDishCard.ts`**

```ts
// src/hooks/useDishCard.ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DishCardData {
  nomenclature_id: string
  container_l2: string | null
  assembly_order: { step: number; text: string }[] | null
  pre_merrychef_prep: string | null
  post_merrychef_check: string | null
  cold_addons_after_reheat: string | null
  has_cutlery: boolean
  has_lid_sticker: boolean
  assembler_photo_url: string | null
  customer_eta_min: number | null
  composition_override: string | null
}

export interface AssemblyComponent {
  dish_id: string
  component_id: string
  component_code: string
  component_name: string
  component_type: string
  qty_per_portion: number
  base_unit: string | null
  slot: string | null
  notes: string | null
}

export interface UseDishCardResult {
  card: DishCardData | null
  components: AssemblyComponent[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useDishCard(dishId: string | null): UseDishCardResult {
  const [card, setCard] = useState<DishCardData | null>(null)
  const [components, setComponents] = useState<AssemblyComponent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!dishId) { setCard(null); setComponents([]); return }
    setIsLoading(true)
    setError(null)

    const [cardRes, compRes] = await Promise.all([
      supabase
        .from('dish_card')
        .select('*')
        .eq('nomenclature_id', dishId)
        .maybeSingle(),
      supabase
        .from('v_dish_assembly_components')
        .select('*')
        .eq('dish_id', dishId),
    ])

    if (cardRes.error) { setError(cardRes.error.message); setIsLoading(false); return }
    if (compRes.error) { setError(compRes.error.message); setIsLoading(false); return }

    setCard(cardRes.data as DishCardData | null)
    setComponents((compRes.data ?? []) as AssemblyComponent[])
    setIsLoading(false)
  }, [dishId])

  useEffect(() => { fetch() }, [fetch])

  return { card, components, isLoading, error, refetch: fetch }
}
```

- [ ] **Step 2: Create `useDishCard.test.ts`**

```ts
// src/hooks/useDishCard.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}))

describe('useDishCard', () => {
  it('exports useDishCard hook', async () => {
    const mod = await import('./useDishCard')
    expect(mod.useDishCard).toBeDefined()
    expect(typeof mod.useDishCard).toBe('function')
  })
})
```

- [ ] **Step 3: Create `usePfPackCard.ts`**

```ts
// src/hooks/usePfPackCard.ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PfPackCardData {
  nomenclature_id: string
  batch_input_qty: number | null
  batch_input_uom: string | null
  portions_per_batch: number | null
  portion_weight_g: number | null
  vacuum_bag_size: string | null
  fill_weight_per_bag_g: number | null
  portions_per_bag: number | null
  label_template: { fields: string[] } | null
  shelf_life_days: number | null
  storage_zone: string | null
  storage_temp_min_c: number | null
  storage_temp_max_c: number | null
  kitchen_photo_url: string | null
}

export interface UsePfPackCardResult {
  card: PfPackCardData | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function usePfPackCard(pfId: string | null): UsePfPackCardResult {
  const [card, setCard] = useState<PfPackCardData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!pfId) { setCard(null); return }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('pf_pack_card')
      .select('*')
      .eq('nomenclature_id', pfId)
      .maybeSingle()
    if (err) { setError(err.message); setIsLoading(false); return }
    setCard(data as PfPackCardData | null)
    setIsLoading(false)
  }, [pfId])

  useEffect(() => { fetch() }, [fetch])

  return { card, isLoading, error, refetch: fetch }
}
```

- [ ] **Step 4: Create `usePfPackCard.test.ts`**

```ts
// src/hooks/usePfPackCard.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}))

describe('usePfPackCard', () => {
  it('exports usePfPackCard hook', async () => {
    const mod = await import('./usePfPackCard')
    expect(mod.usePfPackCard).toBeDefined()
    expect(typeof mod.usePfPackCard).toBe('function')
  })
})
```

- [ ] **Step 5: Create `useAllergens.ts`**

```ts
// src/hooks/useAllergens.ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface UseAllergensResult {
  /** Sorted array of allergen slugs (e.g. ['allergen-dairy', 'allergen-gluten']). */
  allergens: string[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** Strips 'allergen-' prefix for display: 'allergen-gluten' → 'Gluten'. */
export function allergenDisplayName(slug: string): string {
  const raw = slug.replace(/^allergen-/, '')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function useAllergens(dishId: string | null): UseAllergensResult {
  const [allergens, setAllergens] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!dishId) { setAllergens([]); return }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('fn_dish_allergens', {
      p_dish_id: dishId,
    })
    if (err) { setError(err.message); setIsLoading(false); return }
    setAllergens((data as string[] | null) ?? [])
    setIsLoading(false)
  }, [dishId])

  useEffect(() => { fetch() }, [fetch])

  return { allergens, isLoading, error, refetch: fetch }
}
```

- [ ] **Step 6: Create `useAllergens.test.ts`**

```ts
// src/hooks/useAllergens.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}))

describe('useAllergens', () => {
  it('exports useAllergens hook and allergenDisplayName', async () => {
    const mod = await import('./useAllergens')
    expect(mod.useAllergens).toBeDefined()
    expect(mod.allergenDisplayName('allergen-gluten')).toBe('Gluten')
    expect(mod.allergenDisplayName('allergen-dairy')).toBe('Dairy')
  })
})
```

- [ ] **Step 7: Create `useModifierOptions.ts`**

```ts
// src/hooks/useModifierOptions.ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface ModifierOption {
  id: string
  dish_id: string
  modifier_id: string
  modifier_name: string
  modifier_code: string
  price_delta: number
  is_default: boolean
  sort_order: number
}

export interface UseModifierOptionsResult {
  modifiers: ModifierOption[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useModifierOptions(dishId: string | null): UseModifierOptionsResult {
  const [modifiers, setModifiers] = useState<ModifierOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!dishId) { setModifiers([]); return }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('nomenclature_modifier_options')
      .select(`
        id, dish_id, modifier_id, price_delta, is_default, sort_order,
        nomenclature!modifier_id(name, product_code)
      `)
      .eq('dish_id', dishId)
      .order('sort_order', { ascending: true })
    if (err) { setError(err.message); setIsLoading(false); return }

    const rows: ModifierOption[] = ((data ?? []) as unknown as Array<{
      id: string; dish_id: string; modifier_id: string;
      price_delta: number | string; is_default: boolean; sort_order: number;
      nomenclature: { name: string; product_code: string } | null
    }>).map((r) => ({
      id: r.id,
      dish_id: r.dish_id,
      modifier_id: r.modifier_id,
      modifier_name: r.nomenclature?.name ?? 'Unknown',
      modifier_code: r.nomenclature?.product_code ?? '',
      price_delta: Number(r.price_delta),
      is_default: r.is_default,
      sort_order: r.sort_order,
    }))
    setModifiers(rows)
    setIsLoading(false)
  }, [dishId])

  useEffect(() => { fetch() }, [fetch])

  return { modifiers, isLoading, error, refetch: fetch }
}
```

- [ ] **Step 8: Create `useModifierOptions.test.ts`**

```ts
// src/hooks/useModifierOptions.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('useModifierOptions', () => {
  it('exports useModifierOptions hook', async () => {
    const mod = await import('./useModifierOptions')
    expect(mod.useModifierOptions).toBeDefined()
    expect(typeof mod.useModifierOptions).toBe('function')
  })
})
```

- [ ] **Step 9: Create `useDishCardSave.ts`**

```ts
// src/hooks/useDishCardSave.ts
import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DishCardSavePayload {
  expected_version: number
  customer_description?: string
  customer_short_name?: string
  customer_photo_url?: string
  assembler_note?: string
  merrychef_program?: { temp_c: number; time_sec: number } | null
  ttc_source_url?: string
  dish_card?: {
    container_l2?: string
    assembly_order?: { step: number; text: string }[]
    pre_merrychef_prep?: string
    post_merrychef_check?: string
    cold_addons_after_reheat?: string
    has_cutlery?: boolean
    has_lid_sticker?: boolean
    customer_eta_min?: number
    composition_override?: string
  }
}

export interface PfPackCardSavePayload {
  expected_version: number
  kitchen_note?: string
  ttc_source_url?: string
  pf_pack_card?: {
    batch_input_qty?: number
    batch_input_uom?: string
    portions_per_batch?: number
    portion_weight_g?: number
    vacuum_bag_size?: string
    fill_weight_per_bag_g?: number
    portions_per_bag?: number
    label_template?: { fields: string[] }
    shelf_life_days?: number
    storage_zone?: string
    storage_temp_min_c?: number
    storage_temp_max_c?: number
  }
}

export interface SaveResult {
  ok: boolean
  newVersion?: number
  error?: string
  conflict?: { current_version: number }
}

export interface UseDishCardSaveResult {
  saveDishCard: (dishId: string, payload: DishCardSavePayload) => Promise<SaveResult>
  savePfPackCard: (pfId: string, payload: PfPackCardSavePayload) => Promise<SaveResult>
  isSaving: boolean
}

export function useDishCardSave(): UseDishCardSaveResult {
  const [isSaving, setIsSaving] = useState(false)

  const saveDishCard = useCallback(async (dishId: string, payload: DishCardSavePayload): Promise<SaveResult> => {
    setIsSaving(true)
    const { data, error } = await supabase.rpc('fn_dish_card_save', {
      p_dish_id: dishId,
      p_payload: payload as unknown as Record<string, unknown>,
    })
    setIsSaving(false)
    if (error) return { ok: false, error: error.message }
    const result = data as { ok: boolean; new_version?: number; conflict?: { current_version: number }; error?: string }
    if (!result.ok) {
      if (result.conflict) return { ok: false, conflict: result.conflict }
      return { ok: false, error: result.error ?? 'Save failed' }
    }
    return { ok: true, newVersion: result.new_version }
  }, [])

  const savePfPackCard = useCallback(async (pfId: string, payload: PfPackCardSavePayload): Promise<SaveResult> => {
    setIsSaving(true)
    const { data, error } = await supabase.rpc('fn_pf_pack_card_save', {
      p_pf_id: pfId,
      p_payload: payload as unknown as Record<string, unknown>,
    })
    setIsSaving(false)
    if (error) return { ok: false, error: error.message }
    const result = data as { ok: boolean; new_version?: number; conflict?: { current_version: number }; error?: string }
    if (!result.ok) {
      if (result.conflict) return { ok: false, conflict: result.conflict }
      return { ok: false, error: result.error ?? 'Save failed' }
    }
    return { ok: true, newVersion: result.new_version }
  }, [])

  return { saveDishCard, savePfPackCard, isSaving }
}
```

- [ ] **Step 10: Create `useDishCardSave.test.ts`**

```ts
// src/hooks/useDishCardSave.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: { ok: true, new_version: 2 }, error: null }),
  },
}))

describe('useDishCardSave', () => {
  it('exports useDishCardSave hook', async () => {
    const mod = await import('./useDishCardSave')
    expect(mod.useDishCardSave).toBeDefined()
    expect(typeof mod.useDishCardSave).toBe('function')
  })
})
```

- [ ] **Step 11: Commit hooks**

```bash
git add apps/admin-panel/src/hooks/useDishCard.ts \
        apps/admin-panel/src/hooks/useDishCard.test.ts \
        apps/admin-panel/src/hooks/usePfPackCard.ts \
        apps/admin-panel/src/hooks/usePfPackCard.test.ts \
        apps/admin-panel/src/hooks/useAllergens.ts \
        apps/admin-panel/src/hooks/useAllergens.test.ts \
        apps/admin-panel/src/hooks/useModifierOptions.ts \
        apps/admin-panel/src/hooks/useModifierOptions.test.ts \
        apps/admin-panel/src/hooks/useDishCardSave.ts \
        apps/admin-panel/src/hooks/useDishCardSave.test.ts
git commit -m "feat(menu): add data hooks for dish card, pack card, allergens, modifiers, and save RPCs"
```

---

## Task 2: Extend useMenuData with card fields

**Files:**
- Modify: `apps/admin-panel/src/hooks/useMenuData.ts`
- Modify: `apps/admin-panel/src/hooks/useMenuDishes.ts` (type only)

- [ ] **Step 1: Extend `MenuItem` type in `useMenuData.ts`**

Add these fields to the `MenuItem` interface (after `isDualType`):

```ts
  card_version: number
  last_verified_at: string | null
  last_verified_by: string | null
  pos_status: 'draft' | 'approved' | 'synced'
  customer_description: string | null
  customer_short_name: string | null
  assembler_note: string | null
  kitchen_note: string | null
```

- [ ] **Step 2: Extend `RawNomenclatureRow` interface**

Add to `RawNomenclatureRow`:

```ts
  card_version: number
  last_verified_at: string | null
  last_verified_by: string | null
  pos_status: string
  customer_description: string | null
  customer_short_name: string | null
  assembler_note: string | null
  kitchen_note: string | null
```

- [ ] **Step 3: Update the SELECT in `fetchData`**

In the `supabase.from('nomenclature').select(...)` call, add the new columns:

```ts
        .select(`
          id, name, product_code, base_unit, price, cost_per_unit,
          is_available, is_featured, image_url,
          calories, protein, carbs, fat,
          portion_size, portion_unit, launch_phase,
          category_id,
          card_version, last_verified_at, last_verified_by, pos_status,
          customer_description, customer_short_name, assembler_note, kitchen_note,
          product_categories!category_id(id, code, name, sort_order)
        `)
```

- [ ] **Step 4: Map new fields into `MenuItem` in the loop**

Inside the `for (const raw of ...)` loop where `item: MenuItem` is constructed, add:

```ts
        card_version: raw.card_version ?? 1,
        last_verified_at: raw.last_verified_at,
        last_verified_by: raw.last_verified_by,
        pos_status: (raw.pos_status ?? 'draft') as 'draft' | 'approved' | 'synced',
        customer_description: raw.customer_description,
        customer_short_name: raw.customer_short_name,
        assembler_note: raw.assembler_note,
        kitchen_note: raw.kitchen_note,
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel/src/hooks/useMenuData.ts
git commit -m "feat(menu): extend useMenuData with card_version, pos_status, and description fields"
```

---

## Task 3: Drawer section components (AllergenBadges, ModifierChips, AssemblyOrderEditor, MerrychefProgramForm)

**Files:**
- Create: `src/components/menu/drawer/sections/AllergenBadges.tsx`
- Create: `src/components/menu/drawer/sections/AllergenBadges.test.ts`
- Create: `src/components/menu/drawer/sections/ModifierChips.tsx`
- Create: `src/components/menu/drawer/sections/ModifierChips.test.ts`
- Create: `src/components/menu/drawer/sections/AssemblyOrderEditor.tsx`
- Create: `src/components/menu/drawer/sections/AssemblyOrderEditor.test.ts`
- Create: `src/components/menu/drawer/sections/MerrychefProgramForm.tsx`
- Create: `src/components/menu/drawer/sections/MerrychefProgramForm.test.ts`

All paths relative to `apps/admin-panel/`.

- [ ] **Step 1: Create `AllergenBadges.tsx`**

```tsx
// src/components/menu/drawer/sections/AllergenBadges.tsx
import { AlertTriangle } from 'lucide-react'
import { allergenDisplayName } from '../../../../hooks/useAllergens'

interface AllergenBadgesProps {
  allergens: string[]
  isLoading: boolean
}

const ALLERGEN_COLORS: Record<string, string> = {
  'allergen-gluten': 'bg-amber-900/40 text-amber-300',
  'allergen-dairy': 'bg-sky-900/40 text-sky-300',
  'allergen-nuts': 'bg-orange-900/40 text-orange-300',
  'allergen-shellfish': 'bg-rose-900/40 text-rose-300',
  'allergen-soy': 'bg-lime-900/40 text-lime-300',
  'allergen-eggs': 'bg-yellow-900/40 text-yellow-300',
  'allergen-fish': 'bg-cyan-900/40 text-cyan-300',
  'allergen-sesame': 'bg-stone-800/60 text-stone-300',
}
const DEFAULT_ALLERGEN_COLOR = 'bg-slate-800 text-slate-300'

export function AllergenBadges({ allergens, isLoading }: AllergenBadgesProps) {
  if (isLoading) return <span className="text-xs text-cream/40">Loading allergens...</span>
  if (allergens.length === 0) return <span className="text-xs text-cream/40">No allergens detected</span>

  return (
    <div className="flex flex-wrap gap-1.5">
      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
      {allergens.map((slug) => (
        <span
          key={slug}
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${ALLERGEN_COLORS[slug] ?? DEFAULT_ALLERGEN_COLOR}`}
        >
          {allergenDisplayName(slug)}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `AllergenBadges.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('AllergenBadges', () => {
  it('exports AllergenBadges component', async () => {
    const mod = await import('./AllergenBadges')
    expect(mod.AllergenBadges).toBeDefined()
  })
})
```

- [ ] **Step 3: Create `ModifierChips.tsx`**

```tsx
// src/components/menu/drawer/sections/ModifierChips.tsx
import type { ModifierOption } from '../../../../hooks/useModifierOptions'

interface ModifierChipsProps {
  modifiers: ModifierOption[]
  isLoading: boolean
}

function formatDelta(delta: number): string {
  if (delta === 0) return ''
  return delta > 0 ? ` +฿${delta}` : ` -฿${Math.abs(delta)}`
}

export function ModifierChips({ modifiers, isLoading }: ModifierChipsProps) {
  if (isLoading) return <span className="text-xs text-cream/40">Loading modifiers...</span>
  if (modifiers.length === 0) return <span className="text-xs text-cream/40">No modifiers</span>

  return (
    <div className="flex flex-wrap gap-1.5">
      {modifiers.map((m) => (
        <span
          key={m.id}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            m.is_default
              ? 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)] ring-1 ring-inset ring-[var(--color-forest-soft)]/30'
              : 'bg-surface-3 text-cream/70'
          }`}
        >
          +{m.modifier_name}
          {m.price_delta !== 0 && (
            <span className="font-mono text-[9px] tabular-nums opacity-75">
              {formatDelta(m.price_delta)}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create `ModifierChips.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('ModifierChips', () => {
  it('exports ModifierChips component', async () => {
    const mod = await import('./ModifierChips')
    expect(mod.ModifierChips).toBeDefined()
  })
})
```

- [ ] **Step 5: Create `AssemblyOrderEditor.tsx`**

```tsx
// src/components/menu/drawer/sections/AssemblyOrderEditor.tsx
import { Plus, X, GripVertical } from 'lucide-react'

interface AssemblyStep {
  step: number
  text: string
}

interface AssemblyOrderEditorProps {
  steps: AssemblyStep[]
  onChange: (steps: AssemblyStep[]) => void
  readOnly?: boolean
}

export function AssemblyOrderEditor({ steps, onChange, readOnly }: AssemblyOrderEditorProps) {
  const addStep = () => {
    const next = [...steps, { step: steps.length + 1, text: '' }]
    onChange(next)
  }

  const removeStep = (idx: number) => {
    const next = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step: i + 1 }))
    onChange(next)
  }

  const updateText = (idx: number, text: string) => {
    const next = steps.map((s, i) => (i === idx ? { ...s, text } : s))
    onChange(next)
  }

  if (readOnly) {
    if (steps.length === 0) return <span className="text-xs text-cream/40">No assembly steps defined</span>
    return (
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.step} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-cream/50">
              {s.step}
            </span>
            <span className="text-cream/80">{s.text || <span className="text-cream/40 italic">empty</span>}</span>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <div className="space-y-2">
      {steps.map((s, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-cream/30" />
          <span className="shrink-0 font-mono text-[10px] text-cream/50 w-4 text-right">{s.step}</span>
          <input
            value={s.text}
            onChange={(e) => updateText(idx, e.target.value)}
            placeholder={`Step ${s.step}...`}
            className="flex-1 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-xs text-cream placeholder:text-cream/30 focus:border-forest-soft focus:outline-none"
          />
          <button
            type="button"
            onClick={() => removeStep(idx)}
            className="rounded p-0.5 text-cream/40 hover:bg-surface-3 hover:text-brick-soft"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addStep}
        className="flex items-center gap-1 rounded-lg border border-dashed border-surface-3 px-2.5 py-1 text-[10px] text-cream/50 transition hover:border-forest-soft/50 hover:text-forest-soft"
      >
        <Plus className="h-3 w-3" />
        Add step
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Create `AssemblyOrderEditor.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('AssemblyOrderEditor', () => {
  it('exports AssemblyOrderEditor component', async () => {
    const mod = await import('./AssemblyOrderEditor')
    expect(mod.AssemblyOrderEditor).toBeDefined()
  })
})
```

- [ ] **Step 7: Create `MerrychefProgramForm.tsx`**

```tsx
// src/components/menu/drawer/sections/MerrychefProgramForm.tsx
import { Thermometer, Timer } from 'lucide-react'

interface MerrychefProgram {
  temp_c: number
  time_sec: number
}

interface MerrychefProgramFormProps {
  program: MerrychefProgram | null
  onChange: (program: MerrychefProgram | null) => void
  readOnly?: boolean
}

export function MerrychefProgramForm({ program, onChange, readOnly }: MerrychefProgramFormProps) {
  if (readOnly) {
    if (!program) return <span className="text-xs text-amber-400/80">No Merrychef program defined</span>
    return (
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1 text-cream/80">
          <Thermometer className="h-3.5 w-3.5 text-brick-soft" />
          {program.temp_c} C
        </span>
        <span className="flex items-center gap-1 text-cream/80">
          <Timer className="h-3.5 w-3.5 text-amber-watch" />
          {program.time_sec}s ({Math.floor(program.time_sec / 60)}m {program.time_sec % 60}s)
        </span>
      </div>
    )
  }

  const tempC = program?.temp_c ?? ''
  const timeSec = program?.time_sec ?? ''

  const update = (field: 'temp_c' | 'time_sec', raw: string) => {
    const num = raw === '' ? null : Number(raw)
    if (num != null && isNaN(num)) return
    const next = {
      temp_c: field === 'temp_c' ? (num ?? 0) : (program?.temp_c ?? 0),
      time_sec: field === 'time_sec' ? (num ?? 0) : (program?.time_sec ?? 0),
    }
    if (next.temp_c === 0 && next.time_sec === 0) { onChange(null); return }
    onChange(next)
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-cream/60">
        <Thermometer className="h-3.5 w-3.5 text-brick-soft" />
        <input
          type="number"
          value={tempC}
          onChange={(e) => update('temp_c', e.target.value)}
          placeholder="C"
          min={0}
          max={300}
          className="w-16 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-xs text-cream text-right focus:border-forest-soft focus:outline-none"
        />
        <span>C</span>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-cream/60">
        <Timer className="h-3.5 w-3.5 text-amber-watch" />
        <input
          type="number"
          value={timeSec}
          onChange={(e) => update('time_sec', e.target.value)}
          placeholder="sec"
          min={0}
          className="w-16 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-xs text-cream text-right focus:border-forest-soft focus:outline-none"
        />
        <span>sec</span>
      </label>
    </div>
  )
}
```

- [ ] **Step 8: Create `MerrychefProgramForm.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('MerrychefProgramForm', () => {
  it('exports MerrychefProgramForm component', async () => {
    const mod = await import('./MerrychefProgramForm')
    expect(mod.MerrychefProgramForm).toBeDefined()
  })
})
```

- [ ] **Step 9: Commit sections**

```bash
git add apps/admin-panel/src/components/menu/drawer/
git commit -m "feat(menu): add drawer section components — AllergenBadges, ModifierChips, AssemblyOrderEditor, MerrychefProgramForm"
```

---

## Task 4: Drawer tab components (CustomerTab, L1CookTab, L2AssemblerTab, OwnerTab)

**Files:**
- Create: `src/components/menu/drawer/tabs/CustomerTab.tsx` + `.test.ts`
- Create: `src/components/menu/drawer/tabs/L1CookTab.tsx` + `.test.ts`
- Create: `src/components/menu/drawer/tabs/L2AssemblerTab.tsx` + `.test.ts`
- Create: `src/components/menu/drawer/tabs/OwnerTab.tsx` + `.test.ts`

All paths relative to `apps/admin-panel/`.

- [ ] **Step 1: Create `CustomerTab.tsx`**

```tsx
// src/components/menu/drawer/tabs/CustomerTab.tsx
import { NutritionBadges } from '../../shared/NutritionBadges'
import { AllergenBadges } from '../sections/AllergenBadges'
import { ModifierChips } from '../sections/ModifierChips'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishCardData } from '../../../../hooks/useDishCard'
import type { ModifierOption } from '../../../../hooks/useModifierOptions'

interface CustomerTabProps {
  item: MenuItem
  dishCard: DishCardData | null
  allergens: string[]
  allergensLoading: boolean
  modifiers: ModifierOption[]
  modifiersLoading: boolean
}

export function CustomerTab({
  item,
  dishCard,
  allergens,
  allergensLoading,
  modifiers,
  modifiersLoading,
}: CustomerTabProps) {
  const compositionText = dishCard?.composition_override ?? null

  return (
    <div className="space-y-6">
      {/* Customer short name */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">POS Display Name</h4>
        <p className="text-sm text-cream/80">
          {item.customer_short_name || <span className="italic text-cream/40">Not set (falls back to &quot;{item.name}&quot;)</span>}
        </p>
      </section>

      {/* Customer description */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Customer Description</h4>
        <p className="text-sm leading-relaxed text-cream/75">
          {item.customer_description || <span className="italic text-cream/40">No customer description</span>}
        </p>
      </section>

      {/* Allergens */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Allergens (from BOM tree)</h4>
        <AllergenBadges allergens={allergens} isLoading={allergensLoading} />
      </section>

      {/* Modifiers */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Modifier Options</h4>
        <ModifierChips modifiers={modifiers} isLoading={modifiersLoading} />
      </section>

      {/* Nutrition */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Nutrition</h4>
        <NutritionBadges
          calories={item.calories}
          protein={item.protein}
          carbs={item.carbs}
          fat={item.fat}
        />
      </section>

      {/* Composition */}
      {compositionText && (
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Composition (editorial)</h4>
          <p className="text-xs leading-relaxed text-cream/70">{compositionText}</p>
        </section>
      )}

      {/* ETA */}
      {dishCard?.customer_eta_min != null && (
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Estimated Wait</h4>
          <span className="inline-flex rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium text-cream/70">
            ~{dishCard.customer_eta_min} min
          </span>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `CustomerTab.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('CustomerTab', () => {
  it('exports CustomerTab component', async () => {
    const mod = await import('./CustomerTab')
    expect(mod.CustomerTab).toBeDefined()
  })
})
```

- [ ] **Step 3: Create `L1CookTab.tsx`**

This tab shows links to underlying PF items and their recipes_flow steps with CCP highlighting. For a SALE item, it shows the PF components from v_dish_assembly_components. For a PF item, it would show the pack card (but PF drawer is Phase 3 scope).

```tsx
// src/components/menu/drawer/tabs/L1CookTab.tsx
import { ChefHat, AlertTriangle, Package } from 'lucide-react'
import type { AssemblyComponent } from '../../../../hooks/useDishCard'
import type { MenuItem } from '../../../../hooks/useMenuData'

interface RecipeStep {
  id: string
  step_number: number
  operation_name: string
  duration_min: number | null
  internal_temp_c: number | null
  equipment_name: string | null
  notes: string | null
  is_ccp: boolean
  ccp_check_text: string | null
}

interface L1CookTabProps {
  item: MenuItem
  components: AssemblyComponent[]
  componentsLoading: boolean
  recipeSteps: RecipeStep[]
  recipeStepsLoading: boolean
}

export function L1CookTab({
  item,
  components,
  componentsLoading,
  recipeSteps,
  recipeStepsLoading,
}: L1CookTabProps) {
  const pfComponents = components.filter((c) => c.component_code.startsWith('PF-'))

  return (
    <div className="space-y-6">
      {/* Kitchen note */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Kitchen Note</h4>
        <p className="text-sm text-cream/75">
          {item.kitchen_note || <span className="italic text-cream/40">No kitchen note</span>}
        </p>
      </section>

      {/* Underlying PF components */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <Package className="inline h-3 w-3 mr-1" />
          PF Components
        </h4>
        {componentsLoading ? (
          <span className="text-xs text-cream/40">Loading...</span>
        ) : pfComponents.length === 0 ? (
          <span className="text-xs text-cream/40">No PF underlying (RAW + MOD only)</span>
        ) : (
          <ul className="space-y-1.5">
            {pfComponents.map((c) => (
              <li key={c.component_id} className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-[var(--color-amber-watch)]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[color:var(--color-amber-watch)]">
                  PF
                </span>
                <span className="text-cream/80">{c.component_name}</span>
                <span className="font-mono text-[10px] text-cream/40">
                  {c.qty_per_portion} {c.base_unit ?? ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recipe steps with CCP highlighting */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <ChefHat className="inline h-3 w-3 mr-1" />
          Recipe Steps
          {recipeSteps.some((s) => s.is_ccp) && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" />
              HACCP
            </span>
          )}
        </h4>
        {recipeStepsLoading ? (
          <span className="text-xs text-cream/40">Loading...</span>
        ) : recipeSteps.length === 0 ? (
          <span className="text-xs text-cream/40">No recipe steps defined</span>
        ) : (
          <ol className="space-y-2">
            {recipeSteps.map((s) => (
              <li
                key={s.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  s.is_ccp
                    ? 'border-amber-500/40 bg-amber-950/30'
                    : 'border-surface-3 bg-surface-2/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-cream/50">
                    {s.step_number}
                  </span>
                  <span className="font-medium text-cream/90">{s.operation_name}</span>
                  {s.is_ccp && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                      CCP
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-cream/50">
                  {s.duration_min != null && <span>{s.duration_min} min</span>}
                  {s.internal_temp_c != null && <span>{s.internal_temp_c} C</span>}
                  {s.equipment_name && <span>{s.equipment_name}</span>}
                </div>
                {s.is_ccp && s.ccp_check_text && (
                  <p className="mt-1.5 text-[10px] font-medium text-amber-300/80">
                    {s.ccp_check_text}
                  </p>
                )}
                {s.notes && <p className="mt-1 text-[10px] text-cream/50">{s.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Create `L1CookTab.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('L1CookTab', () => {
  it('exports L1CookTab component', async () => {
    const mod = await import('./L1CookTab')
    expect(mod.L1CookTab).toBeDefined()
  })
})
```

- [ ] **Step 5: Create `L2AssemblerTab.tsx`**

```tsx
// src/components/menu/drawer/tabs/L2AssemblerTab.tsx
import { Package, Utensils, StickyNote } from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishCardData, AssemblyComponent } from '../../../../hooks/useDishCard'
import { AssemblyOrderEditor } from '../sections/AssemblyOrderEditor'
import { MerrychefProgramForm } from '../sections/MerrychefProgramForm'

interface L2AssemblerTabProps {
  item: MenuItem
  dishCard: DishCardData | null
  components: AssemblyComponent[]
  isLoading: boolean
  /** Controlled form state — changes here are held until Save & Verify. */
  formCard: DishCardData | null
  onFormChange: (patch: Partial<DishCardData>) => void
}

export function L2AssemblerTab({
  item,
  dishCard,
  components,
  isLoading,
  formCard,
  onFormChange,
}: L2AssemblerTabProps) {
  if (isLoading) return <span className="text-xs text-cream/40">Loading assembler card...</span>

  const card = formCard ?? dishCard

  return (
    <div className="space-y-6">
      {/* Assembler note */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <StickyNote className="inline h-3 w-3 mr-1" />
          Assembler Note
        </h4>
        <textarea
          value={item.assembler_note ?? ''}
          readOnly
          rows={2}
          className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream/80 focus:border-forest-soft focus:outline-none"
          placeholder="No assembler note"
        />
      </section>

      {/* Container */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <Package className="inline h-3 w-3 mr-1" />
          Container (L2)
        </h4>
        <input
          value={card?.container_l2 ?? ''}
          onChange={(e) => onFormChange({ container_l2: e.target.value || null })}
          className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
          placeholder="e.g. paper_bowl_16oz, kraft_box"
        />
      </section>

      {/* Assembly order */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Assembly Order</h4>
        <AssemblyOrderEditor
          steps={card?.assembly_order ?? []}
          onChange={(steps) => onFormChange({ assembly_order: steps })}
        />
      </section>

      {/* Merrychef program */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Merrychef Program</h4>
        <MerrychefProgramForm
          program={item.merrychef_program as { temp_c: number; time_sec: number } | null ?? null}
          onChange={() => {}}
          readOnly
        />
      </section>

      {/* Pre/post Merrychef checks */}
      <div className="grid grid-cols-2 gap-3">
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Pre-Merrychef</h4>
          <input
            value={card?.pre_merrychef_prep ?? ''}
            onChange={(e) => onFormChange({ pre_merrychef_prep: e.target.value || null })}
            className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
            placeholder="Prep before reheat"
          />
        </section>
        <section className="space-y-1">
          <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Post-Merrychef</h4>
          <input
            value={card?.post_merrychef_check ?? ''}
            onChange={(e) => onFormChange({ post_merrychef_check: e.target.value || null })}
            className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
            placeholder="Check after reheat"
          />
        </section>
      </div>

      {/* Cold add-ons */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Cold Add-ons After Reheat</h4>
        <input
          value={card?.cold_addons_after_reheat ?? ''}
          onChange={(e) => onFormChange({ cold_addons_after_reheat: e.target.value || null })}
          className="w-full rounded border border-surface-3 bg-surface-2 px-2 py-1.5 text-xs text-cream focus:border-forest-soft focus:outline-none"
          placeholder="e.g. fresh herbs, sauce drizzle"
        />
      </section>

      {/* Toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-xs text-cream/70">
          <input
            type="checkbox"
            checked={card?.has_cutlery ?? false}
            onChange={(e) => onFormChange({ has_cutlery: e.target.checked })}
            className="rounded border-surface-3"
          />
          <Utensils className="h-3 w-3" />
          Include cutlery
        </label>
        <label className="flex items-center gap-2 text-xs text-cream/70">
          <input
            type="checkbox"
            checked={card?.has_lid_sticker ?? false}
            onChange={(e) => onFormChange({ has_lid_sticker: e.target.checked })}
            className="rounded border-surface-3"
          />
          Lid sticker
        </label>
      </div>

      {/* L2 Components (read-only, from view) */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Components per Portion</h4>
        {components.length === 0 ? (
          <span className="text-xs text-cream/40">No assembly components</span>
        ) : (
          <ul className="space-y-1">
            {components.map((c) => (
              <li key={c.component_id} className="flex items-center justify-between text-xs text-cream/70">
                <span>{c.component_name}</span>
                <span className="font-mono text-[10px] text-cream/50">
                  {c.qty_per_portion} {c.base_unit ?? ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 6: Create `L2AssemblerTab.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('L2AssemblerTab', () => {
  it('exports L2AssemblerTab component', async () => {
    const mod = await import('./L2AssemblerTab')
    expect(mod.L2AssemblerTab).toBeDefined()
  })
})
```

- [ ] **Step 7: Create `OwnerTab.tsx`**

```tsx
// src/components/menu/drawer/tabs/OwnerTab.tsx
import { Shield, ExternalLink, Hash } from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishScorecard } from '../../../../hooks/useDishScorecard'
import { DrawerScorecard } from '../../owner/DrawerScorecard'

interface OwnerTabProps {
  item: MenuItem
  scorecard: DishScorecard | null
  scorecardLoading: boolean
  scorecardError: string | null
}

function posStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
    case 'synced':
      return 'bg-sky-900/40 text-sky-300'
    default:
      return 'bg-surface-3 text-cream/60'
  }
}

export function OwnerTab({ item, scorecard, scorecardLoading, scorecardError }: OwnerTabProps) {
  return (
    <div className="space-y-6">
      {/* Version + Verified */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <Shield className="inline h-3 w-3 mr-1" />
          Card Version
        </h4>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-cream/70">
            <Hash className="h-2.5 w-2.5" />
            v{item.card_version}
          </span>
          {item.last_verified_at && (
            <span className="text-[10px] text-cream/40">
              verified {new Date(item.last_verified_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </section>

      {/* POS Status */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">POS Status</h4>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${posStatusBadge(item.pos_status)}`}>
          {item.pos_status}
        </span>
      </section>

      {/* Cost rollup */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Cost Rollup</h4>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.cost_per_unit != null ? `฿${item.cost_per_unit.toFixed(0)}` : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Cost</div>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.price != null ? `฿${item.price.toFixed(0)}` : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Price</div>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface-2/30 p-2 text-center">
            <div className="font-mono text-sm font-medium text-cream/90">
              {item.cost_per_unit != null && item.price != null && item.price > 0
                ? `${((item.cost_per_unit / item.price) * 100).toFixed(1)}%`
                : '-'}
            </div>
            <div className="text-[10px] text-cream/40">Food Cost</div>
          </div>
        </div>
      </section>

      {/* Scorecard */}
      <DrawerScorecard
        scorecard={scorecard}
        isLoading={scorecardLoading}
        error={scorecardError}
      />

      {/* TTC Source URL */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">TTC Source</h4>
        {item.ttc_source_url ? (
          <a
            href={item.ttc_source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-forest-soft hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Source link
          </a>
        ) : (
          <span className="text-xs text-cream/40">Not set</span>
        )}
      </section>
    </div>
  )
}
```

Note: `item.ttc_source_url` and `item.merrychef_program` are on `nomenclature` but not yet in the `MenuItem` type. We need to add them in Task 2's useMenuData extension. We'll add `ttc_source_url` and `merrychef_program` to the SELECT and type.

- [ ] **Step 8: Create `OwnerTab.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('OwnerTab', () => {
  it('exports OwnerTab component', async () => {
    const mod = await import('./OwnerTab')
    expect(mod.OwnerTab).toBeDefined()
  })
})
```

- [ ] **Step 9: Commit tabs**

```bash
git add apps/admin-panel/src/components/menu/drawer/tabs/
git commit -m "feat(menu): add drawer tab components — CustomerTab, L1CookTab, L2AssemblerTab, OwnerTab"
```

---

## Task 5: DishDrawer shell (tabbed drawer + Save & Verify)

**Files:**
- Create: `src/components/menu/drawer/DishDrawer.tsx`
- Create: `src/components/menu/drawer/DishDrawer.test.ts`

All paths relative to `apps/admin-panel/`.

- [ ] **Step 1: Create `DishDrawer.tsx`**

The drawer is 640px wide, has 4 tabs, fetches data via hooks, and exposes a Save & Verify button that calls the RPCs.

```tsx
// src/components/menu/drawer/DishDrawer.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import type { MenuItem } from '../../../hooks/useMenuData'
import { useDishCard } from '../../../hooks/useDishCard'
import type { DishCardData } from '../../../hooks/useDishCard'
import { useAllergens } from '../../../hooks/useAllergens'
import { useModifierOptions } from '../../../hooks/useModifierOptions'
import { useDishScorecard } from '../../../hooks/useDishScorecard'
import { useDishCardSave } from '../../../hooks/useDishCardSave'
import { useRecipeSteps } from '../../../hooks/useRecipeSteps'
import { DrawerHero } from '../owner/DrawerHero'
import { CustomerTab } from './tabs/CustomerTab'
import { L1CookTab } from './tabs/L1CookTab'
import { L2AssemblerTab } from './tabs/L2AssemblerTab'
import { OwnerTab } from './tabs/OwnerTab'

type DrawerTab = 'customer' | 'l1-cook' | 'l2-assembler' | 'owner'

const TABS: readonly { key: DrawerTab; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'l1-cook', label: 'L1 Cook' },
  { key: 'l2-assembler', label: 'L2 Assembler' },
  { key: 'owner', label: 'Owner' },
]

interface DishDrawerProps {
  item: MenuItem | null
  onClose: () => void
  onSaved?: () => void
  returnFocusToId?: string | null
}

export function DishDrawer({ item, onClose, onSaved, returnFocusToId }: DishDrawerProps) {
  const open = item != null
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [activeTab, setActiveTab] = useState<DrawerTab>('customer')
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  // Data hooks — all keyed to item.id (null when closed)
  const dishId = open ? item.id : null
  const isSale = item?.kind === 'SALE'
  const dishCard = useDishCard(isSale ? dishId : null)
  const allergens = useAllergens(isSale ? dishId : null)
  const modifiers = useModifierOptions(isSale ? dishId : null)
  const scorecard = useDishScorecard(dishId)
  const recipeSteps = useRecipeSteps(dishId)
  const { saveDishCard, isSaving } = useDishCardSave()

  // Local form state for L2 Assembler tab edits (held until Save)
  const [formCard, setFormCard] = useState<Partial<DishCardData> | null>(null)

  // Reset form when item changes
  useEffect(() => {
    setFormCard(null)
    setActiveTab('customer')
    setToast(null)
  }, [dishId])

  const onFormChange = useCallback((patch: Partial<DishCardData>) => {
    setFormCard((prev) => ({ ...(prev ?? {}), ...patch }))
  }, [])

  const isDirty = formCard != null && Object.keys(formCard).length > 0

  const handleSave = useCallback(async () => {
    if (!item || !isSale) return
    const mergedCard = { ...(dishCard.card ?? {}), ...formCard }
    const result = await saveDishCard(item.id, {
      expected_version: item.card_version,
      dish_card: {
        container_l2: mergedCard.container_l2 ?? undefined,
        assembly_order: mergedCard.assembly_order ?? undefined,
        pre_merrychef_prep: mergedCard.pre_merrychef_prep ?? undefined,
        post_merrychef_check: mergedCard.post_merrychef_check ?? undefined,
        cold_addons_after_reheat: mergedCard.cold_addons_after_reheat ?? undefined,
        has_cutlery: mergedCard.has_cutlery,
        has_lid_sticker: mergedCard.has_lid_sticker,
        customer_eta_min: mergedCard.customer_eta_min ?? undefined,
        composition_override: mergedCard.composition_override ?? undefined,
      },
    })
    if (result.ok) {
      setToast({ type: 'ok', text: `Saved v${result.newVersion}` })
      setFormCard(null)
      dishCard.refetch()
      onSaved?.()
    } else if (result.conflict) {
      setToast({ type: 'error', text: `Conflict: someone edited (v${result.conflict.current_version}). Reload.` })
    } else {
      setToast({ type: 'error', text: result.error ?? 'Save failed' })
    }
    setTimeout(() => setToast(null), 4000)
  }, [item, isSale, dishCard, formCard, saveDishCard, onSaved])

  // Focus management
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => closeButtonRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    }
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  // Restore focus on close
  useEffect(() => {
    if (!open && returnFocusToId) {
      const el = document.getElementById(`row-${returnFocusToId}`)
      const target = el?.querySelector<HTMLElement>('button, [tabindex]')
      target?.focus()
    }
  }, [open, returnFocusToId])

  if (!open) return null

  // Tab visibility: PF items hide Customer + L2 tabs
  const isPf = item.kind === 'PF'
  const visibleTabs = isPf
    ? TABS.filter((t) => t.key === 'l1-cook' || t.key === 'owner')
    : TABS

  // Ensure active tab is visible
  const resolvedTab = visibleTabs.find((t) => t.key === activeTab) ? activeTab : visibleTabs[0].key

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        style={{ animation: 'fade-in-up 160ms ease-out both' }}
      />
      <aside
        role="dialog"
        aria-label={`${item.name} card`}
        aria-modal="false"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[640px] flex-col border-l border-slate-800 bg-[var(--color-surface-1)] text-[color:var(--color-cream)] shadow-2xl"
        style={{ animation: 'drawer-slide-in 240ms cubic-bezier(0.32, 0.72, 0, 1) both' }}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800/80 px-5 py-3">
          <span
            className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-cream)]/60"
            style={{ fontFamily: 'var(--font-display-sc)' }}
          >
            Menu Card
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brick-soft)]/60"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Hero */}
        <div className="shrink-0 px-5 pt-4 pb-2">
          <DrawerHero item={item} />
        </div>

        {/* Tab strip */}
        <nav className="flex shrink-0 gap-0 border-b border-slate-800/80 px-5">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2 text-[11px] font-medium transition ${
                resolvedTab === t.key
                  ? 'border-b-2 border-[var(--color-forest-soft)] text-[color:var(--color-forest-soft)]'
                  : 'text-cream/50 hover:text-cream/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {resolvedTab === 'customer' && (
            <CustomerTab
              item={item}
              dishCard={dishCard.card}
              allergens={allergens.allergens}
              allergensLoading={allergens.isLoading}
              modifiers={modifiers.modifiers}
              modifiersLoading={modifiers.isLoading}
            />
          )}
          {resolvedTab === 'l1-cook' && (
            <L1CookTab
              item={item}
              components={dishCard.components}
              componentsLoading={dishCard.isLoading}
              recipeSteps={recipeSteps.steps}
              recipeStepsLoading={recipeSteps.isLoading}
            />
          )}
          {resolvedTab === 'l2-assembler' && (
            <L2AssemblerTab
              item={item}
              dishCard={dishCard.card}
              components={dishCard.components}
              isLoading={dishCard.isLoading}
              formCard={formCard ? { ...(dishCard.card ?? {} as DishCardData), ...formCard } : null}
              onFormChange={onFormChange}
            />
          )}
          {resolvedTab === 'owner' && (
            <OwnerTab
              item={item}
              scorecard={scorecard.scorecard}
              scorecardLoading={scorecard.isLoading}
              scorecardError={scorecard.error}
            />
          )}
        </div>

        {/* Footer: Save & Verify + toast */}
        <footer className="shrink-0 border-t border-slate-800/80 bg-[var(--color-surface-2)]/60 px-5 py-3">
          {toast && (
            <div
              className={`mb-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                toast.type === 'ok'
                  ? 'bg-[var(--color-royal-green)]/20 text-[color:var(--color-forest-soft)]'
                  : 'bg-[var(--color-royal-red)]/20 text-[color:var(--color-brick-soft)]'
              }`}
            >
              {toast.text}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-royal-green)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-forest-soft)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save & Verify
            </button>
          </div>
        </footer>
      </aside>
    </>
  )
}
```

**Important:** This component imports `useRecipeSteps` which does not exist yet. We need a simple hook that fetches `recipes_flow` for a dish. Add it as part of this task:

- [ ] **Step 2: Create `src/hooks/useRecipeSteps.ts`**

```ts
// src/hooks/useRecipeSteps.ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface RecipeStep {
  id: string
  step_number: number
  operation_name: string
  duration_min: number | null
  internal_temp_c: number | null
  equipment_name: string | null
  notes: string | null
  is_ccp: boolean
  ccp_check_text: string | null
}

export interface UseRecipeStepsResult {
  steps: RecipeStep[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useRecipeSteps(nomenclatureId: string | null): UseRecipeStepsResult {
  const [steps, setSteps] = useState<RecipeStep[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!nomenclatureId) { setSteps([]); return }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('recipes_flow')
      .select('id, step_number, operation_name, duration_min, internal_temp_c, equipment_name, notes, is_ccp, ccp_check_text')
      .eq('nomenclature_id', nomenclatureId)
      .order('step_number', { ascending: true })
    if (err) { setError(err.message); setIsLoading(false); return }
    setSteps((data ?? []) as RecipeStep[])
    setIsLoading(false)
  }, [nomenclatureId])

  useEffect(() => { fetch() }, [fetch])

  return { steps, isLoading, error, refetch: fetch }
}
```

- [ ] **Step 3: Create `src/hooks/useRecipeSteps.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('useRecipeSteps', () => {
  it('exports useRecipeSteps hook', async () => {
    const mod = await import('./useRecipeSteps')
    expect(mod.useRecipeSteps).toBeDefined()
  })
})
```

- [ ] **Step 4: Create `DishDrawer.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          order: () => Promise.resolve({ data: [], error: null }),
        }),
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
  },
}))

describe('DishDrawer', () => {
  it('exports DishDrawer component', async () => {
    const mod = await import('./DishDrawer')
    expect(mod.DishDrawer).toBeDefined()
    expect(typeof mod.DishDrawer).toBe('function')
  })
})
```

- [ ] **Step 5: Commit drawer shell + useRecipeSteps**

```bash
git add apps/admin-panel/src/components/menu/drawer/DishDrawer.tsx \
        apps/admin-panel/src/components/menu/drawer/DishDrawer.test.ts \
        apps/admin-panel/src/hooks/useRecipeSteps.ts \
        apps/admin-panel/src/hooks/useRecipeSteps.test.ts
git commit -m "feat(menu): add DishDrawer shell with 4-tab nav, Save & Verify, and useRecipeSteps hook"
```

---

## Task 6: Extend useMenuData with ttc_source_url + merrychef_program

**Files:**
- Modify: `apps/admin-panel/src/hooks/useMenuData.ts`

These two fields are referenced by OwnerTab and L2AssemblerTab but weren't included in Task 2.

- [ ] **Step 1: Add to `MenuItem` interface, `RawNomenclatureRow`, SELECT, and mapping**

Add to `MenuItem`:
```ts
  ttc_source_url: string | null
  merrychef_program: Record<string, unknown> | null
```

Add to `RawNomenclatureRow`:
```ts
  ttc_source_url: string | null
  merrychef_program: Record<string, unknown> | null
```

Add to SELECT string: `ttc_source_url, merrychef_program,`

Add to item mapping:
```ts
        ttc_source_url: raw.ttc_source_url,
        merrychef_program: raw.merrychef_program,
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin-panel/src/hooks/useMenuData.ts
git commit -m "feat(menu): add ttc_source_url and merrychef_program to MenuItem"
```

---

## Task 7: Owner table extensions (Version, Verified, Completeness)

**Files:**
- Modify: `apps/admin-panel/src/pages/menu/components/OwnerTable.tsx`

- [ ] **Step 1: Add 3 new column headers after the "Phase" column**

After the Phase `<th>` (line ~371), add:

```tsx
            <th role="columnheader" className="px-3 py-2.5 text-center">Version</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Verified</th>
            <th role="columnheader" className="px-3 py-2.5 text-center">Card</th>
```

Update `colSpan` values from `15` to `18` in all `<td colSpan={...}>` instances (L2 header, expanded card, BomChildRows).

- [ ] **Step 2: Add CompletenessIndicator helper**

Add this before the `OwnerTable` component:

```tsx
/** 4-dot card-completeness indicator.
 * Dots: customer (customer_description set), cook (kitchen_note set),
 * assembler (assembler_note set), HACCP (at least one CCP step — approximated
 * by non-null assembler_note for now; full check requires recipes_flow query
 * which is too expensive per-row). */
function CompletenessIndicator({ item }: { item: MenuItem }) {
  const dots = [
    { label: 'Customer', filled: !!item.customer_description },
    { label: 'Cook', filled: !!item.kitchen_note },
    { label: 'Assembler', filled: !!item.assembler_note },
    { label: 'POS', filled: item.pos_status !== 'draft' },
  ]
  return (
    <div className="flex items-center gap-1" title={dots.map(d => `${d.label}: ${d.filled ? 'OK' : 'empty'}`).join(', ')}>
      {dots.map((d) => (
        <span
          key={d.label}
          className={`inline-block h-2 w-2 rounded-full ${d.filled ? 'bg-forest-soft' : 'bg-surface-3'}`}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Add 3 new cells to the dish row**

After the Phase `<td>` (launch_phase select), before `</tr>`, add:

```tsx
                {/* Card version */}
                <td className="px-3 py-2 text-center">
                  <span className="font-mono text-[10px] tabular-nums text-cream/50">
                    v{dish.card_version}
                  </span>
                </td>

                {/* Last verified */}
                <td className="px-3 py-2 text-center">
                  {dish.last_verified_at ? (
                    <span className="text-[10px] text-cream/50" title={dish.last_verified_at}>
                      {new Date(dish.last_verified_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  ) : (
                    <span className="text-cream/30">&mdash;</span>
                  )}
                </td>

                {/* Completeness */}
                <td className="px-3 py-2 text-center">
                  <CompletenessIndicator item={dish} />
                </td>
```

- [ ] **Step 4: Add empty cells to BomChildRows**

In `BomChildRows`, the final `<td>` elements need 3 more:

```tsx
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5" />
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel/src/pages/menu/components/OwnerTable.tsx
git commit -m "feat(menu): add Version, Verified, and Card completeness columns to OwnerTable"
```

---

## Task 8: Wire DishDrawer into MenuPage

**Files:**
- Modify: `apps/admin-panel/src/pages/menu/MenuPage.tsx`

- [ ] **Step 1: Replace DetailDrawer import with DishDrawer**

Change:
```ts
import { DetailDrawer } from '../../components/menu/owner/DetailDrawer'
```
To:
```ts
import { DishDrawer } from '../../components/menu/drawer/DishDrawer'
```

- [ ] **Step 2: Replace DetailDrawer usage**

Replace the `<DetailDrawer ... />` block at the bottom of the JSX with:

```tsx
      <DishDrawer
        item={drawerItem}
        onClose={closeDrawer}
        onSaved={() => refetch()}
        returnFocusToId={drawerItem?.id ?? null}
      />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/admin-panel && npx tsc --noEmit`

Expected: no errors (or only pre-existing ones unrelated to menu/).

- [ ] **Step 4: Commit**

```bash
git add apps/admin-panel/src/pages/menu/MenuPage.tsx
git commit -m "feat(menu): wire DishDrawer into MenuPage, replacing DetailDrawer"
```

---

## Task 9: Verify & push

- [ ] **Step 1: Run full vitest suite to catch any import/type issues**

```bash
cd apps/admin-panel && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: all new `.test.ts` files pass (smoke export checks).

- [ ] **Step 2: Run TypeScript check**

```bash
cd apps/admin-panel && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors from menu/ files.

- [ ] **Step 3: Verify dev server builds**

```bash
cd apps/admin-panel && npx vite build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 4: Push branch + create PR**

```bash
git push -u origin feature/admin/menu-card-phase2-drawer
gh pr create --base main --title "feat(menu): Phase 2 — DishDrawer UI + Owner view extension" --body "$(cat <<'EOF'
## Summary

- Tabbed DishDrawer (640px) with 4 role tabs: Customer, L1 Cook, L2 Assembler, Owner
- Save & Verify flow using fn_dish_card_save RPC with optimistic locking
- Owner table: 3 new columns (Version, Verified, Card completeness 4-dot indicator)
- 6 new hooks: useDishCard, usePfPackCard, useAllergens, useModifierOptions, useDishCardSave, useRecipeSteps
- 4 reusable section components: AllergenBadges, ModifierChips, AssemblyOrderEditor, MerrychefProgramForm

## Phase context

Phase 1 (data layer, PR #212) shipped 12 migrations + 4 RPCs + 1 view.
Phase 2 (this PR) builds the UI layer on top.
Phase 3 (future): L1/L2/Customer list views, photo upload, Loyverse push button, per-role RLS.

## Test plan

- [ ] Smoke tests pass (vitest): all new .test.ts files
- [ ] TypeScript compiles without errors
- [ ] Vite build succeeds
- [ ] Open /menu → Owner table shows Version, Verified, Card columns
- [ ] Click dish row → DishDrawer opens with 4 tabs
- [ ] L2 Assembler tab: edit container + assembly steps → Save & Verify → version bumps
- [ ] Conflict toast when stale version submitted
- [ ] PF items: drawer shows only L1 Cook + Owner tabs
- [ ] Customer tab: allergen badges + modifier chips render from BOM data
- [ ] L1 Cook tab: recipe steps with CCP highlighting

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
