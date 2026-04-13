const NUTRITION_CONFIG = {
  calories: { label: 'kcal', bg: 'bg-amber-900/40', text: 'text-amber-300' },
  protein: { label: 'g protein', bg: 'bg-sky-900/40', text: 'text-sky-300' },
  carbs: { label: 'g carbs', bg: 'bg-violet-900/40', text: 'text-violet-300' },
  fat: { label: 'g fat', bg: 'bg-rose-900/40', text: 'text-rose-300' },
} as const

type NutrientKey = keyof typeof NUTRITION_CONFIG

interface NutritionBadgeProps {
  type: NutrientKey
  value: number
}

export function NutritionBadge({ type, value }: NutritionBadgeProps) {
  const cfg = NUTRITION_CONFIG[type]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.text}`}>
      {Math.round(value)} {cfg.label}
    </span>
  )
}

interface NutritionBadgesProps {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

export function NutritionBadges({ calories, protein, carbs, fat }: NutritionBadgesProps) {
  const items: { type: NutrientKey; value: number }[] = []
  if (calories != null && calories > 0) items.push({ type: 'calories', value: calories })
  if (protein != null && protein > 0) items.push({ type: 'protein', value: protein })
  if (carbs != null && carbs > 0) items.push({ type: 'carbs', value: carbs })
  if (fat != null && fat > 0) items.push({ type: 'fat', value: fat })

  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <NutritionBadge key={item.type} type={item.type} value={item.value} />
      ))}
    </div>
  )
}
