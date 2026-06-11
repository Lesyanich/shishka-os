import { useMemo, useState } from 'react'
import type { DishModifierOption } from '../../../../hooks/useMenuListEnrichment'
import type { NutritionSummary } from '../../shared/types'
import { NutritionBadges } from '../../shared/NutritionBadges'

/*
  Owner-facing "build preview" for the /menu dish drawer. Mirrors the customer
  build-your-own experience on shishka.health: toggle modifier options, enforce
  each group's min/max ("pick N–M"), and watch a LIVE calorie/macro + price
  counter (base dish + selected add-ons). Read-only preview — no cart, no save.

  Data comes from v_dish_modifier_options (per-portion nutrition + min/max,
  migs 261/262), the same nomenclature_modifier_options source the site uses, so
  the numbers match the customer site to the gram and the baht.
*/

export interface PreviewGroup {
  name: string
  minSelect: number
  maxSelect: number | null
  options: Array<{ key: string; option: DishModifierOption }>
}

export interface PreviewTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
  priceExtra: number
  count: number
}

/** Group options by group_name in input order; key = "groupIndex:optionIndex". */
export function groupModifierOptions(options: DishModifierOption[]): PreviewGroup[] {
  const groups: PreviewGroup[] = []
  const byName = new Map<string, PreviewGroup>()
  for (const option of options) {
    const name = option.group_name ?? ''
    let g = byName.get(name)
    if (!g) {
      g = {
        name,
        minSelect: option.group_min_select ?? 0,
        maxSelect: option.group_max_select ?? null,
        options: [],
      }
      byName.set(name, g)
      groups.push(g)
    }
    const gi = groups.indexOf(g)
    g.options.push({ key: `${gi}:${g.options.length}`, option })
  }
  return groups
}

/** Number of selected options within a group. */
export function groupSelectedCount(group: PreviewGroup, selected: Set<string>): number {
  return group.options.reduce((n, o) => (selected.has(o.key) ? n + 1 : n), 0)
}

/** Sum nutrition + price delta of all selected options. */
export function selectedTotals(groups: PreviewGroup[], selected: Set<string>): PreviewTotals {
  const t: PreviewTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, priceExtra: 0, count: 0 }
  for (const g of groups) {
    for (const { key, option } of g.options) {
      if (!selected.has(key)) continue
      t.calories += Number(option.calories) || 0
      t.protein += Number(option.protein) || 0
      t.carbs += Number(option.carbs) || 0
      t.fat += Number(option.fat) || 0
      t.priceExtra += Number(option.price_delta) || 0
      t.count += 1
    }
  }
  return t
}

/** Cheapest add-on cost to satisfy every required group (the "from ฿X" floor). */
export function requiredFloorExtra(groups: PreviewGroup[]): number {
  let extra = 0
  for (const g of groups) {
    if (g.minSelect <= 0) continue
    const deltas = g.options
      .map((o) => Number(o.option.price_delta) || 0)
      .sort((a, b) => a - b)
      .slice(0, g.minSelect)
    extra += deltas.reduce((s, d) => s + d, 0)
  }
  return extra
}

/** True when every required group has at least its minimum picked. */
export function requiredMet(groups: PreviewGroup[], selected: Set<string>): boolean {
  return groups.every((g) => groupSelectedCount(g, selected) >= g.minSelect)
}

function groupHint(g: PreviewGroup): string | null {
  if (g.minSelect > 0 && g.maxSelect != null) return `pick ${g.minSelect}–${g.maxSelect}`
  if (g.minSelect > 0) return `pick at least ${g.minSelect}`
  if (g.maxSelect != null) return `pick up to ${g.maxSelect}`
  return null
}

const round1 = (n: number) => Math.round(n * 10) / 10

interface ModifierBuildPreviewProps {
  options: DishModifierOption[]
  base: NutritionSummary
  basePrice: number | null
}

export function ModifierBuildPreview({ options, base, basePrice }: ModifierBuildPreviewProps) {
  const groups = useMemo(() => groupModifierOptions(options), [options])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (group: PreviewGroup, key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        if (group.maxSelect != null && groupSelectedCount(group, prev) >= group.maxSelect) return prev
        next.add(key)
      }
      return next
    })

  if (groups.length === 0)
    return <span className="text-xs text-cream/40">No modifiers</span>

  const totals = selectedTotals(groups, selected)
  const met = requiredMet(groups, selected)
  const liveNutri: NutritionSummary = {
    calories: (base.calories ?? 0) + totals.calories,
    protein: round1((base.protein ?? 0) + totals.protein),
    carbs: round1((base.carbs ?? 0) + totals.carbs),
    fat: round1((base.fat ?? 0) + totals.fat),
  }
  const livePrice = met
    ? (basePrice ?? 0) + totals.priceExtra
    : (basePrice ?? 0) + requiredFloorExtra(groups)

  return (
    <div className="space-y-3">
      {groups.map((g, gi) => {
        const hint = groupHint(g)
        const atMax = g.maxSelect != null && groupSelectedCount(g, selected) >= g.maxSelect
        return (
          <div key={g.name || gi} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-cream/60">
                {g.name}
              </span>
              {hint && (
                <span className="text-[10px] font-medium text-[color:var(--color-forest-soft)]">
                  {hint}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.options.map(({ key, option }) => {
                const on = selected.has(key)
                const blocked = atMax && !on
                const delta = Number(option.price_delta) || 0
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(g, key)}
                    disabled={blocked}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                      on
                        ? 'bg-[var(--color-royal-green)]/30 text-[color:var(--color-forest-soft)] ring-1 ring-inset ring-[var(--color-forest-soft)]/40'
                        : blocked
                          ? 'cursor-not-allowed bg-surface-3 text-cream/25'
                          : 'bg-surface-3 text-cream/70 hover:text-cream'
                    }`}
                  >
                    {option.modifier_emoji && (
                      <span aria-hidden="true">{option.modifier_emoji}</span>
                    )}
                    {option.modifier_short_name || option.modifier_name}
                    {delta !== 0 && (
                      <span className="font-mono text-[9px] tabular-nums opacity-75">
                        {delta > 0 ? `+฿${delta}` : `-฿${Math.abs(delta)}`}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Live counter */}
      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-inset px-3 py-2">
        <NutritionBadges nutrition={liveNutri} />
        <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-cream">
          {!met && <span className="text-[10px] font-normal text-cream/50">from </span>}
          {'฿'}
          {Math.round(livePrice)}
        </span>
      </div>
    </div>
  )
}
