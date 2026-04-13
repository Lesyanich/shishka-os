import { useOptimistic, useCallback } from 'react'
import { Star, StarOff, ImageOff, Eye, EyeOff } from 'lucide-react'
import type { MenuDish } from '../../../hooks/useMenuDishes'
import { NutritionBadges } from './NutritionBadge'

interface OwnerGalleryProps {
  dishes: MenuDish[]
  selectedCategory: string | null
  onUpdate: (id: string, patch: Partial<Pick<MenuDish, 'name' | 'price' | 'is_available' | 'is_featured'>>) => Promise<{ ok: boolean; error?: string }>
}

function foodCostColor(pct: number): string {
  if (pct < 30) return 'text-emerald-400'
  if (pct <= 45) return 'text-amber-400'
  return 'text-rose-400'
}

function foodCostBg(pct: number): string {
  if (pct < 30) return 'bg-emerald-500/10 border-emerald-500/20'
  if (pct <= 45) return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-rose-500/10 border-rose-500/20'
}

export function OwnerGallery({ dishes, selectedCategory, onUpdate }: OwnerGalleryProps) {
  const filtered = selectedCategory
    ? dishes.filter((d) => d.category_id === selectedCategory)
    : dishes

  const [optimisticDishes, setOptimistic] = useOptimistic(
    filtered,
    (state: MenuDish[], update: { id: string; patch: Partial<MenuDish> }) =>
      state.map((d) => (d.id === update.id ? { ...d, ...update.patch } : d)),
  )

  const toggleField = useCallback(
    async (dish: MenuDish, field: 'is_available' | 'is_featured') => {
      const newVal = !dish[field]
      setOptimistic({ id: dish.id, patch: { [field]: newVal } })
      await onUpdate(dish.id, { [field]: newVal })
    },
    [onUpdate, setOptimistic],
  )

  if (optimisticDishes.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        No dishes in this category.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {optimisticDishes.map((dish) => {
        const cost = dish.cost_per_unit ?? 0
        const price = dish.price ?? 0
        const foodCostPct = price > 0 ? (cost / price) * 100 : 0
        const margin = price - cost

        return (
          <div
            key={dish.id}
            className={`group relative flex flex-col overflow-hidden rounded-xl border transition ${
              dish.is_available
                ? 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                : 'border-slate-800/50 bg-slate-950/40 opacity-60'
            }`}
          >
            {/* Photo */}
            <div className="relative h-32 w-full bg-slate-800/50">
              {dish.image_url ? (
                <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageOff className="h-6 w-6 text-slate-700" />
                </div>
              )}

              {/* Food cost badge overlay */}
              {price > 0 && (
                <div className={`absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${foodCostBg(foodCostPct)} ${foodCostColor(foodCostPct)}`}>
                  {foodCostPct.toFixed(0)}% FC
                </div>
              )}

              {/* Toggle buttons overlay */}
              <div className="absolute right-1.5 top-1.5 flex gap-1">
                <button
                  onClick={() => toggleField(dish, 'is_featured')}
                  className={`rounded-md p-1 backdrop-blur transition ${
                    dish.is_featured
                      ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                      : 'bg-slate-950/50 text-slate-500 hover:text-slate-300'
                  }`}
                  title={dish.is_featured ? 'Remove featured' : 'Mark featured'}
                >
                  {dish.is_featured ? <Star className="h-3.5 w-3.5" /> : <StarOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => toggleField(dish, 'is_available')}
                  className={`rounded-md p-1 backdrop-blur transition ${
                    dish.is_available
                      ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                      : 'bg-slate-950/50 text-slate-500 hover:text-slate-300'
                  }`}
                  title={dish.is_available ? 'Hide from menu' : 'Show on menu'}
                >
                  {dish.is_available ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col gap-2 p-3">
              {/* Name + category */}
              <div>
                <h3 className="text-xs font-semibold text-slate-100 leading-tight">{dish.name}</h3>
                {dish.category_name && (
                  <span className="text-[10px] text-slate-500">{dish.category_name}</span>
                )}
              </div>

              {/* Financial row */}
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold tabular-nums text-slate-100">
                    {price > 0 ? `\u0E3F${price.toLocaleString()}` : '-'}
                  </span>
                  <span className="text-[10px] tabular-nums text-slate-500">
                    cost {cost > 0 ? `\u0E3F${cost.toLocaleString()}` : '-'}
                  </span>
                </div>
                {price > 0 && (
                  <span className={`text-xs font-semibold tabular-nums ${margin > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    +{'\u0E3F'}{margin.toLocaleString()}
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
                <div className="flex flex-wrap gap-1 mt-auto">
                  {dish.tags.map((tag) => (
                    <span
                      key={tag.slug}
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-slate-700/50 text-slate-400"
                      style={tag.color ? { backgroundColor: `${tag.color}15`, color: tag.color } : undefined}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
