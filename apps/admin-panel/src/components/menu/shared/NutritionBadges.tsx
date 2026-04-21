import type { NutritionSummary } from './types'

type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'

const NUTRITION_CONFIG: Record<
  NutrientKey,
  { label: string; bg: string; text: string }
> = {
  calories: { label: 'kcal',      bg: 'bg-nutri-cal/20',  text: 'text-nutri-cal'  },
  protein:  { label: 'g protein', bg: 'bg-nutri-pro/20',  text: 'text-nutri-pro'  },
  carbs:    { label: 'g carbs',   bg: 'bg-nutri-car/20',  text: 'text-nutri-car'  },
  fat:      { label: 'g fat',     bg: 'bg-nutri-fat/20',  text: 'text-nutri-fat'  },
  fiber:    { label: 'g fiber',   bg: 'bg-nutri-fib/20',  text: 'text-nutri-fib'  },
}

interface NutritionBadgeProps {
  type: NutrientKey
  value: number
}

export function NutritionBadge({ type, value }: NutritionBadgeProps) {
  const cfg = NUTRITION_CONFIG[type]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tabular-nums ${cfg.bg} ${cfg.text}`}
    >
      {Math.round(value)} {cfg.label}
    </span>
  )
}

interface NutritionBadgesProps {
  nutrition: NutritionSummary
  /** 'full' (default) — all non-zero macros + calories.
   * 'reduced' — calories + dominant macro only (customer-site variant). */
  mode?: 'full' | 'reduced'
}

function dominantMacro(
  nutrition: NutritionSummary,
): { type: NutrientKey; value: number } | null {
  const candidates: { type: NutrientKey; value: number }[] = []
  const { protein, carbs, fat } = nutrition
  if (protein != null && protein > 0) candidates.push({ type: 'protein', value: protein })
  if (carbs != null && carbs > 0)     candidates.push({ type: 'carbs',   value: carbs   })
  if (fat != null && fat > 0)         candidates.push({ type: 'fat',     value: fat     })
  if (candidates.length === 0) return null
  return candidates.reduce((best, cur) => (cur.value > best.value ? cur : best))
}

export function NutritionBadges({ nutrition, mode = 'full' }: NutritionBadgesProps) {
  const items: { type: NutrientKey; value: number }[] = []
  const { calories, protein, carbs, fat, fiber } = nutrition

  if (mode === 'reduced') {
    if (calories != null && calories > 0) items.push({ type: 'calories', value: calories })
    const dom = dominantMacro(nutrition)
    if (dom) items.push(dom)
  } else {
    if (calories != null && calories > 0) items.push({ type: 'calories', value: calories })
    if (protein != null && protein > 0)   items.push({ type: 'protein',  value: protein  })
    if (carbs != null && carbs > 0)       items.push({ type: 'carbs',    value: carbs    })
    if (fat != null && fat > 0)           items.push({ type: 'fat',      value: fat      })
    if (fiber != null && fiber > 0)       items.push({ type: 'fiber',    value: fiber    })
  }

  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <NutritionBadge key={item.type} type={item.type} value={item.value} />
      ))}
    </div>
  )
}
