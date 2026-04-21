import type { NutritionSummary } from './types'

type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'

const NUTRITION_CONFIG: Record<
  NutrientKey,
  { label: string; bg: string; text: string }
> = {
  calories: { label: 'kcal',      bg: 'bg-amber-900/40',  text: 'text-amber-300'  },
  protein:  { label: 'g protein', bg: 'bg-slate-800/60',  text: 'text-slate-200'  },
  carbs:    { label: 'g carbs',   bg: 'bg-violet-900/40', text: 'text-violet-300' },
  fat:      { label: 'g fat',     bg: 'bg-rose-900/40',   text: 'text-rose-300'   },
  fiber:    { label: 'g fiber',   bg: 'bg-emerald-900/40', text: 'text-emerald-300' },
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
}

export function NutritionBadges({ nutrition }: NutritionBadgesProps) {
  const items: { type: NutrientKey; value: number }[] = []
  const { calories, protein, carbs, fat, fiber } = nutrition
  if (calories != null && calories > 0) items.push({ type: 'calories', value: calories })
  if (protein != null && protein > 0)   items.push({ type: 'protein',  value: protein  })
  if (carbs != null && carbs > 0)       items.push({ type: 'carbs',    value: carbs    })
  if (fat != null && fat > 0)           items.push({ type: 'fat',      value: fat      })
  if (fiber != null && fiber > 0)       items.push({ type: 'fiber',    value: fiber    })

  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <NutritionBadge key={item.type} type={item.type} value={item.value} />
      ))}
    </div>
  )
}
