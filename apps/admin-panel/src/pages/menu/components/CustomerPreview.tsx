import type { MenuDish } from '../../../hooks/useMenuDishes'
import { DishCard } from './DishCard'

interface CustomerPreviewProps {
  dishes: MenuDish[]
  selectedCategory: string | null
}

export function CustomerPreview({ dishes, selectedCategory }: CustomerPreviewProps) {
  const visible = dishes.filter((d) => d.is_available)
  const filtered = selectedCategory
    ? visible.filter((d) => d.category_id === selectedCategory)
    : visible

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        No dishes available in this category.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filtered.map((dish) => (
        <DishCard key={dish.id} dish={dish} />
      ))}
    </div>
  )
}
