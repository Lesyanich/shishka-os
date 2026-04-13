import { Star, ImageOff } from 'lucide-react'
import type { MenuDish } from '../../../hooks/useMenuDishes'
import { NutritionBadges } from './NutritionBadge'

interface DishCardProps {
  dish: MenuDish
}

export function DishCard({ dish }: DishCardProps) {
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
          <span className="absolute right-2 top-2 rounded-full bg-slate-950/80 px-2.5 py-1 text-xs font-bold text-emerald-300 backdrop-blur">
            {'\u0E3F'}{dish.price.toLocaleString()}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="text-sm font-semibold text-slate-100 leading-tight">{dish.name}</h3>

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
