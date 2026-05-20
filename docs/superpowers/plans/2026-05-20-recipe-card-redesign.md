# Recipe Card Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign L1CookTab from a flat text list into a beautiful, tablet-friendly recipe card with ingredients, process timeline, storage, and L2 assembly blocks.

**Architecture:** Enrich `useDishRecipeSteps` hook with 3 missing DB fields. Add new `useBomIngredients` hook for BOM children (existing view is SALE-only). Rewrite `L1CookTab.tsx` as a multi-block recipe card. Thread new data through `DishDrawer.tsx`.

**Tech Stack:** React 19, Tailwind CSS v4, lucide-react, Supabase JS

**Spec:** `docs/superpowers/specs/2026-05-20-recipe-card-redesign.md`

---

### Task 1: Enrich `useDishRecipeSteps` hook

**Files:**
- Modify: `apps/admin-panel/src/hooks/useDishRecipeSteps.ts`

- [ ] **Step 1: Update `DishRecipeStep` interface**

Replace the interface at lines 4-14:

```ts
export interface DishRecipeStep {
  id: string
  step_number: number
  operation_name: string
  duration_min: number | null
  instruction_text: string | null
  temperature_c: number | null
  internal_temp_c: number | null
  equipment_name: string | null
  equipment_category: string | null
  is_passive: boolean
  notes: string | null
  is_ccp: boolean
  ccp_check_text: string | null
}
```

- [ ] **Step 2: Update Supabase select to fetch new fields**

Change the `.select()` call at line 41 to:

```ts
'id, step_order, operation_name, duration_min, instruction_text, temperature_c, internal_temp_c, equipment(name, category), notes, is_ccp, ccp_check_text, is_passive'
```

- [ ] **Step 3: Update the mapping function**

Replace the `.map()` callback at lines 51-61:

```ts
const mapped: DishRecipeStep[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
  id: r.id as string,
  step_number: r.step_order as number,
  operation_name: r.operation_name as string,
  duration_min: r.duration_min as number | null,
  instruction_text: r.instruction_text as string | null,
  temperature_c: r.temperature_c as number | null,
  internal_temp_c: r.internal_temp_c as number | null,
  equipment_name: (r.equipment as { name: string; category: string } | null)?.name ?? null,
  equipment_category: (r.equipment as { name: string; category: string } | null)?.category ?? null,
  is_passive: (r.is_passive as boolean) ?? false,
  notes: r.notes as string | null,
  is_ccp: (r.is_ccp as boolean) ?? false,
  ccp_check_text: r.ccp_check_text as string | null,
}))
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/admin-panel && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to useDishRecipeSteps

- [ ] **Step 5: Commit**

```bash
git add apps/admin-panel/src/hooks/useDishRecipeSteps.ts
git commit -m "feat(menu): enrich useDishRecipeSteps with instruction_text, temperature_c, is_passive"
```

---

### Task 2: Create `useBomIngredients` hook

**Files:**
- Create: `apps/admin-panel/src/hooks/useBomIngredients.ts`
- Create: `apps/admin-panel/src/hooks/useBomIngredients.test.ts`

The existing `v_dish_assembly_components` view is SALE-only (`WHERE parent.product_code LIKE 'SALE-%'` and filters to PF/MOD children). For the recipe card, we need ALL BOM children (RAW + PF + MOD) for ANY parent product. Query `bom_structures` directly.

- [ ] **Step 1: Create the hook**

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface BomIngredient {
  ingredient_id: string
  product_code: string
  name: string
  type: string
  quantity: number
  base_unit: string | null
}

export interface UseBomIngredientsResult {
  ingredients: BomIngredient[]
  isLoading: boolean
  error: string | null
}

export function useBomIngredients(parentId: string | null): UseBomIngredientsResult {
  const [ingredients, setIngredients] = useState<BomIngredient[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!parentId) {
      setIngredients([])
      return
    }
    setIsLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('bom_structures')
      .select('ingredient_id, quantity_per_unit, nomenclature!bom_structures_ingredient_id_fkey(product_code, name, type, base_unit)')
      .eq('parent_id', parentId)
      .order('sort_order', { ascending: true })
    if (err) {
      setError(err.message)
      setIsLoading(false)
      return
    }
    const mapped: BomIngredient[] = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const n = r.nomenclature as { product_code: string; name: string; type: string; base_unit: string | null } | null
      return {
        ingredient_id: r.ingredient_id as string,
        product_code: n?.product_code ?? '',
        name: n?.name ?? '',
        type: n?.type ?? '',
        quantity: r.quantity_per_unit as number,
        base_unit: n?.base_unit ?? null,
      }
    })
    setIngredients(mapped)
    setIsLoading(false)
  }, [parentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { ingredients, isLoading, error }
}
```

