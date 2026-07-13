import { useState } from 'react'
import {
  Clock,
  Snowflake,
  AlertTriangle,
  ChefHat,
  Package,
  ChevronRight,
} from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishRecipeStep } from '../../../../hooks/useDishRecipeSteps'
import type { BomIngredient } from '../../../../hooks/useBomIngredients'
import type { PfPackCardData } from '../../../../hooks/usePfPackCard'
import type { DishCardData } from '../../../../hooks/useDishCard'
import { bucketStepsByStation } from '../../../../lib/recipeStation'
import { PrepLabelBlock } from '../PrepLabelBlock'
import { StepCard, formatTime } from '../sections/StepCard'

/* ── emoji helpers ─────────────────────────────────────────────── */

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

/** Inline mini-recipe for a nested sub-prep — the component PF's own steps,
 * rendered compact so the cook sees dose + how-to without leaving the card. */
function MiniRecipe({ steps }: { steps: DishRecipeStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-[11px] italic text-cream/40">
        No recipe steps documented yet — open the card to add them.
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      {steps.map((s) => (
        <StepCard key={s.id} step={s} compact />
      ))}
    </div>
  )
}

/** A nested sub-prep (PF/MOD) line: clickable to open its own card, and
 * expandable to reveal dose + mini-recipe inline (CEO ask — don't make the
 * cook hunt for the marinade / sous-vide recipe). */
