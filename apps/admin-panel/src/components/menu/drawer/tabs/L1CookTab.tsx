import {
  Clock,
  Snowflake,
  AlertTriangle,
  ChefHat,
  Package,
  Pause,
} from 'lucide-react'
import type { MenuItem } from '../../../../hooks/useMenuData'
import type { DishRecipeStep } from '../../../../hooks/useDishRecipeSteps'
import type { BomIngredient } from '../../../../hooks/useBomIngredients'
import type { PfPackCardData } from '../../../../hooks/usePfPackCard'
import type { DishCardData } from '../../../../hooks/useDishCard'
import { PrepLabelBlock } from '../PrepLabelBlock'

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
        <div className="mt-2.5 flex gap-2">
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

      {/* Storage label — shelf-life editor + RawBT print (PF only) */}
      {item.kind === 'PF' && <PrepLabelBlock item={item} card={pfPackCard} />}

      {/* L2 Assembly (SALE only) */}
      {dishCard && <L2AssemblyBlock card={dishCard} item={item} />}
    </div>
  )
}