- [ ] **Step 2: Create test stub**

```ts
import { describe, it, expect } from 'vitest'

describe('useBomIngredients', () => {
  it('exports useBomIngredients hook', async () => {
    const mod = await import('./useBomIngredients')
    expect(mod.useBomIngredients).toBeDefined()
  })
})
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/admin-panel && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/admin-panel/src/hooks/useBomIngredients.ts apps/admin-panel/src/hooks/useBomIngredients.test.ts
git commit -m "feat(menu): add useBomIngredients hook for recipe card ingredients"
```

---

### Task 3: Rewrite `L1CookTab` component

**Files:**
- Modify: `apps/admin-panel/src/components/menu/drawer/tabs/L1CookTab.tsx`
- Modify: `apps/admin-panel/src/components/menu/drawer/tabs/L1CookTab.test.ts`

This is the main UI rewrite. The component receives enriched recipe steps, BOM ingredients, pf_pack_card, and dish_card data — and renders them as a multi-block recipe card.

- [ ] **Step 1: Rewrite L1CookTab with new props interface and full block structure**

Replace the entire file:

```tsx
import {
  Clock,
  Snowflake,
  AlertTriangle,
  ChefHat,
  Package,
  Pause,
  Flame,
} from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishRecipeStep } from '../../../../hooks/useDishRecipeSteps'
import type { BomIngredient } from '../../../../hooks/useBomIngredients'
import type { PfPackCardData } from '../../../../hooks/usePfPackCard'
import type { DishCardData } from '../../../../hooks/useDishCard'

/* ── emoji helpers ─────────────────────────────────────────────── */

const EQUIP_EMOJI: Record<string, string> = {
  cooking: '🔥',
  oven: '🔥',
  prep: '🔪',
  refrigeration: '❄️',
  fermentation: '🧫',
  storage: '📦',
  service: '🍽️',
  beverage: '☕',
  infrastructure: '🔧',
  other: '✋',
}

function equipEmoji(category: string | null): string {
  return EQUIP_EMOJI[category ?? 'other'] ?? '✋'
}

function formatTime(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function ingredientPrefix(code: string): { label: string; cls: string } | null {
  if (code.startsWith('PF-')) return { label: 'PF', cls: 'bg-amber-500/20 text-amber-400' }
  if (code.startsWith('MOD-')) return { label: 'MOD', cls: 'bg-violet-500/20 text-violet-400' }
  return null
}

/* ── sub-components ────────────────────────────────────────────── */

function SummaryBar({ steps }: { steps: DishRecipeStep[] }) {
  const totalMin = steps.reduce((s, st) => s + (st.duration_min ?? 0), 0)
  const activeMin = steps.filter((s) => !s.is_passive).reduce((s, st) => s + (st.duration_min ?? 0), 0)
  const passiveMin = totalMin - activeMin
  const ccpCount = steps.filter((s) => s.is_ccp).length

  const cells = [
    { emoji: '⏱️', value: formatTime(totalMin), label: 'total' },
    { emoji: '🍳', value: formatTime(activeMin), label: 'active' },
    { emoji: '⏳', value: formatTime(passiveMin), label: 'passive' },
    { emoji: '⚠️', value: String(ccpCount), label: ccpCount === 1 ? 'CCP' : 'CCPs' },
  ]

  return (
    <div className="grid grid-cols-4 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col items-center rounded-lg bg-surface-2 px-2 py-2.5">
          <span className="text-base">{c.emoji}</span>
          <span className="mt-0.5 text-sm font-semibold text-cream">{c.value}</span>
          <span className="text-[10px] uppercase tracking-wider text-cream/45">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

function IngredientsBlock({
  ingredients,
  isLoading,
}: {
  ingredients: BomIngredient[]
  isLoading: boolean
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-cream/50">🧂 Ingredients</h4>
      {isLoading ? (
        <span className="text-xs text-cream/40">Loading...</span>
      ) : ingredients.length === 0 ? (
        <span className="text-xs italic text-cream/40">No ingredients defined</span>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ingredients.map((ing) => {
            const badge = ingredientPrefix(ing.product_code)
            return (
              <div
                key={ing.ingredient_id}
                className="flex flex-col rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-2"
              >
                <div className="flex items-center gap-1.5">
                  {badge && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                  <span className="truncate text-xs text-cream/80">{ing.name}</span>
                </div>
                <div className="mt-1">
                  <span className="text-base font-semibold text-cream">{ing.quantity}</span>
                  <span className="ml-1 text-[10px] text-cream/45">{ing.base_unit ?? ''}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function StepCard({ step }: { step: DishRecipeStep }) {
  const isCcp = step.is_ccp
  const isPassive = step.is_passive

  const borderCls = isCcp
    ? 'border-amber-500/50'
    : isPassive
      ? 'border-dashed border-surface-3'
      : 'border-surface-3'

  const bgCls = isCcp
    ? 'bg-amber-950/25'
    : isPassive
      ? 'bg-surface-2/40'
      : 'bg-surface-2/70'

  return (
    <div className={`rounded-xl border px-4 py-3 ${borderCls} ${bgCls}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-cream/70">
            {step.step_number}
          </span>
          <span className="text-sm font-semibold text-cream">{step.operation_name}</span>
          {isCcp && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" /> CCP
            </span>
          )}
          {isPassive && (
            <span className="flex items-center gap-0.5 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-400">
              <Pause className="h-2.5 w-2.5" /> passive
            </span>
          )}
        </div>
        {step.duration_min != null && (
          <span className="shrink-0 text-xs font-medium text-cream/55">
            ⏱️ {formatTime(step.duration_min)}
          </span>
        )}
      </div>

      {/* Instruction text */}
      {step.instruction_text && (
        <p className="mt-2 text-xs leading-relaxed text-cream/75">{step.instruction_text}</p>
      )}

      {/* Temperature blocks (large for CCP) */}
      {(step.temperature_c != null || step.internal_temp_c != null) && (
        <div className={`mt-2.5 flex gap-2 ${isCcp ? '' : ''}`}>
          {step.temperature_c != null && (
            <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${isCcp ? 'border-amber-500/30 bg-amber-950/30' : 'border-surface-3 bg-surface-2/50'}`}>
              <span className={isCcp ? 'text-base' : 'text-sm'}>🔥</span>
              <div>
                <div className={`font-bold text-cream ${isCcp ? 'text-base' : 'text-xs'}`}>{step.temperature_c}°C</div>
                <div className="text-[9px] text-cream/40">equip</div>
              </div>
            </div>
          )}
          {step.internal_temp_c != null && (
            <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${isCcp ? 'border-amber-500/30 bg-amber-950/30' : 'border-surface-3 bg-surface-2/50'}`}>
              <span className={isCcp ? 'text-base' : 'text-sm'}>🌡️</span>
              <div>
                <div className={`font-bold text-cream ${isCcp ? 'text-base' : 'text-xs'}`}>{step.internal_temp_c}°C</div>
                <div className="text-[9px] text-cream/40">probe</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CCP check text */}
      {isCcp && step.ccp_check_text && (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-300">
          ⚠️ {step.ccp_check_text}
        </p>
      )}

      {/* Equipment line */}
      {step.equipment_name && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-cream/50">
          <span>{equipEmoji(step.equipment_category)}</span>
          <span>{step.equipment_name}</span>
        </div>
      )}

      {/* Notes */}
      {step.notes && (
        <p className="mt-1.5 text-[10px] italic text-cream/40">{step.notes}</p>
      )}
    </div>
  )
}

