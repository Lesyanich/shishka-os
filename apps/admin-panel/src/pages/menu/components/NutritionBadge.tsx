const NUTRITION_CONFIG = {
  calories: { label: 'kcal', bg: 'bg-nutri-cal/20', text: 'text-nutri-cal' },
  protein: { label: 'g protein', bg: 'bg-nutri-pro/25', text: 'text-nutri-pro' },
  carbs: { label: 'g carbs', bg: 'bg-nutri-car/20', text: 'text-nutri-car' },
  fat: { label: 'g fat', bg: 'bg-nutri-fat/20', text: 'text-nutri-fat' },
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
