import { useState } from 'react'
import { Eye, Table2, LayoutGrid, Loader2, ChefHat, Sparkles, Plus } from 'lucide-react'
import { useMenuDishes } from '../../hooks/useMenuDishes'
import { OwnerTable } from './components/OwnerTable'
import { OwnerGallery } from './components/OwnerGallery'
import { CustomerPreview } from './components/CustomerPreview'
import { NewDishModal } from './components/NewDishModal'
import { ChefChatPanel } from '../../components/chef/ChefChatPanel'

type ViewMode = 'owner' | 'customer'
type OwnerLayout = 'table' | 'gallery'

export function MenuPage() {
  const { dishes, categories, subcategories, isLoading, error, updateDish, refetch } = useMenuDishes()
  const [view, setView] = useState<ViewMode>('owner')
  const [ownerLayout, setOwnerLayout] = useState<OwnerLayout>('table')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [chefOpen, setChefOpen] = useState(false)
  const [newDishOpen, setNewDishOpen] = useState(false)
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null)

  const handleDishCreated = async (dishId: string) => {
    setJustCreatedId(dishId)
    await refetch()
    // Snap back to owner/table so the new row + chevron is visible
    setView('owner')
    setOwnerLayout('table')
    setSelectedCategory(null)
  }

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

        <div className="flex items-center gap-2">
          {/* New Dish button */}
          <button
            onClick={() => setNewDishOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-700"
            title="Create new dish"
          >
            <Plus className="h-3.5 w-3.5" />
            New dish
          </button>

          {/* AI Chef button */}
          <button
            onClick={() => setChefOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-700/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-600 hover:bg-emerald-500/20"
            title="Open AI Chef"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Chef
          </button>

          {/* Owner layout toggle */}
          {view === 'owner' && (
            <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
              <button
                onClick={() => setOwnerLayout('table')}
                className={`flex items-center rounded-md p-1.5 transition ${
                  ownerLayout === 'table'
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Table view"
              >
                <Table2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOwnerLayout('gallery')}
                className={`flex items-center rounded-md p-1.5 transition ${
                  ownerLayout === 'gallery'
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Gallery view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

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
              Customer
            </button>
          </div>
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
      ) : dishes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-500">
          <ChefHat className="mb-3 h-10 w-10 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">No dishes yet</p>
          <p className="mt-1 text-xs text-slate-600">
            Add SALE-type dishes in the nomenclature to see them here.
          </p>
        </div>
      ) : view === 'owner' && ownerLayout === 'table' ? (
        <OwnerTable
          dishes={dishes}
          selectedCategory={selectedCategory}
          subcategories={subcategories}
          onUpdate={updateDish}
          autoExpandId={justCreatedId}
        />
      ) : view === 'owner' && ownerLayout === 'gallery' ? (
        <OwnerGallery
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

      {/* New Dish modal */}
      <NewDishModal
        open={newDishOpen}
        onClose={() => setNewDishOpen(false)}
        onCreated={handleDishCreated}
      />

      {/* AI Chef slide-out panel */}
      <ChefChatPanel open={chefOpen} onClose={() => setChefOpen(false)} />
    </div>
  )
}