function StorageBlock({ card }: { card: PfPackCardData }) {
  const tempRange =
    card.storage_temp_min_c != null && card.storage_temp_max_c != null
      ? `${card.storage_temp_min_c}..${card.storage_temp_max_c}°C`
      : null
  const portionInfo =
    card.portions_per_batch != null && card.portion_weight_g != null
      ? `${card.portions_per_batch} x ${card.portion_weight_g}g`
      : null

  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-cream/50">📦 Storage & Packaging</h4>
      <div className="flex flex-wrap gap-2">
        {tempRange && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70">
            <Snowflake className="h-3 w-3 text-sky-400" /> {tempRange}
          </span>
        )}
        {card.shelf_life_days != null && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70">
            <Clock className="h-3 w-3 text-cream/40" /> {card.shelf_life_days}d shelf
          </span>
        )}
        {card.vacuum_bag_size && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70">
            <Package className="h-3 w-3 text-cream/40" /> bag {card.vacuum_bag_size}
            {card.portions_per_bag != null && ` (${card.portions_per_bag}/bag)`}
          </span>
        )}
        {portionInfo && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70">
            🍽️ {portionInfo}
          </span>
        )}
        {card.storage_zone && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70">
            📍 {card.storage_zone}
          </span>
        )}
      </div>
    </section>
  )
}

