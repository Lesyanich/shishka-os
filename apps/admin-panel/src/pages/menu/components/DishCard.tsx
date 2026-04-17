import { Star, ImageOff } from 'lucide-react'
import type { MenuDish } from '../../../hooks/useMenuDishes'
import { NutritionBadges } from './NutritionBadge'

interface DishCardProps {
  dish: MenuDish
}

function formatPortion(size: number | null, unit: MenuDish['portion_unit']): string | null {
  if (size == null || unit == null) return null
  if (unit === 'pcs') return size === 1 ? '1 pc' : `${size} pcs`
  return `${size}${unit}`
}

function pricePer100(price: number | null, size: number | null, unit: MenuDish['portion_unit']): string | null {
  if (price == null || size == null || !unit || unit === 'pcs' || size <= 0) return null
  const per100 = (price / size) * 100
  return `\u0E3F${per100.toFixed(0)}/100${unit}`
}

export function DishCard({ dish }: DishCardProps) {
  const portion = formatPortion(dish.portion_size, dish.portion_unit)
  const per100 = pricePer100(dish.price, dish.portion_size, dish.portion_unit)
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 transition hover:border-slate-700 hover:bg-slate-900">
      {/* Photo / placeholder */}
      <div className="relative h-40 w-full bg-slate-800/50">
        {dish.image_url ? (
          <img
            src={dish.image_url}
            alt={dish.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-slate-700" />
          </div>
        )}
        {dish.is_featured && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            <Star className="h-3 w-3" />
            Featured
          </span>
        )}
        {dish.price != null && (
          <span className="absolute right-2 top-2 flex flex-col items-end rounded-lg bg-slate-950/80 px-2.5 py-1 text-right backdrop-blur">
            <span className="text-xs font-bold text-emerald-300">
              {'\u0E3F'}{dish.price.toLocaleString()}
            </span>
            {per100 && (
              <span className="text-[9px] font-medium text-slate-400">
                {per100}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-100 leading-tight">{dish.name}</h3>
          {portion && (
            <span className="shrink-0 text-[10px] font-medium text-slate-400">
              {portion}
            </span>
          )}
        </div>

        {/* Nutrition */}
        <NutritionBadges
          calories={dish.calories}
          protein={dish.protein}
          carbs={dish.carbs}
          fat={dish.fat}
        />

        {/* Tags */}
        {dish.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-1">
            {dish.tags.map((tag) => (
              <span
                key={tag.slug}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-700 text-slate-300"
                style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : undefined}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