function SubPrepRow({
  ing,
  steps,
  onNavigate,
}: {
  ing: BomIngredient
  steps: DishRecipeStep[]
  onNavigate?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const badge = ingredientPrefix(ing.product_code)
  const canOpenCard = Boolean(onNavigate)
  return (
    <div className="rounded-lg border border-surface-3 bg-surface-2/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse recipe' : 'Expand recipe'}
          className="shrink-0 rounded p-0.5 text-cream/50 transition hover:text-cream"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {badge && (
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
        )}
        {canOpenCard ? (
          <button
            type="button"
            onClick={() => onNavigate?.(ing.ingredient_id)}
            className="min-w-0 flex-1 truncate text-left text-xs text-cream/85 underline-offset-2 transition hover:text-forest-soft hover:underline"
            title="Open this sub-prep's card"
          >
            {ing.customer_short_name ?? ing.name}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs text-cream/85">
            {ing.customer_short_name ?? ing.name}
          </span>
        )}
        <span className="shrink-0 text-xs">
          <span className="font-semibold text-cream">{ing.quantity}</span>
          <span className="ml-1 text-[10px] text-cream/45">{ing.base_unit ?? ''}</span>
        </span>
      </div>
      {open && (
        <div className="border-t border-surface-3 px-3 py-2.5">
          <MiniRecipe steps={steps} />
        </div>
      )}
    </div>
  )
}

function IngredientsBlock({
  ingredients,
  isLoading,
  stepsByComponent,
  onNavigateToItem,
}: {
  ingredients: BomIngredient[]
  isLoading: boolean
  stepsByComponent: Map<string, DishRecipeStep[]>
  onNavigateToItem?: (id: string) => void
}) {
  // Split raw ingredients (dose grid) from nested sub-preps (PF/MOD) which get
  // clickable, expandable rows so their recipe is one tap away.
  const subPreps = ingredients.filter((i) => ingredientPrefix(i.product_code))
  const rawItems = ingredients.filter((i) => !ingredientPrefix(i.product_code))

  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-cream/50">🧂 Ingredients</h4>
      {isLoading ? (
        <span className="text-xs text-cream/40">Loading...</span>
      ) : ingredients.length === 0 ? (
        <span className="text-xs italic text-cream/40">No ingredients defined</span>
      ) : (
        <div className="space-y-2.5">
          {rawItems.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rawItems.map((ing) => (
                <div
                  key={ing.ingredient_id}
                  className="flex flex-col rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-2"
                >
                  <span className="truncate text-xs text-cream/80">
                    {ing.customer_short_name ?? ing.name}
                  </span>
                  <div className="mt-1">
                    <span className="text-base font-semibold text-cream">{ing.quantity}</span>
                    <span className="ml-1 text-[10px] text-cream/45">{ing.base_unit ?? ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {subPreps.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[9px] uppercase tracking-widest text-cream/35">
                Sub-preps · tap name to open · ▸ for recipe
              </div>
              {subPreps.map((ing) => (
                <SubPrepRow
                  key={ing.ingredient_id}
                  ing={ing}
                  steps={stepsByComponent.get(ing.ingredient_id) ?? []}
                  onNavigate={onNavigateToItem}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function StorageBlock({ card, item }: { card: PfPackCardData; item: MenuItem }) {
  const tempRange =
    card.storage_temp_min_c != null && card.storage_temp_max_c != null
      ? `${card.storage_temp_min_c}..${card.storage_temp_max_c}°C`
      : null
  const portionInfo =
    card.portions_per_batch != null && card.portion_weight_g != null
      ? `${card.portions_per_batch} × ${card.portion_weight_g}g`
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
        {item.shelf_life_days != null && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-surface-3 bg-surface-2/60 px-3 py-1.5 text-xs text-cream/70">
            <Clock className="h-3 w-3 text-cream/40" /> {item.shelf_life_days}d shelf
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

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function L2AssemblyBlock({ card, item }: { card: DishCardData; item: MenuItem }) {
  const program = item.merrychef_program as {
    temp_c?: number
    time_sec?: number
    fan_pct?: number
    microwave_pct?: number
    notes?: string
  } | null

  const merrychefSummary = program
    ? [
        program.temp_c != null ? `${program.temp_c}°C` : null,
        program.time_sec != null ? formatSec(program.time_sec) : null,
        program.fan_pct != null ? `Fan ${program.fan_pct}%` : null,
        program.microwave_pct != null ? `MW ${program.microwave_pct}%` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

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
        {merrychefSummary && (
          <div>
            <span className="text-cream/40">🔥 Merrychef:</span> {merrychefSummary}
            {program?.notes && <span className="text-cream/50"> — {program.notes}</span>}
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
  /** Recipe steps for each nested PF component, keyed by component id — powers
   *  the inline-expand mini-recipe on sub-prep lines. */
  stepsByComponent?: Map<string, DishRecipeStep[]>
  /** Open another item's card (e.g. click a sub-prep to jump to its card). */
  onNavigateToItem?: (id: string) => void
}

export function L1CookTab({
  item,
  ingredients,
  ingredientsLoading,
  recipeSteps,
  recipeStepsLoading,
  pfPackCard,
  dishCard,
  stepsByComponent,
  onNavigateToItem,
}: L1CookTabProps) {
  // L1 Cook station shows only prep-kitchen steps (Kitchen + Storage). The L2
  // service step (Merrychef bake) is surfaced separately via L2AssemblyBlock.
  // Untagged dishes (no location_id) fall back to the full step list.
  const { l1, tagged } = bucketStepsByStation(recipeSteps)
  const processSteps = tagged ? l1 : recipeSteps

  return (
    <div className="space-y-6">
      {/* Compact recipe header */}
      <div>
        <h3 className="text-lg font-semibold text-cream">{item.name}</h3>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="font-mono text-[10px] text-cream/40">{item.product_code}</span>
          {item.category_name && (
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[9px] uppercase tracking-wider text-cream/55">
              {item.category_name}
            </span>
          )}
        </div>
        {item.kitchen_note && (
          <p className="mt-2 text-xs italic text-cream/60">{item.kitchen_note}</p>
        )}
      </div>

      {/* Summary bar */}
      {!recipeStepsLoading && processSteps.length > 0 && (
        <SummaryBar steps={processSteps} />
      )}

      {/* Ingredients */}
      <IngredientsBlock
        ingredients={ingredients}
        isLoading={ingredientsLoading}
        stepsByComponent={stepsByComponent ?? new Map()}
        onNavigateToItem={onNavigateToItem}
      />

      {/* Process steps */}
      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cream/50">
          <ChefHat className="h-3 w-3" />
          Process
          {processSteps.some((s) => s.is_ccp) && (
            <span className="ml-1 flex items-center gap-0.5 text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" /> HACCP
            </span>
          )}
        </h4>
        {recipeStepsLoading ? (
          <span className="text-xs text-cream/40">Loading...</span>
        ) : processSteps.length === 0 ? (
          <span className="text-xs italic text-cream/40">No recipe steps defined</span>
        ) : (
          <div className="space-y-2">
            {processSteps.map((s) => (
              <StepCard key={s.id} step={s} />
            ))}
          </div>
        )}
      </section>

      {/* Storage (PF only) */}
      {pfPackCard && <StorageBlock card={pfPackCard} item={item} />}

      {/* Storage label — shelf-life + pack-size editor + RawBT print (PF only) */}
      {item.kind === 'PF' && <PrepLabelBlock item={item} packCard={pfPackCard} />}

      {/* L2 Assembly (SALE only) */}
      {dishCard && <L2AssemblyBlock card={dishCard} item={item} />}
    </div>
  )
}