function L2AssemblyBlock({ card, item }: { card: DishCardData; item: MenuItem }) {
  const program = item.merrychef_program as { temp_c?: number; time_sec?: number; notes?: string } | null

  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-cream/50">🏭 L2 Assembly</h4>
      <div className="space-y-2 rounded-xl border border-surface-3 bg-surface-2/60 px-4 py-3 text-xs text-cream/70">
        {card.container_l2 && (
          <div><span className="text-cream/40">Container:</span> {card.container_l2}</div>
        )}
        {card.assembly_order && card.assembly_order.length > 0 && (
          <div>
            <span className="text-cream/40">Order:</span>{' '}
            {card.assembly_order.map((s) => s.text).join(' → ')}
          </div>
        )}
        {program && (
          <div>
            <span className="text-cream/40">Merrychef:</span>{' '}
            {program.temp_c != null && `${program.temp_c}°C`}
            {program.time_sec != null && ` / ${program.time_sec}s`}
            {program.notes && ` — ${program.notes}`}
          </div>
        )}
        {card.pre_merrychef_prep && (
          <div><span className="text-cream/40">Pre-heat:</span> {card.pre_merrychef_prep}</div>
        )}
        {card.post_merrychef_check && (
          <div><span className="text-cream/40">Post-check:</span> {card.post_merrychef_check}</div>
        )}
        {card.cold_addons_after_reheat && (
          <div><span className="text-cream/40">Cold add-ons:</span> {card.cold_addons_after_reheat}</div>
        )}
      </div>
    </section>
  )
}

/* ── main component ────────────────────────────────────────────── */

export interface L1CookTabProps {
  item: MenuItem
  ingredients: BomIngredient[]
  ingredientsLoading: boolean
  recipeSteps: DishRecipeStep[]
  recipeStepsLoading: boolean
  pfPackCard: PfPackCardData | null
  dishCard: DishCardData | null
}

export function L1CookTab({
  item,
  ingredients,
  ingredientsLoading,
  recipeSteps,
  recipeStepsLoading,
  pfPackCard,
  dishCard,
}: L1CookTabProps) {
  return (
    <div className="space-y-6">
      {/* Compact recipe header */}
      <div>
        <h3 className="text-lg font-semibold text-cream">{item.name}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-[10px] text-cream/40">{item.product_code}</span>
          {item.category_name && (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[9px] uppercase tracking-wider text-cream/55">
              {item.category_name}
            </span>
          )}
        </div>
        {item.kitchen_note && (
          <p className="mt-2 text-xs text-cream/60 italic">{item.kitchen_note}</p>
        )}
      </div>

      {/* Summary bar */}
      {!recipeStepsLoading && recipeSteps.length > 0 && (
        <SummaryBar steps={recipeSteps} />
      )}

      {/* Ingredients */}
      <IngredientsBlock ingredients={ingredients} isLoading={ingredientsLoading} />

      {/* Process steps */}
      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cream/50">
          <ChefHat className="h-3 w-3" />
          Process
          {recipeSteps.some((s) => s.is_ccp) && (
            <span className="ml-1 flex items-center gap-0.5 text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" /> HACCP
            </span>
          )}
        </h4>
        {recipeStepsLoading ? (
          <span className="text-xs text-cream/40">Loading...</span>
        ) : recipeSteps.length === 0 ? (
          <span className="text-xs italic text-cream/40">No recipe steps defined</span>
        ) : (
          <div className="space-y-2">
            {recipeSteps.map((s) => (
              <StepCard key={s.id} step={s} />
            ))}
          </div>
        )}
      </section>

      {/* Storage (PF only) */}
      {pfPackCard && <StorageBlock card={pfPackCard} />}

      {/* L2 Assembly (SALE only) */}
      {dishCard && <L2AssemblyBlock card={dishCard} item={item} />}
    </div>
  )
}
```

- [ ] **Step 2: Update test stub for new exports**

```ts
import { describe, it, expect } from 'vitest'

describe('L1CookTab', () => {
  it('exports L1CookTab component', async () => {
    const mod = await import('./L1CookTab')
    expect(mod.L1CookTab).toBeDefined()
  })

  it('exports L1CookTabProps type', async () => {
    // Type-only check — if this compiles, the export exists
    const mod = await import('./L1CookTab')
    expect(typeof mod.L1CookTab).toBe('function')
  })
})
```

- [ ] **Step 3: Verify TypeScript compiles (will fail until Task 4 threads props)**

Run: `cd apps/admin-panel && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: Errors only in DishDrawer.tsx (props mismatch — fixed in Task 4)

