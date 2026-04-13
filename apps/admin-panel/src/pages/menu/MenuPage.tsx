import { useState } from 'react'
import { Eye, Table2, Loader2 } from 'lucide-react'
import { useMenuDishes } from '../../hooks/useMenuDishes'
import { OwnerTable } from './components/OwnerTable'
import { CustomerPreview } from './components/CustomerPreview'

type ViewMode = 'owner' | 'customer'

export function MenuPage() {
  const { dishes, categories, isLoading, error, updateDish } = useMenuDishes()
  const [view, setView] = useState<ViewMode>('owner')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Stats
  const totalDishes = dishes.length
  const availableCount = dishes.filter((d) => d.is_available).length
  const featuredCount = dishes.filter((d) => d.is_featured).length
  const avgFoodCost =
    dishes.reduce((sum, d) => {
      if (!d.price || !d.cost_per_unit) return sum
      return sum + (d.cost_per_unit / d.price) * 100
    }, 0) / (dishes.filter((d) => d.price && d.cost_per_unit).length || 1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Menu</h1>
          <p className="text-xs text-slate-500">
            {totalDishes} dishes &middot; {availableCount} available &middot; {featuredCount} featured &middot; avg food cost {avgFoodCost.toFixed(1)}%
          </p>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
          <button
            onClick={() => setView('owner')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              view === 'owner'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            Owner
          </button>
          <button
            onClick={() => setView('customer')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              view === 'customer'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Customer Preview
          </button>
        </div>
      </div>

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
              selectedCategory === null
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                selectedCategory === cat.id
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-32 text-xs text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
          Loading menu...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 p-4 text-sm text-rose-300">
          Failed to load menu: {error}
        </div>
      ) : view === 'owner' ? (
        <OwnerTable
          dishes={dishes}
          selectedCategory={selectedCategory}
          onUpdate={updateDish}
        />
      ) : (
        <CustomerPreview
          dishes={dishes}
          selectedCategory={selectedCategory}
        />
      )}
    </div>
  )
}
