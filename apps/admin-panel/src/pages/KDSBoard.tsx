import { RefreshCw } from 'lucide-react'
import { useGanttTasks } from '../hooks/useGanttTasks'
import { useEquipmentCategories } from '../hooks/useEquipmentCategories'
import { GanttTimeline } from '../components/kds/GanttTimeline'
import { EquipmentFilter } from '../components/kds/EquipmentFilter'
import { KitchenNav } from '../components/KitchenNav'

export function KDSBoard() {
  const { tasks, conflicts, isLoading: tasksLoading, error: tasksError, refetch } = useGanttTasks()
  const {
    equipment,
    categories,
    selectedCategory,
    setSelectedCategory,
    isLoading: eqLoading,
  } = useEquipmentCategories()

  const filteredEquipment = selectedCategory
    ? equipment.filter((eq) => eq.category === selectedCategory)
    : equipment

  const isLoading = tasksLoading || eqLoading

  return (
    <div className="space-y-4">
      <KitchenNav />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Kitchen KDS</h1>
          <p className="text-xs text-slate-500">
            Gantt scheduling · {tasks.length} task{tasks.length !== 1 ? 's' : ''} today
            {conflicts.length > 0 && (
              <span className="ml-2 text-rose-400">
                · {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Equipment category filter */}
      <EquipmentFilter
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* Gantt timeline */}
      <GanttTimeline
        tasks={tasks}
        equipment={filteredEquipment}
        conflicts={conflicts}
        isLoading={isLoading}
        error={tasksError}
      />
    </div>
  )
}