- [ ] **Step 4: Commit**

```bash
git add apps/admin-panel/src/components/menu/drawer/tabs/L1CookTab.tsx apps/admin-panel/src/components/menu/drawer/tabs/L1CookTab.test.ts
git commit -m "feat(menu): rewrite L1CookTab as multi-block recipe card with emoji infographics"
```

---

### Task 4: Thread new data through `DishDrawer`

**Files:**
- Modify: `apps/admin-panel/src/components/menu/drawer/DishDrawer.tsx`

DishDrawer currently passes `dishCard.components` (SALE-only view) and `recipeSteps.steps` to L1CookTab. We need to:
1. Add `useBomIngredients` hook call
2. Add `usePfPackCard` hook call (for PF items)
3. Pass `pfPackCard` and `dishCard.card` to L1CookTab
4. Replace `components` prop with `ingredients` from new hook

- [ ] **Step 1: Add imports**

Add after existing imports (line 8):

```ts
import { useBomIngredients } from '../../../hooks/useBomIngredients'
import { usePfPackCard } from '../../../hooks/usePfPackCard'
```

- [ ] **Step 2: Add hook calls**

Add after the existing `recipeSteps` hook (line 55), before `saveDishCard`:

```ts
const bomIngredients = useBomIngredients(dishId)
const pfPackCard = usePfPackCard(isPf ? dishId : null)
```

Where `isPf` is the existing variable at line 175 — but it's declared too late (inside the render). Move the `isPf` computation up. Add after `const dishId = open ? item.id : null` (line 49):

```ts
const isPf = item?.kind === 'PF'
const isSale = item?.kind === 'SALE'
```

And remove the duplicate `const isSale = item?.kind === 'SALE'` at line 51 and the late `const isPf = item.kind === 'PF'` at line 175.

- [ ] **Step 3: Update L1CookTab props**

Replace the L1CookTab render block (lines 265-271):

```tsx
{resolvedTab === 'l1-cook' && (
  <L1CookTab
    item={item}
    ingredients={bomIngredients.ingredients}
    ingredientsLoading={bomIngredients.isLoading}
    recipeSteps={recipeSteps.steps}
    recipeStepsLoading={recipeSteps.isLoading}
    pfPackCard={pfPackCard.card}
    dishCard={dishCard.card}
  />
)}
```

- [ ] **Step 4: Remove unused import**

The old `L1CookTab` imported `AssemblyComponent` type. Now DishDrawer no longer passes `components` / `componentsLoading` to L1CookTab, so check if `AssemblyComponent` import is still needed for L2AssemblerTab. It is (line 5 imports it for L2AssemblerTab), so leave the import but verify no unused references.

- [ ] **Step 5: Verify full TypeScript compile**

Run: `cd apps/admin-panel && npx tsc --noEmit 2>&1 | head -30`
Expected: Clean compile, 0 errors

- [ ] **Step 6: Run all tests**

Run: `cd apps/admin-panel && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 7: Run dev server and test visually**

Run: `cd apps/admin-panel && npx vite --port 5173 &`
Then open: `http://localhost:5173/menu?view=l1-cook`
Click on any PF item → drawer opens → L1 Cook tab shows recipe card with blocks
Verify: summary bar, ingredients, process timeline, storage section all render

- [ ] **Step 8: Commit**

```bash
git add apps/admin-panel/src/components/menu/drawer/DishDrawer.tsx
git commit -m "feat(menu): thread BOM ingredients + pf_pack_card + dish_card to L1CookTab recipe card"
```

---

### Task 5: Lint check and final verification

**Files:** None (verification only)

- [ ] **Step 1: ESLint check**

Run: `cd apps/admin-panel && npx eslint src/hooks/useBomIngredients.ts src/hooks/useDishRecipeSteps.ts src/components/menu/drawer/tabs/L1CookTab.tsx src/components/menu/drawer/DishDrawer.tsx 2>&1 | tail -20`
Expected: 0 errors, 0 warnings (ESLint max-warnings=0)

- [ ] **Step 2: Fix any lint issues found**

If any issues, fix them. Common: unused imports, missing return types.

- [ ] **Step 3: Full test suite**

Run: `cd apps/admin-panel && npx vitest run 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix(menu): lint and test fixes for recipe card"
```
